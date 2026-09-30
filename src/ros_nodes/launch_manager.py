#!/usr/bin/env python3
import json
import os
import signal
import socket
import subprocess
import threading

import rospy
from std_msgs.msg import String


COMMAND_TOPIC = "/hmi/launch_command"
STATUS_TOPIC = "/hmi/launch_status"

# Sua map nay tren tung may ROS. Key phai trung voi field "launch" tu UI.
# Vi du:
# "bringup": ["roslaunch", "my_robot_bringup", "bringup.launch"]
LAUNCH_MAP = {
    "bringup": ["roslaunch", "your_robot_bringup_pkg", "bringup.launch"],
    "navigation": ["roslaunch", "your_navigation_pkg", "navigation.launch"],
    "camera": ["roslaunch", "your_camera_pkg", "camera.launch"],
    "perception": ["roslaunch", "your_perception_pkg", "perception.launch"],
    "sensors": ["roslaunch", "your_sensor_pkg", "sensors.launch"],
    "localization": ["roslaunch", "your_localization_pkg", "localization.launch"],
}


class LaunchManager:
    def __init__(self):
        default_machine_name = socket.gethostname()
        self.machine_name = rospy.get_param("~machine_name", default_machine_name)
        self.machine_name = self.machine_name.strip()
        self.processes = {}
        self.process_lock = threading.Lock()

        self.status_pub = rospy.Publisher(STATUS_TOPIC, String, queue_size=20)
        self.command_sub = rospy.Subscriber(COMMAND_TOPIC, String, self.handle_command, queue_size=20)

        rospy.on_shutdown(self.stop_all)
        rospy.loginfo("Launch manager ready: machine_name=%s topic=%s", self.machine_name, COMMAND_TOPIC)

    def publish_status(self, payload):
        payload["machine_name"] = self.machine_name
        payload["timestamp"] = rospy.Time.now().to_sec()
        self.status_pub.publish(String(data=json.dumps(payload)))

    def matches_target(self, target_machine):
        target = str(target_machine or "").strip()
        if target in ("*", "all"):
            return True

        return target == self.machine_name

    def read_log_tail(self, log_path, max_lines=12):
        if not log_path or not os.path.exists(log_path):
            return ""

        try:
            with open(log_path, "r") as log_file:
                lines = log_file.readlines()
        except OSError as error:
            return "Khong doc duoc log: {}".format(error)

        return "".join(lines[-max_lines:]).strip()

    def close_launch_log(self, launch_info):
        log_file = launch_info.get("log_file")
        if not log_file or log_file.closed:
            return

        try:
            log_file.flush()
        except OSError:
            pass

        try:
            log_file.close()
        except OSError:
            pass

    def get_launch_info(self, launch_name):
        with self.process_lock:
            return self.processes.get(launch_name)

    def cleanup_exited_process(self, launch_name):
        launch_info = self.get_launch_info(launch_name)
        if not launch_info:
            return

        process = launch_info["process"]
        return_code = process.poll()
        if return_code is not None:
            with self.process_lock:
                current_info = self.processes.get(launch_name)
                if current_info is not launch_info:
                    return

                self.processes.pop(launch_name, None)

            self.close_launch_log(launch_info)
            self.publish_status(
                {
                    "event": "exited",
                    "launch": launch_name,
                    "return_code": return_code,
                    "log_path": launch_info.get("log_path"),
                    "log_tail": self.read_log_tail(launch_info.get("log_path")),
                    "command": launch_info.get("command_display", ""),
                }
            )

    def watch_process(self, launch_name, process):
        return_code = process.wait()

        with self.process_lock:
            launch_info = self.processes.get(launch_name)
            if not launch_info or launch_info["process"] is not process:
                return

            expected_stop = launch_info.get("expected_stop", False)
            self.processes.pop(launch_name, None)

        self.close_launch_log(launch_info)

        if expected_stop:
            return

        self.publish_status(
            {
                "event": "exited",
                "launch": launch_name,
                "return_code": return_code,
                "pid": process.pid,
                "log_path": launch_info.get("log_path"),
                "log_tail": self.read_log_tail(launch_info.get("log_path")),
                "command": launch_info.get("command_display", ""),
            }
        )

    def handle_command(self, msg):
        try:
            payload = json.loads(msg.data)
        except ValueError:
            rospy.logwarn("Invalid launch command JSON: %s", msg.data)
            return

        target_machine = payload.get("target_machine")
        if not self.matches_target(target_machine):
            return

        action = str(payload.get("action", "")).strip().lower()
        launch_name = str(payload.get("launch", "")).strip()
        request_id = payload.get("request_id", "")

        if action == "start":
            self.start_launch(launch_name, request_id)
            return

        if action == "stop":
            self.stop_launch(launch_name, request_id)
            return

        self.publish_status(
            {
                "event": "rejected",
                "reason": "unknown_action",
                "action": action,
                "launch": launch_name,
                "request_id": request_id,
            }
        )

    def start_launch(self, launch_name, request_id=""):
        self.cleanup_exited_process(launch_name)

        if launch_name not in LAUNCH_MAP:
            self.publish_status(
                {
                    "event": "rejected",
                    "reason": "launch_not_whitelisted",
                    "launch": launch_name,
                    "request_id": request_id,
                }
            )
            return

        launch_info = self.get_launch_info(launch_name)
        if launch_info:
            self.publish_status(
                {
                    "event": "already_running",
                    "launch": launch_name,
                    "pid": launch_info["process"].pid,
                    "log_path": launch_info.get("log_path"),
                    "request_id": request_id,
                }
            )
            return

        command = LAUNCH_MAP[launch_name]
        log_path = "/tmp/hmi_launch_{}.log".format(launch_name)
        command_display = command if isinstance(command, str) else " ".join(command)

        try:
            log_file = open(log_path, "a")
        except OSError as error:
            self.publish_status(
                {
                    "event": "start_failed",
                    "launch": launch_name,
                    "request_id": request_id,
                    "error": "Khong mo duoc file log: {}".format(error),
                    "command": command_display,
                    "log_path": log_path,
                }
            )
            return

        rospy.loginfo("Starting launch %s: %s", launch_name, command_display)

        try:
            process = subprocess.Popen(
                command,
                stdout=log_file,
                stderr=subprocess.STDOUT,
                preexec_fn=os.setsid,
            )
        except OSError as error:
            self.close_launch_log({"log_file": log_file})
            self.publish_status(
                {
                    "event": "start_failed",
                    "launch": launch_name,
                    "request_id": request_id,
                    "error": str(error),
                    "command": command_display,
                    "log_path": log_path,
                    "log_tail": self.read_log_tail(log_path),
                }
            )
            return

        launch_info = {
            "process": process,
            "log_file": log_file,
            "log_path": log_path,
            "command_display": command_display,
            "expected_stop": False,
        }

        with self.process_lock:
            self.processes[launch_name] = launch_info

        watcher = threading.Thread(target=self.watch_process, args=(launch_name, process))
        watcher.daemon = True
        watcher.start()

        self.publish_status(
            {
                "event": "started",
                "launch": launch_name,
                "pid": process.pid,
                "log_path": log_path,
                "command": command_display,
                "request_id": request_id,
            }
        )

    def stop_launch(self, launch_name, request_id=""):
        self.cleanup_exited_process(launch_name)

        launch_info = self.get_launch_info(launch_name)
        if not launch_info:
            self.publish_status(
                {
                    "event": "not_running",
                    "launch": launch_name,
                    "request_id": request_id,
                }
            )
            return

        process = launch_info["process"]

        with self.process_lock:
            current_info = self.processes.get(launch_name)
            if current_info:
                current_info["expected_stop"] = True

        rospy.loginfo("Stopping launch %s pid=%s", launch_name, process.pid)
        try:
            os.killpg(os.getpgid(process.pid), signal.SIGINT)
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            os.killpg(os.getpgid(process.pid), signal.SIGTERM)
            process.wait(timeout=5)
        except ProcessLookupError:
            pass
        finally:
            with self.process_lock:
                self.processes.pop(launch_name, None)

        self.close_launch_log(launch_info)

        self.publish_status(
            {
                "event": "stopped",
                "launch": launch_name,
                "log_path": launch_info.get("log_path"),
                "request_id": request_id,
            }
        )

    def stop_all(self):
        for launch_name in list(self.processes.keys()):
            self.stop_launch(launch_name)


if __name__ == "__main__":
    rospy.init_node("hmi_launch_manager")
    LaunchManager()
    rospy.spin()

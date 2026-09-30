#!/usr/bin/env python3
import json
import threading
import time

import rospy
from std_msgs.msg import String

try:
    import Jetson.GPIO as GPIO
except ImportError as error:
    raise SystemExit(
        "Khong import duoc Jetson.GPIO. Cai tren Orin NX bang: sudo apt install python3-jetson-gpio"
    ) from error


COMMAND_TOPIC = "/hmi/launch_command"
STATUS_TOPIC = "/hmi/launch_status"
SWITCH_STATE_TOPIC = "/hmi/launch_switch_state"

DEFAULT_TARGET_MACHINE = "cuong"
DEFAULT_SOURCE = "hmi_gpio_switch"
DEFAULT_POLL_HZ = 30.0
DEFAULT_DEBOUNCE_MS = 80
DEFAULT_SYNC_ON_STARTUP = True
DEFAULT_COMMAND_DELAY_MS = 180
DEFAULT_FORWARD_COMMAND_ON_TOGGLE = False

# Day la vi du mapping theo BOARD pin numbering tren header 40 pin.
# Hay doi lai dung voi day noi thuc te cua ban.
DEFAULT_SWITCH_SPECS = [
    {"pin": 7, "launch": "outdoor_waypoint_nav", "label": "Khoi dong EKF", "active_low": True},
    {"pin": 13, "launch": "rslidar_start", "label": "Khoi dong Lidar", "active_low": True},
    {"pin": 15, "launch": "aloam_velodyne_HDL_32", "label": "Tao ban do SLAM", "active_low": True},
    {"pin": 16, "launch": "save_aloam_2d_map", "label": "Luu ban do 2D", "active_low": True},
    {"pin": 18, "launch": "warthog_real_amcl_checked", "label": "Dieu khien ROBOT", "active_low": True},
    {"pin": 22, "launch": "outdoor_waypoint_nav_tracking", "label": "Chay hinh vuong", "active_low": True},
    {"pin": 31, "launch": "outdoor_waypoint_nav_sim", "label": "Chay bai 2", "active_low": True},
    {"pin": 33, "launch": "joy_launch_control_sim", "label": "Chay bai 3", "active_low": True},
]

class HmiGpioSwitchBridge:
    def __init__(self):
        self.command_topic = rospy.get_param("~command_topic", COMMAND_TOPIC)
        self.status_topic = rospy.get_param("~status_topic", STATUS_TOPIC)
        self.switch_state_topic = rospy.get_param("~switch_state_topic", SWITCH_STATE_TOPIC)
        self.target_machine = rospy.get_param("~target_machine", DEFAULT_TARGET_MACHINE)
        self.source = rospy.get_param("~source", DEFAULT_SOURCE)
        self.poll_hz = float(rospy.get_param("~poll_hz", DEFAULT_POLL_HZ))
        self.debounce_ms = int(rospy.get_param("~debounce_ms", DEFAULT_DEBOUNCE_MS))
        self.sync_on_startup = bool(rospy.get_param("~sync_on_startup", DEFAULT_SYNC_ON_STARTUP))
        self.command_delay_ms = int(rospy.get_param("~command_delay_ms", DEFAULT_COMMAND_DELAY_MS))
        self.forward_command_on_toggle = bool(
            rospy.get_param("~forward_command_on_toggle", DEFAULT_FORWARD_COMMAND_ON_TOGGLE)
        )
        self.switch_specs = rospy.get_param("~switch_specs", DEFAULT_SWITCH_SPECS)

        self.command_pub = rospy.Publisher(self.command_topic, String, queue_size=20)
        self.status_pub = rospy.Publisher(self.status_topic, String, queue_size=20)
        self.switch_state_pub = rospy.Publisher(self.switch_state_topic, String, queue_size=20)

        self.last_raw_state = {}
        self.last_raw_change_at = {}
        self.stable_state = {}
        self.command_lock = threading.Lock()
        self.command_timers = {}
        self.pending_request_ids = {}

        self.validate_specs()
        self.setup_gpio()
        rospy.on_shutdown(self.shutdown)

        rospy.loginfo(
            "HMI GPIO switch bridge ready: target_machine=%s switches=%s",
            self.target_machine,
            [self.describe_switch(spec) for spec in self.switch_specs],
        )

    def validate_specs(self):
        if not isinstance(self.switch_specs, list) or not self.switch_specs:
            raise ValueError("~switch_specs phai la list va khong duoc rong")

        pins = set()
        launches = set()
        normalized_specs = []
        for raw_spec in self.switch_specs:
            pin = int(raw_spec["pin"])
            launch = str(raw_spec["launch"]).strip()
            label = str(raw_spec.get("label", launch)).strip()
            active_low = bool(raw_spec.get("active_low", True))

            if not launch:
                raise ValueError("switch spec bi thieu launch")
            if pin in pins:
                raise ValueError("pin bi trung: {}".format(pin))
            if launch in launches:
                raise ValueError("launch bi trung: {}".format(launch))

            pins.add(pin)
            launches.add(launch)
            normalized_specs.append(
                {
                    "pin": pin,
                    "launch": launch,
                    "label": label,
                    "active_low": active_low,
                }
            )

        self.switch_specs = normalized_specs

    def setup_gpio(self):
        GPIO.setwarnings(False)
        GPIO.setmode(GPIO.BOARD)

        for spec in self.switch_specs:
            GPIO.setup(spec["pin"], GPIO.IN, pull_up_down=GPIO.PUD_UP)

    def describe_switch(self, spec):
        return "{}@pin{}".format(spec["launch"], spec["pin"])

    def read_logical_state(self, spec):
        raw_value = GPIO.input(spec["pin"])
        is_on = raw_value == GPIO.LOW if spec["active_low"] else raw_value == GPIO.HIGH
        return bool(is_on)

    def build_request_id(self, spec, action):
        timestamp_ms = int(time.time() * 1000)
        return "{}_{}_{}_pin{}".format(timestamp_ms, spec["launch"], action, spec["pin"])

    def publish_json(self, publisher, payload):
        publisher.publish(String(data=json.dumps(payload)))

    def build_base_payload(self, spec, request_id, timestamp_ms):
        return {
            "source": self.source,
            "launch": spec["launch"],
            "label": spec["label"],
            "target_machine": self.target_machine,
            "request_id": request_id,
            "timestamp": timestamp_ms,
            "pin": spec["pin"],
        }

    def publish_switch_state(self, spec, is_on, reason, request_id):
        timestamp_ms = int(time.time() * 1000)
        payload = self.build_base_payload(spec, request_id, timestamp_ms)
        payload.update(
            {
                "event": "switch_on" if is_on else "switch_off",
                "switch_state": "on" if is_on else "off",
                "reason": reason,
            }
        )
        self.publish_json(self.switch_state_pub, payload)

    def dispatch_command(self, spec, is_on, request_id):
        launch = spec["launch"]
        with self.command_lock:
            if self.pending_request_ids.get(launch) != request_id:
                return
            self.command_timers.pop(launch, None)

        action = "start" if is_on else "stop"
        timestamp_ms = int(time.time() * 1000)
        base_payload = self.build_base_payload(spec, request_id, timestamp_ms)

        command_payload = dict(base_payload)
        command_payload.update(
            {
                "action": action,
            }
        )

        self.publish_json(self.command_pub, command_payload)

        rospy.loginfo(
            "Dispatch %s => %s",
            self.describe_switch(spec),
            action,
        )

    def schedule_command_dispatch(self, spec, is_on, request_id):
        if not self.forward_command_on_toggle:
            return

        launch = spec["launch"]
        delay_sec = max(0.0, self.command_delay_ms / 1000.0)

        with self.command_lock:
            existing_timer = self.command_timers.get(launch)
            if existing_timer:
                existing_timer.cancel()

            self.pending_request_ids[launch] = request_id
            timer = threading.Timer(delay_sec, self.dispatch_command, args=(spec, is_on, request_id))
            timer.daemon = True
            self.command_timers[launch] = timer

        timer.start()

    def handle_switch_transition(self, spec, is_on, reason, forward_command):
        action = "start" if is_on else "stop"
        request_id = self.build_request_id(spec, action)
        self.publish_switch_state(spec, is_on, reason, request_id)

        rospy.loginfo(
            "Switch %s => %s (%s)",
            self.describe_switch(spec),
            action,
            reason,
        )

        if forward_command:
            self.schedule_command_dispatch(spec, is_on, request_id)

    def sync_initial_states(self):
        now = time.monotonic()
        for spec in self.switch_specs:
            logical_state = self.read_logical_state(spec)
            launch = spec["launch"]
            self.last_raw_state[launch] = logical_state
            self.last_raw_change_at[launch] = now
            self.stable_state[launch] = logical_state

            if self.sync_on_startup:
                self.handle_switch_transition(spec, logical_state, "startup_sync", forward_command=False)

    def spin(self):
        self.sync_initial_states()
        rate = rospy.Rate(self.poll_hz)
        debounce_sec = max(0.0, self.debounce_ms / 1000.0)

        while not rospy.is_shutdown():
            now = time.monotonic()
            for spec in self.switch_specs:
                launch = spec["launch"]
                raw_state = self.read_logical_state(spec)

                if raw_state != self.last_raw_state[launch]:
                    self.last_raw_state[launch] = raw_state
                    self.last_raw_change_at[launch] = now
                    continue

                if raw_state == self.stable_state[launch]:
                    continue

                if now - self.last_raw_change_at[launch] < debounce_sec:
                    continue

                self.stable_state[launch] = raw_state
                self.handle_switch_transition(spec, raw_state, "switch_toggle", forward_command=True)

            rate.sleep()

    def shutdown(self):
        with self.command_lock:
            timers = list(self.command_timers.values())
            self.command_timers.clear()
            self.pending_request_ids.clear()

        for timer in timers:
            timer.cancel()

        try:
            GPIO.cleanup()
        except RuntimeError:
            pass


if __name__ == "__main__":
    rospy.init_node("hmi_gpio_switch_bridge")
    HmiGpioSwitchBridge().spin()

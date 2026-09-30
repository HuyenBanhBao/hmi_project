#!/usr/bin/env python3
import time

import rospy
from std_msgs.msg import Bool

try:
    import Jetson.GPIO as GPIO
except ImportError as error:
    raise SystemExit(
        "Khong import duoc Jetson.GPIO. Cai tren Orin NX bang: sudo apt install python3-jetson-gpio"
    ) from error


ENABLE_TOPIC = "/hmi/joystick_enable"
BUTTON_STATUS_TOPIC = "/hmi/joystick_toggle_button"

# BOARD numbering tren header 40 pin cua Jetson.
DEFAULT_GPIO_PIN = 29
DEFAULT_ACTIVE_LOW = False
DEFAULT_ENABLED_WHEN_ACTIVE = True
DEFAULT_POLL_HZ = 50.0
DEFAULT_DEBOUNCE_MS = 80


class HmiJoystickToggleGpio:
    def __init__(self):
        self.enable_topic = rospy.get_param("~enable_topic", ENABLE_TOPIC)
        self.button_status_topic = rospy.get_param("~button_status_topic", BUTTON_STATUS_TOPIC)
        self.pin = int(rospy.get_param("~pin", DEFAULT_GPIO_PIN))
        self.active_low = bool(rospy.get_param("~active_low", DEFAULT_ACTIVE_LOW))
        self.enabled_when_active = bool(
            rospy.get_param("~enabled_when_active", DEFAULT_ENABLED_WHEN_ACTIVE)
        )
        self.poll_hz = float(rospy.get_param("~poll_hz", DEFAULT_POLL_HZ))
        self.debounce_ms = int(rospy.get_param("~debounce_ms", DEFAULT_DEBOUNCE_MS))

        self.enable_pub = rospy.Publisher(self.enable_topic, Bool, queue_size=10, latch=True)
        self.button_status_pub = rospy.Publisher(
            self.button_status_topic,
            Bool,
            queue_size=5,
            latch=True,
        )

        self.last_raw_state = False
        self.stable_state = False
        self.last_raw_change_at = time.monotonic()

        self.setup_gpio()
        self.sync_initial_state()
        rospy.on_shutdown(self.shutdown)

        rospy.loginfo(
            "HMI joystick GPIO ready: pin=%s active_low=%s enabled_when_active=%s enable_topic=%s status_topic=%s",
            self.pin,
            self.active_low,
            self.enabled_when_active,
            self.enable_topic,
            self.button_status_topic,
        )

    def setup_gpio(self):
        GPIO.setwarnings(False)
        GPIO.setmode(GPIO.BOARD)

        pull_mode = GPIO.PUD_UP if self.active_low else GPIO.PUD_DOWN
        GPIO.setup(self.pin, GPIO.IN, pull_up_down=pull_mode)

    def read_button_active(self):
        raw_value = GPIO.input(self.pin)
        return bool(raw_value == GPIO.LOW if self.active_low else raw_value == GPIO.HIGH)

    def map_enabled_state(self, button_active):
        return bool(button_active if self.enabled_when_active else not button_active)

    def sync_initial_state(self):
        now = time.monotonic()
        current_button_active = self.read_button_active()
        self.last_raw_state = current_button_active
        self.stable_state = current_button_active
        self.last_raw_change_at = now

        self.button_status_pub.publish(Bool(data=current_button_active))
        self.enable_pub.publish(Bool(data=self.map_enabled_state(current_button_active)))

    def spin(self):
        rate = rospy.Rate(self.poll_hz)
        debounce_sec = max(0.0, self.debounce_ms / 1000.0)

        while not rospy.is_shutdown():
            now = time.monotonic()
            raw_state = self.read_button_active()

            if raw_state != self.last_raw_state:
                self.last_raw_state = raw_state
                self.last_raw_change_at = now
                rate.sleep()
                continue

            if raw_state == self.stable_state:
                rate.sleep()
                continue

            if now - self.last_raw_change_at < debounce_sec:
                rate.sleep()
                continue

            self.stable_state = raw_state
            self.button_status_pub.publish(Bool(data=raw_state))

            requested_enabled = self.map_enabled_state(raw_state)
            self.enable_pub.publish(Bool(data=requested_enabled))

            rospy.loginfo(
                "Joystick enable => %s tu pin %s (button_active=%s)",
                "ON" if requested_enabled else "OFF",
                self.pin,
                raw_state,
            )

            rate.sleep()

    def shutdown(self):
        try:
            GPIO.cleanup(self.pin)
        except RuntimeError:
            pass


if __name__ == "__main__":
    rospy.init_node("hmi_joystick_toggle_gpio")
    HmiJoystickToggleGpio().spin()

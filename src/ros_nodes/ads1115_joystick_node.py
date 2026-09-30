#!/usr/bin/env python3
import math
import time

import rospy
import smbus
from geometry_msgs.msg import Twist
from sensor_msgs.msg import Joy
from std_msgs.msg import Bool


ADS1115_ADDR = 0x48
CONFIG_REG = 0x01
CONVERT_REG = 0x00
MUX_CONFIGS = {
    0: 0x4000,  # A0
    1: 0x5000,  # A1
    2: 0x6000,  # A2
    3: 0x7000,  # A3
}
DATA_RATE_CONFIGS = {
    8: 0x0000,
    16: 0x0020,
    32: 0x0040,
    64: 0x0060,
    128: 0x0080,
    250: 0x00A0,
    475: 0x00C0,
    860: 0x00E0,
}
BASE_CONFIG = 0x8103

DEFAULT_I2C_BUS = 7
DEFAULT_PUBLISH_HZ = 30.0
DEFAULT_DATA_RATE = 860
DEFAULT_SAMPLE_DELAY_SEC = 0.002
DEFAULT_DEADZONE = 0.25
DEFAULT_RESPONSE_EXPONENT = 0.85
DEFAULT_MAX_LINEAR_MPS = 0.6    # Max vận tốc di chuyển
DEFAULT_MAX_ANGULAR_RADPS = 0.5   # Max vận tốc quay
DEFAULT_AXIS_MIN = 0
DEFAULT_AXIS_MAX = 32767
DEFAULT_CENTER_SAMPLES = 30
DEFAULT_ENABLE_TOPIC = "/hmi/joystick_enable"
DEFAULT_JOY_TOPIC = "/joy"
DEFAULT_CMD_VEL_TOPIC = "/cmd_vel"
DEFAULT_ROTATE_DEGREES = 90
DEFAULT_AUTO_RANGE_ENABLED = True
DEFAULT_RANGE_ACTIVATION_DELTA = 1500
DEFAULT_RANGE_MARGIN_RATIO = 0.03


def clamp(value, min_value, max_value):
    return min(max_value, max(min_value, value))


class Ads1115JoystickNode:
    def __init__(self):
        self.i2c_bus = int(rospy.get_param("~i2c_bus", DEFAULT_I2C_BUS))
        self.ads1115_addr = int(rospy.get_param("~ads1115_addr", ADS1115_ADDR))
        self.publish_hz = float(rospy.get_param("~publish_hz", DEFAULT_PUBLISH_HZ))
        self.data_rate = int(rospy.get_param("~data_rate", DEFAULT_DATA_RATE))
        self.sample_delay_sec = float(rospy.get_param("~sample_delay_sec", DEFAULT_SAMPLE_DELAY_SEC))
        self.deadzone = float(rospy.get_param("~deadzone", DEFAULT_DEADZONE))
        self.response_exponent = float(
            rospy.get_param("~response_exponent", DEFAULT_RESPONSE_EXPONENT)
        )
        self.max_linear_mps = float(rospy.get_param("~max_linear_mps", DEFAULT_MAX_LINEAR_MPS))
        self.max_angular_radps = float(
            rospy.get_param("~max_angular_radps", DEFAULT_MAX_ANGULAR_RADPS)
        )
        self.center_samples = int(rospy.get_param("~center_samples", DEFAULT_CENTER_SAMPLES))
        self.enable_topic = rospy.get_param("~enable_topic", DEFAULT_ENABLE_TOPIC)
        self.joy_topic = rospy.get_param("~joy_topic", DEFAULT_JOY_TOPIC)
        self.cmd_vel_topic = rospy.get_param("~cmd_vel_topic", DEFAULT_CMD_VEL_TOPIC)

        self.x_channel = int(rospy.get_param("~x_channel", 0))
        self.y_channel = int(rospy.get_param("~y_channel", 1))
        self.x_min = int(rospy.get_param("~x_min", DEFAULT_AXIS_MIN))
        self.x_max = int(rospy.get_param("~x_max", DEFAULT_AXIS_MAX))
        self.y_min = int(rospy.get_param("~y_min", DEFAULT_AXIS_MIN))
        self.y_max = int(rospy.get_param("~y_max", DEFAULT_AXIS_MAX))
        self.x_center = int(rospy.get_param("~x_center", -1))
        self.y_center = int(rospy.get_param("~y_center", -1))
        self.rotate_degrees = int(rospy.get_param("~rotate_degrees", DEFAULT_ROTATE_DEGREES))
        self.invert_x_axis = bool(rospy.get_param("~invert_x_axis", False))
        self.invert_y_axis = bool(rospy.get_param("~invert_y_axis", False))
        self.start_enabled = bool(rospy.get_param("~start_enabled", False))
        self.auto_range_enabled = bool(
            rospy.get_param("~auto_range_enabled", DEFAULT_AUTO_RANGE_ENABLED)
        )
        self.range_activation_delta = int(
            rospy.get_param("~range_activation_delta", DEFAULT_RANGE_ACTIVATION_DELTA)
        )
        self.range_margin_ratio = float(
            rospy.get_param("~range_margin_ratio", DEFAULT_RANGE_MARGIN_RATIO)
        )

        self.enabled = self.start_enabled
        self.bus = smbus.SMBus(self.i2c_bus)
        self.joy_pub = rospy.Publisher(self.joy_topic, Joy, queue_size=20)
        self.cmd_vel_pub = rospy.Publisher(self.cmd_vel_topic, Twist, queue_size=20)
        self.enable_sub = rospy.Subscriber(self.enable_topic, Bool, self.handle_enable, queue_size=10)

        self.validate_config()
        self.resolve_centers()
        self.reset_observed_ranges()

        rospy.on_shutdown(self.shutdown)
        rospy.loginfo(
            "ADS1115 joystick ready: bus=%s addr=0x%02X joy_topic=%s cmd_vel_topic=%s x_channel=%s y_channel=%s rotate=%s data_rate=%sHz x_center=%s y_center=%s auto_range=%s",
            self.i2c_bus,
            self.ads1115_addr,
            self.joy_topic,
            self.cmd_vel_topic,
            self.x_channel,
            self.y_channel,
            self.rotate_degrees,
            self.data_rate,
            self.x_center,
            self.y_center,
            self.auto_range_enabled,
        )

    def validate_config(self):
        if self.x_channel not in MUX_CONFIGS:
            raise ValueError("x_channel khong hop le: {}".format(self.x_channel))
        if self.y_channel not in MUX_CONFIGS:
            raise ValueError("y_channel khong hop le: {}".format(self.y_channel))
        if self.data_rate not in DATA_RATE_CONFIGS:
            raise ValueError(
                "data_rate khong hop le: {}. Chon trong {}".format(
                    self.data_rate,
                    sorted(DATA_RATE_CONFIGS),
                )
            )
        if self.rotate_degrees not in (-270, -180, -90, 0, 90, 180, 270):
            raise ValueError("rotate_degrees chi ho tro -270, -180, -90, 0, 90, 180, 270")

    def resolve_centers(self):
        if self.x_center < 0:
            self.x_center = self.calibrate_center(self.x_channel, "X")
        if self.y_center < 0:
            self.y_center = self.calibrate_center(self.y_channel, "Y")

    def reset_observed_ranges(self):
        self.x_observed_min = self.x_center
        self.x_observed_max = self.x_center
        self.y_observed_min = self.y_center
        self.y_observed_max = self.y_center

    def calibrate_center(self, channel, axis_label):
        samples = []
        sample_count = max(1, self.center_samples)

        rospy.loginfo(
            "Dang lay center cho truc %s tren channel %s voi %s mau. Giu joystick o vi tri giua.",
            axis_label,
            channel,
            sample_count,
        )

        for _ in range(sample_count):
            if rospy.is_shutdown():
                break

            samples.append(self.read_channel(channel))
            time.sleep(self.sample_delay_sec)

        if not samples:
            raise RuntimeError("Khong lay duoc mau center cho truc {}".format(axis_label))

        center = int(round(sum(samples) / len(samples)))
        rospy.loginfo("Center truc %s = %s", axis_label, center)
        return center

    def handle_enable(self, msg):
        self.enabled = bool(msg.data)

    def build_config(self, channel):
        return MUX_CONFIGS[channel] | BASE_CONFIG | DATA_RATE_CONFIGS[self.data_rate]

    def read_channel(self, channel):
        config = self.build_config(channel)
        self.bus.write_i2c_block_data(
            self.ads1115_addr,
            CONFIG_REG,
            [(config >> 8) & 0xFF, config & 0xFF],
        )

        time.sleep(self.sample_delay_sec)

        data = self.bus.read_i2c_block_data(self.ads1115_addr, CONVERT_REG, 2)
        value = (data[0] << 8) | data[1]

        if value > 32767:
            value -= 65536

        return value

    def normalize_axis(self, raw_value, center_value, min_value, max_value):
        if raw_value >= center_value:
            span = max(1.0, float(max_value - center_value))
        else:
            span = max(1.0, float(center_value - min_value))

        return clamp((raw_value - center_value) / span, -1.0, 1.0)

    def update_observed_range(self, axis_name, raw_value):
        if axis_name == "x":
            self.x_observed_min = min(self.x_observed_min, raw_value)
            self.x_observed_max = max(self.x_observed_max, raw_value)
            return

        self.y_observed_min = min(self.y_observed_min, raw_value)
        self.y_observed_max = max(self.y_observed_max, raw_value)

    def resolve_effective_range(self, center_value, configured_min, configured_max, observed_min, observed_max):
        effective_min = configured_min
        effective_max = configured_max

        if not self.auto_range_enabled:
            return effective_min, effective_max

        negative_excursion = center_value - observed_min
        positive_excursion = observed_max - center_value

        if (
            negative_excursion < self.range_activation_delta
            or positive_excursion < self.range_activation_delta
        ):
            return effective_min, effective_max

        if negative_excursion >= self.range_activation_delta:
            effective_min = int(
                round(center_value - negative_excursion * (1.0 + self.range_margin_ratio))
            )

        if positive_excursion >= self.range_activation_delta:
            effective_max = int(
                round(center_value + positive_excursion * (1.0 + self.range_margin_ratio))
            )

        effective_min = clamp(effective_min, -32768, center_value - 1)
        effective_max = clamp(effective_max, center_value + 1, 32767)
        return int(effective_min), int(effective_max)

    def rotate_axes(self, axis_x, axis_y):
        normalized_rotation = self.rotate_degrees % 360

        if normalized_rotation == 0:
            return axis_x, axis_y
        if normalized_rotation == 90:
            return -axis_y, axis_x
        if normalized_rotation == 180:
            return -axis_x, -axis_y
        if normalized_rotation == 270:
            return axis_y, -axis_x

        raise ValueError("Gia tri rotate_degrees khong duoc ho tro: {}".format(self.rotate_degrees))

    def shape_axes(self, axis_x, axis_y):
        clamped_x = clamp(float(axis_x), -1.0, 1.0)
        clamped_y = clamp(float(axis_y), -1.0, 1.0)
        magnitude = math.hypot(clamped_x, clamped_y)

        if magnitude <= self.deadzone:
            return 0.0, 0.0

        normalized_magnitude = (magnitude - self.deadzone) / max(1e-6, 1.0 - self.deadzone)
        shaped_magnitude = math.pow(normalized_magnitude, self.response_exponent)
        direction_scale = shaped_magnitude / max(magnitude, 1e-6)

        return clamped_x * direction_scale, clamped_y * direction_scale

    def build_twist(self, linear_x, angular_z):
        twist = Twist()
        twist.linear.x = linear_x
        twist.angular.z = angular_z
        return twist

    def publish_zero_twist(self):
        self.cmd_vel_pub.publish(self.build_twist(0.0, 0.0))

    def spin(self):
        rate = rospy.Rate(self.publish_hz)

        while not rospy.is_shutdown():
            try:
                raw_x = self.read_channel(self.x_channel)
                raw_y = self.read_channel(self.y_channel)
            except OSError as error:
                rospy.logerr_throttle(2.0, "Doc ADS1115 loi: %s", error)
                self.publish_zero_twist()
                rate.sleep()
                continue

            self.update_observed_range("x", raw_x)
            self.update_observed_range("y", raw_y)

            x_min, x_max = self.resolve_effective_range(
                self.x_center,
                self.x_min,
                self.x_max,
                self.x_observed_min,
                self.x_observed_max,
            )
            y_min, y_max = self.resolve_effective_range(
                self.y_center,
                self.y_min,
                self.y_max,
                self.y_observed_min,
                self.y_observed_max,
            )

            axis_x = self.normalize_axis(raw_x, self.x_center, x_min, x_max)
            axis_y = self.normalize_axis(raw_y, self.y_center, y_min, y_max)
            axis_x, axis_y = self.rotate_axes(axis_x, axis_y)

            if self.invert_x_axis:
                axis_x *= -1.0
            if self.invert_y_axis:
                axis_y *= -1.0

            axis_x = clamp(axis_x, -1.0, 1.0)
            axis_y = clamp(axis_y, -1.0, 1.0)

            shaped_x, shaped_y = self.shape_axes(axis_x, axis_y)

            joy_msg = Joy()
            joy_msg.header.stamp = rospy.Time.now()
            joy_msg.axes = [round(axis_x, 4), round(axis_y, 4)]
            joy_msg.buttons = [1 if self.enabled else 0]
            self.joy_pub.publish(joy_msg)

            if self.enabled:
                linear_x = round(shaped_y * self.max_linear_mps, 3)
                angular_z = round(shaped_x * self.max_angular_radps, 3)
                self.cmd_vel_pub.publish(self.build_twist(linear_x, angular_z))
            else:
                linear_x = 0.0
                angular_z = 0.0

            rospy.logdebug_throttle(
                1.0,
                "raw_x=%s raw_y=%s x_range=[%s,%s] y_range=[%s,%s] joy x=%.3f y=%.3f -> cmd_vel linear=%.3f angular=%.3f enabled=%s",
                raw_x,
                raw_y,
                x_min,
                x_max,
                y_min,
                y_max,
                axis_x,
                axis_y,
                linear_x,
                angular_z,
                self.enabled,
            )

            rate.sleep()

    def shutdown(self):
        try:
            self.publish_zero_twist()
        except rospy.ROSException:
            pass

        try:
            self.bus.close()
        except AttributeError:
            pass


if __name__ == "__main__":
    rospy.init_node("ads1115_joystick_node")
    Ads1115JoystickNode().spin()

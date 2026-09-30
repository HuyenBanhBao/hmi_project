#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import rospy
import math
from sensor_msgs.msg import Imu, MagneticField
from std_msgs.msg import Float64
from geometry_msgs.msg import Vector3Stamped
import tf.transformations as tft


class RelativeHeadingNode:
    def __init__(self):
        rospy.init_node("relative_heading_from_mag")

        # Topic params
        self.imu_topic = rospy.get_param("~imu_topic", "/imu/data_new")
        self.mag_topic = rospy.get_param("~mag_topic", "/imu/mag")

        # Calibration params (hard-iron offset)
        self.mag_offset_x = rospy.get_param("~mag_offset_x", 0.0)
        self.mag_offset_y = rospy.get_param("~mag_offset_y", 0.0)
        self.mag_offset_z = rospy.get_param("~mag_offset_z", 0.0)

        # Optional scaling (soft-iron simple correction)
        self.mag_scale_x = rospy.get_param("~mag_scale_x", 1.0)
        self.mag_scale_y = rospy.get_param("~mag_scale_y", 1.0)
        self.mag_scale_z = rospy.get_param("~mag_scale_z", 1.0)

        # Axis reverse if needed
        self.invert_yaw = rospy.get_param("~invert_yaw", False)

        # Smooth factor
        self.alpha = rospy.get_param("~alpha", 0.2)  # low-pass filter

        # Initial averaging samples
        self.init_samples_required = rospy.get_param("~init_samples", 30)

        self.latest_roll = None
        self.latest_pitch = None

        self.filtered_yaw = None
        self.yaw_offset = None
        self.init_yaw_buffer = []

        # Publishers
        self.pub_yaw_deg = rospy.Publisher(
            "/relative_heading/deg", Float64, queue_size=10
        )
        self.pub_yaw_rad = rospy.Publisher(
            "/relative_heading/rad", Float64, queue_size=10
        )
        self.pub_rpy = rospy.Publisher(
            "/relative_heading/rpy_deg", Vector3Stamped, queue_size=10
        )

        # Subscribers
        rospy.Subscriber(self.imu_topic, Imu, self.imu_callback, queue_size=50)
        rospy.Subscriber(
            self.mag_topic, MagneticField, self.mag_callback, queue_size=50
        )

        rospy.loginfo("relative_heading_from_mag node started")
        rospy.loginfo("IMU topic: %s", self.imu_topic)
        rospy.loginfo("MAG topic: %s", self.mag_topic)

    def imu_callback(self, msg):
        q = msg.orientation

        # Nếu orientation không hợp lệ thì bỏ qua
        if q.x == 0.0 and q.y == 0.0 and q.z == 0.0 and q.w == 0.0:
            return

        roll, pitch, yaw = tft.euler_from_quaternion([q.x, q.y, q.z, q.w])
        self.latest_roll = roll
        self.latest_pitch = pitch

    def mag_callback(self, msg):
        if self.latest_roll is None or self.latest_pitch is None:
            return

        # 1) Lấy dữ liệu mag
        mx = msg.magnetic_field.x
        my = msg.magnetic_field.y
        mz = msg.magnetic_field.z

        # 2) Hard-iron offset correction
        mx -= self.mag_offset_x
        my -= self.mag_offset_y
        mz -= self.mag_offset_z

        # 3) Soft-iron scale correction đơn giản
        mx *= self.mag_scale_x
        my *= self.mag_scale_y
        mz *= self.mag_scale_z

        roll = self.latest_roll
        pitch = self.latest_pitch

        # 4) Tilt compensation
        Xh = mx * math.cos(pitch) + mz * math.sin(pitch)
        Yh = (
            mx * math.sin(roll) * math.sin(pitch)
            + my * math.cos(roll)
            - mz * math.sin(roll) * math.cos(pitch)
        )

        yaw = math.atan2(Yh, Xh)

        if self.invert_yaw:
            yaw = -yaw

        yaw = self.normalize_angle(yaw)

        # 5) Low-pass filter yaw
        if self.filtered_yaw is None:
            self.filtered_yaw = yaw
        else:
            dyaw = self.normalize_angle(yaw - self.filtered_yaw)
            self.filtered_yaw = self.normalize_angle(
                self.filtered_yaw + self.alpha * dyaw
            )

        # 6) Lấy offset ban đầu để góc start = 0
        if self.yaw_offset is None:
            self.init_yaw_buffer.append(self.filtered_yaw)
            if len(self.init_yaw_buffer) >= self.init_samples_required:
                self.yaw_offset = self.circular_mean(self.init_yaw_buffer)
                rospy.loginfo(
                    "Initial yaw offset set: %.3f rad (%.2f deg)",
                    self.yaw_offset,
                    math.degrees(self.yaw_offset),
                )
            return

        relative_yaw = self.normalize_angle(self.filtered_yaw - self.yaw_offset)

        # Publish
        yaw_deg_msg = Float64()
        yaw_deg_msg.data = math.degrees(relative_yaw)

        yaw_rad_msg = Float64()
        yaw_rad_msg.data = relative_yaw

        rpy_msg = Vector3Stamped()
        rpy_msg.header = msg.header
        rpy_msg.vector.x = math.degrees(self.latest_roll)
        rpy_msg.vector.y = math.degrees(self.latest_pitch)
        rpy_msg.vector.z = math.degrees(relative_yaw)

        self.pub_yaw_deg.publish(yaw_deg_msg)
        self.pub_yaw_rad.publish(yaw_rad_msg)
        self.pub_rpy.publish(rpy_msg)

        rospy.loginfo_throttle(
            1.0,
            "Relative heading: %.2f deg | roll: %.2f | pitch: %.2f",
            math.degrees(relative_yaw),
            math.degrees(self.latest_roll),
            math.degrees(self.latest_pitch),
        )

    @staticmethod
    def normalize_angle(angle):
        while angle > math.pi:
            angle -= 2.0 * math.pi
        while angle < -math.pi:
            angle += 2.0 * math.pi
        return angle

    @staticmethod
    def circular_mean(angles):
        s = sum(math.sin(a) for a in angles)
        c = sum(math.cos(a) for a in angles)
        return math.atan2(s, c)


if __name__ == "__main__":
    try:
        RelativeHeadingNode()
        rospy.spin()
    except rospy.ROSInterruptException:
        pass

#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import math
import yaml
import rospy
import numpy as np

from std_msgs.msg import Float64
from sensor_msgs.msg import Imu, MagneticField
from geometry_msgs.msg import Vector3Stamped
import tf.transformations as tft


class IMUAutoCalibratorWithHeading:
    def __init__(self):
        rospy.init_node("imu_auto_calibrator_with_heading")

        # ===================== TOPICS =====================
        self.imu_raw_topic = rospy.get_param("~imu_raw_topic", "/imu/data_raw")
        self.imu_topic = rospy.get_param("~imu_topic", "/imu/data_new")
        self.mag_topic = rospy.get_param("~mag_topic", "/imu/mag")

        # ===================== TIMING =====================
        self.static_duration = rospy.get_param(
            "~static_duration", 10.0
        )  # đứng yên đầu kỳ
        self.rotation_duration = rospy.get_param(
            "~rotation_duration", 120.0
        )  # quay xe 2 phút
        self.rate_hz = rospy.get_param("~rate", 50.0)

        # ===================== OUTPUT =====================
        self.output_yaml = rospy.get_param(
            "~output_yaml", os.path.expanduser("~/imu_calibration_result.yaml")
        )

        # ===================== HEADING PARAMS =====================
        # declination: radian, Đông dương nếu từ Bắc từ sang Bắc thật là +/-
        self.magnetic_declination_rad = rospy.get_param(
            "~magnetic_declination_rad", 0.0
        )

        # mounting yaw offset: nếu IMU gắn lệch so với trục thân xe
        self.sensor_yaw_offset_rad = rospy.get_param("~sensor_yaw_offset_rad", 0.0)

        # nếu cần đảo dấu yaw
        self.invert_yaw = rospy.get_param("~invert_yaw", False)

        # low-pass filter yaw
        self.alpha = rospy.get_param("~alpha", 0.15)

        # ===================== QUALITY CHECK =====================
        self.min_mag_samples = rospy.get_param("~min_mag_samples", 500)
        self.min_mag_span_x = rospy.get_param("~min_mag_span_x", 1e-5)
        self.min_mag_span_y = rospy.get_param("~min_mag_span_y", 1e-5)
        self.min_mag_span_z = rospy.get_param("~min_mag_span_z", 3e-6)

        # ===================== DATA BUFFERS =====================
        self.static_gyro = []
        self.static_acc = []
        self.mag_samples = []

        self.latest_imu_raw = None
        self.latest_imu = None
        self.latest_mag = None

        # orientation từ topic IMU đã lọc (/imu/data_new mặc định)
        self.latest_roll = None
        self.latest_pitch = None
        self.latest_yaw_from_imu = None

        # calibration results
        self.gyro_bias = np.zeros(3)
        self.acc_bias = np.zeros(3)
        self.mag_offset = np.zeros(3)
        self.mag_scale = np.ones(3)

        self.filtered_heading_rad = None
        self.calibrated = False

        # ===================== PUB =====================
        self.pub_heading_deg = rospy.Publisher(
            "/imu_calibrated/heading_deg", Float64, queue_size=20
        )
        self.pub_heading_rad = rospy.Publisher(
            "/imu_calibrated/heading_rad", Float64, queue_size=20
        )
        self.pub_rpy_deg = rospy.Publisher(
            "/imu_calibrated/rpy_deg", Vector3Stamped, queue_size=20
        )
        self.pub_mag_calibrated = rospy.Publisher(
            "/imu_calibrated/mag", Vector3Stamped, queue_size=20
        )

        # ===================== SUB =====================
        rospy.Subscriber(self.imu_raw_topic, Imu, self.imu_raw_callback, queue_size=200)
        rospy.Subscriber(self.imu_topic, Imu, self.imu_callback, queue_size=200)
        rospy.Subscriber(
            self.mag_topic, MagneticField, self.mag_callback, queue_size=200
        )

        rospy.loginfo("=== IMU AUTO CALIBRATOR WITH HEADING STARTED ===")
        rospy.loginfo("imu_raw_topic: %s", self.imu_raw_topic)
        rospy.loginfo("imu_topic    : %s", self.imu_topic)
        rospy.loginfo("mag_topic    : %s", self.mag_topic)
        rospy.loginfo("static_duration   = %.1f s", self.static_duration)
        rospy.loginfo("rotation_duration = %.1f s", self.rotation_duration)
        rospy.loginfo("output_yaml       = %s", self.output_yaml)

    # ============================================================
    # CALLBACKS
    # ============================================================
    def imu_raw_callback(self, msg):
        self.latest_imu_raw = msg

    def imu_callback(self, msg):
        self.latest_imu = msg

        q = msg.orientation
        # Kiểm tra quaternion có hợp lệ không
        if q.x == 0.0 and q.y == 0.0 and q.z == 0.0 and q.w == 0.0:
            return

        try:
            roll, pitch, yaw = tft.euler_from_quaternion([q.x, q.y, q.z, q.w])
            self.latest_roll = roll
            self.latest_pitch = pitch
            self.latest_yaw_from_imu = yaw
        except Exception as e:
            rospy.logwarn_throttle(2.0, "Quaternion convert failed: %s", str(e))

    def mag_callback(self, msg):
        self.latest_mag = msg

        # Nếu đã calibrate xong thì publish heading online luôn
        if (
            self.calibrated
            and self.latest_roll is not None
            and self.latest_pitch is not None
        ):
            self.publish_calibrated_heading(msg)

    # ============================================================
    # MAIN RUN
    # ============================================================
    def run(self):
        rate = rospy.Rate(self.rate_hz)

        # Chờ đủ dữ liệu
        rospy.loginfo("Waiting for /imu/data_raw, /imu/data_new, /imu/mag ...")
        while not rospy.is_shutdown():
            if (
                self.latest_imu_raw is not None
                and self.latest_imu is not None
                and self.latest_mag is not None
            ):
                break
            rate.sleep()

        # ============== PHASE 1: STATIC CALIBRATION ==============
        rospy.loginfo(
            "PHASE 1/2: Keep robot still for %.1f seconds ...", self.static_duration
        )
        t0 = rospy.Time.now().to_sec()

        while not rospy.is_shutdown():
            now = rospy.Time.now().to_sec()
            if now - t0 >= self.static_duration:
                break

            if self.latest_imu_raw is not None:
                gx = self.latest_imu_raw.angular_velocity.x
                gy = self.latest_imu_raw.angular_velocity.y
                gz = self.latest_imu_raw.angular_velocity.z

                ax = self.latest_imu_raw.linear_acceleration.x
                ay = self.latest_imu_raw.linear_acceleration.y
                az = self.latest_imu_raw.linear_acceleration.z

                self.static_gyro.append([gx, gy, gz])
                self.static_acc.append([ax, ay, az])

            rate.sleep()

        if len(self.static_gyro) < 20:
            rospy.logerr("Not enough static IMU samples. Abort.")
            return

        self.compute_static_bias()

        # ============== PHASE 2: MAG ROTATION CALIBRATION ==============
        rospy.loginfo(
            "PHASE 2/2: Rotate robot 360 deg multiple times for %.1f seconds ...",
            self.rotation_duration,
        )
        rospy.loginfo("Try to rotate slowly and cover as many headings as possible.")
        t1 = rospy.Time.now().to_sec()

        while not rospy.is_shutdown():
            now = rospy.Time.now().to_sec()
            if now - t1 >= self.rotation_duration:
                break

            if self.latest_mag is not None:
                mx = self.latest_mag.magnetic_field.x
                my = self.latest_mag.magnetic_field.y
                mz = self.latest_mag.magnetic_field.z
                self.mag_samples.append([mx, my, mz])

            rate.sleep()

        if len(self.mag_samples) < self.min_mag_samples:
            rospy.logwarn(
                "Collected only %d mag samples. Calibration may be weak.",
                len(self.mag_samples),
            )

        self.compute_mag_calibration()
        self.save_yaml()

        self.calibrated = True
        rospy.loginfo("Calibration done. Publishing calibrated heading...")
        rospy.loginfo("Saved calibration to: %s", self.output_yaml)

        while not rospy.is_shutdown():
            rate.sleep()

    # ============================================================
    # STATIC BIAS
    # ============================================================
    def compute_static_bias(self):
        gyro_np = np.array(self.static_gyro, dtype=np.float64)
        acc_np = np.array(self.static_acc, dtype=np.float64)

        self.gyro_bias = np.mean(gyro_np, axis=0)
        acc_mean = np.mean(acc_np, axis=0)

        # Giả sử robot đứng tương đối bằng, trục Z đo +g
        self.acc_bias = np.array(
            [acc_mean[0], acc_mean[1], acc_mean[2] - 9.80665], dtype=np.float64
        )

        gyro_std = np.std(gyro_np, axis=0)
        acc_std = np.std(acc_np, axis=0)

        rospy.loginfo(
            "Gyro bias [rad/s]: x=%.8f y=%.8f z=%.8f",
            self.gyro_bias[0],
            self.gyro_bias[1],
            self.gyro_bias[2],
        )
        rospy.loginfo(
            "Gyro std  [rad/s]: x=%.8f y=%.8f z=%.8f",
            gyro_std[0],
            gyro_std[1],
            gyro_std[2],
        )

        rospy.loginfo(
            "Acc bias [m/s^2]: x=%.8f y=%.8f z=%.8f",
            self.acc_bias[0],
            self.acc_bias[1],
            self.acc_bias[2],
        )
        rospy.loginfo(
            "Acc std  [m/s^2]: x=%.8f y=%.8f z=%.8f", acc_std[0], acc_std[1], acc_std[2]
        )

    # ============================================================
    # MAG CALIBRATION
    # ============================================================
    def compute_mag_calibration(self):
        mag_np = np.array(self.mag_samples, dtype=np.float64)

        mag_min = np.min(mag_np, axis=0)
        mag_max = np.max(mag_np, axis=0)

        spans = mag_max - mag_min
        rospy.loginfo(
            "Mag min [T]: x=%.8e y=%.8e z=%.8e", mag_min[0], mag_min[1], mag_min[2]
        )
        rospy.loginfo(
            "Mag max [T]: x=%.8e y=%.8e z=%.8e", mag_max[0], mag_max[1], mag_max[2]
        )
        rospy.loginfo("Mag span[T]: x=%.8e y=%.8e z=%.8e", spans[0], spans[1], spans[2])

        if spans[0] < self.min_mag_span_x or spans[1] < self.min_mag_span_y:
            rospy.logwarn(
                "Mag coverage in XY seems poor. Hard/soft-iron estimate may be weak."
            )

        if spans[2] < self.min_mag_span_z:
            rospy.logwarn(
                "Mag Z span is small. This is acceptable if robot mainly rotates on flat ground, but 3D calibration will be limited."
            )

        # Hard-iron offset
        self.mag_offset = (mag_max + mag_min) / 2.0

        # Soft-iron simple scale
        half_range = (mag_max - mag_min) / 2.0
        avg_radius = np.mean(half_range[:2])  # ưu tiên mặt phẳng XY cho xe mặt đất

        self.mag_scale = np.ones(3, dtype=np.float64)
        for i in range(3):
            if half_range[i] > 1e-12:
                self.mag_scale[i] = avg_radius / half_range[i]
            else:
                self.mag_scale[i] = 1.0

        rospy.loginfo(
            "Mag offset [T]: x=%.8e y=%.8e z=%.8e",
            self.mag_offset[0],
            self.mag_offset[1],
            self.mag_offset[2],
        )
        rospy.loginfo(
            "Mag scale     : x=%.8f y=%.8f z=%.8f",
            self.mag_scale[0],
            self.mag_scale[1],
            self.mag_scale[2],
        )

        # đánh giá sau calibration
        corrected = (mag_np - self.mag_offset) * self.mag_scale
        norms = np.linalg.norm(corrected[:, :2], axis=1)
        rospy.loginfo(
            "Corrected XY mag norm mean = %.8e, std = %.8e",
            np.mean(norms),
            np.std(norms),
        )

    # ============================================================
    # HEADING COMPUTE + PUBLISH
    # ============================================================
    def publish_calibrated_heading(self, mag_msg):
        mx = mag_msg.magnetic_field.x
        my = mag_msg.magnetic_field.y
        mz = mag_msg.magnetic_field.z

        # 1) hard-iron correction
        mx -= self.mag_offset[0]
        my -= self.mag_offset[1]
        mz -= self.mag_offset[2]

        # 2) soft-iron scale correction
        mx *= self.mag_scale[0]
        my *= self.mag_scale[1]
        mz *= self.mag_scale[2]

        # publish calibrated mag vector
        mag_vec = Vector3Stamped()
        mag_vec.header = mag_msg.header
        mag_vec.vector.x = mx
        mag_vec.vector.y = my
        mag_vec.vector.z = mz
        self.pub_mag_calibrated.publish(mag_vec)

        roll = self.latest_roll
        pitch = self.latest_pitch

        # 3) tilt compensation
        Xh = mx * math.cos(pitch) + mz * math.sin(pitch)
        Yh = (
            mx * math.sin(roll) * math.sin(pitch)
            + my * math.cos(roll)
            - mz * math.sin(roll) * math.cos(pitch)
        )

        # 4) yaw magnetic
        yaw_mag = math.atan2(Yh, Xh)

        if self.invert_yaw:
            yaw_mag = -yaw_mag

        # 5) cộng mounting offset
        yaw_mag += self.sensor_yaw_offset_rad

        # 6) chuyển sang heading true north
        heading_true = yaw_mag + self.magnetic_declination_rad
        heading_true = self.normalize_angle(heading_true)

        # 7) low-pass
        if self.filtered_heading_rad is None:
            self.filtered_heading_rad = heading_true
        else:
            delta = self.normalize_angle(heading_true - self.filtered_heading_rad)
            self.filtered_heading_rad = self.normalize_angle(
                self.filtered_heading_rad + self.alpha * delta
            )

        # publish heading rad/deg
        msg_rad = Float64()
        msg_rad.data = self.filtered_heading_rad
        self.pub_heading_rad.publish(msg_rad)

        msg_deg = Float64()
        msg_deg.data = self.rad_to_heading_deg(self.filtered_heading_rad)
        self.pub_heading_deg.publish(msg_deg)

        # publish rpy deg
        rpy_msg = Vector3Stamped()
        rpy_msg.header = mag_msg.header
        rpy_msg.vector.x = math.degrees(roll)
        rpy_msg.vector.y = math.degrees(pitch)
        rpy_msg.vector.z = self.rad_to_heading_deg(self.filtered_heading_rad)
        self.pub_rpy_deg.publish(rpy_msg)

        rospy.loginfo_throttle(
            1.0,
            "Heading true north: %.2f deg | roll=%.2f deg | pitch=%.2f deg",
            self.rad_to_heading_deg(self.filtered_heading_rad),
            math.degrees(roll),
            math.degrees(pitch),
        )

    # ============================================================
    # SAVE YAML
    # ============================================================
    def save_yaml(self):
        data = {
            "imu_calibration": {
                "gyro_bias": {
                    "x": float(self.gyro_bias[0]),
                    "y": float(self.gyro_bias[1]),
                    "z": float(self.gyro_bias[2]),
                    "unit": "rad/s",
                },
                "acc_bias": {
                    "x": float(self.acc_bias[0]),
                    "y": float(self.acc_bias[1]),
                    "z": float(self.acc_bias[2]),
                    "unit": "m/s^2",
                },
                "mag_offset": {
                    "x": float(self.mag_offset[0]),
                    "y": float(self.mag_offset[1]),
                    "z": float(self.mag_offset[2]),
                    "unit": "tesla",
                },
                "mag_scale": {
                    "x": float(self.mag_scale[0]),
                    "y": float(self.mag_scale[1]),
                    "z": float(self.mag_scale[2]),
                    "unit": "dimensionless",
                },
                "heading": {
                    "magnetic_declination_rad": float(self.magnetic_declination_rad),
                    "sensor_yaw_offset_rad": float(self.sensor_yaw_offset_rad),
                    "invert_yaw": bool(self.invert_yaw),
                },
                "topics": {
                    "imu_raw_topic": self.imu_raw_topic,
                    "imu_topic": self.imu_topic,
                    "mag_topic": self.mag_topic,
                },
                "sample_counts": {
                    "static_gyro_samples": int(len(self.static_gyro)),
                    "static_acc_samples": int(len(self.static_acc)),
                    "mag_samples": int(len(self.mag_samples)),
                },
            }
        }

        with open(self.output_yaml, "w", encoding="utf-8") as f:
            yaml.safe_dump(data, f, sort_keys=False, allow_unicode=True)

    # ============================================================
    # HELPERS
    # ============================================================
    @staticmethod
    def normalize_angle(angle):
        while angle > math.pi:
            angle -= 2.0 * math.pi
        while angle < -math.pi:
            angle += 2.0 * math.pi
        return angle

    @staticmethod
    def rad_to_heading_deg(rad):
        deg = math.degrees(rad)
        if deg < 0:
            deg += 360.0
        return deg


if __name__ == "__main__":
    try:
        node = IMUAutoCalibratorWithHeading()
        node.run()
    except rospy.ROSInterruptException:
        pass

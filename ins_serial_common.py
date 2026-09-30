#!/usr/bin/env python3
import math
import struct
from typing import Iterator, Optional

DEFAULT_PORT = "/dev/ttyUSB0"
DEFAULT_BAUD = 115200
INS_HEADER = b"\x10\x10"
YAW_OFFSET = 25


def hexstr(data: bytes) -> str:
    return " ".join(f"{byte:02X}" for byte in data)


def checksum_sum(data: bytes) -> int:
    return sum(data) & 0xFF


def packet_checksum_expected(packet: bytes) -> int:
    if len(packet) < 5:
        return 0
    return checksum_sum(packet[:4] + packet[5:])


def build_packet(cmd: int, payload: bytes) -> bytes:
    total_len = 5 + len(payload)
    packet = bytearray([0x10, 0x10, cmd, total_len, 0x00])
    packet.extend(payload)
    packet[4] = packet_checksum_expected(packet)
    return bytes(packet)


def command_name(cmd: int) -> str:
    return {
        0x01: "STATUS",
        0x02: "DATA",
        0x03: "CONTROL",
        0x82: "SET INPUT",
        0x83: "SET NAV PARAM",
        0x84: "OUTPUT CTRL",
        0x86: "GYROCOMPASS",
    }.get(cmd, "UNKNOWN")


def decode_packet_meta(packet: bytes) -> dict:
    if len(packet) < 5:
        return {
            "header": packet[:2],
            "cmd": None,
            "cmd_name": "INVALID",
            "declared_len": len(packet),
            "actual_len": len(packet),
            "checksum_rx": None,
            "checksum_expected": None,
            "checksum_ok": False,
            "payload": b"",
        }

    cmd = packet[2]
    checksum_rx = packet[4]
    checksum_expected = packet_checksum_expected(packet)

    return {
        "header": packet[:2],
        "cmd": cmd,
        "cmd_name": command_name(cmd),
        "declared_len": packet[3],
        "actual_len": len(packet),
        "checksum_rx": checksum_rx,
        "checksum_expected": checksum_expected,
        "checksum_ok": checksum_rx == checksum_expected,
        "payload": packet[5:],
    }


def open_serial(
    port: str = DEFAULT_PORT,
    baud: int = DEFAULT_BAUD,
    timeout: float = 0.05,
) -> object:
    import serial

    return serial.Serial(
        port=port,
        baudrate=baud,
        bytesize=8,
        parity="N",
        stopbits=1,
        timeout=timeout,
    )


def read_float_le(data: bytes, offset: int) -> float:
    return struct.unpack("<f", data[offset:offset + 4])[0]


def read_double_le(data: bytes, offset: int) -> float:
    return struct.unpack("<d", data[offset:offset + 8])[0]


def read_u32_le(data: bytes, offset: int) -> int:
    return int.from_bytes(data[offset:offset + 4], byteorder="little", signed=False)


def rad_to_deg(rad: float) -> float:
    return rad * 180.0 / math.pi


def deg_to_rad(deg: float) -> float:
    return deg * math.pi / 180.0


def normalize_deg(deg: float) -> float:
    deg = deg % 360.0
    if deg < 0:
        deg += 360.0
    return deg


def extract_ins_packets(buf: bytearray) -> Iterator[bytes]:
    while True:
        idx = buf.find(INS_HEADER)
        if idx < 0:
            if len(buf) > 4096:
                buf.clear()
            return

        if idx > 0:
            del buf[:idx]

        if len(buf) < 4:
            return

        total_len = buf[3]
        if total_len < 5:
            del buf[0]
            continue

        if len(buf) < total_len:
            return

        pkt = bytes(buf[:total_len])
        del buf[:total_len]
        yield pkt


def decode_status_0x01(pkt: bytes) -> Optional[dict]:
    if len(pkt) < 9 or pkt[2] != 0x01:
        return None

    status = read_u32_le(pkt, 5)
    bin_mode = (status >> 12) & 0b11

    return {
        "status": status,
        "bic_status": (status >> 0) & 0b11,
        "bin_status": (status >> 6) & 0b11,
        "compass_remaining_min": (status >> 8) & 0b1111,
        "bin_mode": bin_mode,
        "bin_mode_text": {
            0: "Cho",
            1: "La ban con quay",
            2: "Dan duong",
            3: "Khong xac dinh",
        }.get(bin_mode, "Khong xac dinh"),
        "bin_adjust_status": (status >> 14) & 0b11,
        "fixed_base": (status >> 18) & 0b1,
        "dpc_status": (status >> 22) & 0b11,
        "need_calib": (status >> 24) & 0b1,
        "by_link_error": (status >> 29) & 0b1,
    }


def decode_control_0x03(pkt: bytes) -> Optional[dict]:
    if len(pkt) < 9 or pkt[2] != 0x03:
        return None

    code = pkt[4]
    value = read_u32_le(pkt, 5)

    meaning = {
        0x2C: "Bat dau la ban con quay",
        0x2D: "Ket thuc la ban con quay",
    }.get(code, "Khong xac dinh")

    return {
        "code": code,
        "value": value,
        "meaning": meaning,
    }

#!/usr/bin/env python3
import argparse
import hashlib
import time
from typing import Optional

from ins_serial_common import (
    DEFAULT_BAUD,
    DEFAULT_PORT,
    YAW_OFFSET,
    command_name,
    decode_packet_meta,
    decode_control_0x03,
    decode_status_0x01,
    extract_ins_packets,
    hexstr,
    normalize_deg,
    open_serial,
    rad_to_deg,
    read_float_le,
)

CMD_STOP_ONCE = bytes.fromhex("10 10 84 0C 31 81 00 00 00 00 00 00")
CMD_OUTPUT_ONCE = bytes.fromhex("10 10 84 0C B0 00 00 00 00 00 00 00")
CMD_START_LOOP = bytes.fromhex("10 10 84 0C B2 01 00 01 00 00 00 00")
CMD_ENABLE_LOOP = bytes.fromhex("10 10 84 0C B2 00 00 01 00 00 00 01")


def packet_hash(data: bytes) -> str:
    return hashlib.md5(data).hexdigest()[:8]


def print_protocol(packet: bytes, direction: str, label: Optional[str] = None) -> None:
    meta = decode_packet_meta(packet)
    tag = label or meta["cmd_name"]

    print(f"\n[{direction} PROTOCOL] {tag}")
    print(f"  raw                  : {hexstr(packet)}")
    print(f"  header               : {hexstr(meta['header'])}")
    if meta["cmd"] is not None:
        print(f"  cmd                  : 0x{meta['cmd']:02X} ({meta['cmd_name']})")
    print(f"  declared len         : {meta['declared_len']}")
    print(f"  actual len           : {meta['actual_len']}")
    if meta["checksum_rx"] is not None:
        print(f"  checksum rx          : 0x{meta['checksum_rx']:02X}")
        print(f"  checksum expected    : 0x{meta['checksum_expected']:02X}")
        print(f"  checksum ok          : {meta['checksum_ok']}")
    print(f"  payload len          : {len(meta['payload'])}")
    print(f"  payload              : {hexstr(meta['payload'])}")


def print_status(pkt: bytes) -> None:
    info = decode_status_0x01(pkt)
    if info is None:
        return

    print_protocol(pkt, "RX")
    print("\n[STATUS 0x01]")
    print(f"  RAW                  : {hexstr(pkt)}")
    print(f"  status               : 0x{info['status']:08X}")
    print(f"  BIC status           : {info['bic_status']}")
    print(f"  BIN status           : {info['bin_status']}")
    print(f"  BIN mode             : {info['bin_mode']} - {info['bin_mode_text']}")
    print(f"  compass remaining    : {info['compass_remaining_min']} min")
    print(f"  BIN adjust status    : {info['bin_adjust_status']}")
    print(f"  fixed base           : {info['fixed_base']}")
    print(f"  DPC status           : {info['dpc_status']}")
    print(f"  need calibration     : {info['need_calib']}")
    print(f"  BY link error        : {info['by_link_error']}")


def print_control(pkt: bytes) -> None:
    info = decode_control_0x03(pkt)
    if info is None:
        return

    print_protocol(pkt, "RX")
    print("\n[CONTROL 0x03]")
    print(f"  code                 : 0x{info['code']:02X}")
    print(f"  value                : 0x{info['value']:08X}")
    print(f"  meaning              : {info['meaning']}")


def print_data_0x02(pkt: bytes, count: int) -> None:
    if len(pkt) < YAW_OFFSET + 4:
        print_protocol(pkt, "RX")
        print("\n[INS DATA 0x02]")
        print(f"  packet no.           : {count}")
        print("  packet too short")
        return

    yaw_raw = pkt[YAW_OFFSET:YAW_OFFSET + 4]
    yaw_value = read_float_le(pkt, YAW_OFFSET)
    yaw_deg_direct = normalize_deg(yaw_value)
    yaw_deg_if_rad = normalize_deg(rad_to_deg(yaw_value))

    print_protocol(pkt, "RX")
    print("\n[INS DATA 0x02]")
    print(f"  packet no.           : {count}")
    print(f"  packet hash          : {packet_hash(pkt)}")
    print(f"  len                  : {len(pkt)} bytes")
    print(f"  yaw offset           : {YAW_OFFSET}-{YAW_OFFSET + 3}")
    print(f"  yaw bytes            : {hexstr(yaw_raw)}")
    print(f"  yaw float            : {yaw_value:.6f}")
    print(f"  yaw direct           : {yaw_deg_direct:.3f} deg")
    print(f"  yaw if rad           : {yaw_deg_if_rad:.3f} deg")


def send_commands(ser, mode: str) -> None:
    if mode == "once":
        commands = [CMD_STOP_ONCE, CMD_OUTPUT_ONCE]
    else:
        commands = [CMD_START_LOOP, CMD_ENABLE_LOOP]

    for index, cmd in enumerate(commands, start=1):
        ser.write(cmd)
        ser.flush()
        print_protocol(cmd, "TX", label=f"SEND {index} - {command_name(cmd[2])}")
        time.sleep(0.05)


def main() -> None:
    parser = argparse.ArgumentParser(description="Bat xuat du lieu 0x02 tu BIN.")
    parser.add_argument("--port", default=DEFAULT_PORT, help="Serial port")
    parser.add_argument("--baud", type=int, default=DEFAULT_BAUD, help="Baudrate")
    parser.add_argument(
        "--mode",
        choices=["once", "loop"],
        default="loop",
        help="once = hoi 1 lan, loop = bat xuat lien tuc.",
    )
    parser.add_argument(
        "--count",
        type=int,
        default=0,
        help="So goi 0x02 can nhan truoc khi thoat. 0 = chay den khi Ctrl+C.",
    )
    args = parser.parse_args()

    ser = open_serial(port=args.port, baud=args.baud)
    buf = bytearray()
    packet_count = 0

    print("====================================")
    print(" ENABLE OUTPUT 0x02")
    print("====================================")
    print(f"PORT                  : {args.port}")
    print(f"BAUD                  : {args.baud}")
    print(f"MODE                  : {args.mode}")
    print("====================================")

    send_commands(ser, args.mode)
    print("[INFO] Dang nghe goi 0x02. Nhan Ctrl+C de dung.")

    try:
        while True:
            data = ser.read(512)
            if data:
                buf.extend(data)
                for pkt in extract_ins_packets(buf):
                    cmd = pkt[2]
                    if cmd == 0x01:
                        print_status(pkt)
                    elif cmd == 0x02:
                        packet_count += 1
                        print_data_0x02(pkt, packet_count)
                        if args.count > 0 and packet_count >= args.count:
                            return
                    elif cmd == 0x03:
                        print_control(pkt)
                    else:
                        print_protocol(pkt, "RX", label=f"CMD 0x{cmd:02X}")

            time.sleep(0.01)
    except KeyboardInterrupt:
        print("\n[EXIT] Stopped by user")
    finally:
        ser.close()


if __name__ == "__main__":
    main()

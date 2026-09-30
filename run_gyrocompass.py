#!/usr/bin/env python3
import argparse
import time

from ins_serial_common import (
    DEFAULT_BAUD,
    DEFAULT_PORT,
    build_packet,
    decode_control_0x03,
    decode_status_0x01,
    extract_ins_packets,
    hexstr,
    open_serial,
)


def print_status(pkt: bytes) -> None:
    info = decode_status_0x01(pkt)
    if info is None:
        return

    print("\n[STATUS 0x01]")
    print(f"  RAW                  : {hexstr(pkt)}")
    print(f"  status               : 0x{info['status']:08X}")
    print(f"  BIC status           : {info['bic_status']}")
    print(f"  BIN status           : {info['bin_status']}")
    print(f"  compass remaining    : {info['compass_remaining_min']} min")
    print(f"  BIN mode             : {info['bin_mode']} - {info['bin_mode_text']}")
    print(f"  BIN adjust status    : {info['bin_adjust_status']}")
    print(f"  fixed base           : {info['fixed_base']}")
    print(f"  DPC status           : {info['dpc_status']}")
    print(f"  need calibration     : {info['need_calib']}")
    print(f"  BY link error        : {info['by_link_error']}")


def print_control(pkt: bytes) -> bool:
    info = decode_control_0x03(pkt)
    if info is None:
        return False

    print("\n[CONTROL 0x03]")
    print(f"  RAW                  : {hexstr(pkt)}")
    print(f"  code                 : 0x{info['code']:02X}")
    print(f"  value                : 0x{info['value']:08X}")
    print(f"  meaning              : {info['meaning']}")
    return info["code"] == 0x2D


def main() -> None:
    parser = argparse.ArgumentParser(description="Gui lenh 0x86 bat dau la ban con quay.")
    parser.add_argument("--port", default=DEFAULT_PORT, help="Serial port")
    parser.add_argument("--baud", type=int, default=DEFAULT_BAUD, help="Baudrate")
    parser.add_argument(
        "--stop-on-complete",
        action="store_true",
        help="Thoat khi nhan duoc goi 0x03/0x2D ket thuc la ban con quay.",
    )
    args = parser.parse_args()

    packet = build_packet(0x86, b"\x00\x00\x00\x00")

    ser = open_serial(port=args.port, baud=args.baud)
    buf = bytearray()

    print("====================================")
    print(" START GYROCOMPASS 0x86")
    print("====================================")
    print(f"PORT                  : {args.port}")
    print(f"BAUD                  : {args.baud}")
    print(f"CMD                   : {hexstr(packet)}")
    print("====================================")

    ser.write(packet)
    ser.flush()

    print("[INFO] Dang nghe phan hoi 0x01/0x03. Nhan Ctrl+C de dung.")

    try:
        while True:
            data = ser.read(512)
            if data:
                buf.extend(data)
                for pkt in extract_ins_packets(buf):
                    cmd = pkt[2]
                    if cmd == 0x01:
                        print_status(pkt)
                    elif cmd == 0x03:
                        finished = print_control(pkt)
                        if finished and args.stop_on_complete:
                            return
                    else:
                        print("\n[RX]")
                        print(f"  cmd                  : 0x{cmd:02X}")
                        print(f"  raw                  : {hexstr(pkt)}")

            time.sleep(0.01)
    except KeyboardInterrupt:
        print("\n[EXIT] Stopped by user")
    finally:
        ser.close()


if __name__ == "__main__":
    main()

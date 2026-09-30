#!/usr/bin/env python3
import argparse
import datetime as dt
import struct
import time

from ins_serial_common import (
    DEFAULT_BAUD,
    DEFAULT_PORT,
    build_packet,
    deg_to_rad,
    extract_ins_packets,
    hexstr,
    open_serial,
)


def build_date_value(day: int, month: int, year: int) -> int:
    return (day & 0xFF) | ((month & 0xFF) << 8) | ((year & 0xFFFF) << 16)


def build_time_value(hour: int, minute: int, millisecond: int) -> int:
    return (millisecond & 0xFFFF) | ((minute & 0xFF) << 16) | ((hour & 0xFF) << 24)


def build_setup_bits(
    accept_coords: bool,
    accept_heading: bool,
    accept_datetime: bool,
    accept_timezone: bool,
) -> int:
    value = 0
    if accept_coords:
        value |= 1 << 0
    if accept_heading:
        value |= 1 << 1
    if accept_datetime:
        value |= 1 << 2
    if accept_timezone:
        value |= 1 << 3
    return value


def build_0x82_packet(
    lat_rad: float,
    lon_rad: float,
    alt_m: float,
    yaw_rad: float,
    date_value: int,
    time_value: int,
    timezone_quarter: int,
    setup_bits: int,
    reserved_float_1: float = 0.0,
    reserved_float_2: float = 0.0,
    reserved_byte_46: int = 0,
    reserved_byte_47: int = 0,
) -> bytes:
    payload = bytearray()
    payload.extend(struct.pack("<d", lat_rad))
    payload.extend(struct.pack("<d", lon_rad))
    payload.extend(struct.pack("<f", alt_m))
    payload.extend(struct.pack("<f", yaw_rad))
    payload.extend(struct.pack("<f", reserved_float_1))
    payload.extend(struct.pack("<f", reserved_float_2))
    payload.extend(struct.pack("<I", date_value))
    payload.extend(struct.pack("<I", time_value))
    payload.extend(struct.pack("<B", timezone_quarter & 0xFF))
    payload.extend(struct.pack("<B", reserved_byte_46 & 0xFF))
    payload.extend(struct.pack("<B", reserved_byte_47 & 0xFF))
    payload.extend(struct.pack("<I", setup_bits & 0xFFFFFFFF))
    return build_packet(0x82, bytes(payload))


def main() -> None:
    now = dt.datetime.now()

    parser = argparse.ArgumentParser(
        description="Gui lenh 0x82 thiet lap du lieu dau vao tu BY xuong BIN."
    )
    parser.add_argument("--port", default=DEFAULT_PORT, help="Serial port")
    parser.add_argument("--baud", type=int, default=DEFAULT_BAUD, help="Baudrate")
    parser.add_argument("--lat-deg", type=float, required=True, help="Vi do theo do.")
    parser.add_argument("--lon-deg", type=float, required=True, help="Kinh do theo do.")
    parser.add_argument("--alt-m", type=float, default=0.0, help="Do cao theo met.")
    parser.add_argument("--yaw-deg", type=float, default=0.0, help="Goc phuong vi theo do.")
    parser.add_argument("--day", type=int, default=now.day, help="Ngay trong thang.")
    parser.add_argument("--month", type=int, default=now.month, help="Thang.")
    parser.add_argument("--year", type=int, default=now.year, help="Nam.")
    parser.add_argument("--hour", type=int, default=now.hour, help="Gio.")
    parser.add_argument("--minute", type=int, default=now.minute, help="Phut.")
    parser.add_argument(
        "--millisecond",
        type=int,
        default=now.second * 1000 + now.microsecond // 1000,
        help="Mili giay trong phut.",
    )
    parser.add_argument(
        "--timezone-hours",
        type=float,
        default=7.0,
        help="Mui gio theo gio, se doi sang don vi 1/4 gio.",
    )
    parser.add_argument(
        "--timezone-quarter",
        type=int,
        help="Ghi de truc tiep gia tri mui gio theo don vi 1/4 gio.",
    )
    parser.add_argument(
        "--setup-bits",
        type=lambda value: int(value, 0),
        help="Ghi de truc tiep truong bit thiet dat, vi du 0x0F.",
    )
    parser.add_argument(
        "--accept-coords",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Bit 0: tiep nhan toa do.",
    )
    parser.add_argument(
        "--accept-heading",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Bit 1: tiep nhan dinh huong.",
    )
    parser.add_argument(
        "--accept-datetime",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Bit 2: tiep nhan ngay gio.",
    )
    parser.add_argument(
        "--accept-timezone",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Bit 3: tiep nhan mui gio.",
    )
    parser.add_argument(
        "--reserved-float-1",
        type=float,
        default=0.0,
        help="Gia tri du phong tai byte 29-32.",
    )
    parser.add_argument(
        "--reserved-float-2",
        type=float,
        default=0.0,
        help="Gia tri du phong tai byte 33-36.",
    )
    parser.add_argument(
        "--reserved-byte-46",
        type=lambda value: int(value, 0),
        default=0,
        help="Gia tri du phong tai byte 46.",
    )
    parser.add_argument(
        "--reserved-byte-47",
        type=lambda value: int(value, 0),
        default=0,
        help="Gia tri du phong tai byte 47.",
    )
    parser.add_argument(
        "--listen-seconds",
        type=float,
        default=2.0,
        help="So giay nghe phan hoi sau khi gui. 0 = khong nghe.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Chi in goi lenh, khong gui xuong serial.",
    )
    args = parser.parse_args()

    lat_rad = deg_to_rad(args.lat_deg)
    lon_rad = deg_to_rad(args.lon_deg)
    yaw_rad = deg_to_rad(args.yaw_deg)

    timezone_quarter = args.timezone_quarter
    if timezone_quarter is None:
        timezone_quarter = int(round(args.timezone_hours * 4))

    if args.setup_bits is None:
        setup_bits = build_setup_bits(
            accept_coords=args.accept_coords,
            accept_heading=args.accept_heading,
            accept_datetime=args.accept_datetime,
            accept_timezone=args.accept_timezone,
        )
    else:
        setup_bits = args.setup_bits

    date_value = build_date_value(args.day, args.month, args.year)
    time_value = build_time_value(args.hour, args.minute, args.millisecond)

    packet = build_0x82_packet(
        lat_rad=lat_rad,
        lon_rad=lon_rad,
        alt_m=args.alt_m,
        yaw_rad=yaw_rad,
        date_value=date_value,
        time_value=time_value,
        timezone_quarter=timezone_quarter,
        setup_bits=setup_bits,
        reserved_float_1=args.reserved_float_1,
        reserved_float_2=args.reserved_float_2,
        reserved_byte_46=args.reserved_byte_46,
        reserved_byte_47=args.reserved_byte_47,
    )

    print("====================================")
    print(" SEND INPUT SETUP 0x82")
    print("====================================")
    print(f"PORT                  : {args.port}")
    print(f"BAUD                  : {args.baud}")
    print(f"lat                    : {args.lat_deg:.8f} deg -> {lat_rad:.8f} rad")
    print(f"lon                    : {args.lon_deg:.8f} deg -> {lon_rad:.8f} rad")
    print(f"alt                    : {args.alt_m:.3f} m")
    print(f"yaw                    : {args.yaw_deg:.3f} deg -> {yaw_rad:.8f} rad")
    print(f"date value             : 0x{date_value:08X}")
    print(f"time value             : 0x{time_value:08X}")
    print(f"timezone quarter-hour  : 0x{timezone_quarter & 0xFF:02X}")
    print(f"setup bits             : 0x{setup_bits:08X}")
    print(f"packet len             : {len(packet)} bytes")
    print(f"packet                 : {hexstr(packet)}")
    print("====================================")

    if args.dry_run:
        return

    ser = open_serial(port=args.port, baud=args.baud)
    buf = bytearray()

    try:
        ser.write(packet)
        ser.flush()

        if args.listen_seconds <= 0:
            return

        print("[INFO] Dang nghe phan hoi sau khi gui 0x82...")
        deadline = time.time() + args.listen_seconds
        while time.time() < deadline:
            data = ser.read(512)
            if data:
                buf.extend(data)
                for pkt in extract_ins_packets(buf):
                    print(f"[RX 0x{pkt[2]:02X}] {hexstr(pkt)}")
            time.sleep(0.01)
    finally:
        ser.close()


if __name__ == "__main__":
    main()

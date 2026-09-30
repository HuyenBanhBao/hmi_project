# #!/usr/bin/env python3
# import subprocess
# import time

# import Jetson.GPIO as GPIO

# # Dùng cách đánh số chân vật lý trên header 40-pin.
# GPIO.setmode(GPIO.BOARD)

# # Công tắc nối vào chân vật lý số 7.
# SWITCH_PIN = 7

# RUN_SCRIPT = "/home/tung/Desktop/run_hmi_offline_hidden.sh"
# STOP_SCRIPT = "/home/tung/Desktop/stop_hmi_offline.sh"

# # Board này đang báo bỏ qua pull_up_down của Jetson.GPIO, vì vậy chân input
# # phải có điện trở kéo ngoài để tránh trạng thái floating.
# GPIO.setup(SWITCH_PIN, GPIO.IN, pull_up_down=GPIO.PUD_UP)

# POLL_INTERVAL = 0.02
# DEBOUNCE_MS = 120
# STABLE_SAMPLES = max(2, int(DEBOUNCE_MS / (POLL_INTERVAL * 1000)))


# def run_cmd(script_path):
#     subprocess.Popen(
#         ["/bin/bash", script_path],
#         stdout=subprocess.DEVNULL,
#         stderr=subprocess.DEVNULL,
#     )


# def read_switch_state():
#     # Công tắc đóng: GPIO nối GND => LOW.
#     return "ON" if GPIO.input(SWITCH_PIN) == GPIO.LOW else "OFF"


# def read_stable_state():
#     candidate = None
#     stable_count = 0

#     while True:
#         state = read_switch_state()

#         if state == candidate:
#             stable_count += 1
#         else:
#             candidate = state
#             stable_count = 1

#         if stable_count >= STABLE_SAMPLES:
#             return candidate

#         time.sleep(POLL_INTERVAL)


# def wait_for_state_change(previous_state):
#     candidate = previous_state
#     stable_count = 0

#     while True:
#         state = read_switch_state()

#         if state == candidate:
#             stable_count += 1
#         else:
#             candidate = state
#             stable_count = 1

#         if candidate != previous_state and stable_count >= STABLE_SAMPLES:
#             return candidate

#         time.sleep(POLL_INTERVAL)


# def handle_state_change(state):
#     if state == "ON":
#         print("Công tắc ĐÓNG -> chạy HMI", flush=True)
#         run_cmd(RUN_SCRIPT)
#     else:
#         print("Công tắc MỞ -> tắt HMI", flush=True)
#         run_cmd(STOP_SCRIPT)


# try:
#     last_state = read_stable_state()
#     handle_state_change(last_state)

#     while True:
#         last_state = wait_for_state_change(last_state)
#         handle_state_change(last_state)

# except KeyboardInterrupt:
#     pass

# finally:
#     GPIO.cleanup()

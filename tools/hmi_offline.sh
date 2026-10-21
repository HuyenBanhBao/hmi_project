#!/usr/bin/env bash
# Shared implementation for the Run/Stop HMI Offline desktop shortcuts.
set -eo pipefail

PROJECT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
LOG_DIR="$PROJECT_DIR/logs"
mkdir -p "$LOG_DIR"
cd "$PROJECT_DIR"

# Serialize clicks; background services must not inherit this lock.
exec 9>"$LOG_DIR/hmi_offline.lock"
if ! flock -n 9; then
    echo "Another HMI start/stop operation is in progress."
    exit 1
fi
exec > >(tee -a "$LOG_DIR/hmi_offline.log") 2>&1

log() { printf '[%s] %s\n' "$(date '+%F %T')" "$*"; }
fail() { log "ERROR: $*"; exit 1; }

# Match only this user's services launched from this project. This also finds
# services from the old desktop scripts or a manually started npm run dev.
service_pids() {
    local service=$1 pattern pid
    case "$service" in
        frontend) pattern='(^|/)(node|nodejs) .*(tools/(dev_runner|local_launcher_server|offline_detail_server)\.mjs|node_modules/vite/bin/vite\.js)( |$)' ;;
        router) pattern='(^|/)python[0-9.]* .*tools/offline_route_server\.py( |$)' ;;
        rosbridge) pattern='(^|/)(python[0-9.]* .*roslaunch|roslaunch) rosbridge_server rosbridge_websocket\.launch( |$)' ;;
        joystick) pattern='(^|/)python[0-9.]* .*src/ros_nodes/ads1115_joystick_node\.py( |$)' ;;
        *) return 1 ;;
    esac
    for pid in $(pgrep -u "$UID" -f "$pattern" || true); do
        if [[ $(readlink -f "/proc/$pid/cwd" 2>/dev/null) == "$PROJECT_DIR" ]]; then
            printf '%s\n' "$pid"
        fi
    done
}

resume_service() {
    local pid
    while read -r pid; do
        [[ -n $pid ]] || continue
        if [[ $(ps -o stat= -p "$pid") == *T* ]]; then
            log "Resuming $1 (PID $pid)."
            kill -CONT "$pid"
        fi
    done < <(service_pids "$1")
}

http_ready() { curl --noproxy '*' -fsS --max-time 2 "$1" >/dev/null 2>&1; }
port_busy() { ss -H -ltn "sport = :$1" | grep -q .; }

start_service() {
    local service=$1 logfile=$2
    shift 2
    if [[ -n $(service_pids "$service") ]]; then
        resume_service "$service"
        log "$service already running; keeping existing process."
        return
    fi
    log "Starting $service; log: $LOG_DIR/$logfile"
    printf '\n--- %s ---\n' "$(date '+%F %T')" >> "$LOG_DIR/$logfile"
    nohup "$@" </dev/null >> "$LOG_DIR/$logfile" 2>&1 9>&- &
}

wait_http() {
    local service=$1 url=$2 logfile=$3 attempt
    for ((attempt = 0; attempt < 60; attempt++)); do
        if http_ready "$url"; then return; fi
        [[ -n $(service_pids "$service") ]] || break
        sleep 1
    done
    fail "$service is not ready at $url. See $LOG_DIR/$logfile"
}

stop_service() {
    local service=$1 attempt
    local -a pids=()
    mapfile -t pids < <(service_pids "$service")
    (("${#pids[@]}")) || return 0
    log "Stopping $service (PIDs: ${pids[*]})."
    # Stopped (Ctrl+Z) processes must resume before they can handle SIGTERM.
    kill -TERM "${pids[@]}" 2>/dev/null || true
    kill -CONT "${pids[@]}" 2>/dev/null || true
    for ((attempt = 0; attempt < 50; attempt++)); do
        [[ -n $(service_pids "$service") ]] || return 0
        sleep 0.2
    done
    log "ERROR: $service did not stop; check its log."
    return 1
}

start_stack() {
    local executable port tiles_running attempt
    # Desktop shortcuts do not load interactive .bashrc (including NVM).
    if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
        source "$HOME/.nvm/nvm.sh"
    fi
    for executable in node python3 curl ss docker; do
        command -v "$executable" >/dev/null || fail "Missing command: $executable"
    done
    [[ -f node_modules/vite/bin/vite.js ]] || fail "Dependencies missing; run npm install in $PROJECT_DIR."
    # These generated files were committed to the new repository without +x.
    for executable in node_modules/@esbuild/*/bin/esbuild node_modules/esbuild/bin/esbuild devel/_setup_util.py devel/env.sh; do
        if [[ -f $executable && ! -x $executable ]]; then chmod u+x "$executable"; fi
    done

    # Use the local ROS master, independent of stale interactive ROS settings.
    export ROS_MASTER_URI="${HMI_ROS_MASTER_URI:-http://192.168.1.114:11311}"
    export ROS_IP="${HMI_ROS_IP:-192.168.1.114}"
    unset ROS_HOSTNAME
    source /opt/ros/noetic/setup.bash
    if [[ -f devel/setup.bash ]]; then source devel/setup.bash; fi
    log "ROS master: $ROS_MASTER_URI; ROS_IP: $ROS_IP"
    rospack find rosbridge_server >/dev/null || fail "rosbridge_server is not installed."
    python3 -c 'import rospy' || fail "Missing Python ROS dependency."

    if ! tiles_running=$(docker inspect -f '{{.State.Running}}' tileserver-gl 2>/dev/null); then
        docker run -d --pull=never --name tileserver-gl \
            -v /home/tung/osm-offline-server/tiles:/data -p 8080:8080 \
            maptiler/tileserver-gl >> "$LOG_DIR/tileserver.log" 2>&1 \
            || fail "TileServer failed; see $LOG_DIR/tileserver.log"
    elif [[ $tiles_running != true ]]; then
        docker start tileserver-gl >> "$LOG_DIR/tileserver.log" 2>&1 \
            || fail "TileServer failed; see $LOG_DIR/tileserver.log"
    else
        log "TileServer already running."
    fi

    if [[ -z $(service_pids router) ]] && port_busy 5000; then
        fail "Port 5000 belongs to another process."
    fi
    start_service router offline_route_server.log python3 -u tools/offline_route_server.py \
        --roads /home/tung/osm_python/hoankiem_drive.gpkg --roads-layer edges --host 127.0.0.1 --port 5000

    if [[ -z $(service_pids frontend) ]]; then
        for port in 5173 5051 5002; do
            if port_busy "$port"; then fail "Port $port belongs to another process."; fi
        done
    fi
    start_service frontend frontend.log node tools/dev_runner.mjs
    wait_http frontend http://127.0.0.1:5173/ frontend.log
    wait_http frontend http://127.0.0.1:5051/health frontend.log
    if [[ -f ${OFFLINE_BUILDINGS_GPKG:-/home/tung/osm_python/hanoi_buildings.gpkg} && -f ${OFFLINE_POIS_GPKG:-/home/tung/osm_python/hanoi_pois.gpkg} ]]; then
        wait_http frontend http://127.0.0.1:5002/health frontend.log
    fi
    wait_http router http://127.0.0.1:5000/health offline_route_server.log

    if [[ -z $(service_pids rosbridge) ]] && port_busy 9090; then
        fail "Port 9090 belongs to another process."
    fi
    start_service rosbridge rosbridge.log roslaunch rosbridge_server rosbridge_websocket.launch
    for ((attempt = 0; attempt < 30; attempt++)); do
        if port_busy 9090; then break; fi
        [[ -n $(service_pids rosbridge) ]] || fail "ROS bridge exited; see $LOG_DIR/rosbridge.log"
        sleep 1
    done
    port_busy 9090 || fail "ROS bridge is not ready; see $LOG_DIR/rosbridge.log"
    start_service joystick ads1115_joystick.log python3 -u src/ros_nodes/ads1115_joystick_node.py
    sleep 2
    if [[ -z $(service_pids joystick) ]]; then
        log "WARNING: Joystick is unavailable; see $LOG_DIR/ads1115_joystick.log"
    fi
    log "HMI web and ROS ready: http://localhost:5173/"
}

stop_stack() {
    local service result=0
    for service in joystick rosbridge frontend router; do
        stop_service "$service" || result=1
    done
    if docker inspect tileserver-gl >/dev/null 2>&1; then
        docker stop tileserver-gl >> "$LOG_DIR/tileserver.log" 2>&1 || result=1
    fi
    if ((result == 0)); then log "HMI stopped."; fi
    return "$result"
}

case "${1:-}" in
    start) start_stack ;;
    stop) stop_stack ;;
    *) echo "Usage: bash tools/hmi_offline.sh {start|stop}"; exit 2 ;;
esac

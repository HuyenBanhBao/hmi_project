// std_msgs/String: data chứa JSON. Phần robot sẽ triển khai giao thức trong
// docs/ros-map-workflow.md; dùng topic riêng để launch manager cũ không chạy
// nhầm map mặc định khi chưa hỗ trợ trường map_name.
export const MAP_COMMAND_TOPIC = "/hmi/map_command";
export const MAP_LIST_TOPIC = "/hmi/map_list";
export const SAVE_MAP_LAUNCH = "save_aloam_2d_map";
export const RUN_MAP_LAUNCH = "helios_raw_to_map";

export const isMapLaunch = (launch) => launch === SAVE_MAP_LAUNCH || launch === RUN_MAP_LAUNCH;

export const createMapRequestId = () => `map_${Date.now()}_${Math.random().toString(36).slice(2)}`;

export const normalizeMapName = (name) => name.trim().normalize("NFC");

export const getMapNameError = (name) => {
    if (!/^[\p{L}\p{N}][\p{L}\p{N} _-]{0,79}$/u.test(name)) {
        return "Tên dài 1–80 ký tự, bắt đầu bằng chữ hoặc số; chỉ dùng chữ, số, dấu cách, _ hoặc -.";
    }
    return "";
};

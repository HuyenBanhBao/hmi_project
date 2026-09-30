import { Box, Typography } from "@mui/material";
import RocketLaunchIcon from "@mui/icons-material/RocketLaunch";
import WifiTetheringIcon from "@mui/icons-material/WifiTethering";
import { alpha, useTheme } from "@mui/material/styles";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRos } from "../context/RosContext";
import useRosPublisher from "../hooks/useRosPublisher";
import useRosTopic from "../hooks/useRosTopic";
import RosImuCard from "./RosImuCard";
import RosLaunchGroupControl from "./RosLaunchGroupControl";
import RosMotorTemperatureCard from "./RosMotorTemperatureCard";

const COMMAND_TOPIC = "/hmi/launch_command";
const STATUS_TOPIC = "/hmi/launch_status";
const SWITCH_STATE_TOPIC = "/hmi/launch_switch_state";
const IMU_TOPIC = "/imu/data_new";

const launchGroups = [
    {
        id: "cuong",
        title: "Xe cơ sở",
        targetMachine: "cuong",
        commands: [
            // { launch: "imu_start_calib", label: "Calib IMU" },
            { launch: "outdoor_waypoint_nav", label: "Khởi động EKF" },
            { launch: "rslidar_start", label: "Khởi động Lidar" },
            { launch: "aloam_velodyne_HDL_32", label: "Tạo bản đồ SLAM" },
            { launch: "save_aloam_2d_map", label: "Lưu bản đồ 2D" },
            { launch: "warthog_real_amcl_checked", label: "Điều khiển ROBOT" },
            { launch: "outdoor_waypoint_nav_tracking", label: "Chạy hình vuông" },
            { launch: "outdoor_waypoint_nav_sim", label: "Chạy bài 2" },
            { launch: "joy_launch_control_sim", label: "Chạy bài 3" },
        ],
    },
];
const COMMAND_LABEL_BY_LAUNCH = Object.fromEntries(
    launchGroups.flatMap((group) => group.commands.map((command) => [command.launch, command.label])),
);
const COMMAND_CONFIG_BY_LAUNCH = Object.fromEntries(
    launchGroups.flatMap((group) =>
        group.commands.map((command) => [
            command.launch,
            {
                ...command,
                targetMachine: group.targetMachine,
            },
        ]),
    ),
);

const getConnectionStatusView = (theme, connection) => {
    if (connection?.isConnected) {
        return {
            color: theme.hmi.colorPrimary,
            label: "Đã kết nối",
        };
    }

    if (connection?.status === "Connecting") {
        return {
            color: theme.hmi.colorBtnOrange,
            label: "Đang kết nối",
        };
    }

    if (connection?.status === "Unavailable") {
        return {
            color: theme.hmi.colorAshGray,
            label: "Chưa cấu hình",
        };
    }

    return {
        color: theme.hmi.colorError,
        label: "Chưa kết nối",
    };
};

const RosLaunchDrawer = () => {
    const theme = useTheme();
    const { isConnected, robotConnection, valiConnection } = useRos();
    const publishLaunchCommand = useRosPublisher(COMMAND_TOPIC, "std_msgs/String");
    const launchCommandMessage = useRosTopic(COMMAND_TOPIC, "std_msgs/String");
    const launchStatusMessage = useRosTopic(STATUS_TOPIC, "std_msgs/String");
    const launchSwitchStateMessage = useRosTopic(SWITCH_STATE_TOPIC, "std_msgs/String");
    const imuData = useRosTopic(IMU_TOPIC, "sensor_msgs/Imu");

    const [activeLaunchGroupId, setActiveLaunchGroupId] = useState(null);
    const [launchStatuses, setLaunchStatuses] = useState({});
    const [launchSwitchStates, setLaunchSwitchStates] = useState({});
    const handledSwitchRequestIdsRef = useRef(new Set());

    const deviceConnections = [robotConnection, valiConnection].filter(Boolean);
    const connectedDeviceCount = deviceConnections.filter((connection) => connection.isConnected).length;
    const summaryStatusColor =
        connectedDeviceCount === deviceConnections.length && deviceConnections.length > 0
            ? theme.hmi.colorPrimary
            : connectedDeviceCount > 0
              ? theme.hmi.colorBtnOrange
              : theme.hmi.colorError;

    const sendCommand = useCallback(
        ({ targetMachine, launch, label, action, source = "hmi_web" }) => {
            if (!isConnected) return;

            const payload = {
                source,
                target_machine: targetMachine,
                action,
                launch,
                request_id: `${Date.now()}_${targetMachine}_${launch}_${action}`,
                timestamp: Date.now(),
            };

            publishLaunchCommand({
                data: JSON.stringify(payload),
            });

            setLaunchStatuses((current) => ({
                ...current,
                [launch]: {
                    ...payload,
                    label,
                    event: action === "start" ? "pending_start" : "pending_stop",
                    receivedAt: Date.now(),
                },
            }));
        },
        [isConnected, publishLaunchCommand],
    );

    const applyLaunchMessage = (rawMessage) => {
        if (!rawMessage?.data) return;
        let payload;
        try {
            payload = JSON.parse(rawMessage.data);
        } catch {
            console.warn("Launch status không hợp lệ:", rawMessage.data);
            return;
        }

        if (!payload.launch) return;

        setLaunchStatuses((current) => ({
            ...current,
            [payload.launch]: {
                ...payload,
                receivedAt: Date.now(),
            },
        }));
    };

    useEffect(() => {
        if (!launchSwitchStateMessage?.data) return;

        let payload;
        try {
            payload = JSON.parse(launchSwitchStateMessage.data);
        } catch {
            console.warn("Launch switch state không hợp lệ:", launchSwitchStateMessage.data);
            return;
        }

        if (!payload.launch) return;

        setLaunchSwitchStates((current) => ({
            ...current,
            [payload.launch]: {
                isOn: payload.switch_state === "on" || payload.event === "switch_on",
                receivedAt: Date.now(),
                ...payload,
            },
        }));

        if (payload.reason === "startup_sync" || !payload.request_id) {
            return;
        }

        if (handledSwitchRequestIdsRef.current.has(payload.request_id)) {
            return;
        }

        const commandConfig = COMMAND_CONFIG_BY_LAUNCH[payload.launch];
        if (!commandConfig) return;

        handledSwitchRequestIdsRef.current.add(payload.request_id);

        const action = payload.switch_state === "on" || payload.event === "switch_on" ? "start" : "stop";
        sendCommand({
            targetMachine: payload.target_machine || commandConfig.targetMachine,
            launch: payload.launch,
            label: commandConfig.label,
            action,
            source: "hmi_switch_proxy",
        });
    }, [launchSwitchStateMessage, sendCommand]);

    useEffect(() => {
        if (!launchCommandMessage?.data) return;

        let payload;
        try {
            payload = JSON.parse(launchCommandMessage.data);
        } catch {
            console.warn("Launch command không hợp lệ:", launchCommandMessage.data);
            return;
        }

        if (!payload.launch || !payload.action || payload.source === "hmi_gpio_switch") return;

        setLaunchStatuses((current) => ({
            ...current,
            [payload.launch]: {
                ...payload,
                label: COMMAND_LABEL_BY_LAUNCH[payload.launch] || payload.launch,
                event: payload.action === "start" ? "pending_start" : "pending_stop",
                receivedAt: Date.now(),
            },
        }));
    }, [launchCommandMessage]);

    useEffect(() => {
        applyLaunchMessage(launchStatusMessage);
    }, [launchStatusMessage]);

    const toggleLaunchGroup = (groupId) => {
        setActiveLaunchGroupId((current) => (current === groupId ? null : groupId));
    };

    const closeLaunchGroup = () => {
        setActiveLaunchGroupId(null);
    };

    return (
        <Box
            sx={{
                position: "absolute",
                top: "95px",
                left: 0,
                bottom: 0,
                width: { xs: "calc(100% - 24px)", sm: 380 },
                zIndex: 1400,
                p: 1,
                bgcolor: theme.hmi.colorDeepNavy,
                userSelect: "none",
            }}
        >
            <Box
                sx={{
                    height: "100%",
                    position: "relative",
                    overflow: "visible",
                }}
            >
                <Box
                    sx={{
                        color: theme.hmi.colorSnowGray,
                        backgroundImage: theme.hmi.primaryColorBgGradientSlidebarDark,
                        border: `1px solid ${alpha(theme.hmi.colorSnowGray, 0.18)}`,
                        borderRadius: 2,
                        overflow: "hidden",
                        pointerEvents: "auto",
                        height: "100%",
                    }}
                >
                    <Box
                        sx={{
                            height: "100%",
                            p: 2,
                            display: "flex",
                            flexDirection: "column",
                            gap: 1.5,
                            overflowY: "auto",
                            pr: 1,
                            "&::-webkit-scrollbar": {
                                width: 6,
                            },
                            "&::-webkit-scrollbar-thumb": {
                                backgroundColor: alpha(theme.hmi.colorBtnOrange, 0.28),
                                borderRadius: 999,
                            },
                        }}
                    >
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                            <RocketLaunchIcon sx={{ color: theme.hmi.colorBtnOrange }} />
                            <Box>
                                <Typography sx={{ fontSize: 18, fontWeight: 800 }}>Trình điều khiển</Typography>
                                <Typography sx={{ color: alpha(theme.hmi.colorSnowGray, 0.68), fontSize: 12 }}>
                                    Gửi lệnh xuống robot
                                </Typography>
                            </Box>
                        </Box>

                        <Box
                            sx={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 1,
                                px: 1.25,
                                py: 1,
                                borderRadius: "8px",
                                bgcolor: alpha(summaryStatusColor, 0.14),
                                border: `1px solid ${alpha(summaryStatusColor, 0.38)}`,
                            }}
                        >
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                <WifiTetheringIcon sx={{ fontSize: 18, color: summaryStatusColor }} />
                                <Box>
                                    <Typography sx={{ fontSize: 13, fontWeight: 700 }}>Trạng thái kết nối</Typography>
                                    {/* <Typography sx={{ color: alpha(theme.hmi.colorSnowGray, 0.68), fontSize: 11 }}>
                                        Hiển thị riêng ROBOT 120 và VALI 116
                                    </Typography> */}
                                </Box>
                            </Box>

                            <Box
                                sx={{
                                    display: "grid",
                                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                                    gap: 1,
                                }}
                            >
                                {deviceConnections.map((connection) => {
                                    const statusView = getConnectionStatusView(theme, connection);
                                    const helperText = connection?.host
                                        ? `${connection.host}:9090`
                                        : connection?.error || "Chưa cấu hình URL";

                                    return (
                                        <Box
                                            key={connection.id}
                                            sx={{
                                                minWidth: 0,
                                                px: 1,
                                                py: 0.9,
                                                borderRadius: "10px",
                                                bgcolor: alpha(theme.hmi.colorDeepNavy, 0.46),
                                                border: `1px solid ${alpha(statusView.color, 0.24)}`,
                                            }}
                                        >
                                            <Typography
                                                sx={{
                                                    fontSize: 11,
                                                    fontWeight: 800,
                                                    letterSpacing: 0.4,
                                                }}
                                            >
                                                {connection.label}
                                                {/* {connection.hostSuffix ? `· ${connection.hostSuffix}` : ""} */}
                                            </Typography>
                                            <Typography
                                                sx={{
                                                    mt: 0.35,
                                                    fontSize: 12,
                                                    fontWeight: 700,
                                                    color: statusView.color,
                                                }}
                                            >
                                                {statusView.label}
                                            </Typography>
                                            {/* <Typography
                                                sx={{
                                                    mt: 0.2,
                                                    fontSize: 10,
                                                    color: alpha(theme.hmi.colorSnowGray, 0.62),
                                                    wordBreak: "break-all",
                                                }}
                                            >
                                                {helperText}
                                            </Typography> */}
                                        </Box>
                                    );
                                })}
                            </Box>
                        </Box>

                        {/* Control IMU */}
                        <RosImuCard
                            imuMessage={imuData}
                            isConnected={isConnected}
                        />

                        {/* List run launchs */}
                        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.95 }}>
                            {launchGroups.map((group) => (
                                <RosLaunchGroupControl
                                    key={group.id}
                                    variant="summary"
                                    group={group}
                                    isActive={activeLaunchGroupId === group.id}
                                    launchStatuses={launchStatuses}
                                    launchSwitchStates={launchSwitchStates}
                                    onToggle={() => toggleLaunchGroup(group.id)}
                                />
                            ))}
                        </Box>

                        <RosMotorTemperatureCard />
                    </Box>
                </Box>

                {launchGroups.map((group) => (
                    <RosLaunchGroupControl
                        key={`${group.id}_flyout`}
                        variant="flyout"
                        group={group}
                        isActive={activeLaunchGroupId === group.id}
                        launchStatuses={launchStatuses}
                        launchSwitchStates={launchSwitchStates}
                        onClose={closeLaunchGroup}
                        onSendCommand={sendCommand}
                    />
                ))}
            </Box>
        </Box>
    );
};

export default RosLaunchDrawer;

// Chạy lệnh trên ROS để kết nối
// rosrun aloam_velodyne launch_manager.py

import { useCallback, useEffect, useState } from "react";
import { Box, Typography } from "@mui/material";
import LocationOnRoundedIcon from "@mui/icons-material/LocationOnRounded";
import SportsEsportsIcon from "@mui/icons-material/SportsEsports";
import { useTheme, alpha } from "@mui/material/styles";
import Content_item from "./Content_item";
// import Footer_item from "./Footer_item";

// ------------------ HOOKS ROS ------------------
import useRosTopic from "../hooks/useRosTopic";
import useRosPublisher from "../hooks/useRosPublisher";
import { useRos } from "../context/RosContext";
// ------------------ COMPONENTS ------------------
import CmdVelViewer from "../components/CmdVelViewer";
import RosCameraPanel from "../components/RosCameraPanel";
import RosLaunchDrawer from "../components/RosLaunchDrawer";
// import SlamMapDrawer from "../components/SlamMapDrawer";
// =================================== MAIN CONTAINER ===================================
// const LASER_CLOUD_TOPIC = "/laser_cloud_map";
// const LASER_CLOUD_TOPIC_OPTIONS = {
//     queue_length: 1,
//     throttle_rate: 300,
// };
const CMD_VEL_OUTPUT_TOPIC = "/cmd_vel";
const JOYSTICK_ENABLE_TOPIC = "/hmi/joystick_enable";
const JOY_TOPIC = "/joy";
const JOYSTICK_MAX_LINEAR_MPS = 1.0;
const JOYSTICK_MAX_ANGULAR_RADPS = 0.8;
const JOYSTICK_DEADZONE = 0.25;
const JOYSTICK_RESPONSE_EXPONENT = 0.85;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const roundTo = (value, decimals = 3) => Number(value.toFixed(decimals));

const buildJoystickCmdVel = (
    joyData,
    {
        maxLinear = JOYSTICK_MAX_LINEAR_MPS,
        maxAngular = JOYSTICK_MAX_ANGULAR_RADPS,
        deadzone = JOYSTICK_DEADZONE,
        responseExponent = JOYSTICK_RESPONSE_EXPONENT,
    } = {},
) => {
    const rawAxisX = clamp(Number(joyData?.axes?.[0]) || 0, -1, 1);
    const rawAxisY = clamp(Number(joyData?.axes?.[1]) || 0, -1, 1);
    const magnitude = Math.hypot(rawAxisX, rawAxisY);

    if (magnitude <= deadzone) {
        return {
            linearX: 0,
            angularZ: 0,
        };
    }

    const normalizedMagnitude = (magnitude - deadzone) / Math.max(1e-6, 1 - deadzone);
    const shapedMagnitude = Math.pow(normalizedMagnitude, responseExponent);
    const directionScale = shapedMagnitude / Math.max(magnitude, 1e-6);

    return {
        linearX: roundTo(rawAxisY * directionScale * maxLinear),
        angularZ: roundTo(rawAxisX * directionScale * maxAngular),
    };
};

const buildTwistMessage = ({ linearX = 0, angularZ = 0 } = {}) => ({
    linear: {
        x: linearX,
        y: 0,
        z: 0,
    },
    angular: {
        x: 0,
        y: 0,
        z: angularZ,
    },
});

const formatCoordinateValue = (value) => {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? `${numericValue.toFixed(6)}°` : "--";
};

const Main_page = () => {
    const theme = useTheme();
    const { isConnected } = useRos();
    const [requestedJoystickEnabled, setRequestedJoystickEnabled] = useState(null);
    // const { isConnected, gpsData, hexLog, error, connect, disconnect } = useWebSerial();
    // const [showConnect, setShowConnect] = useState(!isConnected);
    // ============================== ROS TOPICS ==============================
    const gpsData = useRosTopic("/gps/fix", "sensor_msgs/NavSatFix");
    const cmdVelData = useRosTopic(CMD_VEL_OUTPUT_TOPIC, "geometry_msgs/Twist");
    const joystickEnableMessage = useRosTopic(JOYSTICK_ENABLE_TOPIC, "std_msgs/Bool");
    const joyData = useRosTopic(JOY_TOPIC, "sensor_msgs/Joy");
    const cameraData = useRosTopic("/image_nen", "sensor_msgs/CompressedImage", {
        queue_length: 1,
    });
    // const laserCloudMap = useRosTopic(LASER_CLOUD_TOPIC, "sensor_msgs/PointCloud2", LASER_CLOUD_TOPIC_OPTIONS);

    // ============================== ROS PUBLISHERS ==============================
    const publishCmdVel = useRosPublisher(CMD_VEL_OUTPUT_TOPIC, "geometry_msgs/Twist");
    const publishJoystickEnable = useRosPublisher(JOYSTICK_ENABLE_TOPIC, "std_msgs/Bool");
    const publishMission = useRosPublisher("/mission_waypoints", "std_msgs/String");

    // ============================== LOCAL STATES & LOGIC ==============================
    const hasGpsFix = Number.isFinite(Number(gpsData?.latitude)) && Number.isFinite(Number(gpsData?.longitude));
    const gpsStatusColor = hasGpsFix ? theme.hmi.colorPrimary : theme.hmi.colorBtnOrange;
    const hasJoyData = Array.isArray(joyData?.axes) && joyData.axes.length >= 2;
    const externalJoystickEnabled =
        typeof joystickEnableMessage?.data === "boolean" ? joystickEnableMessage.data : null;
    const effectiveJoystickEnabled =
        typeof externalJoystickEnabled === "boolean" ? externalJoystickEnabled : Boolean(requestedJoystickEnabled);
    const joystickCmdVel = buildJoystickCmdVel(joyData, {
        maxLinear: JOYSTICK_MAX_LINEAR_MPS,
        maxAngular: JOYSTICK_MAX_ANGULAR_RADPS,
    });
    const joystickCmdVelData = buildTwistMessage(joystickCmdVel);

    useEffect(() => {
        if (typeof externalJoystickEnabled !== "boolean") {
            return;
        }

        setRequestedJoystickEnabled(externalJoystickEnabled);
    }, [externalJoystickEnabled]);

    useEffect(() => {
        if (!isConnected || !effectiveJoystickEnabled || !hasJoyData) {
            return;
        }

        publishCmdVel(buildTwistMessage(joystickCmdVel));
    }, [
        effectiveJoystickEnabled,
        hasJoyData,
        isConnected,
        joystickCmdVel.angularZ,
        joystickCmdVel.linearX,
        publishCmdVel,
    ]);

    // ---------------- joystick enable ----------------
    const handleJoystickEnabledChange = useCallback(
        (isEnabled) => {
            if (!isConnected) {
                return false;
            }

            const nextEnabled = Boolean(isEnabled);
            const publishAccepted = publishJoystickEnable({
                data: nextEnabled,
            });

            if (publishAccepted) {
                setRequestedJoystickEnabled(nextEnabled);
            }

            return publishAccepted;
        },
        [isConnected, publishJoystickEnable],
    );

    // ---------------- waypoints ----------------
    const handlePublishMission = (waypoints = []) => {
        if (!waypoints.length) return;

        const payload = {
            timestamp: Date.now(),
            total: waypoints.length,
            waypoints: waypoints.map((wp, index) => ({
                seq: index + 1,
                latitude: wp.latitude,
                longitude: wp.longitude,
            })),
        };

        publishMission({
            data: JSON.stringify(payload),
        });

        console.log("MISSION SENT:", payload);
    };

    // ================================================= RETURN =================================================
    return (
        <Box
            sx={{
                width: "100%",
                height: "100vh",
                display: "flex",
                bgcolor: theme.hmi.colorSlateBlue,
                userSelect: "none",
            }}
        >
            <Box
                sx={{
                    position: "relative",
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    minHeight: 0,
                }}
            >
                {/* ---------------------------------------- */}
                {/* ---------------- HEADER ---------------- */}
                {/* ---------------------------------------- */}
                <Box
                    sx={{
                        position: "absolute",
                        zIndex: 1000,
                        top: 0,
                        left: 0,
                        right: 0,
                        display: "grid",
                        gridTemplateColumns: "260px minmax(0, 1fr) 300px ",
                        alignItems: "center",
                        gap: 1.25,
                        px: 1.5,
                        py: 0.9,
                        minHeight: 58,
                        color: theme.hmi.colorSnowGray,
                        backgroundImage: theme.hmi.primaryColorBgGradientSlidebarDark135,
                        borderBottom: `1px solid ${alpha(theme.hmi.colorSnowGray, 0.2)}`,
                        boxShadow: "0 12px 28px rgba(0, 0, 0, 0.28)",
                        backdropFilter: "blur(12px)",
                    }}
                >
                    {/* Tọa độ */}
                    <Box sx={{ color: theme.hmi.colorSnowGray, fontSize: "20px", fontWeight: 600 }}>
                        <Box
                            sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 1,
                                px: 1.1,
                                py: 0.7,
                                borderRadius: "14px",
                                bgcolor: alpha(theme.hmi.colorSnowGray, 0.06),
                                border: `1px solid ${alpha(gpsStatusColor, 0.3)}`,
                                boxShadow: `inset 0 1px 0 ${alpha(theme.hmi.colorSnowGray, 0.05)}`,
                            }}
                        >
                            <Box
                                sx={{
                                    width: 34,
                                    height: 34,
                                    borderRadius: "12px",
                                    display: "grid",
                                    placeItems: "center",
                                    flexShrink: 0,
                                    bgcolor: alpha(gpsStatusColor, 0.16),
                                    border: `1px solid ${alpha(gpsStatusColor, 0.28)}`,
                                    color: gpsStatusColor,
                                }}
                            >
                                <LocationOnRoundedIcon sx={{ fontSize: 18 }} />
                            </Box>

                            <Box sx={{ minWidth: 0, flex: 1 }}>
                                <Box
                                    sx={{
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        gap: 1,
                                        mb: 0.45,
                                    }}
                                >
                                    <Typography
                                        sx={{
                                            color: alpha(theme.hmi.colorSnowGray, 0.62),
                                            fontSize: 10,
                                            fontWeight: 800,
                                            letterSpacing: 0.55,
                                            textTransform: "uppercase",
                                        }}
                                    >
                                        Tọa độ GPS
                                    </Typography>
                                    <Typography
                                        sx={{
                                            px: 0.75,
                                            py: 0.15,
                                            borderRadius: "999px",
                                            bgcolor: alpha(gpsStatusColor, 0.16),
                                            border: `1px solid ${alpha(gpsStatusColor, 0.28)}`,
                                            color: gpsStatusColor,
                                            fontSize: 9,
                                            fontWeight: 900,
                                            letterSpacing: 0.45,
                                            lineHeight: 1.5,
                                        }}
                                    >
                                        {hasGpsFix ? "LIVE" : "WAIT"}
                                    </Typography>
                                </Box>

                                <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
                                    <Box sx={{ minWidth: 0 }}>
                                        <Typography
                                            sx={{
                                                color: alpha(theme.hmi.colorSnowGray, 0.5),
                                                fontSize: 10,
                                                fontWeight: 700,
                                            }}
                                        >
                                            Kinh độ
                                        </Typography>
                                        <Typography
                                            sx={{
                                                color: theme.hmi.colorSnowGray,
                                                fontSize: 12,
                                                fontWeight: 800,
                                                lineHeight: 1.2,
                                            }}
                                        >
                                            {formatCoordinateValue(gpsData?.longitude)}
                                        </Typography>
                                    </Box>
                                    <Box sx={{ minWidth: 0 }}>
                                        <Typography
                                            sx={{
                                                color: alpha(theme.hmi.colorSnowGray, 0.5),
                                                fontSize: 10,
                                                fontWeight: 700,
                                            }}
                                        >
                                            Vĩ độ
                                        </Typography>
                                        <Typography
                                            sx={{
                                                color: theme.hmi.colorSnowGray,
                                                fontSize: 12,
                                                fontWeight: 800,
                                                lineHeight: 1.2,
                                            }}
                                        >
                                            {formatCoordinateValue(gpsData?.latitude)}
                                        </Typography>
                                    </Box>
                                </Box>
                            </Box>
                        </Box>
                    </Box>

                    {/* Title */}
                    <Box sx={{ minWidth: 0, textAlign: "center" }}>
                        <Typography
                            variant="h1"
                            sx={{
                                color: theme.hmi.colorSnowGray,
                                fontSize: 30,
                                fontWeight: 900,
                                letterSpacing: { md: 0.4 },
                                lineHeight: 1.15,
                                textTransform: "uppercase",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                            }}
                        >
                            TRUNG TÂM GIÁM SÁT VÀ ĐIỀU KHIỂN ROBOT DI ĐỘNG TỰ HÀNH
                        </Typography>
                    </Box>

                    {/*  */}
                    <Box sx={{ color: theme.hmi.colorSnowGray, fontSize: "20px", fontWeight: 600 }}>
                        <Box
                            sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 1,
                                px: 1.1,
                                py: 0.7,
                                height: 78,
                                borderRadius: "14px",
                                bgcolor: alpha(theme.hmi.colorSnowGray, 0.06),
                                border: `1px solid ${alpha(gpsStatusColor, 0.3)}`,
                                boxShadow: `inset 0 1px 0 ${alpha(theme.hmi.colorSnowGray, 0.05)}`,
                            }}
                        >
                            CAPITI
                        </Box>
                    </Box>
                </Box>

                <Content_item
                    gpsData={gpsData}
                    onPublishMission={handlePublishMission}
                />
                {/* <SlamMapDrawer cloudMessage={laserCloudMap} isConnected={isConnected} topicName={LASER_CLOUD_TOPIC} /> */}
                <RosLaunchDrawer />

                <Box
                    sx={{
                        position: "absolute",
                        zIndex: 1300,
                        left: { xs: 12, sm: 380 },
                        right: { xs: 12, sm: 450 },
                        bottom: 0,
                        pointerEvents: "none",
                    }}
                >
                    <Box
                        sx={{
                            py: 1,
                            display: "flex",
                            gap: 1.25,
                            flexWrap: "nowrap",
                            maxWidth: "100%",
                            pointerEvents: "auto",
                            bgcolor: theme.hmi.colorDeepNavy, // Màu nền chính
                        }}
                    >
                        <RosCameraPanel
                            layout="inline"
                            title="Camera giám sát"
                            topicName="/image_nen"
                            messageType="sensor_msgs/CompressedImage"
                            cameraMessage={cameraData}
                        />

                        <Box
                            sx={{
                                width: "100%",
                                color: theme.hmi.colorSnowGray,
                                // bgcolor: alpha(theme.hmi.colorMidnightBlue, 0.96),
                                backgroundImage: theme.hmi.primaryColorBgGradientSlidebarDark135,
                                border: `1px solid ${alpha(theme.hmi.colorSnowGray, 0.2)}`,
                                boxShadow: "0 18px 36px rgba(0, 0, 0, 0.3)",
                                backdropFilter: "blur(12px)",
                                borderRadius: 2,
                                overflow: "hidden",
                            }}
                        >
                            <Box
                                sx={{
                                    px: 1.25,
                                    py: 1,
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 1,
                                    borderBottom: `1px solid ${alpha(theme.hmi.colorSnowGray, 0.12)}`,
                                }}
                            >
                                <SportsEsportsIcon sx={{ color: theme.hmi.colorBtnOrange }} />
                                <Box sx={{ minWidth: 0 }}>
                                    <Typography sx={{ color: theme.hmi.colorSnowGray, fontSize: 14, fontWeight: 800 }}>
                                        Joystick
                                    </Typography>
                                    {/* <Typography sx={{ color: alpha(theme.hmi.colorSnowGray, 0.66), fontSize: 11 }}>
                                        {"Joystick thật: /joy -> /cmd_vel"}
                                    </Typography> */}
                                </Box>
                            </Box>

                            <Box sx={{ p: 1.25 }}>
                                <CmdVelViewer
                                    cmdVelData={cmdVelData}
                                    joystickCmdVelData={joystickCmdVelData}
                                    joyData={joyData}
                                    onJoystickEnabledChange={handleJoystickEnabledChange}
                                    externalJoystickEnabled={effectiveJoystickEnabled}
                                />
                            </Box>
                        </Box>
                    </Box>
                </Box>
            </Box>
        </Box>
    );
};

export default Main_page;

// /SIDE/status/motor_temperature	std_msgs/Int32
// Nhiệt độ động cơ.

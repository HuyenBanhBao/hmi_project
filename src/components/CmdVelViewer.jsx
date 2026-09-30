import LockIcon from "@mui/icons-material/Lock";
import PowerSettingsNewIcon from "@mui/icons-material/PowerSettingsNew";
import SpeedIcon from "@mui/icons-material/Speed";
import TuneIcon from "@mui/icons-material/Tune";
import { Box, Button, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { useEffect, useState } from "react";
import DirectionJoystick from "../Joystick/Joystick";

const DIRECTION_THRESHOLD = 0.18;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const roundTo = (value, decimals = 3) => Number(value.toFixed(decimals));

const getActiveDirection = (axisX, axisY) => {
    const absX = Math.abs(axisX);
    const absY = Math.abs(axisY);

    if (absX < DIRECTION_THRESHOLD && absY < DIRECTION_THRESHOLD) {
        return null;
    }

    if (absY >= absX) {
        return axisY >= 0 ? "UP" : "DOWN";
    }

    return axisX >= 0 ? "RIGHT" : "LEFT";
};

const CmdVelViewer = ({
    cmdVelData,
    joystickCmdVelData,
    joyData,
    onJoystickEnabledChange,
    externalJoystickEnabled = null,
}) => {
    const theme = useTheme();
    const [isJoystickEnabled, setIsJoystickEnabled] = useState(false);

    useEffect(() => {
        if (typeof externalJoystickEnabled !== "boolean") {
            return;
        }

        setIsJoystickEnabled(externalJoystickEnabled);
    }, [externalJoystickEnabled]);

    const displayedJoystickEnabled =
        typeof externalJoystickEnabled === "boolean" ? externalJoystickEnabled : isJoystickEnabled;
    const joystickStatusColor = displayedJoystickEnabled ? theme.hmi.colorPrimary : theme.hmi.colorError;
    const hasCmdVelData = Boolean(cmdVelData);
    const cmdVelStatusColor = hasCmdVelData ? theme.hmi.colorPrimary : theme.hmi.colorBtnOrange;
    const hasJoyData = Array.isArray(joyData?.axes) && joyData.axes.length >= 2;
    const joyStatusColor = hasJoyData ? theme.hmi.colorPrimary : theme.hmi.colorBtnOrange;

    const rawAxisX = clamp(Number(joyData?.axes?.[0]) || 0, -1, 1);
    const rawAxisY = clamp(Number(joyData?.axes?.[1]) || 0, -1, 1);
    const targetCmd = {
        linearX: roundTo(Number(joystickCmdVelData?.linear?.x) || 0),
        angularZ: roundTo(Number(joystickCmdVelData?.angular?.z) || 0),
    };
    const activeDirection = getActiveDirection(rawAxisX, rawAxisY);

    const formatCmdVelValue = (value) => {
        if (value === null || value === undefined) return "__";

        const numericValue = Number(value);
        return Number.isFinite(numericValue) ? numericValue.toFixed(3) : "__";
    };

    const metricCardSx = {
        p: 1.2,
        borderRadius: "8px",
        bgcolor: alpha(theme.hmi.colorDeepNavy, 0.52),
        border: `1px solid ${alpha(theme.hmi.colorSnowGray, 0.14)}`,
    };

    const sectionSx = {
        p: 1.25,
        borderRadius: "8px",
        bgcolor: alpha(theme.hmi.colorDeepNavy, 0.38),
        border: `1px solid ${alpha(theme.hmi.colorSnowGray, 0.12)}`,
    };

    const handleToggleJoystick = () => {
        const nextEnabled = !displayedJoystickEnabled;
        const publishAccepted = onJoystickEnabledChange?.(nextEnabled);

        if (publishAccepted === false) {
            return;
        }

        setIsJoystickEnabled(nextEnabled);
    };

    return (
        <Box
            sx={{
                display: "flex",
                gap: 1.25,
                userSelect: "none",
            }}
        >
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1, flex: 1 }}>
                <Box
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 1,
                        px: 1.25,
                        py: 1,
                        borderRadius: "8px",
                        bgcolor: alpha(joystickStatusColor, 0.14),
                        border: `1px solid ${alpha(joystickStatusColor, 0.38)}`,
                    }}
                >
                    <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontSize: 13, fontWeight: 800 }}>
                            {displayedJoystickEnabled ? "Joystick đang truyền" : "Joystick đang khóa"}
                        </Typography>
                        {/* <Typography sx={{ color: alpha(theme.hmi.colorSnowGray, 0.62), fontSize: 11 }}>
                            {hasJoyData
                                ? "Nguồn đọc từ /joy và publish ra /cmd_vel"
                                : "Chưa nhận được topic /joy"}
                        </Typography> */}
                    </Box>

                    <Button
                        variant="contained"
                        startIcon={<PowerSettingsNewIcon />}
                        onClick={handleToggleJoystick}
                        sx={{
                            borderRadius: "8px",
                            minWidth: 112,
                            py: 0.95,
                            fontWeight: 900,
                            color: theme.hmi.colorSnowGray,
                            bgcolor: displayedJoystickEnabled
                                ? theme.hmi.colorBtnOrange
                                : theme.hmi.primarySuccessColor,
                            boxShadow: theme.hmi.boxShadowBtn,
                            transition: "background-color 0.3s ease, box-shadow 0.3s ease",
                            "&:hover": {
                                boxShadow: theme.hmi.boxShadowBtnHover,
                                bgcolor: displayedJoystickEnabled
                                    ? alpha(theme.hmi.colorBtnOrange, 0.9)
                                    : alpha(theme.hmi.primarySuccessColor, 0.9),
                            },
                        }}
                    >
                        {displayedJoystickEnabled ? "Tắt" : "Bật"}
                    </Button>
                </Box>

                <Box sx={{ display: "flex", gap: 1 }}>
                    <Box sx={{ ...sectionSx, flex: 1 }}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 1 }}>
                            <SpeedIcon sx={{ fontSize: 18, color: cmdVelStatusColor }} />
                            <Box sx={{ minWidth: 0 }}>
                                <Typography sx={{ fontWeight: 800 }}>Tốc độ robot truyền đi</Typography>
                            </Box>
                        </Box>

                        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
                            <Box sx={metricCardSx}>
                                <Box sx={{ display: "flex", alignItems: "flex-end", gap: 1 }}>
                                    <Typography sx={{ color: alpha(theme.hmi.colorSnowGray, 0.62), fontSize: 12 }}>
                                        V
                                    </Typography>
                                    <Typography sx={{ color: alpha(theme.hmi.colorSnowGray, 0.58), fontSize: 11 }}>
                                        m/s
                                    </Typography>
                                </Box>
                                <Box sx={{ display: "flex", alignItems: "flex-end", gap: 1 }}>
                                    <Typography sx={{ mt: 0.25, fontSize: 22, fontWeight: 900 }}>
                                        {formatCmdVelValue(cmdVelData?.linear?.x)}
                                    </Typography>
                                </Box>
                            </Box>

                            <Box sx={metricCardSx}>
                                <Box sx={{ display: "flex", alignItems: "flex-end", gap: 1 }}>
                                    <Typography sx={{ color: alpha(theme.hmi.colorSnowGray, 0.62), fontSize: 12 }}>
                                        ω
                                    </Typography>
                                    <Typography sx={{ color: alpha(theme.hmi.colorSnowGray, 0.58), fontSize: 11 }}>
                                        rad/s
                                    </Typography>
                                </Box>
                                <Box sx={{ display: "flex", alignItems: "flex-end", gap: 1 }}>
                                    <Typography sx={{ mt: 0.25, fontSize: 22, fontWeight: 900 }}>
                                        {formatCmdVelValue(cmdVelData?.angular?.z)}
                                    </Typography>
                                </Box>
                            </Box>
                        </Box>
                    </Box>

                    {/* <Box
                        sx={{
                            ...sectionSx,
                            border: `1px solid ${alpha(joystickStatusColor, 0.2)}`,
                            flex: 1,
                        }}
                    >
                        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                                <TuneIcon sx={{ fontSize: 18, color: joyStatusColor }} />
                                <Typography sx={{ fontWeight: 800 }}>JoyStick</Typography>
                            </Box>
                            <Typography
                                sx={{
                                    px: 0.9,
                                    py: 0.3,
                                    borderRadius: "999px",
                                    color: theme.hmi.colorSnowGray,
                                    bgcolor: alpha(joystickStatusColor, 0.24),
                                    border: `1px solid ${alpha(joystickStatusColor, 0.52)}`,
                                    fontSize: 11,
                                    fontWeight: 800,
                                }}
                            >
                                {displayedJoystickEnabled ? "ON" : "OFF"}
                            </Typography>
                        </Box>

                        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
                            <Box sx={metricCardSx}>
                                <Box sx={{ display: "flex", alignItems: "flex-end", gap: 1 }}>
                                    <Typography sx={{ color: alpha(theme.hmi.colorSnowGray, 0.62), fontSize: 12 }}>
                                        V
                                    </Typography>
                                    <Typography sx={{ color: alpha(theme.hmi.colorSnowGray, 0.58), fontSize: 11 }}>
                                        m/s
                                    </Typography>
                                </Box>
                                <Typography sx={{ mt: 0.25, fontSize: 22, fontWeight: 900 }}>
                                    {targetCmd.linearX.toFixed(3)}
                                </Typography>
                            </Box>

                            <Box sx={metricCardSx}>
                                <Box sx={{ display: "flex", alignItems: "flex-end", gap: 1 }}>
                                    <Typography sx={{ color: alpha(theme.hmi.colorSnowGray, 0.62), fontSize: 12 }}>
                                        ω
                                    </Typography>
                                    <Typography sx={{ color: alpha(theme.hmi.colorSnowGray, 0.58), fontSize: 11 }}>
                                        rad/s
                                    </Typography>
                                </Box>
                                <Typography sx={{ mt: 0.25, fontSize: 22, fontWeight: 900 }}>
                                    {targetCmd.angularZ.toFixed(3)}
                                </Typography>
                            </Box>
                        </Box>
                    </Box> */}
                </Box>
            </Box>

            <Box
                sx={{
                    display: "flex",
                    justifyContent: "center",
                    py: 0.5,
                }}
            >
                <Box
                    sx={{
                        width: 224,
                        minHeight: 224,
                        borderRadius: "24px",
                        position: "relative",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 1,
                        px: 1.25,
                        py: 1.5,
                        bgcolor: hasJoyData
                            ? "radial-gradient(circle, rgba(76, 175, 80, 0.14), rgba(255, 255, 255, 0.04) 58%)"
                            : "rgba(222, 222, 222, 0.04)",
                        border: `2px dashed ${alpha(
                            displayedJoystickEnabled ? theme.hmi.colorPrimary : theme.hmi.colorSnowGray,
                            displayedJoystickEnabled ? 0.55 : 0.16,
                        )}`,
                        transition: "border-color 160ms ease, background 160ms ease, opacity 160ms ease",
                        opacity: hasJoyData ? 1 : 0.72,
                    }}
                >
                    <Box sx={{ transform: "scale(1.08)" }}>
                        <DirectionJoystick activeDirection={activeDirection} />
                    </Box>

                    {/* <Box sx={{ textAlign: "center" }}>
                        <Typography sx={{ fontSize: 12, fontWeight: 800 }}>
                            {hasJoyData ? "Hướng joystick thật" : "Chưa có dữ liệu /joy"}
                        </Typography>
                        <Typography sx={{ color: alpha(theme.hmi.colorSnowGray, 0.62), fontSize: 11 }}>
                            {activeDirection ? `Đang giữ hướng ${activeDirection}` : "Đang ở vùng trung tâm"}
                        </Typography>
                    </Box> */}

                    {!displayedJoystickEnabled && (
                        <Box
                            sx={{
                                position: "absolute",
                                top: 12,
                                right: 12,
                                display: "flex",
                                alignItems: "center",
                                gap: 0.5,
                                px: 0.8,
                                py: 0.4,
                                borderRadius: "999px",
                                color: theme.hmi.colorSnowGray,
                                bgcolor: alpha(theme.hmi.colorDeepNavy, 0.76),
                                border: `1px solid ${alpha(theme.hmi.colorSnowGray, 0.12)}`,
                            }}
                        >
                            <LockIcon sx={{ fontSize: 16, color: alpha(theme.hmi.colorSnowGray, 0.88) }} />
                            <Typography sx={{ fontSize: 11, fontWeight: 800 }}>LOCK</Typography>
                        </Box>
                    )}
                </Box>
            </Box>
        </Box>
    );
};

export default CmdVelViewer;

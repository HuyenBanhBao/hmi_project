import DeviceThermostatIcon from "@mui/icons-material/DeviceThermostat";
import { Box, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { useMemo } from "react";
import { useRos } from "../context/RosContext";
import useRosTopic from "../hooks/useRosTopic";

const LEFT_MOTOR_TEMPERATURE_TOPIC = "/left/status/motor_temperature";
const RIGHT_MOTOR_TEMPERATURE_TOPIC = "/right/status/motor_temperature";

const formatTemperature = (value) => {
    if (!Number.isFinite(value)) return "--";
    return `${Math.round(value)}°C`;
};

const getTemperatureState = ({ isConnected, hasMessage, value, theme }) => {
    if (!isConnected) {
        return {
            label: "ROS đang offline",
            color: theme.hmi.colorError,
        };
    }

    if (!hasMessage) {
        return {
            label: "Chờ dữ liệu",
            color: theme.hmi.colorAshGray,
        };
    }

    if (!Number.isFinite(value)) {
        return {
            label: "Dữ liệu không hợp lệ",
            color: theme.hmi.colorBtnOrange,
        };
    }

    if (value >= 80) {
        return {
            label: "Quá nhiệt",
            color: theme.hmi.colorError,
        };
    }

    if (value >= 60) {
        return {
            label: "Nhiệt độ cao",
            color: theme.hmi.colorBtnOrange,
        };
    }

    return {
        label: "Ổn định",
        color: theme.hmi.colorPrimary,
    };
};

const RosMotorTemperatureCard = () => {
    const theme = useTheme();
    const { isConnected } = useRos();
    const leftMotorTemperature = useRosTopic(LEFT_MOTOR_TEMPERATURE_TOPIC, "std_msgs/Int32");
    const rightMotorTemperature = useRosTopic(RIGHT_MOTOR_TEMPERATURE_TOPIC, "std_msgs/Int32");

    const controllers = useMemo(
        () => [
            {
                id: "left",
                label: "Motor trái",
                topic: LEFT_MOTOR_TEMPERATURE_TOPIC,
                hasMessage: leftMotorTemperature !== null,
                value: Number(leftMotorTemperature?.data),
            },
            {
                id: "right",
                label: "Motor phải",
                topic: RIGHT_MOTOR_TEMPERATURE_TOPIC,
                hasMessage: rightMotorTemperature !== null,
                value: Number(rightMotorTemperature?.data),
            },
        ],
        [leftMotorTemperature, rightMotorTemperature],
    );

    const accentColor = !isConnected
        ? theme.hmi.colorError
        : controllers.some((controller) => Number.isFinite(controller.value) && controller.value >= 60)
          ? theme.hmi.colorBtnOrange
          : theme.hmi.colorPrimary;

    return (
        <Box
            sx={{
                p: 1.25,
                borderRadius: "16px",
                bgcolor: alpha(theme.hmi.colorDeepNavy, 0.52),
                border: `1px solid ${alpha(accentColor, 0.6)}`,
                boxShadow: `inset 0 1px 0 ${alpha(theme.hmi.colorSnowGray, 0.04)}`,
                userSelect: "none",
            }}
        >
            <Box
                sx={{
                    mb: 1.1,
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                }}
            >
                <Box
                    sx={{
                        width: 40,
                        height: 40,
                        borderRadius: "14px",
                        display: "grid",
                        placeItems: "center",
                        bgcolor: alpha(accentColor, 0.14),
                        border: `1px solid ${alpha(accentColor, 0.26)}`,
                        color: accentColor,
                        flexShrink: 0,
                    }}
                >
                    <DeviceThermostatIcon />
                </Box>

                <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 800 }}>Nhiệt độ động cơ</Typography>
                    {/* <Typography sx={{ color: alpha(theme.hmi.colorSnowGray, 0.62), fontSize: 11 }}>
                        Topic `/SIDE/status/motor_temperature` · `std_msgs/Int32`
                    </Typography> */}
                </Box>
            </Box>

            <Box
                sx={{
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))" },
                    gap: 0.95,
                }}
            >
                {controllers.map((controller) => {
                    const state = getTemperatureState({
                        isConnected,
                        hasMessage: controller.hasMessage,
                        value: controller.value,
                        theme,
                    });

                    return (
                        <Box
                            key={controller.id}
                            sx={{
                                p: 1,
                                borderRadius: "14px",
                                bgcolor: alpha(theme.hmi.colorMidnightBlue, 0.42),
                                border: `1px solid ${alpha(state.color, 0.24)}`,
                                boxShadow: `inset 0 1px 0 ${alpha(theme.hmi.colorSnowGray, 0.04)}`,
                            }}
                        >
                            <Typography
                                sx={{
                                    display: "block",
                                    textAlign: "center",
                                    color: alpha(theme.hmi.colorSnowGray, 0.62),
                                    fontSize: 10,
                                    fontWeight: 800,
                                    letterSpacing: 0.45,
                                    textTransform: "uppercase",
                                }}
                            >
                                {controller.label}
                            </Typography>

                            <Typography
                                variant="span"
                                sx={{
                                    display: "block",
                                    textAlign: "center",
                                    mt: 0.45,
                                    color: state.color,
                                    fontSize: 34,
                                    fontWeight: 900,
                                    lineHeight: 1.05,
                                }}
                            >
                                {formatTemperature(controller.value)}
                            </Typography>

                            {/* <Box
                                sx={{
                                    mt: 0.75,
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 0.75,
                                    minWidth: 0,
                                }}
                            >
                                <Box
                                    sx={{
                                        width: 8,
                                        height: 8,
                                        borderRadius: "50%",
                                        bgcolor: state.color,
                                        flex: "0 0 auto",
                                        boxShadow: `0 0 10px ${alpha(state.color, 0.68)}`,
                                    }}
                                />

                                <Box sx={{ minWidth: 0 }}>
                                    <Typography
                                        sx={{
                                            color: state.color,
                                            fontSize: 12,
                                            fontWeight: 800,
                                            lineHeight: 1.2,
                                        }}
                                    >
                                        {state.label}
                                    </Typography>
                                    <Typography
                                        sx={{
                                            color: alpha(theme.hmi.colorSnowGray, 0.48),
                                            fontSize: 10,
                                            lineHeight: 1.2,
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            whiteSpace: "nowrap",
                                        }}
                                    >
                                        {controller.topic}
                                    </Typography>
                                </Box>
                            </Box> */}
                        </Box>
                    );
                })}
            </Box>
        </Box>
    );
};

export default RosMotorTemperatureCard;

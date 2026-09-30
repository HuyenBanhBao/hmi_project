import ExploreIcon from "@mui/icons-material/Explore";
import NavigationIcon from "@mui/icons-material/Navigation";
import { Box, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { useMemo } from "react";

const RAD_TO_DEG = 180 / Math.PI;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// chuẩn hóa góc hướng về khoảng [0, 360), với 0° = Bắc, tăng theo chiều kim đồng hồ
const normalizeHeadingDegrees = (degrees) => {
    if (!Number.isFinite(degrees)) return null;

    const normalized = ((degrees % 360) + 360) % 360;
    return normalized === 360 ? 0 : normalized;
};

// chuyển đổi yaw từ IMU sang góc hướng compass (0° = Bắc, tăng theo chiều kim đồng hồ)
const yawToCompassHeadingDegrees = (yawDeg) => {
    if (!Number.isFinite(yawDeg)) return null;

    return normalizeHeadingDegrees(180 - yawDeg);
    // return normalizeHeadingDegrees(yawDeg);
};

const quaternionToEulerDegrees = (orientation) => {
    const x = Number(orientation?.x);
    const y = Number(orientation?.y);
    const z = Number(orientation?.z);
    const w = Number(orientation?.w);

    if ([x, y, z, w].some((value) => !Number.isFinite(value))) return null;

    const magnitude = Math.hypot(x, y, z, w);
    if (magnitude < 1e-8) return null;

    const qx = x / magnitude;
    const qy = y / magnitude;
    const qz = z / magnitude;
    const qw = w / magnitude;

    const sinrCosp = 2 * (qw * qx + qy * qz);
    const cosrCosp = 1 - 2 * (qx * qx + qy * qy);
    const roll = Math.atan2(sinrCosp, cosrCosp);

    const sinp = 2 * (qw * qy - qz * qx);
    const pitch = Math.asin(clamp(sinp, -1, 1));

    const sinyCosp = 2 * (qw * qz + qx * qy);
    const cosyCosp = 1 - 2 * (qy * qy + qz * qz);
    const yaw = Math.atan2(sinyCosp, cosyCosp);

    const rollDeg = roll * RAD_TO_DEG;
    const pitchDeg = pitch * RAD_TO_DEG;
    const yawDeg = yaw * RAD_TO_DEG;

    return {
        rollDeg,
        pitchDeg,
        yawDeg,
        headingDeg: yawToCompassHeadingDegrees(yawDeg),
    };
};

const getHeadingDirection = (headingDeg) => {
    if (!Number.isFinite(headingDeg)) return "--";

    const directions = ["Bắc", "Đông Bắc", "Đông", "Đông Nam", "Nam", "Tây Nam", "Tây", "Tây Bắc"];
    const index = Math.round(headingDeg / 45) % directions.length;

    return directions[index];
};

const sanitizeRoundedValue = (value, fractionDigits) => {
    if (!Number.isFinite(value)) return null;

    const epsilon = 10 ** -(fractionDigits + 2);
    return Math.abs(value) < epsilon ? 0 : value;
};

const formatAngle = (value, fractionDigits = 1, wrapHeading = false) => {
    if (!Number.isFinite(value)) return "--";

    let nextValue = value;

    if (wrapHeading) {
        nextValue = normalizeHeadingDegrees(value);
    }

    nextValue = sanitizeRoundedValue(nextValue, fractionDigits);
    if (!Number.isFinite(nextValue)) return "--";

    if (wrapHeading && Number(nextValue.toFixed(fractionDigits)) >= 360) {
        return `${(0).toFixed(fractionDigits)}°`;
    }

    return `${nextValue.toFixed(fractionDigits)}°`;
};

const formatRosStamp = (stamp) => {
    const secs = Number(stamp?.secs);
    const nsecs = Number(stamp?.nsecs);

    if (!Number.isFinite(secs) || !Number.isFinite(nsecs)) return "--";

    return `t=${(secs + nsecs / 1e9).toFixed(3)} s`;
};

// eslint-disable-next-line no-unused-vars
const ImuMetricCard = ({ label, value, detail, color }) => {
    const theme = useTheme();

    return (
        <Box
            sx={{
                p: 1,
                borderRadius: "14px",
                bgcolor: alpha(theme.hmi.colorMidnightBlue, 0.42),
                border: `1px solid ${alpha(color, 0.18)}`,
                boxShadow: `inset 0 1px 0 ${alpha(theme.hmi.colorSnowGray, 0.04)}`,
            }}
        >
            <Typography
                sx={{
                    color: alpha(theme.hmi.colorSnowGray, 0.62),
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: 0.45,
                    textTransform: "uppercase",
                }}
            >
                {label}
            </Typography>

            <Typography
                sx={{
                    mt: 0.45,
                    color,
                    fontSize: 17,
                    fontWeight: 900,
                    lineHeight: 1.1,
                }}
            >
                {value}
            </Typography>

            {/* <Typography
                sx={{
                    mt: 0.4,
                    color: alpha(theme.hmi.colorSnowGray, 0.56),
                    fontSize: 11,
                    lineHeight: 1.2,
                }}
            >
                {detail}
            </Typography> */}
        </Box>
    );
};

const RosImuCard = ({ imuMessage, isConnected }) => {
    const theme = useTheme();

    const imuView = useMemo(() => {
        const orientationView = quaternionToEulerDegrees(imuMessage?.orientation);
        if (!orientationView) return null;

        return {
            ...orientationView,
            direction: getHeadingDirection(orientationView.headingDeg),
            seq: Number(imuMessage?.header?.seq),
            stampLabel: formatRosStamp(imuMessage?.header?.stamp),
            frameId: imuMessage?.header?.frame_id || "--",
            angularVelocityZ: Number(imuMessage?.angular_velocity?.z),
            linearAccelerationZ: Number(imuMessage?.linear_acceleration?.z),
        };
    }, [imuMessage]);

    const imuStatusColor = !isConnected
        ? theme.hmi.colorError
        : imuView
          ? theme.hmi.colorPrimary
          : theme.hmi.colorBtnOrange;
    const imuAccentColor = imuView ? theme.hmi.colorBtnOrange : theme.hmi.colorAshGray;

    return (
        <Box
            sx={{
                p: 1.25,
                borderRadius: "16px",
                bgcolor: alpha(theme.hmi.colorDeepNavy, 0.52),
                border: `1px solid ${alpha(imuStatusColor, 0.6)}`,
                boxShadow: `inset 0 1px 0 ${alpha(theme.hmi.colorSnowGray, 0.04)}`,
                userSelect: "none",
            }}
        >
            <Box
                sx={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: 1,
                    mb: 1.1,
                }}
            >
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Box
                        sx={{
                            width: 40,
                            height: 40,
                            borderRadius: "14px",
                            display: "grid",
                            placeItems: "center",
                            bgcolor: alpha(imuAccentColor, 0.14),
                            border: `1px solid ${alpha(imuAccentColor, 0.26)}`,
                            color: imuAccentColor,
                            flexShrink: 0,
                        }}
                    >
                        <ExploreIcon />
                    </Box>

                    <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontSize: 15, fontWeight: 800, lineHeight: 1.2 }}>La bàn IMU</Typography>
                        {/* <Typography sx={{ color: alpha(theme.hmi.colorSnowGray, 0.66), fontSize: 11.5 }}>
                            Hiển thị góc hướng từ quaternion của {topicName}
                        </Typography> */}
                    </Box>
                </Box>

                <Box
                    sx={{
                        px: 1,
                        py: 0.45,
                        borderRadius: "999px",
                        color: imuStatusColor,
                        bgcolor: alpha(imuStatusColor, 0.14),
                        border: `1px solid ${alpha(imuStatusColor, 0.3)}`,
                        fontSize: 10,
                        fontWeight: 900,
                        letterSpacing: 0.55,
                        lineHeight: 1.1,
                        flexShrink: 0,
                    }}
                >
                    {imuView ? "LIVE" : "WAIT"}
                </Box>
            </Box>

            <Box
                sx={{
                    p: 1.2,
                    borderRadius: "20px",
                    bgcolor: alpha(theme.hmi.colorMidnightBlue, 0.4),
                    border: `1px solid ${alpha(imuAccentColor, 0.18)}`,
                }}
            >
                {/* la bàn IMU */}
                <Box
                    sx={{
                        mx: "auto",
                        position: "relative",
                        width: { xs: "100%", sm: 220 },
                        maxWidth: 220,
                        aspectRatio: "1 / 1",
                        borderRadius: "50%",
                        border: `1px solid ${alpha(theme.hmi.colorSnowGray, 0.16)}`,
                        background: `radial-gradient(circle, ${alpha(theme.hmi.colorSnowGray, 0.1)} 0%, ${alpha(theme.hmi.colorDeepNavy, 0.05)} 58%, ${alpha(theme.hmi.colorDeepNavy, 0)} 100%)`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        overflow: "hidden",
                    }}
                >
                    <Box
                        sx={{
                            position: "absolute",
                            inset: 12,
                            borderRadius: "50%",
                            border: `1px solid ${alpha(theme.hmi.colorSnowGray, 0.08)}`,
                        }}
                    />
                    <Box
                        sx={{
                            position: "absolute",
                            top: "50%",
                            left: 16,
                            right: 16,
                            height: 1,
                            bgcolor: alpha(theme.hmi.colorSnowGray, 0.1),
                        }}
                    />
                    <Box
                        sx={{
                            position: "absolute",
                            left: "50%",
                            top: 16,
                            bottom: 16,
                            width: 1,
                            bgcolor: alpha(theme.hmi.colorSnowGray, 0.1),
                        }}
                    />
                    <Typography
                        sx={{
                            position: "absolute",
                            top: 16,
                            left: "50%",
                            transform: "translateX(-50%)",
                            color: alpha(theme.hmi.colorSnowGray, 0.84),
                            fontSize: 13,
                            fontWeight: 900,
                            letterSpacing: 1,
                        }}
                    >
                        N
                    </Typography>
                    <Typography
                        sx={{
                            position: "absolute",
                            right: 18,
                            top: "50%",
                            transform: "translateY(-50%)",
                            color: alpha(theme.hmi.colorSnowGray, 0.52),
                            fontSize: 12,
                            fontWeight: 800,
                        }}
                    >
                        E
                    </Typography>
                    <Typography
                        sx={{
                            position: "absolute",
                            bottom: 16,
                            left: "50%",
                            transform: "translateX(-50%)",
                            color: alpha(theme.hmi.colorSnowGray, 0.52),
                            fontSize: 12,
                            fontWeight: 800,
                        }}
                    >
                        S
                    </Typography>
                    <Typography
                        sx={{
                            position: "absolute",
                            left: 18,
                            top: "50%",
                            transform: "translateY(-50%)",
                            color: alpha(theme.hmi.colorSnowGray, 0.52),
                            fontSize: 12,
                            fontWeight: 800,
                        }}
                    >
                        W
                    </Typography>

                    <NavigationIcon
                        sx={{
                            position: "relative",
                            zIndex: 1,
                            fontSize: 92,
                            color: imuAccentColor,
                            filter: `drop-shadow(0 0 18px ${alpha(imuAccentColor, 0.44)})`,
                            transform: `rotate(${imuView?.headingDeg ?? 0}deg)`,
                            transition: "transform 0.18s ease-out",
                        }}
                    />

                    <Box
                        sx={{
                            position: "absolute",
                            zIndex: 2,
                            width: 16,
                            height: 16,
                            borderRadius: "50%",
                            bgcolor: theme.hmi.colorSnowGray,
                            boxShadow: `0 0 14px ${alpha(theme.hmi.colorSnowGray, 0.35)}`,
                        }}
                    />
                </Box>

                <Box sx={{ mt: 1.15, textAlign: "center" }}>
                    <Typography
                        sx={{
                            color: alpha(theme.hmi.colorSnowGray, 0.6),
                            fontSize: 10,
                            fontWeight: 800,
                            letterSpacing: 0.55,
                            textTransform: "uppercase",
                        }}
                    >
                        Góc hướng
                    </Typography>
                    <Box
                        sx={{
                            mt: 0.35,
                            display: "flex",
                            justifyContent: "center",
                            alignItems: "baseline",
                            gap: 1,
                            flexWrap: "wrap",
                        }}
                    >
                        <Typography
                            sx={{
                                color: imuAccentColor,
                                fontSize: 31,
                                fontWeight: 900,
                                letterSpacing: -0.9,
                                lineHeight: 1,
                            }}
                        >
                            {formatAngle(imuView?.headingDeg, 1, true)}
                        </Typography>
                        <Typography
                            sx={{
                                color: alpha(theme.hmi.colorSnowGray, 0.84),
                                fontSize: 13,
                                fontWeight: 800,
                            }}
                        >
                            {imuView?.direction || "--"}
                        </Typography>
                    </Box>
                    {/* <Typography
                        sx={{
                            mt: 0.55,
                            color: alpha(theme.hmi.colorSnowGray, 0.62),
                            fontSize: 11,
                        }}
                    >
                        {imuStatusText}
                    </Typography> */}
                </Box>
            </Box>

            {/* Giá trị IMU */}
            <Box
                sx={{
                    mt: 1,
                    display: "grid",
                    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                    gap: 0.9,
                }}
            >
                <ImuMetricCard
                    label="Roll"
                    value={formatAngle(imuView?.rollDeg, 1)}
                    detail="Trục X"
                    color={theme.hmi.colorPrimary}
                />
                <ImuMetricCard
                    label="Pitch"
                    value={formatAngle(imuView?.pitchDeg, 1)}
                    detail="Trục Y"
                    color={theme.hmi.colorBtnOrange}
                />
                <ImuMetricCard
                    label="Yaw"
                    value={formatAngle(90 - imuView?.yawDeg, 1)}
                    detail="Trục Z"
                    color={theme.hmi.colorPaleSky}
                />
            </Box>

            {/* Giá trị IMU */}
            {/* <Box
                sx={{
                    mt: 0.9,
                    display: "grid",
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                    gap: 0.9,
                }}
            >
                <ImuMetricCard
                    label="Yaw rate"
                    value={formatNumber(imuView?.angularVelocityZ, 3, " rad/s")}
                    detail="angular_velocity.z"
                    color={theme.hmi.colorBtnOrange}
                />
                <ImuMetricCard
                    label="Accel Z"
                    value={formatNumber(imuView?.linearAccelerationZ, 2, " m/s²")}
                    detail="linear_acceleration.z"
                    color={theme.hmi.colorPrimary}
                />
            </Box> */}

            {/* <Box sx={{ mt: 1, display: "flex", flexWrap: "wrap", gap: 0.75 }}>
                <Box
                    sx={{
                        px: 1,
                        py: 0.6,
                        borderRadius: "999px",
                        bgcolor: alpha(theme.hmi.colorSnowGray, 0.06),
                        border: `1px solid ${alpha(theme.hmi.colorSnowGray, 0.12)}`,
                        color: alpha(theme.hmi.colorSnowGray, 0.76),
                        fontSize: 11,
                    }}
                >
                    frame: {imuView?.frameId || "--"}
                </Box>
                <Box
                    sx={{
                        px: 1,
                        py: 0.6,
                        borderRadius: "999px",
                        bgcolor: alpha(theme.hmi.colorSnowGray, 0.06),
                        border: `1px solid ${alpha(theme.hmi.colorSnowGray, 0.12)}`,
                        color: alpha(theme.hmi.colorSnowGray, 0.76),
                        fontSize: 11,
                    }}
                >
                    seq: {Number.isFinite(imuView?.seq) ? imuView.seq : "--"}
                </Box>
                <Box
                    sx={{
                        px: 1,
                        py: 0.6,
                        borderRadius: "999px",
                        bgcolor: alpha(theme.hmi.colorSnowGray, 0.06),
                        border: `1px solid ${alpha(theme.hmi.colorSnowGray, 0.12)}`,
                        color: alpha(theme.hmi.colorSnowGray, 0.76),
                        fontSize: 11,
                    }}
                >
                    {imuView?.stampLabel || "--"}
                </Box>
            </Box> */}
        </Box>
    );
};

export default RosImuCard;

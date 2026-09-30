import { Box, Button, FormControl, InputLabel, MenuItem, Select, TextField, Tooltip, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import AddLocationAltIcon from "@mui/icons-material/AddLocationAlt";
import AltRouteIcon from "@mui/icons-material/AltRoute";
import DeleteSweepIcon from "@mui/icons-material/DeleteSweep";
import LayersIcon from "@mui/icons-material/Layers";
import MapIcon from "@mui/icons-material/Map";
import MyLocationIcon from "@mui/icons-material/MyLocation";
import SaveIcon from "@mui/icons-material/Save";
import SendIcon from "@mui/icons-material/Send";
import UndoIcon from "@mui/icons-material/Undo";

const getModeColor = (theme, active) => (active ? theme.hmi.colorPrimary : theme.hmi.colorError);

const getRouteStatusColor = (theme, routeStatus) => {
    if (routeStatus === "ready") return theme.hmi.colorPrimary;
    if (routeStatus === "fallback") return theme.hmi.colorBtnOrange;
    if (routeStatus === "missing-start") return theme.hmi.colorError;
    if (routeStatus === "select-start" || routeStatus === "select-target") return theme.hmi.colorBtnOrange;

    return theme.hmi.colorAshGray;
};

const getRouteLabel = (routeStatus, routePointsCount) => {
    if (routeStatus === "ready") return `${routePointsCount} wp`;
    if (routeStatus === "fallback") return `fallback ${routePointsCount} wp`;
    if (routeStatus === "select-start") return "chọn điểm đầu";
    if (routeStatus === "select-target") return "chọn đích";
    if (routeStatus === "missing-start") return "thiếu GPS robot";

    return routeStatus || "idle";
};

const getDistanceLabel = (distanceMeters) => {
    if (!Number.isFinite(distanceMeters)) return "-- m";
    return `${Math.round(distanceMeters)} m`;
};

const getRouteModeLabel = (isRoutePlanning, isRouteTestPlanning) => {
    if (isRoutePlanning) return "AUTO";
    if (isRouteTestPlanning) return "TEST";
    return "OFF";
};

const formatMissionTimestamp = (timestamp) => {
    if (!Number.isFinite(Number(timestamp))) return "--";

    return new Date(timestamp).toLocaleString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    });
};

const getButtonPalette = (theme, tone) => {
    if (tone === "accent") {
        return {
            color: theme.hmi.colorMidnightBlue,
            bgcolor: theme.hmi.colorBtnOrange,
            borderColor: alpha(theme.hmi.colorBtnOrange, 0.3),
            hoverBg: alpha(theme.hmi.colorBtnOrange, 0.92),
        };
    }

    if (tone === "danger") {
        return {
            color: theme.hmi.colorSnowGray,
            bgcolor: theme.hmi.colorError,
            borderColor: alpha(theme.hmi.colorError, 0.3),
            hoverBg: alpha(theme.hmi.colorError, 0.92),
        };
    }

    if (tone === "neutral") {
        return {
            color: theme.hmi.colorSnowGray,
            bgcolor: alpha(theme.hmi.colorMidnightBlue, 0.88),
            borderColor: alpha(theme.hmi.colorSnowGray, 0.16),
            hoverBg: alpha(theme.hmi.colorMidnightBlue, 1),
        };
    }

    return {
        color: theme.hmi.colorSnowGray,
        bgcolor: theme.hmi.primaryColorHvqp,
        borderColor: alpha(theme.hmi.primaryColorHvqp, 0.32),
        hoverBg: alpha(theme.hmi.primaryColorHvqp, 0.92),
    };
};

const HeaderBadge = ({ label, value, color }) => {
    const theme = useTheme();

    return (
        <Box
            sx={{
                px: 1,
                py: 0.75,
                minWidth: 86,
                borderRadius: "12px",
                bgcolor: alpha(color, 0.14),
                border: `1px solid ${alpha(color, 0.32)}`,
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                gap: 0.1,
                flexShrink: 0,
            }}
        >
            <Typography
                sx={{
                    color: alpha(theme.hmi.colorSnowGray, 0.64),
                    fontSize: 9,
                    fontWeight: 800,
                    letterSpacing: 0.6,
                    textTransform: "uppercase",
                    lineHeight: 1.1,
                }}
            >
                {label}
            </Typography>
            <Typography
                sx={{
                    color,
                    fontSize: 12,
                    fontWeight: 800,
                    lineHeight: 1.2,
                    textAlign: "right",
                }}
            >
                {value}
            </Typography>
        </Box>
    );
};

const SummaryTile = ({ label, value, detail, color, bgColorNew }) => {
    const theme = useTheme();

    return (
        <Box
            sx={{
                p: 1.1,
                minWidth: 0,
                borderRadius: "14px",
                bgcolor: bgColorNew || alpha(theme.hmi.colorDeepNavy, 0.46),
                border: `1px solid ${alpha(color, 0.24)}`,
                boxShadow: `inset 0 1px 0 ${alpha(theme.hmi.colorSnowGray, 0.04)}`,
                display: "flex",
                flexDirection: "column",
                gap: 0.45,
            }}
        >
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, minWidth: 0 }}>
                <Box
                    sx={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        bgcolor: color,
                        boxShadow: `0 0 10px ${alpha(color, 0.7)}`,
                        flexShrink: 0,
                    }}
                />
                <Typography
                    variant="span"
                    sx={{
                        color: alpha(theme.hmi.colorSnowGray, 0.68),
                        fontSize: 10,
                        fontWeight: 800,
                        letterSpacing: 0.4,
                        textTransform: "uppercase",
                    }}
                >
                    {label}
                </Typography>
            </Box>

            <Typography
                sx={{
                    color,
                    fontSize: 15,
                    fontWeight: 800,
                    lineHeight: 1.2,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                }}
            >
                {value}
            </Typography>

            <Typography
                sx={{
                    color: alpha(theme.hmi.colorSnowGray, 0.66),
                    fontSize: 11,
                    lineHeight: 1.35,
                    minHeight: 30,
                    display: "-webkit-box",
                    overflow: "hidden",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                }}
            >
                {detail}
            </Typography>
        </Box>
    );
};

const StatusPill = ({ label, value, color }) => {
    const theme = useTheme();

    return (
        <Box
            sx={{
                px: 1,
                py: 0.85,
                minWidth: 0,
                borderRadius: "12px",
                bgcolor: alpha(color, 0.12),
                border: `1px solid ${alpha(color, 0.26)}`,
                display: "flex",
                flexDirection: "column",
                gap: 0.15,
            }}
        >
            <Typography
                sx={{
                    color: alpha(theme.hmi.colorSnowGray, 0.62),
                    fontSize: 9,
                    fontWeight: 800,
                    letterSpacing: 0.5,
                    textTransform: "uppercase",
                    lineHeight: 1.1,
                }}
            >
                {label}
            </Typography>
            <Typography
                sx={{
                    color,
                    fontSize: 12,
                    fontWeight: 800,
                    lineHeight: 1.2,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                }}
            >
                {value}
            </Typography>
        </Box>
    );
};

const ActionButton = ({ tone = "primary", sx, ...props }) => {
    const theme = useTheme();
    const palette = getButtonPalette(theme, tone);

    return (
        <Button
            variant="contained"
            {...props}
            sx={[
                {
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-start",
                    gap: 0.6,
                    minWidth: 0,
                    minHeight: 40,
                    px: 1.15,
                    borderRadius: "12px",
                    border: `1px solid ${palette.borderColor}`,
                    color: palette.color,
                    bgcolor: palette.bgcolor,
                    boxShadow: theme.hmi.boxShadowBtn,
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: 0.1,
                    whiteSpace: "nowrap",
                    "&:hover": {
                        bgcolor: palette.hoverBg,
                        boxShadow: theme.hmi.boxShadowBtnHover,
                    },
                    "& .MuiButton-startIcon": {
                        mr: 0.2,
                    },
                    "& .MuiButton-startIcon svg": {
                        fontSize: "15px",
                    },
                    "&.Mui-disabled": {
                        color: alpha(theme.hmi.colorSnowGray, 0.4),
                        bgcolor: alpha(theme.hmi.colorMidnightBlue, 0.52),
                        borderColor: alpha(theme.hmi.colorSnowGray, 0.12),
                        boxShadow: "none",
                    },
                    "&.Mui-disabled .MuiButton-startIcon": {
                        color: alpha(theme.hmi.colorSnowGray, 0.38),
                    },
                },
                sx,
            ]}
        />
    );
};

const SectionCard = ({ icon, title, subtitle, badge, badgeColor, children }) => {
    const theme = useTheme();
    const accentColor = badgeColor || alpha(theme.hmi.colorSnowGray, 0.6);

    return (
        <Box
            sx={{
                p: 1.25,
                borderRadius: "16px",
                bgcolor: alpha(theme.hmi.colorMidnightBlue, 0.44),
                backgroundImage: `linear-gradient(180deg, ${alpha(theme.hmi.colorMidnightBlue, 0.76)} 0%, ${alpha(
                    theme.hmi.colorDeepNavy,
                    0.7,
                )} 100%)`,
                border: `1px solid ${alpha(accentColor, 0.5)}`,
                boxShadow: `inset 0 1px 0 ${alpha(theme.hmi.colorSnowGray, 0.05)}`,
                display: "flex",
                flexDirection: "column",
                gap: 1.15,
            }}
        >
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
                    <Box
                        sx={{
                            width: 40,
                            height: 40,
                            borderRadius: "12px",
                            display: "grid",
                            placeItems: "center",
                            flexShrink: 0,
                            bgcolor: alpha(accentColor, 0.14),
                            border: `1px solid ${alpha(accentColor, 0.28)}`,
                            color: accentColor,
                        }}
                    >
                        {icon}
                    </Box>

                    <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontSize: 14, fontWeight: 800, lineHeight: 1.2 }}>{title}</Typography>
                        {/* {subtitle && (
                            <Typography
                                sx={{
                                    mt: 0.35,
                                    color: alpha(theme.hmi.colorSnowGray, 0.66),
                                    fontSize: 11,
                                    lineHeight: 1.35,
                                }}
                            >
                                {subtitle}
                            </Typography>
                        )} */}
                    </Box>
                </Box>

                {badge ? (
                    <HeaderBadge
                        label={badge.label}
                        value={badge.value}
                        color={badgeColor || theme.hmi.colorAshGray}
                    />
                ) : null}
            </Box>

            {children}
        </Box>
    );
};

const MapToolbar = ({
    isPlanning,
    isRoutePlanning,
    isRouteTestPlanning,
    mapLayerOptions = [],
    routeDistanceMeters,
    routePointsCount,
    routeStatus,
    selectedMapLayerId,
    missionNameDraft,
    savedWaypointMissions = [],
    selectedMissionId,
    waypointsCount,
    onCenterRobot,
    onChangeMissionName,
    onClearRoute,
    onClearWaypoints,
    onLoadSavedMission,
    onSaveMissionHistory,
    onSelectMapLayer,
    onSelectMission,
    onSendMission,
    onSendRoute,
    onSendSavedMission,
    onTogglePlanning,
    onToggleRoutePlanning,
    onToggleRouteTestPlanning,
    onUndoWaypoint,
}) => {
    const theme = useTheme();
    const routeLabel = getRouteLabel(routeStatus, routePointsCount);
    const distanceLabel = getDistanceLabel(routeDistanceMeters);
    const selectedMapLayer = mapLayerOptions.find((layer) => layer.id === selectedMapLayerId) ?? mapLayerOptions[0];
    const selectedMission = savedWaypointMissions.find((mission) => mission.id === selectedMissionId) ?? null;

    const waypointColor = getModeColor(theme, isPlanning);
    const routeModeColor =
        isRoutePlanning || isRouteTestPlanning
            ? isRouteTestPlanning
                ? theme.hmi.colorBtnOrange
                : theme.hmi.colorPrimary
            : theme.hmi.colorError;
    const routeStatusColor = getRouteStatusColor(theme, routeStatus);
    const historyColor = selectedMission ? theme.hmi.colorBtnOrange : theme.hmi.colorAshGray;
    const mapLayerColor = selectedMapLayer?.isOffline ? theme.hmi.colorPrimary : theme.hmi.colorBtnOrange;

    const fieldStyle = {
        width: "100%",
        "& .MuiInputLabel-root": {
            color: alpha(theme.hmi.colorSnowGray, 0.64),
        },
        "& .MuiInputLabel-root.Mui-focused": {
            color: theme.hmi.colorBtnOrange,
        },
        "& .MuiOutlinedInput-root": {
            color: theme.hmi.colorSnowGray,
            bgcolor: alpha(theme.hmi.colorDeepNavy, 0.54),
            borderRadius: "12px",
            "& fieldset": {
                borderColor: alpha(theme.hmi.colorSnowGray, 0.16),
            },
            "&:hover fieldset": {
                borderColor: alpha(theme.hmi.colorSnowGray, 0.28),
            },
            "&.Mui-focused fieldset": {
                borderColor: theme.hmi.colorBtnOrange,
            },
        },
        "& .MuiSvgIcon-root": {
            color: alpha(theme.hmi.colorSnowGray, 0.72),
        },
    };

    return (
        <Box
            sx={{
                p: 1,
                position: "absolute",
                zIndex: 1200,
                right: 0,
                top: "95px",
                bottom: 0,
                width: { xs: "calc(100% - 24px)", sm: 450 },
                maxWidth: "calc(100vw - 24px)",
                bgcolor: theme.hmi.colorDeepNavy,
            }}
        >
            <Box
                sx={{
                    color: theme.hmi.colorSnowGray,
                    bgcolor: alpha(theme.hmi.colorMidnightBlue, 0.98),
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
                    }}
                >
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.1 }}>
                        <Box
                            sx={{
                                width: 44,
                                height: 44,
                                borderRadius: "14px",
                                display: "grid",
                                placeItems: "center",
                                bgcolor: alpha(theme.hmi.colorBtnOrange, 0.14),
                                border: `1px solid ${alpha(theme.hmi.colorBtnOrange, 0.28)}`,
                                color: theme.hmi.colorBtnOrange,
                                flexShrink: 0,
                            }}
                        >
                            <MapIcon />
                        </Box>

                        <Box sx={{ minWidth: 0 }}>
                            <Typography sx={{ fontSize: 17, fontWeight: 800, lineHeight: 1.2 }}>
                                Điều hướng bản đồ
                            </Typography>
                            <Typography sx={{ color: alpha(theme.hmi.colorSnowGray, 0.68), fontSize: 12 }}>
                                Bảng điều khiển waypoint, route và trạng thái tác vụ
                            </Typography>
                        </Box>
                    </Box>

                    <Box
                        sx={{
                            flex: 1,
                            minHeight: 0,
                            overflowY: "auto",
                            pr: 0.25,
                            "&::-webkit-scrollbar": {
                                width: 4,
                            },
                            "&::-webkit-scrollbar-thumb": {
                                backgroundColor: alpha(theme.hmi.colorBtnOrange, 0.3),
                                borderRadius: 2,
                            },
                        }}
                    >
                        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
                            <Box
                                sx={{
                                    p: 1.1,
                                    borderRadius: "16px",
                                    bgcolor: alpha(theme.hmi.colorDeepNavy, 0.48),
                                    border: `1px solid ${alpha(theme.hmi.colorSnowGray, 0.4)}`,
                                }}
                            >
                                <Box
                                    sx={{
                                        display: "grid",
                                        gridTemplateColumns: {
                                            xs: "repeat(2, minmax(0, 1fr))",
                                            sm: "repeat(2, minmax(0, 1fr))",
                                        },
                                        gap: 1,
                                    }}
                                >
                                    <SummaryTile
                                        label="Bản đồ nền"
                                        value={selectedMapLayer?.label || "--"}
                                        // bgColorNew={theme.hmi.colorBtnOrange}
                                        // detail={
                                        //     selectedMapLayer?.isOffline
                                        //         ? "Nguồn local đang hoạt động"
                                        //         : "Nguồn internet đang hoạt động"
                                        // }
                                        color={mapLayerColor}
                                    />
                                    <SummaryTile
                                        label="Waypoint"
                                        value={`${waypointsCount} điểm`}
                                        // detail={isPlanning ? "Đang ghi waypoint mới" : "Đang chờ thao tác thêm điểm"}
                                        color={waypointColor}
                                    />
                                    <SummaryTile
                                        label="Tuyến route"
                                        value={routeLabel}
                                        detail={`Khoảng cách ${distanceLabel}`}
                                        color={routeStatusColor}
                                    />
                                    <SummaryTile
                                        label="Kho lưu"
                                        value={`${savedWaypointMissions.length}/5`}
                                        detail={selectedMission ? selectedMission.name : "Chưa chọn mission lưu"}
                                        color={historyColor}
                                    />
                                </Box>
                            </Box>

                            <SectionCard
                                icon={<LayersIcon />}
                                title="Lớp bản đồ"
                                // badge={{
                                //     label: "Đang dùng",
                                //     value: selectedMapLayer?.isOffline ? "OFFLINE" : "ONLINE",
                                // }}
                                badgeColor={mapLayerColor}
                            >
                                <Box
                                    sx={{
                                        display: "grid",
                                        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                                        gap: 1,
                                    }}
                                >
                                    {mapLayerOptions.map((layer) => {
                                        const isSelected = layer.id === selectedMapLayerId;
                                        const layerColor = layer.isOffline
                                            ? theme.hmi.colorPrimary
                                            : theme.hmi.colorBtnOrange;

                                        return (
                                            <Tooltip
                                                key={layer.id}
                                                title={layer.description}
                                            >
                                                <Button
                                                    variant="contained"
                                                    onClick={() => onSelectMapLayer?.(layer.id)}
                                                    sx={{
                                                        p: 0,
                                                        minWidth: 0,
                                                        minHeight: 50,
                                                        borderRadius: "14px",
                                                        alignItems: "stretch",
                                                        justifyContent: "stretch",
                                                        textTransform: "none",
                                                        color: theme.hmi.colorSnowGray,
                                                        bgcolor: isSelected
                                                            ? alpha(theme.hmi.primaryColorHvqp, 0.96)
                                                            : alpha(theme.hmi.colorMidnightBlue, 0.9),
                                                        border: `1px solid ${alpha(
                                                            isSelected ? layerColor : theme.hmi.colorSnowGray,
                                                            isSelected ? 0.5 : 0.12,
                                                        )}`,
                                                        boxShadow: isSelected ? theme.hmi.boxShadowBtn : "none",
                                                        "&:hover": {
                                                            bgcolor: isSelected
                                                                ? alpha(theme.hmi.primaryColorHvqp, 0.92)
                                                                : alpha(theme.hmi.colorMidnightBlue, 1),
                                                            boxShadow: isSelected
                                                                ? theme.hmi.boxShadowBtnHover
                                                                : theme.hmi.boxShadowBtn,
                                                        },
                                                    }}
                                                >
                                                    <Box
                                                        sx={{
                                                            p: 1,
                                                            width: "100%",
                                                            display: "flex",
                                                            flexDirection: "column",
                                                            alignItems: "flex-start",
                                                            justifyContent: "center",
                                                            gap: 0.45,
                                                        }}
                                                    >
                                                        <Box
                                                            sx={{
                                                                display: "flex",
                                                                alignItems: "center",
                                                                gap: 0.75,
                                                                minWidth: 0,
                                                            }}
                                                        >
                                                            <Box
                                                                sx={{
                                                                    width: 9,
                                                                    height: 9,
                                                                    borderRadius: "50%",
                                                                    bgcolor: isSelected
                                                                        ? theme.hmi.colorSnowGray
                                                                        : alpha(layerColor, 0.9),
                                                                    boxShadow: `0 0 10px ${alpha(layerColor, 0.58)}`,
                                                                    flexShrink: 0,
                                                                }}
                                                            />
                                                            <Typography
                                                                variant="span"
                                                                sx={{
                                                                    fontSize: 12,
                                                                    fontWeight: 800,
                                                                    textAlign: "left",
                                                                    lineHeight: 1.25,
                                                                }}
                                                            >
                                                                {layer.label}
                                                            </Typography>
                                                        </Box>
                                                        {/* <Typography
                                                            sx={{
                                                                color: alpha(theme.hmi.colorSnowGray, 0.68),
                                                                fontSize: 10,
                                                                textAlign: "left",
                                                                lineHeight: 1.3,
                                                            }}
                                                        >
                                                            {layer.isOffline
                                                                ? "Tile local, ưu tiên vận hành ổn định"
                                                                : "Tile internet, phù hợp kiểm tra nhanh"}
                                                        </Typography> */}
                                                    </Box>
                                                </Button>
                                            </Tooltip>
                                        );
                                    })}
                                </Box>
                            </SectionCard>

                            <SectionCard
                                icon={<MyLocationIcon />}
                                title="Điều khiển map"
                                // subtitle="Tác vụ nhanh để đưa góc nhìn quay lại vị trí robot."
                                badge={{ label: "Tác vụ", value: "CENTER" }}
                                badgeColor={theme.hmi.colorPrimary}
                            >
                                <Box
                                    sx={{
                                        display: "grid",
                                        gridTemplateColumns: { xs: "1fr", sm: "minmax(0, 1.2fr) minmax(0, 0.8fr)" },
                                        gap: 1,
                                        alignItems: "stretch",
                                    }}
                                >
                                    <Tooltip title="Canh giữa map về vị trí robot">
                                        <ActionButton
                                            tone="primary"
                                            startIcon={<MyLocationIcon fontSize="small" />}
                                            onClick={onCenterRobot}
                                        >
                                            Canh giữa robot
                                        </ActionButton>
                                    </Tooltip>

                                    {/* <Box
                                        sx={{
                                            px: 1.1,
                                            py: 0.95,
                                            borderRadius: "12px",
                                            bgcolor: alpha(theme.hmi.colorDeepNavy, 0.54),
                                            border: `1px solid ${alpha(theme.hmi.colorPrimary, 0.22)}`,
                                            display: "flex",
                                            flexDirection: "column",
                                            justifyContent: "center",
                                            gap: 0.2,
                                        }}
                                    >
                                        <Typography
                                            sx={{
                                                color: alpha(theme.hmi.colorSnowGray, 0.62),
                                                fontSize: 9,
                                                fontWeight: 800,
                                                letterSpacing: 0.45,
                                                textTransform: "uppercase",
                                            }}
                                        >
                                            Tác vụ
                                        </Typography>
                                        <Typography
                                            sx={{ fontSize: 12, fontWeight: 800, color: theme.hmi.colorPrimary }}
                                        >
                                            Bám robot
                                        </Typography>
                                        <Typography sx={{ color: alpha(theme.hmi.colorSnowGray, 0.64), fontSize: 11 }}>
                                            Thu hồi camera về tâm vận hành.
                                        </Typography>
                                    </Box> */}
                                </Box>
                            </SectionCard>

                            <SectionCard
                                icon={<AddLocationAltIcon />}
                                title="Điều khiển waypoint"
                                subtitle="Bật chế độ chấm điểm, hiệu chỉnh và gửi mission thủ công."
                                badge={{ label: "Chế độ", value: isPlanning ? "ON" : "OFF" }}
                                badgeColor={waypointColor}
                            >
                                <Box
                                    sx={{
                                        display: "grid",
                                        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                                        gap: 1,
                                    }}
                                >
                                    <Tooltip title="Bật hoặc tắt chế độ thêm waypoint">
                                        <ActionButton
                                            tone={isPlanning ? "primary" : "danger"}
                                            startIcon={<AddLocationAltIcon fontSize="small" />}
                                            onClick={onTogglePlanning}
                                        >
                                            {isPlanning ? "Dừng chấm điểm" : "Bật waypoint"}
                                        </ActionButton>
                                    </Tooltip>

                                    <Tooltip title="Gửi waypoint hiện tại xuống robot">
                                        <ActionButton
                                            tone="primary"
                                            startIcon={<SendIcon fontSize="small" />}
                                            onClick={onSendMission}
                                            disabled={!waypointsCount}
                                        >
                                            Gửi lộ trình
                                        </ActionButton>
                                    </Tooltip>

                                    <Tooltip title="Hoàn tác waypoint cuối cùng">
                                        <ActionButton
                                            tone="accent"
                                            startIcon={<UndoIcon fontSize="small" />}
                                            onClick={onUndoWaypoint}
                                            disabled={!waypointsCount}
                                        >
                                            Hoàn tác
                                        </ActionButton>
                                    </Tooltip>

                                    <Tooltip title="Xóa toàn bộ waypoint đang có">
                                        <ActionButton
                                            tone="neutral"
                                            startIcon={<DeleteSweepIcon fontSize="small" />}
                                            onClick={onClearWaypoints}
                                            disabled={!waypointsCount}
                                        >
                                            Xóa toàn bộ
                                        </ActionButton>
                                    </Tooltip>
                                </Box>

                                <Box
                                    sx={{
                                        display: "grid",
                                        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                                        gap: 1,
                                    }}
                                >
                                    <StatusPill
                                        label="Trạng thái"
                                        value={isPlanning ? "Đang thêm waypoint" : "Chờ kích hoạt"}
                                        color={waypointColor}
                                    />
                                    <StatusPill
                                        label="Số lượng"
                                        value={`${waypointsCount} waypoint`}
                                        color={theme.hmi.colorBtnOrange}
                                    />
                                </Box>
                            </SectionCard>

                            {/* <SectionCard
                                icon={<SaveIcon />}
                                title="Kho lưu hành trình"
                                subtitle="Lưu mission thủ công, chọn lại bản đã có và gửi trực tiếp."
                                badge={{
                                    label: "Bản lưu",
                                    value: `${savedWaypointMissions.length}/5`,
                                }}
                                badgeColor={historyColor}
                            >
                                <TextField
                                    size="small"
                                    label="Tên hành trình"
                                    placeholder="Ví dụ: Khu A buổi sáng"
                                    value={missionNameDraft}
                                    onChange={(event) => onChangeMissionName?.(event.target.value)}
                                    sx={fieldStyle}
                                />

                                <Box
                                    sx={{
                                        px: 1.1,
                                        py: 1,
                                        borderRadius: "12px",
                                        bgcolor: alpha(theme.hmi.colorDeepNavy, 0.54),
                                        border: `1px solid ${alpha(historyColor, 0.22)}`,
                                        display: "flex",
                                        flexDirection: "column",
                                        gap: 0.3,
                                    }}
                                >
                                    <Typography
                                        sx={{
                                            color: alpha(theme.hmi.colorSnowGray, 0.62),
                                            fontSize: 9,
                                            fontWeight: 800,
                                            letterSpacing: 0.45,
                                            textTransform: "uppercase",
                                        }}
                                    >
                                        Mission đang chọn
                                    </Typography>
                                    <Typography sx={{ fontSize: 13, fontWeight: 800, color: historyColor }}>
                                        {selectedMission ? selectedMission.name : "Chưa chọn mission lưu"}
                                    </Typography>
                                    <Typography
                                        sx={{
                                            color: alpha(theme.hmi.colorSnowGray, 0.66),
                                            fontSize: 11,
                                            lineHeight: 1.35,
                                        }}
                                    >
                                        {selectedMission
                                            ? `${selectedMission.waypoints.length} waypoint · cập nhật ${formatMissionTimestamp(
                                                  selectedMission.updatedAt,
                                              )}`
                                            : "Chọn một mission bên dưới để nạp lại hoặc gửi trực tiếp xuống robot."}
                                    </Typography>
                                </Box>

                                <FormControl
                                    size="small"
                                    fullWidth
                                    sx={fieldStyle}
                                >
                                    <InputLabel id="saved-mission-select-label">Mission đã lưu</InputLabel>
                                    <Select
                                        labelId="saved-mission-select-label"
                                        label="Mission đã lưu"
                                        value={selectedMissionId || ""}
                                        onChange={(event) => onSelectMission?.(event.target.value)}
                                    >
                                        {!savedWaypointMissions.length && (
                                            <MenuItem
                                                value=""
                                                disabled
                                            >
                                                Chưa có mission đã lưu
                                            </MenuItem>
                                        )}
                                        {savedWaypointMissions.map((mission) => (
                                            <MenuItem
                                                key={mission.id}
                                                value={mission.id}
                                            >
                                                {mission.name} · {mission.waypoints.length} wp ·{" "}
                                                {formatMissionTimestamp(mission.updatedAt)}
                                            </MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>

                                <Box
                                    sx={{
                                        display: "grid",
                                        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                                        gap: 1,
                                    }}
                                >
                                    <Tooltip title="Lưu waypoint hiện tại vào lịch sử">
                                        <ActionButton
                                            tone="primary"
                                            startIcon={<SaveIcon fontSize="small" />}
                                            onClick={onSaveMissionHistory}
                                            disabled={!waypointsCount}
                                            sx={{ gridColumn: "1 / -1" }}
                                        >
                                            Lưu hành trình hiện tại
                                        </ActionButton>
                                    </Tooltip>

                                    <Tooltip title="Nạp mission đã lưu lên bản đồ">
                                        <ActionButton
                                            tone="accent"
                                            startIcon={<LayersIcon fontSize="small" />}
                                            onClick={onLoadSavedMission}
                                            disabled={!savedWaypointMissions.length || !selectedMissionId}
                                        >
                                            Nạp lên bản đồ
                                        </ActionButton>
                                    </Tooltip>

                                    <Tooltip title="Gửi trực tiếp mission đã lưu xuống robot">
                                        <ActionButton
                                            tone="primary"
                                            startIcon={<SendIcon fontSize="small" />}
                                            onClick={onSendSavedMission}
                                            disabled={!savedWaypointMissions.length || !selectedMissionId}
                                        >
                                            Gửi mission
                                        </ActionButton>
                                    </Tooltip>
                                </Box>
                            </SectionCard> */}

                            <SectionCard
                                icon={<AltRouteIcon />}
                                title="Điều khiển route tự động"
                                subtitle="Sinh route từ vị trí robot đến điểm đích hoặc chạy ở chế độ test."
                                badge={{
                                    label: "Route",
                                    value: getRouteModeLabel(isRoutePlanning, isRouteTestPlanning),
                                }}
                                badgeColor={routeModeColor}
                            >
                                <Box
                                    sx={{
                                        display: "grid",
                                        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                                        gap: 1,
                                    }}
                                >
                                    <Tooltip title="Bật hoặc tắt chế độ chọn đích đến tự động">
                                        <ActionButton
                                            tone={isRoutePlanning ? "primary" : "danger"}
                                            startIcon={<AltRouteIcon fontSize="small" />}
                                            onClick={onToggleRoutePlanning}
                                        >
                                            {isRoutePlanning ? "Dừng tự động" : "Bật tự động "}
                                        </ActionButton>
                                    </Tooltip>

                                    <Tooltip title="Chọn điểm đầu và điểm đích để kiểm tra lộ trình">
                                        <ActionButton
                                            tone={isRouteTestPlanning ? "accent" : "neutral"}
                                            startIcon={<AltRouteIcon fontSize="small" />}
                                            onClick={onToggleRouteTestPlanning}
                                        >
                                            {isRouteTestPlanning ? "Dừng kiểm tra" : "Kiểm tra lộ trình"}
                                        </ActionButton>
                                    </Tooltip>

                                    <Tooltip title="Xóa lộ trình hiện tại">
                                        <ActionButton
                                            tone="neutral"
                                            startIcon={<DeleteSweepIcon fontSize="small" />}
                                            onClick={onClearRoute}
                                            disabled={!routePointsCount && routeStatus === "idle"}
                                        >
                                            Xóa lộ trình
                                        </ActionButton>
                                    </Tooltip>

                                    <Tooltip title="Gửi lộ trình hiện tại xuống robot">
                                        <ActionButton
                                            tone="primary"
                                            startIcon={<SendIcon fontSize="small" />}
                                            onClick={onSendRoute}
                                            disabled={!routePointsCount}
                                        >
                                            Gửi lộ trình
                                        </ActionButton>
                                    </Tooltip>
                                </Box>

                                <Box
                                    sx={{
                                        display: "grid",
                                        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                                        gap: 1,
                                    }}
                                >
                                    <StatusPill
                                        label="Lộ trình"
                                        value={routeLabel}
                                        color={routeStatusColor}
                                    />
                                    <StatusPill
                                        label="Khoảng cách"
                                        value={distanceLabel}
                                        color={theme.hmi.colorBtnOrange}
                                    />
                                </Box>
                            </SectionCard>
                        </Box>
                    </Box>
                </Box>
            </Box>
        </Box>
    );
};

export default MapToolbar;

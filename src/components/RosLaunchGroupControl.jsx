import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import CloseIcon from "@mui/icons-material/Close";
import DirectionsCarFilledIcon from "@mui/icons-material/DirectionsCarFilled";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import StopCircleIcon from "@mui/icons-material/StopCircle";
import { Box, Button, IconButton, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { useMemo } from "react";

const RUN_BUTTON_SX = {
    borderRadius: "8px",
    bgcolor: (theme) => theme.hmi.primaryColorHvqp,
    color: (theme) => theme.hmi.colorSnowGray,
    fontSize: 10,
    fontWeight: 600,
    boxShadow: (theme) => theme.hmi.boxShadowBtn,
    transition: "background-color 0.3s ease, box-shadow 0.3s ease",
    "&:hover": {
        boxShadow: (theme) => theme.hmi.boxShadowBtnHover,
    },
    "& .MuiButton-startIcon svg": {
        fontSize: "13px",
    },
    "&.Mui-disabled": {
        color: (theme) => theme.hmi.colorSnowGray,
        border: (theme) => `1px solid ${alpha(theme.hmi.colorSnowGray, 0.28)}`,
    },
    "&.Mui-disabled .MuiButton-startIcon": {
        color: (theme) => theme.hmi.colorSnowGray,
    },
};

const START_LIKE_EVENTS = new Set(["switch_on", "pending_start", "saving", "started", "already_running"]);
const STOP_LIKE_EVENTS = new Set(["switch_off", "pending_stop", "stopped", "not_running", "saved"]);

const getLaunchToggleState = (status, switchState = null) => {
    if (typeof switchState?.isOn === "boolean") {
        return {
            isRunActive: switchState.isOn,
            isStopActive: !switchState.isOn,
        };
    }

    const event = status?.event;

    if (START_LIKE_EVENTS.has(event)) {
        return {
            isRunActive: true,
            isStopActive: false,
        };
    }

    if (STOP_LIKE_EVENTS.has(event)) {
        return {
            isRunActive: false,
            isStopActive: true,
        };
    }

    return {
        isRunActive: false,
        isStopActive: false,
    };
};

const getActionButtonSx = (theme, variant, isActive) => {
    const isRun = variant === "run";
    const activeBgColor = isRun ? theme.hmi.primaryColorHvqp : theme.hmi.colorBtnOrange;
    const activeTextColor = isRun ? theme.hmi.colorSnowGray : theme.hmi.primaryColorHvqp;
    const idleBgColor = alpha(activeBgColor, 0.2);
    const idleTextColor = alpha(theme.hmi.colorSnowGray, 0.78);
    const idleBorderColor = alpha(activeBgColor, 0.3);

    return {
        ...RUN_BUTTON_SX,
        bgcolor: isActive ? activeBgColor : idleBgColor,
        color: isActive ? activeTextColor : idleTextColor,
        border: `1px solid ${isActive ? alpha(activeBgColor, 0.9) : idleBorderColor}`,
        boxShadow: isActive ? theme.hmi.boxShadowBtnHover : "none",
        transform: isActive ? "translateY(-1px)" : "none",
        "&:hover": {
            bgcolor: activeBgColor,
            color: activeTextColor,
            borderColor: alpha(activeBgColor, 0.95),
            boxShadow: theme.hmi.boxShadowBtnHover,
        },
        "&.Mui-disabled": {
            color: idleTextColor,
            border: `1px solid ${idleBorderColor}`,
            bgcolor: idleBgColor,
            boxShadow: "none",
        },
        "&.Mui-disabled .MuiButton-startIcon": {
            color: idleTextColor,
        },
    };
};

const getLaunchStatusView = (theme, status) => {
    if (!status) {
        return {
            label: "Chờ tín hiệu",
            color: theme.hmi.colorAshGray,
        };
    }

    const statusTime = status.receivedAt
        ? new Date(status.receivedAt).toLocaleTimeString("vi-VN", { hour12: false })
        : "";
    const mapDetail = status.map_name ? `${status.map_name} · ${statusTime}` : statusTime;

    if (status.event === "saving" || status.event === "saved") {
        return {
            label: status.event === "saving" ? "Đang lưu bản đồ" : "Đã lưu bản đồ",
            detail: mapDetail,
            color: status.event === "saving" ? theme.hmi.colorBtnOrange : theme.hmi.colorPrimary,
        };
    }

    if (status.event === "save_failed" || status.event === "start_failed") {
        return {
            label: status.event === "save_failed" ? "Lưu bản đồ thất bại" : "Khởi chạy thất bại",
            detail: status.message || status.error || mapDetail,
            color: theme.hmi.colorError,
        };
    }

    if (status.event === "pending_start") {
        return {
            label: "Đang gửi lệnh chạy",
            detail: mapDetail,
            color: theme.hmi.colorBtnOrange,
        };
    }

    if (status.event === "pending_stop") {
        return {
            label: "Đã gửi lệnh dừng",
            detail: statusTime,
            color: theme.hmi.colorBtnOrange,
        };
    }

    if (status.event === "switch_on") {
        return {
            label: "Công tắc bật",
            detail: statusTime,
            color: theme.hmi.colorPrimary,
        };
    }

    if (status.event === "switch_off") {
        return {
            label: "Công tắc tắt",
            detail: statusTime,
            color: theme.hmi.colorAshGray,
        };
    }

    if (status.event === "started" || status.event === "already_running") {
        return {
            label: "Đang chạy",
            detail: status.map_name ? mapDetail : status.pid ? `pid ${status.pid} · ${statusTime}` : statusTime,
            color: theme.hmi.colorPrimary,
        };
    }

    if (status.event === "stopped" || status.event === "not_running") {
        return {
            label: status.event === "stopped" ? "Đã dừng" : "Chưa chạy",
            detail: statusTime,
            color: theme.hmi.colorAshGray,
        };
    }

    if (status.event === "exited") {
        const isError = Number(status.return_code) !== 0;

        return {
            label: isError ? "Lỗi / đã thoát" : "Đã thoát",
            detail: `return ${status.return_code} · ${statusTime}`,
            color: isError ? theme.hmi.colorError : theme.hmi.colorBtnOrange,
        };
    }

    if (status.event === "rejected") {
        return {
            label: "Bị từ chối",
            detail: `${status.message || status.reason || "unknown"} · ${statusTime}`,
            color: theme.hmi.colorError,
        };
    }

    return {
        label: status.event || "Không rõ",
        detail: status.reason ? `${status.reason} · ${statusTime}` : statusTime,
        color: theme.hmi.colorBtnOrange,
    };
};

const getLaunchGroupSummary = (theme, group, launchStatuses, launchSwitchStates = {}) => {
    const groupStatuses = group.commands.map((command) => ({
        status: launchStatuses[command.launch],
        switchState: launchSwitchStates[command.launch],
    }));

    const activeSwitchCount = groupStatuses.filter((entry) => entry.switchState?.isOn).length;
    const hasSwitchState = groupStatuses.some((entry) => typeof entry.switchState?.isOn === "boolean");
    const statusEntries = groupStatuses.map((entry) => entry.status).filter(Boolean);

    const runningCount = hasSwitchState
        ? activeSwitchCount
        : statusEntries.filter(
              (status) =>
                  status.event === "switch_on" || status.event === "saving"
                  || status.event === "started" || status.event === "already_running",
          ).length;
    const pendingCount = statusEntries.filter(
        (status) => status.event === "pending_start" || status.event === "pending_stop",
    ).length;
    const errorCount = statusEntries.filter(
        (status) => ["rejected", "save_failed", "start_failed"].includes(status.event)
            || (status.event === "exited" && Number(status.return_code) !== 0),
    ).length;
    const stoppedCount = hasSwitchState
        ? group.commands.length - activeSwitchCount
        : statusEntries.filter(
              (status) => status.event === "switch_off" || status.event === "stopped" || status.event === "not_running",
          ).length;

    if (errorCount > 0) {
        return {
            color: theme.hmi.colorError,
            label: `${errorCount} lỗi`,
            detail: `${runningCount}/${group.commands.length} launch đang chạy`,
            runningCount,
        };
    }

    if (hasSwitchState) {
        return {
            color: runningCount > 0 ? theme.hmi.colorPrimary : theme.hmi.colorAshGray,
            label: runningCount > 0 ? `${runningCount}/${group.commands.length} đang bật` : "Tất cả đang tắt",
            detail: pendingCount > 0 ? `${pendingCount} lệnh đang gửi đi` : "Trạng thái bám theo công tắc vật lý",
            runningCount,
        };
    }

    if (pendingCount > 0) {
        return {
            color: theme.hmi.colorBtnOrange,
            label: `${pendingCount} đang xử lý`,
            detail: `${runningCount}/${group.commands.length} launch đang chạy`,
            runningCount,
        };
    }

    if (runningCount > 0) {
        return {
            color: theme.hmi.colorPrimary,
            label: `${runningCount}/${group.commands.length} đang chạy`,
            detail: stoppedCount > 0 ? `${stoppedCount} launch đã dừng` : "Bấm để mở danh sách launch",
            runningCount,
        };
    }

    return {
        color: theme.hmi.colorAshGray,
        // label: "Bấm để mở",
        // detail: `${group.commands.length} launch khả dụng`,
        runningCount,
    };
};

const RosLaunchGroupControl = ({
    variant = "summary",
    group,
    isActive = false,
    launchStatuses,
    launchSwitchStates = {},
    onToggle,
    onClose,
    onSendCommand,
}) => {
    const theme = useTheme();
    const summary = useMemo(
        () => getLaunchGroupSummary(theme, group, launchStatuses, launchSwitchStates),
        [theme, group, launchStatuses, launchSwitchStates],
    );

    if (variant === "summary") {
        return (
            <Box
                component="button"
                type="button"
                onClick={onToggle}
                sx={{
                    width: "100%",
                    p: 1.2,
                    borderRadius: "16px",
                    bgcolor: alpha(theme.hmi.colorDeepNavy, 0.52),
                    border: `1px solid ${alpha(isActive ? summary.color : theme.hmi.colorSnowGray, isActive ? 0.5 : 0.5)}`,
                    color: theme.hmi.colorSnowGray,
                    textAlign: "left",
                    cursor: "pointer",
                    transition: "transform 0.3s ease, border-color 0.3s ease, background-color 0.3s ease",
                    "&:hover": {
                        transform: "translateX(2px)",
                        borderColor: alpha(summary.color, 0.7),
                        bgcolor: alpha(theme.hmi.colorMidnightBlue, 0.42),
                    },
                }}
            >
                <Box
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 1,
                    }}
                >
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <Box
                            sx={{
                                width: 38,
                                height: 38,
                                borderRadius: "12px",
                                display: "grid",
                                placeItems: "center",
                                bgcolor: alpha(summary.color, 0.14),
                                border: `1px solid ${alpha(summary.color, 0.24)}`,
                                color: summary.color,
                                flexShrink: 0,
                            }}
                        >
                            <DirectionsCarFilledIcon fontSize="small" />
                        </Box>

                        <Box sx={{ minWidth: 0 }}>
                            <Typography sx={{ fontSize: 14, fontWeight: 800 }}>{group.title}</Typography>
                            <Typography
                                sx={{
                                    mt: 0.2,
                                    color: alpha(theme.hmi.colorSnowGray, 0.6),
                                    fontSize: 11,
                                    lineHeight: 1.25,
                                }}
                            >
                                {summary.detail}
                            </Typography>
                        </Box>
                    </Box>

                    <ChevronRightIcon
                        sx={{
                            color: summary.color,
                            fontSize: 24,
                            transform: isActive ? "rotate(90deg)" : "rotate(0deg)",
                            transition: "transform 0.18s ease",
                            flexShrink: 0,
                        }}
                    />
                </Box>

                <Box
                    sx={{
                        mt: 1,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 1,
                        flexWrap: "wrap",
                    }}
                >
                    <Typography
                        sx={{
                            color: summary.color,
                            fontSize: 12,
                            fontWeight: 800,
                        }}
                    >
                        {summary.label}
                    </Typography>
                    <Typography
                        sx={{
                            color: alpha(theme.hmi.colorSnowGray, 0.56),
                            fontSize: 11,
                        }}
                    >
                        {group.commands.length} launch
                    </Typography>
                </Box>
            </Box>
        );
    }

    if (!isActive) return null;

    return (
        <Box
            sx={{
                position: "absolute",
                top: { xs: 72, sm: 0 },
                bottom: { xs: 12, sm: 0 },
                left: { xs: 12, sm: "calc(100% + 12px)" },
                right: { xs: 12, sm: "auto" },
                width: { sm: 332 },
                zIndex: 2000,
                pointerEvents: "auto",
                userSelect: "none",
            }}
        >
            <Box
                sx={{
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    color: theme.hmi.colorSnowGray,
                    backgroundImage: theme.hmi.primaryColorBgGradientSlidebarDark,
                    border: `1px solid ${alpha(theme.hmi.colorSnowGray, 0.5)}`,
                    borderRadius: "18px",
                    boxShadow: "0 24px 48px rgba(0, 0, 0, 0.34)",
                    overflow: "hidden",
                }}
            >
                <Box
                    sx={{
                        px: 1.4,
                        py: 1.15,
                        display: "flex",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        gap: 1,
                        borderBottom: `1px solid ${alpha(theme.hmi.colorSnowGray, 0.1)}`,
                    }}
                >
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <Box
                            sx={{
                                width: 42,
                                height: 42,
                                borderRadius: "14px",
                                display: "grid",
                                placeItems: "center",
                                bgcolor: alpha(summary.color, 0.14),
                                border: `1px solid ${alpha(summary.color, 0.26)}`,
                                color: summary.color,
                                flexShrink: 0,
                            }}
                        >
                            <DirectionsCarFilledIcon />
                        </Box>

                        <Box sx={{ minWidth: 0 }}>
                            <Typography sx={{ fontSize: 16, fontWeight: 800 }}>{group.title}</Typography>
                            {/* <Typography sx={{ color: alpha(theme.hmi.colorSnowGray, 0.64), fontSize: 12 }}>
                                Danh sách launch điều khiển robot
                            </Typography> */}
                        </Box>
                    </Box>

                    <IconButton
                        size="small"
                        onClick={onClose}
                        sx={{
                            color: alpha(theme.hmi.colorSnowGray, 0.72),
                            border: `1px solid ${alpha(theme.hmi.colorSnowGray, 0.12)}`,
                            bgcolor: alpha(theme.hmi.colorSnowGray, 0.04),
                        }}
                    >
                        <CloseIcon fontSize="small" />
                    </IconButton>
                </Box>

                <Box
                    sx={{
                        px: 1.4,
                        py: 1,
                        display: "flex",
                        gap: 0.75,
                        flexWrap: "wrap",
                        borderBottom: `1px solid ${alpha(theme.hmi.colorSnowGray, 0.08)}`,
                    }}
                >
                    {/* <Box
                        sx={{
                            px: 1,
                            py: 0.55,
                            borderRadius: "999px",
                            bgcolor: alpha(summary.color, 0.12),
                            border: `1px solid ${alpha(summary.color, 0.24)}`,
                            color: summary.color,
                            fontSize: 13,
                            fontWeight: 800,
                        }}
                    >
                        {summary.label}
                    </Box> */}
                    {/* <Box
                        sx={{
                            px: 1,
                            py: 0.55,
                            borderRadius: "999px",
                            bgcolor: alpha(theme.hmi.colorSnowGray, 0.06),
                            border: `1px solid ${alpha(theme.hmi.colorSnowGray, 0.12)}`,
                            color: alpha(theme.hmi.colorSnowGray, 0.74),
                            fontSize: 13,
                        }}
                    >
                        {summary.runningCount}/{group.commands.length} đang chạy
                    </Box> */}
                </Box>

                <Box
                    sx={{
                        flex: 1,
                        minHeight: 0,
                        p: 1.15,
                        display: "flex",
                        flexDirection: "column",
                        gap: 0.95,
                        overflowY: "auto",
                        "&::-webkit-scrollbar": {
                            width: 6,
                        },
                        "&::-webkit-scrollbar-thumb": {
                            backgroundColor: alpha(theme.hmi.colorBtnOrange, 0.24),
                            borderRadius: 999,
                        },
                    }}
                >
                    {group.commands.map((command) => {
                        const launchStatus = launchStatuses[command.launch];
                        const launchSwitchState = launchSwitchStates[command.launch];
                        const launchStatusView = getLaunchStatusView(theme, launchStatus);
                        const toggleState = getLaunchToggleState(launchStatus, launchSwitchState);

                        return (
                            <Box
                                key={`${group.id}_${command.launch}`}
                                sx={{
                                    p: 0.95,
                                    borderRadius: "14px",
                                    bgcolor: alpha(theme.hmi.colorMidnightBlue, 0.34),
                                    border: `1px solid ${alpha(launchStatusView.color, 0.34)}`,
                                }}
                            >
                                <Box
                                    sx={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        gap: 0.75,
                                        alignItems: "center",
                                    }}
                                >
                                    <Typography
                                        sx={{
                                            color: theme.hmi.colorSnowGray,
                                            fontSize: 13,
                                            fontWeight: 700,
                                            minWidth: 0,
                                            userSelect: "none",
                                        }}
                                    >
                                        {command.label}
                                    </Typography>

                                    <Box sx={{ display: "flex", gap: 0.5, flexShrink: 0 }}>
                                        <Button
                                            size="small"
                                            variant="contained"
                                            startIcon={<PlayArrowIcon />}
                                            onClick={() =>
                                                onSendCommand({
                                                    ...command,
                                                    targetMachine: group.targetMachine,
                                                    action: "start",
                                                })
                                            }
                                            sx={getActionButtonSx(theme, "run", toggleState.isRunActive)}
                                        >
                                            RUN
                                        </Button>

                                        <Button
                                            size="small"
                                            variant="contained"
                                            startIcon={<StopCircleIcon />}
                                            onClick={() =>
                                                onSendCommand({
                                                    ...command,
                                                    targetMachine: group.targetMachine,
                                                    action: "stop",
                                                })
                                            }
                                            sx={getActionButtonSx(theme, "stop", toggleState.isStopActive)}
                                        >
                                            STOP
                                        </Button>
                                    </Box>
                                </Box>

                                <Box
                                    sx={{
                                        mt: 0.8,
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
                                            flex: "0 0 auto",
                                            borderRadius: "50%",
                                            bgcolor: launchStatusView.color,
                                            boxShadow: `0 0 10px ${alpha(launchStatusView.color, 0.68)}`,
                                        }}
                                    />
                                    <Box
                                        sx={{
                                            minWidth: 0,
                                            display: "flex",
                                            flexDirection: "column",
                                            gap: 0.15,
                                        }}
                                    >
                                        <Typography
                                            sx={{
                                                color: launchStatusView.color,
                                                fontSize: 12,
                                                fontWeight: 800,
                                                lineHeight: 1.2,
                                                userSelect: "none",
                                            }}
                                        >
                                            {launchStatusView.label}
                                        </Typography>
                                        <Typography
                                            title={launchStatusView.detail}
                                            sx={{
                                                color: alpha(theme.hmi.colorSnowGray, 0.62),
                                                fontSize: 11,
                                                lineHeight: 1.2,
                                                overflow: "hidden",
                                                textOverflow: "ellipsis",
                                                whiteSpace: "nowrap",
                                            }}
                                        >
                                            {launchStatusView.detail}
                                        </Typography>
                                    </Box>
                                </Box>
                            </Box>
                        );
                    })}
                </Box>
            </Box>
        </Box>
    );
};

export default RosLaunchGroupControl;

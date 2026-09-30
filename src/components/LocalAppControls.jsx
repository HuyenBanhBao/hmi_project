import { useCallback, useEffect, useState } from "react";
import { Box, Button, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import ComputerIcon from "@mui/icons-material/Computer";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import StopCircleIcon from "@mui/icons-material/StopCircle";

const LOCAL_LAUNCHER_URL = (import.meta.env.VITE_LOCAL_LAUNCHER_URL || "http://127.0.0.1:5051").replace(/\/$/, "");

const LOCAL_APPS = [
    {
        id: "rviz",
        label: "RViz",
        command: "rviz",
    },
];

const LocalAppControls = () => {
    const theme = useTheme();
    const [launcherOnline, setLauncherOnline] = useState(false);
    const [apps, setApps] = useState({});
    const [pendingAction, setPendingAction] = useState("");
    const [lastMessage, setLastMessage] = useState("");

    const fetchJson = async (path, options = {}) => {
        const response = await fetch(`${LOCAL_LAUNCHER_URL}${path}`, {
            headers: {
                "Content-Type": "application/json",
            },
            ...options,
        });

        const data = await response.json();
        if (!response.ok || data.ok === false) {
            throw new Error(data.message || data.reason || "Local launcher request failed");
        }

        return data;
    };

    const loadStatus = useCallback(async ({ silent = false } = {}) => {
        try {
            const data = await fetchJson("/api/apps/status");
            setLauncherOnline(true);
            setApps(data.apps || {});

            if (!silent) {
                setLastMessage("Launcher local đã kết nối");
            }
        } catch (error) {
            setLauncherOnline(false);
            if (!silent) {
                setLastMessage(error.message || "Không kết nối được launcher local");
            }
        }
    }, []);

    useEffect(() => {
        loadStatus();

        const timer = window.setInterval(() => {
            loadStatus({ silent: true });
        }, 3000);

        return () => {
            window.clearInterval(timer);
        };
    }, [loadStatus]);

    const runAction = async (appId, action) => {
        setPendingAction(`${appId}:${action}`);

        try {
            const data = await fetchJson(`/api/apps/${appId}/${action}`, {
                method: "POST",
            });

            if (data.status) {
                setApps((current) => ({
                    ...current,
                    [appId]: data.status,
                }));
            }

            setLauncherOnline(true);
            setLastMessage(`${appId} · ${data.event}`);
        } catch (error) {
            setLauncherOnline(false);
            setLastMessage(error.message || "Không gửi được lệnh local");
        } finally {
            setPendingAction("");
        }
    };

    const getStatusView = (appStatus, command) => {
        if (!launcherOnline) {
            return {
                label: "Launcher local đang offline",
                detail: "Chạy `npm run launcher:local` trên máy HMI",
                color: theme.hmi.colorError,
            };
        }

        if (appStatus?.running) {
            return {
                label: "Đang chạy",
                detail: appStatus.pid ? `pid ${appStatus.pid}` : "running",
                color: theme.hmi.colorPrimary,
            };
        }

        if (appStatus?.lastExit?.exitedAt) {
            const returnCode = appStatus.lastExit.returnCode;

            return {
                label: returnCode === null ? "Đã dừng" : "Đã thoát",
                detail: returnCode === null ? "stop requested" : `return ${returnCode}`,
                color: returnCode === 0 || returnCode === null ? theme.hmi.colorAshGray : theme.hmi.colorBtnOrange,
            };
        }

        return {
            label: "Chưa chạy",
            detail: `Lệnh: ${command}`,
            color: theme.hmi.colorAshGray,
        };
    };

    return (
        <Box
            sx={{
                p: 1.25,
                borderRadius: "16px",
                bgcolor: alpha(theme.hmi.colorDeepNavy, 0.52),
                border: `1px solid ${alpha(theme.hmi.colorSnowGray, 0.5)}`,
            }}
        >
            <Box sx={{ mb: 1.1, display: "flex", alignItems: "center", gap: 1 }}>
                <ComputerIcon sx={{ color: theme.hmi.colorBtnOrange }} />
                <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 800 }}>Ứng dụng local</Typography>
                </Box>
            </Box>

            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.95 }}>
                {LOCAL_APPS.map((app) => {
                    const appStatus = apps[app.id];
                    const statusView = getStatusView(appStatus, app.command);

                    return (
                        <Box
                            key={app.id}
                            sx={{
                                p: 0.8,
                                borderRadius: "8px",
                                bgcolor: alpha(theme.hmi.colorMidnightBlue, 0.34),
                                border: `1px solid ${alpha(statusView.color, 0.5)}`,
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
                                        fontWeight: 650,
                                        minWidth: 0,
                                    }}
                                >
                                    {app.label}
                                </Typography>

                                <Box sx={{ display: "flex", gap: 0.5, flexShrink: 0 }}>
                                    <Button
                                        size="small"
                                        variant="contained"
                                        startIcon={<PlayArrowIcon />}
                                        disabled={pendingAction === `${app.id}:start`}
                                        onClick={() => runAction(app.id, "start")}
                                        sx={{
                                            borderRadius: "8px",
                                            bgcolor: theme.hmi.primaryColorHvqp,
                                            color: theme.hmi.colorSnowGray,
                                            fontSize: 10,
                                            fontWeight: 600,
                                            boxShadow: theme.hmi.boxShadowBtn,
                                            "&:hover": {
                                                boxShadow: theme.hmi.boxShadowBtnHover,
                                            },
                                        }}
                                    >
                                        RUN
                                    </Button>

                                    <Button
                                        size="small"
                                        variant="contained"
                                        startIcon={<StopCircleIcon />}
                                        disabled={pendingAction === `${app.id}:stop`}
                                        onClick={() => runAction(app.id, "stop")}
                                        sx={{
                                            borderRadius: "8px",
                                            color: theme.hmi.primaryColorHvqp,
                                            bgcolor: theme.hmi.colorBtnOrange,
                                            fontSize: 10,
                                            fontWeight: 600,
                                            boxShadow: theme.hmi.boxShadowBtn,
                                            "&:hover": {
                                                boxShadow: theme.hmi.boxShadowBtnHover,
                                            },
                                        }}
                                    >
                                        STOP
                                    </Button>
                                </Box>
                            </Box>

                            <Box
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
                                        flex: "0 0 auto",
                                        borderRadius: "50%",
                                        bgcolor: statusView.color,
                                        boxShadow: `0 0 10px ${alpha(statusView.color, 0.68)}`,
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
                                            color: statusView.color,
                                            fontSize: 12,
                                            fontWeight: 800,
                                            lineHeight: 1.2,
                                        }}
                                    >
                                        {statusView.label}
                                    </Typography>
                                    {/* <Typography
                                        sx={{
                                            color: alpha(theme.hmi.colorSnowGray, 0.62),
                                            fontSize: 11,
                                            lineHeight: 1.2,
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            whiteSpace: "nowrap",
                                        }}
                                    >
                                        {statusView.detail}
                                    </Typography> */}
                                    {/* <Typography
                                        sx={{
                                            color: alpha(theme.hmi.colorSnowGray, 0.5),
                                            fontSize: 10,
                                            lineHeight: 1.2,
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            whiteSpace: "nowrap",
                                        }}
                                    >
                                        {appStatus?.logPath || `${LOCAL_LAUNCHER_URL}/api/apps/status`}
                                    </Typography> */}
                                </Box>
                            </Box>
                        </Box>
                    );
                })}
            </Box>

            <Typography sx={{ mt: 1, color: alpha(theme.hmi.colorSnowGray, 0.58), fontSize: 11, lineHeight: 1.4 }}>
                {lastMessage || `Launcher URL: ${LOCAL_LAUNCHER_URL}`}
            </Typography>
        </Box>
    );
};

export default LocalAppControls;

import CloseFullscreenIcon from "@mui/icons-material/CloseFullscreen";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import LayersIcon from "@mui/icons-material/Layers";
import MapIcon from "@mui/icons-material/Map";
import MenuOpenIcon from "@mui/icons-material/MenuOpen";
import WifiTetheringIcon from "@mui/icons-material/WifiTethering";
import { Box, Button, Divider, Drawer, IconButton, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { useMemo, useState } from "react";
import SlamCloudViewer from "./SlamCloudViewer";

const SlamMapDrawer = ({ cloudMessage, isConnected, topicName = "/laser_cloud_map" }) => {
    const theme = useTheme();
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [viewerOpen, setViewerOpen] = useState(false);

    const statusColor = isConnected ? theme.hmi.colorPrimary : theme.hmi.colorError;
    const statusText = isConnected ? "ROS Connected" : "ROS Disconnected";
    const lastMessageAt = useMemo(() => {
        if (!cloudMessage?.header?.stamp && !cloudMessage) return "";

        return new Date().toLocaleTimeString("vi-VN", {
            hour12: false,
        });
    }, [cloudMessage]);

    return (
        <>
            {viewerOpen && (
                <SlamCloudViewer
                    cloudMessage={cloudMessage}
                    isConnected={isConnected}
                    layout="fullscreen"
                    topicName={topicName}
                />
            )}

            <IconButton
                aria-label="Mở bảng bản đồ SLAM"
                onClick={() => setDrawerOpen(true)}
                sx={{
                    position: "absolute",
                    zIndex: 1200,
                    left: 0,
                    top: 138,
                    width: 42,
                    height: 42,
                    color: theme.hmi.colorSnowGray,
                    bgcolor: alpha(theme.hmi.colorDeepNavy, 0.9),
                    border: `1px solid ${alpha(theme.hmi.colorSnowGray, 0.28)}`,
                    borderLeft: 0,
                    borderRadius: "0 8px 8px 0",
                    boxShadow: "0 10px 24px rgba(0, 0, 0, 0.24)",
                    "&:hover": {
                        bgcolor: alpha(theme.hmi.colorGunmetalBlue, 0.96),
                    },
                }}
            >
                <MapIcon />
            </IconButton>

            <Drawer
                anchor="left"
                hideBackdrop
                open={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                ModalProps={{
                    keepMounted: true,
                }}
                sx={{
                    zIndex: 1200,
                    pointerEvents: "none",
                    "& .MuiDrawer-paper": {
                        zIndex: 1200,
                        pointerEvents: "auto",
                    },
                }}
                PaperProps={{
                    sx: {
                        top: 48,
                        width: 330,
                        height: "calc(100% - 48px)",
                        color: theme.hmi.colorSnowGray,
                        bgcolor: alpha(theme.hmi.colorMidnightBlue, 0.96),
                        borderRight: `1px solid ${alpha(theme.hmi.colorSnowGray, 0.16)}`,
                        boxShadow: "18px 0 36px rgba(0, 0, 0, 0.35)",
                    },
                }}
            >
                <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 1.5 }}>
                    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
                            <LayersIcon sx={{ color: theme.hmi.colorBtnOrange }} />
                            <Box sx={{ minWidth: 0 }}>
                                <Typography sx={{ fontSize: 18, fontWeight: 800 }}>Bản đồ SLAM</Typography>
                                <Typography
                                    sx={{
                                        color: alpha(theme.hmi.colorSnowGray, 0.68),
                                        fontSize: 12,
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                    }}
                                >
                                    {topicName}
                                </Typography>
                            </Box>
                        </Box>

                        <IconButton
                            aria-label="Đóng bảng bản đồ SLAM"
                            onClick={() => setDrawerOpen(false)}
                            sx={{
                                color: theme.hmi.colorSnowGray,
                                borderRadius: "8px",
                                border: `1px solid ${alpha(theme.hmi.colorSnowGray, 0.16)}`,
                            }}
                        >
                            <MenuOpenIcon />
                        </IconButton>
                    </Box>

                    <Box
                        sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 1,
                            px: 1.25,
                            py: 1,
                            borderRadius: "8px",
                            bgcolor: alpha(statusColor, 0.14),
                            border: `1px solid ${alpha(statusColor, 0.38)}`,
                        }}
                    >
                        <WifiTetheringIcon sx={{ fontSize: 18, color: statusColor }} />
                        <Box sx={{ minWidth: 0 }}>
                            <Typography sx={{ fontSize: 13, fontWeight: 700 }}>{statusText}</Typography>
                            <Typography
                                sx={{
                                    color: alpha(theme.hmi.colorSnowGray, 0.62),
                                    fontSize: 11,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                }}
                            >
                                Nhận topic: {topicName}
                            </Typography>
                        </Box>
                    </Box>

                    <Button
                        fullWidth
                        variant="contained"
                        startIcon={viewerOpen ? <CloseFullscreenIcon /> : <FullscreenIcon />}
                        onClick={() => setViewerOpen((current) => !current)}
                        sx={{
                            borderRadius: "8px",
                            py: 0.9,
                            color: theme.hmi.colorSnowGray,
                            bgcolor: viewerOpen ? theme.hmi.colorBtnOrange : theme.hmi.primaryColorHvqp,
                            fontWeight: 800,
                            boxShadow: theme.hmi.boxShadowBtn,
                            "&:hover": {
                                bgcolor: viewerOpen
                                    ? alpha(theme.hmi.colorBtnOrange, 0.9)
                                    : alpha(theme.hmi.primaryColorHvqp, 0.9),
                                boxShadow: theme.hmi.boxShadowBtnHover,
                            },
                        }}
                    >
                        {viewerOpen ? "Ẩn bản đồ SLAM" : "Mở bản đồ SLAM"}
                    </Button>

                    <Divider sx={{ borderColor: alpha(theme.hmi.colorSnowGray, 0.14) }} />

                    <Box
                        sx={{
                            p: 1.25,
                            borderRadius: "8px",
                            bgcolor: alpha(theme.hmi.colorDeepNavy, 0.52),
                            border: `1px solid ${alpha(theme.hmi.colorSnowGray, 0.18)}`,
                        }}
                    >
                        <Typography sx={{ color: alpha(theme.hmi.colorSnowGray, 0.62), fontSize: 12 }}>
                            Trạng thái dữ liệu
                        </Typography>
                        <Typography sx={{ mt: 0.4, fontWeight: 800 }}>
                            {cloudMessage ? "Đã nhận PointCloud2" : "Chưa có dữ liệu"}
                        </Typography>
                        <Typography sx={{ color: alpha(theme.hmi.colorSnowGray, 0.65), fontSize: 12 }}>
                            {lastMessageAt || "Waiting"}{" "}
                            {cloudMessage?.header?.frame_id ? `- ${cloudMessage.header.frame_id}` : ""}
                        </Typography>
                    </Box>
                </Box>
            </Drawer>
        </>
    );
};

export default SlamMapDrawer;

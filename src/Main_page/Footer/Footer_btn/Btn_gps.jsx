import { useState } from "react";
import { Box, Typography, Button } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import Drawer from "@mui/material/Drawer";

const BTN_STYLE = {
    bgcolor: (theme) => theme.hmi.colorIronBlue,
    color: "#fff",
    fontWeight: 600,
    "&:hover": {
        bgcolor: "#3c5a73",
    },
};

// Helper functions
const rtkStatus = (v) => {
    if (v === 2) return "RTK FIXED";
    if (v === 1) return "RTK FLOAT";
    return "NO RTK";
};

const fixStatus = (v) => {
    switch (v) {
        case 0:
            return "NO FIX";
        case 1:
            return "FIX OK";
        default:
            return "UNKNOWN";
    }
};

// ============================================ MAIN COMPONENTS ============================================
const Btn_gps = ({ gpsData, hexLog }) => {
    const theme = useTheme();

    const [open, setOpen] = useState(false);

    const toggleDrawer = (newOpen) => () => {
        setOpen(newOpen);
    };

    // Giá trị các trường GPS để hiển thị
    const GPS_FIELDS = [
        { label: "Latitude", key: "lat", format: (v) => `${v.toFixed(7)}°` },
        { label: "Longitude", key: "lon", format: (v) => `${v.toFixed(7)}°` },
        { label: "Altitude", key: "alt", format: (v) => `${(v / 1000).toFixed(2)} m` },
        { label: "Satellites", key: "sat" },
        { label: "Accuracy", key: "meanAccuracy", format: (v) => `${v} m` },
        { label: "RTK Status", key: "rtk", format: (v) => rtkStatus(v) },
        { label: "GNSS Fix", key: "fix", format: (v) => fixStatus(v) },
    ];

    const renderValue = (field, gpsData) => {
        if (!gpsData || gpsData[field.key] === undefined) return "---";

        const value = gpsData[field.key];

        return field.format ? field.format(value) : value;
    };

    // ============================================ RETURN ============================================
    return (
        <>
            <Button sx={BTN_STYLE} onClick={toggleDrawer(true)}>
                GPS
            </Button>

            {/* GPS Debug Drawer */}
            <Drawer anchor="right" open={open} onClose={toggleDrawer(false)}>
                <Box sx={{ width: 650, height: "100%" }} role="presentation">
                    <Box
                        sx={{
                            p: 2,
                            bgcolor: theme.hmi.colorGunmetalBlue,
                            height: "100%",
                            borderLeft: `2px solid ${theme.hmi.colorPaleSky}`,
                            display: "flex",
                            flexDirection: "column",
                        }}
                    >
                        {/* Tiêu đề */}
                        <Typography variant="h6" sx={{ mb: 2, color: "#ccc", fontWeight: 600 }}>
                            GPS Debug
                        </Typography>
                        {/* Nội dung debug GPS */}
                        <Box
                            sx={{
                                flex: 1,
                                border: `1px solid ${theme.hmi.colorPaleSky}`,
                                borderRadius: "8px",
                                p: 2,
                                display: "flex",
                                flexDirection: "column",
                                gap: 2,
                                bgcolor: theme.hmi.colorMidnightBlue,
                                overflowY: "auto",
                                scrollbarWidth: "thin",
                                "&::-webkit-scrollbar": {
                                    width: "6px",
                                },
                                "&::-webkit-scrollbar-thumb": {
                                    background: "#6b7c8c",
                                    borderRadius: "4px",
                                },
                            }}
                        >
                            {/* GPS Data Display */}
                            <Box sx={{}}>
                                <Typography sx={{ mb: 1, color: "#00ff00", fontWeight: 600, fontSize: "12px" }}>
                                    ================= GPS DATA =================
                                </Typography>

                                {GPS_FIELDS.map((field) => (
                                    <Box
                                        key={field.key}
                                        sx={{
                                            display: "flex",
                                            borderBottom: `1px solid ${alpha(theme.hmi.colorPaleSky, 0.2)}`,
                                            py: 0.5,
                                        }}
                                    >
                                        <Typography
                                            variant="span"
                                            sx={{
                                                color: theme.hmi.colorLemonChiffon,
                                                width: 150,
                                                fontSize: "15px",
                                            }}
                                        >
                                            {field.label}
                                        </Typography>
                                        <Typography sx={{ color: theme.hmi.colorLemonChiffon }}>
                                            : {renderValue(field, gpsData)}
                                        </Typography>
                                    </Box>
                                ))}
                            </Box>

                            {/* HEX Log Display */}
                            <Box sx={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
                                <Box>
                                    <Typography sx={{ mb: 1, color: "#00ff00", fontWeight: 600, fontSize: "12px" }}>
                                        ================= HEX LOG =================
                                    </Typography>
                                </Box>
                                <Box
                                    sx={{
                                        flex: 1,
                                        overflowY: "auto",
                                        display: "flex",
                                        flexDirection: "column",
                                        gap: 1,
                                        /* Scrollbar */
                                        "&::-webkit-scrollbar": {
                                            width: "8px",
                                        },
                                        "&::-webkit-scrollbar-track": {
                                            background: "#0a0a0a",
                                            borderRadius: "10px",
                                        },
                                        "&::-webkit-scrollbar-thumb": {
                                            background: "#FB8F2C",
                                            borderRadius: "10px",
                                        },
                                        "&::-webkit-scrollbar-thumb:hover": {
                                            background: "#FB8F2C",
                                        },

                                        /* Firefox */
                                        scrollbarWidth: "thin",
                                        scrollbarColor: "#FB8F2C #0a0a0a",
                                    }}
                                >
                                    {hexLog && hexLog.length > 0 ? (
                                        hexLog.map((line, idx) => (
                                            <Typography
                                                key={idx}
                                                variant="span"
                                                sx={{
                                                    display: "block",
                                                    color: theme.hmi.colorLemonChiffon,
                                                    fontSize: "14px",
                                                    fontFamily: "monospace",
                                                    lineHeight: 1.4,
                                                }}
                                            >
                                                {line}
                                            </Typography>
                                        ))
                                    ) : (
                                        <Typography sx={{ color: "#999", fontSize: "11px" }}>
                                            Chờ dữ liệu từ COM port...
                                        </Typography>
                                    )}
                                </Box>
                            </Box>
                        </Box>
                    </Box>
                </Box>
            </Drawer>
        </>
    );
};

export default Btn_gps;

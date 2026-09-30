import { Box, Typography, Button, Stack } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import Btn_gps from "./Footer_btn/Btn_gps";

const STYLE_CONTENT_ITEM = {
    display: "flex",
    borderRadius: "8px",
    border: (theme) => `2px solid ${theme.hmi.colorIronBlue}`,
    height: "100%",
};

const BTN_STYLE = {
    bgcolor: (theme) => theme.hmi.colorIronBlue,
    color: "#fff",
    fontWeight: 600,
    "&:hover": {
        bgcolor: "#3c5a73",
    },
};

const Footer_move = ({ gpsData, hexLog }) => {
    const theme = useTheme();

    // ==========================================================================
    return (
        <>
            <Box sx={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
                <Typography
                    sx={{
                        py: 1,
                        px: 2,
                        fontWeight: 600,
                        fontSize: "16px",
                        color: theme.hmi.colorSnowGray,
                    }}
                >
                    CHỨC NĂNG
                </Typography>

                <Box
                    sx={{
                        ...STYLE_CONTENT_ITEM,
                        flex: 1,
                        minHeight: 0,
                        bgcolor: theme.hmi.colorGunmetalBlue,
                        p: 2,
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
                    <Stack spacing={2} width="100%">
                        {/* HỆ THỐNG */}
                        <Box>
                            <Typography sx={{ mb: 1, color: "#ccc", fontWeight: 600 }}>HỆ THỐNG</Typography>

                            <Stack direction="row" spacing={1}>
                                <Button sx={BTN_STYLE}>Kết nối</Button>
                                <Button sx={BTN_STYLE}>Khởi động lại Robot</Button>
                                <Button sx={BTN_STYLE}>Khởi động lại Jetson</Button>
                            </Stack>
                        </Box>

                        {/* NHIỆM VỤ */}
                        <Box>
                            <Typography sx={{ mb: 1, color: "#ccc", fontWeight: 600 }}>NHIỆM VỤ</Typography>

                            <Stack direction="row" spacing={1}>
                                <Button sx={BTN_STYLE}>Bắt đầu</Button>
                                <Button sx={BTN_STYLE}>Tạm dừng</Button>
                                <Button sx={BTN_STYLE}>Quay về gốc</Button>
                            </Stack>
                        </Box>

                        {/* GỠ LỖI */}
                        <Box>
                            <Typography sx={{ mb: 1, color: "#ccc", fontWeight: 600 }}>DEBUG</Typography>

                            <Stack direction="row" spacing={1}>
                                <Btn_gps gpsData={gpsData} hexLog={hexLog} />
                                <Button sx={BTN_STYLE}>Cảm biến</Button>
                                <Button sx={BTN_STYLE}>Động cơ</Button>
                            </Stack>
                        </Box>
                    </Stack>
                </Box>
            </Box>
        </>
    );
};

export default Footer_move;

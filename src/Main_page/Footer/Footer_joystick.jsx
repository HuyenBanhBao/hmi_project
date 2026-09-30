import { Box, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import Joystick from "../../Joystick/Joystick";
import { useState } from "react";
import { Button } from "@mui/material";

const STYLE_CONTENT_ITEM = {
    display: "flex",
    borderRadius: "8px",
    border: (theme) => `2px solid ${theme.hmi.colorIronBlue}`,
    height: "100%",
};

// =================================== MAIN COMPONENT ===================================
const Footer_joystick = () => {
    const [dir, setDir] = useState(null);
    const theme = useTheme();
    return (
        <Box sx={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <Typography
                variant="span"
                sx={{
                    display: "block",
                    py: 1,
                    px: 2,
                    fontWeight: 600,
                    fontSize: "16px",
                    color: theme.hmi.colorSnowGray,
                }}
            >
                JOYSTICK:
            </Typography>
            <Box
                sx={{
                    ...STYLE_CONTENT_ITEM,
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    bgcolor: theme.hmi.colorGunmetalBlue,
                }}
            >
                {/* --------------- JOYSTICK CONTROLS --------------- */}
                <Box sx={{ ml: 2 }}>
                    <Joystick activeDirection={dir} />
                </Box>
                {/* --------------- JOYSTICK INFO --------------- */}
                <Box
                    sx={{
                        flex: 1,
                        display: "grid",
                        gridTemplateColumns: "repeat(3,60px)",
                        gridTemplateRows: "repeat(3,60px)",
                        gap: 1,
                        justifyContent: "center",
                        alignItems: "center",
                    }}
                >
                    <Box />

                    <Button variant="contained" onMouseDown={() => setDir("UP")} onMouseUp={() => setDir(null)}>
                        ↑
                    </Button>

                    <Box />

                    <Button variant="contained" onMouseDown={() => setDir("LEFT")} onMouseUp={() => setDir(null)}>
                        ←
                    </Button>

                    <Box />

                    <Button variant="contained" onMouseDown={() => setDir("RIGHT")} onMouseUp={() => setDir(null)}>
                        →
                    </Button>

                    <Box />

                    <Button variant="contained" onMouseDown={() => setDir("DOWN")} onMouseUp={() => setDir(null)}>
                        ↓
                    </Button>

                    <Box />
                </Box>
            </Box>
        </Box>
    );
};

export default Footer_joystick;

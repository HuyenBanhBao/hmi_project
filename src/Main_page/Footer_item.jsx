import { Box } from "@mui/material";
import Footer_joystick from "./Footer/Footer_joystick";
import Footer_move from "./Footer/Footer_move";
import Footer_signal from "./Footer/Footer_signal";

// =================================== FOOTER ITEM ===================================
const Footer_item = ({ gpsData, hexLog, showConnect }) => {
    return (
        <Box
            sx={{
                flexShrink: 0,
                flex: 1,
                mx: 2,
                mb: 2,
                gap: 2,
                minHeight: 0,
                display: "flex",
                justifyContent: "center",
            }}
        >
            {/* JOYSTICK */}
            <Footer_joystick />

            {/* SIGNAL */}
            <Footer_signal showConnect={showConnect} />

            {/* MOVE */}
            <Footer_move gpsData={gpsData} hexLog={hexLog} />
        </Box>
    );
};

export default Footer_item;

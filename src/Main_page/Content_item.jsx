import { Box } from "@mui/material";
import { useState } from "react";
import MapView from "../Map/MapView";
// import MapView from "../components/MapView";

const Content_item = ({ gpsData, onPublishMission }) => {
    const [waypoints, setWaypoints] = useState([]);

    return (
        <Box
            sx={{
                flex: 1,
                display: "flex",
                minHeight: 0,
            }}
        >
            <Box
                sx={{
                    flex: 1,
                    display: "flex",
                    bgcolor: (theme) => theme.hmi.colorAshGray,
                    // borderRadius: "8px",
                    // border: (theme) => `2px solid ${theme.hmi.colorPaleSky}`,
                    position: "relative",
                    overflow: "hidden",
                    minHeight: 0,
                }}
            >
                <MapView
                    gpsData={gpsData}
                    onPublishMission={onPublishMission}
                    setWaypoints={setWaypoints}
                    waypoints={waypoints}
                />
                {/* <MapView gpsData={gpsData} /> */}
            </Box>
        </Box>
    );
};

export default Content_item;

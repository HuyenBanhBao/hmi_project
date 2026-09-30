import { useEffect, useRef } from "react";
import { Box } from "@mui/material";

const CameraView = ({ onStatusChange }) => {
    const videoRef = useRef(null);

    useEffect(() => {
        const startCamera = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: true,
                    audio: false,
                });

                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                }

                // camera OK
                onStatusChange?.(true);
            } catch (err) {
                console.error("Camera error:", err);

                // camera FAIL
                onStatusChange?.(false);
            }
        };

        startCamera();

        return () => {
            if (videoRef.current?.srcObject) {
                const tracks = videoRef.current.srcObject.getTracks();
                tracks.forEach((track) => track.stop());
            }
        };
    }, [onStatusChange]);

    return (
        <Box
            component="video"
            ref={videoRef}
            autoPlay
            playsInline
            muted
            sx={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                borderRadius: 1,
            }}
        />
    );
};

export default CameraView;

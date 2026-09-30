import VideocamIcon from "@mui/icons-material/Videocam";
import { Box, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRos } from "../context/RosContext";

const normalizeBytes = (data) => {
    if (!data) return null;

    if (data instanceof Uint8Array) {
        return data;
    }

    if (Array.isArray(data)) {
        return Uint8Array.from(data);
    }

    if (typeof data === "string") {
        try {
            const binary = window.atob(data);
            const bytes = new Uint8Array(binary.length);

            for (let index = 0; index < binary.length; index += 1) {
                bytes[index] = binary.charCodeAt(index);
            }

            return bytes;
        } catch {
            return null;
        }
    }

    return null;
};

const bytesToBase64 = (bytes) => {
    if (!bytes?.length) return "";

    let binary = "";
    const chunkSize = 0x8000;

    for (let index = 0; index < bytes.length; index += chunkSize) {
        const chunk = bytes.subarray(index, index + chunkSize);
        binary += String.fromCharCode(...chunk);
    }

    return window.btoa(binary);
};

const resolveMimeType = (format = "") => {
    const normalizedFormat = String(format).toLowerCase();

    if (normalizedFormat.includes("png")) return "image/png";
    if (normalizedFormat.includes("webp")) return "image/webp";

    return "image/jpeg";
};

const buildCompressedImageSrc = (message) => {
    const { data, format } = message || {};

    if (!data) return "";

    if (typeof data === "string") {
        if (data.startsWith("data:image/")) {
            return data;
        }

        return `data:${resolveMimeType(format)};base64,${data}`;
    }

    const bytes = normalizeBytes(data);
    if (!bytes) return "";

    return `data:${resolveMimeType(format)};base64,${bytesToBase64(bytes)}`;
};

const drawRawImageToCanvas = (canvas, message) => {
    const width = Number(message?.width) || 0;
    const height = Number(message?.height) || 0;
    const encoding = String(message?.encoding || "").toLowerCase();
    const bytes = normalizeBytes(message?.data);

    if (!canvas) return "Không tìm thấy canvas camera";
    if (!width || !height || !bytes?.length) return "Không có dữ liệu ảnh";

    const ctx = canvas.getContext("2d");
    if (!ctx) return "Trình duyệt không hỗ trợ canvas";

    let channels = 0;

    if (encoding === "rgb8" || encoding === "bgr8") channels = 3;
    if (encoding === "rgba8" || encoding === "bgra8") channels = 4;
    if (encoding === "mono8" || encoding === "8uc1") channels = 1;

    if (!channels) {
        return `Encoding ${message?.encoding || "unknown"} chưa hỗ trợ`;
    }

    const step = Number(message?.step) || width * channels;
    if (bytes.length < step * height) {
        return "Dữ liệu ảnh chưa đủ để render";
    }

    canvas.width = width;
    canvas.height = height;

    const imageData = ctx.createImageData(width, height);
    const target = imageData.data;

    for (let row = 0; row < height; row += 1) {
        const rowOffset = row * step;

        for (let column = 0; column < width; column += 1) {
            const sourceIndex = rowOffset + column * channels;
            const targetIndex = (row * width + column) * 4;

            if (encoding === "rgb8") {
                target[targetIndex] = bytes[sourceIndex];
                target[targetIndex + 1] = bytes[sourceIndex + 1];
                target[targetIndex + 2] = bytes[sourceIndex + 2];
                target[targetIndex + 3] = 255;
                continue;
            }

            if (encoding === "bgr8") {
                target[targetIndex] = bytes[sourceIndex + 2];
                target[targetIndex + 1] = bytes[sourceIndex + 1];
                target[targetIndex + 2] = bytes[sourceIndex];
                target[targetIndex + 3] = 255;
                continue;
            }

            if (encoding === "rgba8") {
                target[targetIndex] = bytes[sourceIndex];
                target[targetIndex + 1] = bytes[sourceIndex + 1];
                target[targetIndex + 2] = bytes[sourceIndex + 2];
                target[targetIndex + 3] = bytes[sourceIndex + 3];
                continue;
            }

            if (encoding === "bgra8") {
                target[targetIndex] = bytes[sourceIndex + 2];
                target[targetIndex + 1] = bytes[sourceIndex + 1];
                target[targetIndex + 2] = bytes[sourceIndex];
                target[targetIndex + 3] = bytes[sourceIndex + 3];
                continue;
            }

            const value = bytes[sourceIndex];
            target[targetIndex] = value;
            target[targetIndex + 1] = value;
            target[targetIndex + 2] = value;
            target[targetIndex + 3] = 255;
        }
    }

    ctx.putImageData(imageData, 0, 0);
    return "";
};

const RosCameraPanel = ({
    layout = "floating",
    title = "Camera ROS",
    topicName,
    messageType = "sensor_msgs/CompressedImage",
    cameraMessage = null,
}) => {
    const theme = useTheme();
    const { isConnected } = useRos();
    const canvasRef = useRef(null);
    const [rawFrameError, setRawFrameError] = useState("");

    const isCompressedMessage = messageType === "sensor_msgs/CompressedImage";
    const isRawImageMessage = messageType === "sensor_msgs/CompressedImage";
    const typeError = isCompressedMessage || isRawImageMessage ? "" : `Message type ${messageType} chưa được hỗ trợ`;

    const imageSrc = useMemo(() => {
        if (!isCompressedMessage || !cameraMessage) return "";

        return buildCompressedImageSrc(cameraMessage);
    }, [cameraMessage, isCompressedMessage]);

    useEffect(() => {
        if (!isRawImageMessage) {
            setRawFrameError("");
            return;
        }

        if (!cameraMessage) {
            setRawFrameError("");
            return;
        }

        const nextError = drawRawImageToCanvas(canvasRef.current, cameraMessage);
        setRawFrameError(nextError);
    }, [cameraMessage, isRawImageMessage]);

    useEffect(() => {
        if (isRawImageMessage || typeError) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }, [isRawImageMessage, typeError]);

    const frameError = typeError || rawFrameError;
    const hasFrame = frameError
        ? false
        : isCompressedMessage
          ? Boolean(imageSrc)
          : isRawImageMessage
            ? Boolean(cameraMessage)
            : false;

    const statusColor = !isConnected
        ? theme.hmi.colorError
        : frameError
          ? theme.hmi.colorBtnOrange
          : hasFrame
            ? theme.hmi.colorPrimary
            : theme.hmi.colorAshGray;

    const statusText = !isConnected
        ? "ROS offline"
        : // frameError
          //   ? "Lỗi render"
          //   :
          hasFrame
          ? "Đang nhận ảnh"
          : "Đang chờ frame";

    const helperText = !isConnected ? "ROSBridge chưa kết nối" : frameError || "Nhận frame camera qua rosbridge";
    const isInline = layout === "inline";

    return (
        <Box
            sx={{
                position: isInline ? "relative" : "absolute",
                zIndex: isInline ? "auto" : 1400,
                left: isInline ? "auto" : "380px",
                bottom: isInline ? "auto" : 0,
                width: isInline ? { xs: "100%", sm: 360 } : { xs: "calc(100% - 24px)", sm: 360 },
                maxWidth: isInline ? "100%" : "92vw",
                flex: isInline ? "0 0 auto" : "none",
                overflow: "hidden",
                borderRadius: 2,
                // bgcolor: alpha(theme.hmi.colorMidnightBlue, 0.96),
                backgroundImage: theme.hmi.primaryColorBgGradientSlidebarDark135,
                border: `1px solid ${alpha(theme.hmi.colorSnowGray, 0.2)}`,
                boxShadow: "0 18px 36px rgba(0, 0, 0, 0.3)",
                backdropFilter: "blur(12px)",
                userSelect: "none",
            }}
        >
            <Box
                sx={{
                    px: 1.25,
                    py: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 1,
                    borderBottom: `1px solid ${alpha(theme.hmi.colorSnowGray, 0.12)}`,
                }}
            >
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
                    <VideocamIcon sx={{ color: theme.hmi.colorBtnOrange }} />
                    <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ color: theme.hmi.colorSnowGray, fontSize: 14, fontWeight: 800 }}>
                            {title}
                        </Typography>
                        <Typography
                            noWrap
                            sx={{
                                color: alpha(theme.hmi.colorSnowGray, 0.66),
                                fontSize: 11,
                                maxWidth: { xs: 180, sm: 220 },
                            }}
                        >
                            {topicName}
                        </Typography>
                    </Box>
                </Box>

                <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexShrink: 0 }}>
                    <Box
                        sx={{
                            width: 9,
                            height: 9,
                            borderRadius: "50%",
                            bgcolor: statusColor,
                            boxShadow: `0 0 10px ${alpha(statusColor, 0.7)}`,
                        }}
                    />
                    {/* <Typography sx={{ color: statusColor, fontSize: 11, fontWeight: 800 }}>{statusText}</Typography> */}
                </Box>
            </Box>

            <Box
                sx={{
                    position: "relative",
                    aspectRatio: "16 / 9",
                    bgcolor: alpha(theme.hmi.colorDeepNavy, 0.76),
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                }}
            >
                {isCompressedMessage && imageSrc ? (
                    <Box
                        component="img"
                        src={imageSrc}
                        alt={topicName}
                        sx={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            display: "block",
                        }}
                    />
                ) : null}

                {isRawImageMessage ? (
                    <Box
                        component="canvas"
                        ref={canvasRef}
                        sx={{
                            width: "100%",
                            height: "100%",
                            display: hasFrame ? "block" : "none",
                        }}
                    />
                ) : null}

                {/* {!hasFrame ? (
                    <Box
                        sx={{
                            position: "absolute",
                            inset: 0,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexDirection: "column",
                            gap: 0.8,
                            px: 2,
                            textAlign: "center",
                        }}
                    >
                        <VideocamIcon
                            sx={{
                                fontSize: 38,
                                color: alpha(theme.hmi.colorSnowGray, 0.3),
                            }}
                        />
                        <Typography sx={{ color: theme.hmi.colorSnowGray, fontSize: 12.5, fontWeight: 700 }}>
                            Chưa có hình camera
                        </Typography>
                        <Typography
                            sx={{
                                color: alpha(theme.hmi.colorSnowGray, 0.65),
                                fontSize: 11.5,
                                lineHeight: 1.35,
                            }}
                        >
                            {helperText}
                        </Typography>
                    </Box>
                ) : null} */}
            </Box>

            <Box
                sx={{
                    px: 1.25,
                    py: 0.85,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 1,
                    borderTop: `1px solid ${alpha(theme.hmi.colorSnowGray, 0.08)}`,
                }}
            >
                {/* <Typography
                    sx={{
                        color: alpha(theme.hmi.colorSnowGray, 0.66),
                        fontSize: 11,
                    }}
                >
                    {helperText}
                </Typography> */}
                <Typography
                    sx={{
                        color: alpha(theme.hmi.colorSnowGray, 0.56),
                        fontSize: 10.5,
                        whiteSpace: "nowrap",
                    }}
                >
                    {messageType}
                </Typography>
            </Box>
        </Box>
    );
};

export default RosCameraPanel;

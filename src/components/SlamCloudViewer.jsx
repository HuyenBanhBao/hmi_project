import CenterFocusStrongIcon from "@mui/icons-material/CenterFocusStrong";
import DeleteSweepIcon from "@mui/icons-material/DeleteSweep";
import GridOnIcon from "@mui/icons-material/GridOn";
import MapIcon from "@mui/icons-material/Map";
import PauseCircleOutlineIcon from "@mui/icons-material/PauseCircleOutline";
import PlayCircleOutlineIcon from "@mui/icons-material/PlayCircleOutline";
import { Box, IconButton, Tooltip, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const MAX_RENDER_POINTS = 22000;
const POINT_SIZE = 1.8;
const EMPTY_BOUNDS = {
    minX: -10,
    maxX: 10,
    minY: -10,
    maxY: 10,
    minZ: 0,
    maxZ: 0,
};

const FIELD_READERS = {
    1: (view, offset) => view.getInt8(offset),
    2: (view, offset) => view.getUint8(offset),
    3: (view, offset, littleEndian) => view.getInt16(offset, littleEndian),
    4: (view, offset, littleEndian) => view.getUint16(offset, littleEndian),
    5: (view, offset, littleEndian) => view.getInt32(offset, littleEndian),
    6: (view, offset, littleEndian) => view.getUint32(offset, littleEndian),
    7: (view, offset, littleEndian) => view.getFloat32(offset, littleEndian),
    8: (view, offset, littleEndian) => view.getFloat64(offset, littleEndian),
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const decodeBase64 = (value) => {
    const binary = window.atob(value);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }

    return bytes;
};

const normalizeBinaryData = (data) => {
    if (!data) return null;
    if (data instanceof Uint8Array) return data;
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    if (Array.isArray(data)) return Uint8Array.from(data);
    if (typeof data === "string") return decodeBase64(data);

    return null;
};

const findField = (fields, name) => fields.find((field) => field.name === name);

const readFieldValue = (view, byteOffset, field, littleEndian) => {
    const reader = FIELD_READERS[field?.datatype];
    if (!reader) return null;

    return reader(view, byteOffset + field.offset, littleEndian);
};

const getGridStep = (metersPerPixel) => {
    const desiredMeters = metersPerPixel * 80;
    const base = 10 ** Math.floor(Math.log10(Math.max(desiredMeters, 0.001)));
    const normalized = desiredMeters / base;

    if (normalized > 5) return base * 10;
    if (normalized > 2) return base * 5;
    if (normalized > 1) return base * 2;

    return base;
};

const getColorBucket = (z, minZ, maxZ) => {
    if (!Number.isFinite(z) || maxZ <= minZ) return 4;

    return clamp(Math.floor(((z - minZ) / (maxZ - minZ)) * 7), 0, 7);
};

const parsePointCloud2 = (message) => {
    if (!message?.fields?.length || !message?.point_step || !message?.data) {
        return null;
    }

    const bytes = normalizeBinaryData(message.data);
    const xField = findField(message.fields, "x");
    const yField = findField(message.fields, "y");
    const zField = findField(message.fields, "z");

    if (!bytes || !xField || !yField) {
        return null;
    }

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const width = Number(message.width) || 0;
    const height = Number(message.height) || 1;
    const pointStep = Number(message.point_step);
    const rowStep = Number(message.row_step) || width * pointStep;
    const possiblePoints = Math.floor(bytes.byteLength / pointStep);
    const totalPoints = Math.min(width * height || possiblePoints, possiblePoints);
    const stride = Math.max(1, Math.ceil(totalPoints / MAX_RENDER_POINTS));
    const littleEndian = !message.is_bigendian;
    const points = [];
    const bounds = {
        minX: Infinity,
        maxX: -Infinity,
        minY: Infinity,
        maxY: -Infinity,
        minZ: Infinity,
        maxZ: -Infinity,
    };

    for (let pointIndex = 0; pointIndex < totalPoints; pointIndex += stride) {
        const row = width > 0 ? Math.floor(pointIndex / width) : 0;
        const column = width > 0 ? pointIndex % width : pointIndex;
        const offset = row * rowStep + column * pointStep;

        if (offset + pointStep > bytes.byteLength) continue;

        const x = readFieldValue(view, offset, xField, littleEndian);
        const y = readFieldValue(view, offset, yField, littleEndian);
        const z = zField ? readFieldValue(view, offset, zField, littleEndian) : 0;

        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;

        points.push({ x, y, z });

        bounds.minX = Math.min(bounds.minX, x);
        bounds.maxX = Math.max(bounds.maxX, x);
        bounds.minY = Math.min(bounds.minY, y);
        bounds.maxY = Math.max(bounds.maxY, y);
        bounds.minZ = Math.min(bounds.minZ, z);
        bounds.maxZ = Math.max(bounds.maxZ, z);
    }

    if (!points.length) {
        return null;
    }

    return {
        bounds,
        frameId: message.header?.frame_id || "",
        points,
        renderedPoints: points.length,
        totalPoints,
    };
};

const drawGrid = (ctx, transform, bounds, width, height, color) => {
    const { centerX, centerY, panX, panY, scale } = transform;
    const metersPerPixel = 1 / Math.max(scale, 0.001);
    const gridStep = getGridStep(metersPerPixel);
    const minX = centerX - (width / 2 + panX) / scale;
    const maxX = centerX + (width / 2 - panX) / scale;
    const minY = centerY - (height / 2 - panY) / scale;
    const maxY = centerY + (height / 2 + panY) / scale;
    const startX = Math.floor(minX / gridStep) * gridStep;
    const startY = Math.floor(minY / gridStep) * gridStep;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;

    for (let x = startX; x <= maxX; x += gridStep) {
        const canvasX = (x - centerX) * scale + width / 2 + panX;
        ctx.beginPath();
        ctx.moveTo(canvasX, 0);
        ctx.lineTo(canvasX, height);
        ctx.stroke();
    }

    for (let y = startY; y <= maxY; y += gridStep) {
        const canvasY = height / 2 - (y - centerY) * scale + panY;
        ctx.beginPath();
        ctx.moveTo(0, canvasY);
        ctx.lineTo(width, canvasY);
        ctx.stroke();
    }

    const originX = (0 - centerX) * scale + width / 2 + panX;
    const originY = height / 2 - (0 - centerY) * scale + panY;

    if (originX > -40 && originX < width + 40) {
        ctx.strokeStyle = "rgba(248, 113, 113, 0.68)";
        ctx.beginPath();
        ctx.moveTo(originX, 0);
        ctx.lineTo(originX, height);
        ctx.stroke();
    }

    if (originY > -40 && originY < height + 40) {
        ctx.strokeStyle = "rgba(96, 165, 250, 0.68)";
        ctx.beginPath();
        ctx.moveTo(0, originY);
        ctx.lineTo(width, originY);
        ctx.stroke();
    }

    ctx.fillStyle = "rgba(242, 242, 242, 0.72)";
    ctx.font = "11px sans-serif";
    ctx.fillText(`${gridStep.toFixed(gridStep >= 1 ? 0 : 1)} m`, 10, height - 12);
    ctx.restore();

    return bounds;
};

const drawOriginMarker = (ctx, transform, width, height) => {
    const { centerX, centerY, panX, panY, scale } = transform;
    const x = (0 - centerX) * scale + width / 2 + panX;
    const y = height / 2 - (0 - centerY) * scale + panY;

    if (x < -24 || x > width + 24 || y < -24 || y > height + 24) return;

    ctx.save();
    ctx.strokeStyle = "rgba(251, 143, 44, 0.96)";
    ctx.fillStyle = "rgba(251, 143, 44, 0.3)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 22, y);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x + 26, y);
    ctx.lineTo(x + 17, y - 5);
    ctx.lineTo(x + 17, y + 5);
    ctx.closePath();
    ctx.fillStyle = "rgba(251, 143, 44, 0.96)";
    ctx.fill();
    ctx.restore();
};

const SlamCloudViewer = ({ cloudMessage, isConnected, layout = "panel", topicName = "/laser_cloud_map" }) => {
    const theme = useTheme();
    const canvasRef = useRef(null);
    const containerRef = useRef(null);
    const dragRef = useRef(null);
    const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0, dpr: 1 });
    const [cloud, setCloud] = useState(null);
    const [lastReceivedAt, setLastReceivedAt] = useState(null);
    const [isPaused, setIsPaused] = useState(false);
    const [showGrid, setShowGrid] = useState(true);
    const [view, setView] = useState({ panX: 0, panY: 0, zoom: 1 });

    useEffect(() => {
        const target = containerRef.current;
        if (!target) return undefined;

        const updateSize = () => {
            const rect = target.getBoundingClientRect();
            setCanvasSize({
                dpr: window.devicePixelRatio || 1,
                height: Math.max(1, Math.round(rect.height)),
                width: Math.max(1, Math.round(rect.width)),
            });
        };

        updateSize();

        const observer = new ResizeObserver(updateSize);
        observer.observe(target);

        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (!cloudMessage || isPaused) return;

        const nextCloud = parsePointCloud2(cloudMessage);
        if (!nextCloud) return;

        setCloud(nextCloud);
        setLastReceivedAt(Date.now());
    }, [cloudMessage, isPaused]);

    const cloudAge = useMemo(() => {
        if (!lastReceivedAt) return "";

        return new Date(lastReceivedAt).toLocaleTimeString("vi-VN", {
            hour12: false,
        });
    }, [lastReceivedAt]);

    const fitTransform = useMemo(() => {
        const width = canvasSize.width;
        const height = canvasSize.height;
        const bounds = cloud?.bounds || EMPTY_BOUNDS;
        const spanX = Math.max(bounds.maxX - bounds.minX, 1);
        const spanY = Math.max(bounds.maxY - bounds.minY, 1);
        const padding = 28;
        const fitScale = Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanY);

        return {
            centerX: (bounds.minX + bounds.maxX) / 2,
            centerY: (bounds.minY + bounds.maxY) / 2,
            panX: view.panX,
            panY: view.panY,
            scale: Math.max(0.1, fitScale) * view.zoom,
        };
    }, [canvasSize.height, canvasSize.width, cloud, view]);

    useEffect(() => {
        const canvas = canvasRef.current;
        const { dpr, height, width } = canvasSize;
        if (!canvas || width <= 0 || height <= 0) return;

        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;

        const ctx = canvas.getContext("2d");
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);

        const background = ctx.createLinearGradient(0, 0, width, height);
        background.addColorStop(0, "#08111d");
        background.addColorStop(1, "#102018");
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, width, height);

        if (showGrid) {
            drawGrid(ctx, fitTransform, cloud?.bounds || EMPTY_BOUNDS, width, height, "rgba(242, 242, 242, 0.08)");
        }

        if (!cloud?.points?.length) {
            ctx.fillStyle = "rgba(242, 242, 242, 0.68)";
            ctx.font = "13px sans-serif";
            // ctx.fillText(isConnected ? `Waiting ${topicName}` : "ROS disconnected", 50, 26);
            return;
        }

        const buckets = Array.from({ length: 8 }, () => []);
        const { centerX, centerY, panX, panY, scale } = fitTransform;
        const { minZ, maxZ } = cloud.bounds;

        for (const point of cloud.points) {
            const x = (point.x - centerX) * scale + width / 2 + panX;
            const y = height / 2 - (point.y - centerY) * scale + panY;

            if (x < -POINT_SIZE || x > width + POINT_SIZE || y < -POINT_SIZE || y > height + POINT_SIZE) continue;

            buckets[getColorBucket(point.z, minZ, maxZ)].push([x, y]);
        }

        const palette = [
            "rgba(96, 165, 250, 0.88)",
            "rgba(34, 211, 238, 0.9)",
            "rgba(45, 212, 191, 0.92)",
            "rgba(74, 222, 128, 0.92)",
            "rgba(163, 230, 53, 0.92)",
            "rgba(250, 204, 21, 0.92)",
            "rgba(251, 146, 60, 0.92)",
            "rgba(248, 113, 113, 0.92)",
        ];

        buckets.forEach((bucket, bucketIndex) => {
            ctx.fillStyle = palette[bucketIndex];
            bucket.forEach(([x, y]) => {
                ctx.fillRect(x, y, POINT_SIZE, POINT_SIZE);
            });
        });

        drawOriginMarker(ctx, fitTransform, width, height);
    }, [canvasSize, cloud, fitTransform, isConnected, showGrid, theme, topicName]);

    const handleResetView = useCallback(() => {
        setView({ panX: 0, panY: 0, zoom: 1 });
    }, []);

    const handleClear = useCallback(() => {
        setCloud(null);
        setLastReceivedAt(null);
        setView({ panX: 0, panY: 0, zoom: 1 });
    }, []);

    const handleWheel = useCallback((event) => {
        event.preventDefault();
        const direction = event.deltaY > 0 ? 0.9 : 1.1;

        setView((current) => ({
            ...current,
            zoom: clamp(current.zoom * direction, 0.2, 35),
        }));
    }, []);

    const handlePointerDown = useCallback((event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = {
            x: event.clientX,
            y: event.clientY,
        };
    }, []);

    const handlePointerMove = useCallback((event) => {
        if (!dragRef.current) return;

        const dx = event.clientX - dragRef.current.x;
        const dy = event.clientY - dragRef.current.y;
        dragRef.current = {
            x: event.clientX,
            y: event.clientY,
        };

        setView((current) => ({
            ...current,
            panX: current.panX + dx,
            panY: current.panY + dy,
        }));
    }, []);

    const handlePointerUp = useCallback((event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }

        dragRef.current = null;
    }, []);

    const isFullScreen = layout === "fullscreen";
    const pointLabel = cloud
        ? `${cloud.renderedPoints.toLocaleString("vi-VN")} / ${cloud.totalPoints.toLocaleString("vi-VN")}`
        : "0";
    const statusColor = isConnected ? theme.hmi.colorPrimary : theme.hmi.colorError;

    return (
        <Box
            sx={{
                position: "absolute",
                zIndex: isFullScreen ? 930 : 940,
                top: isFullScreen ? 46 : 60,
                left: isFullScreen ? 0 : 52,
                right: isFullScreen ? 0 : "auto",
                bottom: isFullScreen ? 0 : "auto",
                width: isFullScreen ? "100%" : "min(520px, calc(100vw - 92px))",
                height: isFullScreen ? "auto" : { xs: 260, md: 340 },
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                borderRadius: isFullScreen ? 0 : "8px",
                bgcolor: alpha(theme.hmi.colorMidnightBlue, isFullScreen ? 0.94 : 0.86),
                border: isFullScreen ? 0 : `1px solid ${alpha(theme.hmi.colorSnowGray, 0.22)}`,
                boxShadow: isFullScreen ? "none" : "0 16px 34px rgba(0, 0, 0, 0.32)",
                backdropFilter: isFullScreen ? "none" : "blur(8px)",
            }}
        >
            <Box
                sx={{
                    px: 1,
                    py: 0.75,
                    display: "flex",
                    alignItems: "center",
                    // justifyContent: "space-between",
                    gap: 1,
                    borderBottom: `1px solid ${alpha(theme.hmi.colorSnowGray, 0.14)}`,
                }}
            >
                <Box sx={{ minWidth: 0, display: "flex", alignItems: "center", gap: 0.75 }}>
                    <MapIcon sx={{ fontSize: 18, color: theme.hmi.colorBtnOrange, flexShrink: 0 }} />
                    <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ color: theme.hmi.colorSnowGray, fontSize: 13, fontWeight: 800 }}>
                            SLAM PointCloud
                        </Typography>
                        <Typography
                            sx={{
                                color: alpha(theme.hmi.colorSnowGray, 0.62),
                                fontSize: 11,
                                lineHeight: 1.2,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                            }}
                        >
                            {cloud?.frameId ? `${topicName} - ${cloud.frameId}` : topicName}
                        </Typography>
                    </Box>
                </Box>

                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexShrink: 0, ml: 8 }}>
                    <Box
                        sx={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            bgcolor: statusColor,
                            boxShadow: `0 0 10px ${alpha(statusColor, 0.8)}`,
                        }}
                    />
                    <Tooltip title={isPaused ? "Live" : "Pause"}>
                        <IconButton
                            size="small"
                            onClick={() => setIsPaused((current) => !current)}
                            sx={{ color: theme.hmi.colorSnowGray, borderRadius: "6px" }}
                        >
                            {isPaused ? (
                                <PlayCircleOutlineIcon fontSize="small" />
                            ) : (
                                <PauseCircleOutlineIcon fontSize="small" />
                            )}
                        </IconButton>
                    </Tooltip>
                    <Tooltip title={showGrid ? "Hide grid" : "Show grid"}>
                        <IconButton
                            size="small"
                            onClick={() => setShowGrid((current) => !current)}
                            sx={{
                                color: showGrid ? theme.hmi.colorPrimary : alpha(theme.hmi.colorSnowGray, 0.55),
                                borderRadius: "6px",
                            }}
                        >
                            <GridOnIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Fit">
                        <IconButton
                            size="small"
                            onClick={handleResetView}
                            sx={{ color: theme.hmi.colorSnowGray, borderRadius: "6px" }}
                        >
                            <CenterFocusStrongIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Clear">
                        <IconButton
                            size="small"
                            onClick={handleClear}
                            sx={{ color: theme.hmi.colorBtnOrange, borderRadius: "6px" }}
                        >
                            <DeleteSweepIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                </Box>
            </Box>

            <Box
                ref={containerRef}
                onPointerDown={handlePointerDown}
                onPointerLeave={handlePointerUp}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onWheel={handleWheel}
                sx={{
                    position: "relative",
                    flex: 1,
                    minHeight: 0,
                    cursor: dragRef.current ? "grabbing" : "grab",
                    touchAction: "none",
                }}
            >
                <canvas ref={canvasRef} />
            </Box>

            <Box
                sx={{
                    px: 1,
                    py: 0.65,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 1,
                    borderTop: `1px solid ${alpha(theme.hmi.colorSnowGray, 0.12)}`,
                    color: alpha(theme.hmi.colorSnowGray, 0.72),
                    fontSize: 11,
                }}
            >
                <Typography sx={{ fontSize: 11, color: "inherit", whiteSpace: "nowrap" }}>
                    Points: {pointLabel}
                </Typography>
                <Typography
                    sx={{
                        minWidth: 0,
                        fontSize: 11,
                        color: "inherit",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                    }}
                >
                    {cloudAge || "No data"}
                </Typography>
                <Typography sx={{ fontSize: 11, color: "inherit", whiteSpace: "nowrap" }}>
                    {Math.round(view.zoom * 100)}%
                </Typography>
            </Box>
        </Box>
    );
};

export default SlamCloudViewer;

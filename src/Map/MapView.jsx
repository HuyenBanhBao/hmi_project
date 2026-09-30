import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box } from "@mui/material";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import AutoRouteLayer from "./AutoRouteLayer";
import OfflineDetailLayer from "./OfflineDetailLayer";
import MapToolbar from "./MapToolbar";

// Fix icon mặc định của Leaflet
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: markerIcon2x,
    iconUrl: markerIcon,
    shadowUrl: markerShadow,
});

const DEFAULT_LAT = 21.0354814;
const DEFAULT_LNG = 105.8684144;

// ========================= ICONS =========================
const robotIcon = L.divIcon({
    html: `
        <div style="
            width:16px;
            height:16px;
            background:red;
            border:2px solid white;
            border-radius:50%;
            box-shadow:0 0 12px rgba(255,0,0,0.9);
        "></div>
    `,
    className: "",
    iconSize: [16, 16],
    iconAnchor: [8, 8],
});

const defaultRobotIcon = L.divIcon({
    html: `
        <div style="
            width:16px;
            height:16px;
            background:orange;
            border:2px solid white;
            border-radius:50%;
            box-shadow:0 0 12px rgba(255,165,0,0.9);
        "></div>
    `,
    className: "",
    iconSize: [16, 16],
    iconAnchor: [8, 8],
});

const createWaypointIcon = (index) =>
    L.divIcon({
        html: `
            <div style="
                width:24px;
                height:24px;
                background:#1976d2;
                color:white;
                border:2px solid white;
                border-radius:50%;
                display:flex;
                align-items:center;
                justify-content:center;
                font-size:11px;
                font-weight:bold;
                box-shadow:0 0 10px rgba(25,118,210,0.8);
            ">
                ${index + 1}
            </div>
        `,
        className: "",
        iconSize: [24, 24],
        iconAnchor: [12, 12],
    });

const WAYPOINT_SNAP_DISTANCE_PX = 18;
const ROUTE_TEST_STEP_START = "start";
const ROUTE_TEST_STEP_TARGET = "target";
const ROUTE_TEST_STEP_DONE = "done";
const WAYPOINT_HISTORY_STORAGE_KEY = "hmi-waypoint-history-v1";
const WAYPOINT_HISTORY_LIMIT = 5;
const DEFAULT_OFFLINE_TILE_LABEL = import.meta.env.VITE_OFFLINE_TILE_LABEL || "Bản đồ offline";
const DEFAULT_OFFLINE_TILE_URL =
    import.meta.env.VITE_OFFLINE_TILE_URL || "http://127.0.0.1:8080/styles/basic-preview/{z}/{x}/{y}.png";
const DEFAULT_OFFLINE_TILE_DESCRIPTION =
    import.meta.env.VITE_OFFLINE_TILE_DESCRIPTION || "Local TileServer GL from vietnam.mbtiles";
const DEFAULT_MAP_LAYER_ID = "osm-offline";

const MAP_LAYER_OPTIONS = [
    {
        id: "osm-offline",
        label: DEFAULT_OFFLINE_TILE_LABEL,
        description: DEFAULT_OFFLINE_TILE_DESCRIPTION,
        type: "tile",
        url: DEFAULT_OFFLINE_TILE_URL,
        attribution: "MapTiler, OpenStreetMap contributors",
        maxNativeZoom: 14,
        maxZoom: 22,
        isOffline: true,
    },
    {
        id: "osm-online",
        label: "Bản đồ trực tuyến",
        description: "Needs internet",
        type: "tile",
        url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        attribution: "OpenStreetMap",
        maxNativeZoom: 19,
        maxZoom: 22,
        isOffline: false,
    },
];

const createBaseLayer = (layerOption) => {
    if (layerOption.type === "image") {
        return L.imageOverlay(layerOption.imageUrl, layerOption.bounds, {
            interactive: false,
            zIndex: 1,
        });
    }

    return L.tileLayer(layerOption.url, {
        attribution: layerOption.attribution,
        minNativeZoom: layerOption.minNativeZoom,
        maxNativeZoom: layerOption.maxNativeZoom,
        maxZoom: layerOption.maxZoom,
    });
};

const attachBaseLayerDiagnostics = (baseLayer, layerOption) => {
    if (layerOption.type !== "tile" || typeof baseLayer.on !== "function") {
        return () => {};
    }

    let hasLoggedError = false;

    const handleTileError = (event) => {
        if (hasLoggedError) return;

        hasLoggedError = true;
        console.error(`[map] base layer "${layerOption.id}" failed to load`, {
            url: layerOption.url,
            tileUrl: event?.tile?.src || null,
        });
    };

    baseLayer.on("tileerror", handleTileError);

    return () => {
        baseLayer.off("tileerror", handleTileError);
    };
};

const createWaypoint = (latitude, longitude) => ({
    id: Date.now() + Math.random(),
    latitude,
    longitude,
});

const normalizeWaypointSnapshot = (waypoint) => {
    const latitude = Number(waypoint?.latitude);
    const longitude = Number(waypoint?.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return null;
    }

    return { latitude, longitude };
};

const normalizeWaypointMission = (mission) => {
    const name = typeof mission?.name === "string" ? mission.name.trim() : "";
    const waypoints = Array.isArray(mission?.waypoints)
        ? mission.waypoints.map(normalizeWaypointSnapshot).filter(Boolean)
        : [];

    if (!name || !waypoints.length) {
        return null;
    }

    const createdAt = Number.isFinite(Number(mission?.createdAt)) ? Number(mission.createdAt) : Date.now();
    const updatedAt = Number.isFinite(Number(mission?.updatedAt)) ? Number(mission.updatedAt) : createdAt;

    return {
        id:
            typeof mission?.id === "string" && mission.id
                ? mission.id
                : `${createdAt}_${Math.random().toString(36).slice(2, 8)}`,
        name,
        createdAt,
        updatedAt,
        waypoints,
    };
};

const buildMissionName = () =>
    `Mission ${new Date().toLocaleString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    })}`;

const findNearestWaypoint = (map, waypoints, containerPoint) => {
    if (!map || !waypoints.length || !containerPoint) return null;

    let nearestWaypoint = null;
    let nearestDistance = WAYPOINT_SNAP_DISTANCE_PX;

    waypoints.forEach((wp) => {
        const waypointPoint = map.latLngToContainerPoint([wp.latitude, wp.longitude]);
        const distance = containerPoint.distanceTo(waypointPoint);

        if (distance <= nearestDistance) {
            nearestDistance = distance;
            nearestWaypoint = wp;
        }
    });

    return nearestWaypoint;
};

const MapView = ({ gpsData, onPublishMission, setWaypoints, waypoints = [] }) => {
    const mapRef = useRef(null);
    const mapInstance = useRef(null);
    const baseLayerRef = useRef(null);
    const robotMarkerRef = useRef(null);
    const waypointMarkersRef = useRef([]);
    const polylineRef = useRef(null);
    const isPlanningRef = useRef(false);
    const isRoutePlanningRef = useRef(false);
    const isRouteTestPlanningRef = useRef(false);
    const routeTestStepRef = useRef(ROUTE_TEST_STEP_START);
    const robotPositionRef = useRef(null);

    const [leafletMap, setLeafletMap] = useState(null);
    const [isPlanning, setIsPlanning] = useState(false);
    const [isRoutePlanning, setIsRoutePlanning] = useState(false);
    const [isRouteTestPlanning, setIsRouteTestPlanning] = useState(false);
    const [selectedMapLayerId, setSelectedMapLayerId] = useState(DEFAULT_MAP_LAYER_ID);
    const [routeTarget, setRouteTarget] = useState(null);
    const [routeStart, setRouteStart] = useState(null);
    const [routePoints, setRoutePoints] = useState([]);
    const [routeDistance, setRouteDistance] = useState(null);
    const [routeStatus, setRouteStatus] = useState("idle");
    const [historyReady, setHistoryReady] = useState(false);
    const [missionNameDraft, setMissionNameDraft] = useState("");
    const [savedWaypointMissions, setSavedWaypointMissions] = useState([]);
    const [selectedMissionId, setSelectedMissionId] = useState("");
    const selectedMapLayer = MAP_LAYER_OPTIONS.find((layer) => layer.id === selectedMapLayerId) ?? MAP_LAYER_OPTIONS[0];
    const selectedMission = savedWaypointMissions.find((mission) => mission.id === selectedMissionId) ?? null;

    const robotPosition = useMemo(() => {
        if (gpsData?.latitude == null || gpsData?.longitude == null) return null;

        return {
            latitude: gpsData.latitude,
            longitude: gpsData.longitude,
        };
    }, [gpsData?.latitude, gpsData?.longitude]);

    useEffect(() => {
        isPlanningRef.current = isPlanning;
    }, [isPlanning]);

    useEffect(() => {
        isRoutePlanningRef.current = isRoutePlanning;
    }, [isRoutePlanning]);

    useEffect(() => {
        isRouteTestPlanningRef.current = isRouteTestPlanning;
    }, [isRouteTestPlanning]);

    useEffect(() => {
        robotPositionRef.current = robotPosition;
    }, [robotPosition]);

    useEffect(() => {
        if (routeTarget && !routeStart && robotPosition) {
            setRouteStart(robotPosition);
        }
    }, [robotPosition, routeStart, routeTarget]);

    useEffect(() => {
        if (typeof window === "undefined") return;

        try {
            const rawHistory = window.localStorage.getItem(WAYPOINT_HISTORY_STORAGE_KEY);
            if (!rawHistory) {
                setHistoryReady(true);
                return;
            }

            const parsedHistory = JSON.parse(rawHistory);
            if (!Array.isArray(parsedHistory)) {
                setHistoryReady(true);
                return;
            }

            const normalizedHistory = parsedHistory
                .map(normalizeWaypointMission)
                .filter(Boolean)
                .sort((a, b) => b.updatedAt - a.updatedAt)
                .slice(0, WAYPOINT_HISTORY_LIMIT);

            setSavedWaypointMissions(normalizedHistory);
        } catch (error) {
            console.error("Failed to restore waypoint history", error);
        } finally {
            setHistoryReady(true);
        }
    }, []);

    useEffect(() => {
        if (typeof window === "undefined") return;
        if (!historyReady) return;

        try {
            window.localStorage.setItem(WAYPOINT_HISTORY_STORAGE_KEY, JSON.stringify(savedWaypointMissions));
        } catch (error) {
            console.error("Failed to persist waypoint history", error);
        }
    }, [historyReady, savedWaypointMissions]);

    useEffect(() => {
        if (selectedMissionId && savedWaypointMissions.some((mission) => mission.id === selectedMissionId)) {
            return;
        }

        if (!savedWaypointMissions.length) {
            setSelectedMissionId("");
            return;
        }

        setSelectedMissionId(savedWaypointMissions[0].id);
    }, [savedWaypointMissions, selectedMissionId]);

    const handleRouteChange = useCallback((route) => {
        setRouteStatus(route.status);
        setRoutePoints(route.points ?? []);
        setRouteDistance(Number.isFinite(route.distance) ? route.distance : null);
    }, []);

    const saveWaypointMission = useCallback(
        (missionWaypoints = [], preferredName = "") => {
            const normalizedWaypoints = missionWaypoints.map(normalizeWaypointSnapshot).filter(Boolean);
            if (!normalizedWaypoints.length) return null;

            const fallbackName = preferredName.trim() || selectedMission?.name || buildMissionName();
            const missionName = fallbackName.slice(0, 64);
            const normalizedName = missionName.toLowerCase();
            const now = Date.now();
            const existingMission =
                savedWaypointMissions.find(
                    (mission) => mission.id === selectedMissionId && mission.name.toLowerCase() === normalizedName,
                ) ?? savedWaypointMissions.find((mission) => mission.name.toLowerCase() === normalizedName);
            const missionId = existingMission?.id ?? `${now}_${Math.random().toString(36).slice(2, 8)}`;
            const savedMission = {
                id: missionId,
                name: missionName,
                createdAt: existingMission?.createdAt ?? now,
                updatedAt: now,
                waypoints: normalizedWaypoints,
            };
            const nextMissions = [
                savedMission,
                ...savedWaypointMissions.filter((mission) => mission.id !== missionId),
            ].slice(0, WAYPOINT_HISTORY_LIMIT);

            setSavedWaypointMissions(nextMissions);

            setMissionNameDraft(missionName);
            setSelectedMissionId(savedMission.id);
            return savedMission;
        },
        [savedWaypointMissions, selectedMission?.name, selectedMissionId],
    );

    // ========================= INIT MAP =========================
    useEffect(() => {
        if (!mapRef.current || mapInstance.current) return;

        const map = L.map(mapRef.current, {
            zoomControl: false,
        }).setView([DEFAULT_LAT, DEFAULT_LNG], 18);

        const robotMarker = L.marker([DEFAULT_LAT, DEFAULT_LNG], {
            icon: defaultRobotIcon,
        }).addTo(map);

        map.on("click", (e) => {
            const { lat, lng } = e.latlng;
            const clickedPoint = createWaypoint(lat, lng);

            if (isRouteTestPlanningRef.current) {
                if (routeTestStepRef.current === ROUTE_TEST_STEP_TARGET) {
                    routeTestStepRef.current = ROUTE_TEST_STEP_DONE;
                    setRouteTarget(clickedPoint);
                    setRoutePoints([]);
                    setRouteDistance(null);
                    setRouteStatus("loading");
                    return;
                }

                routeTestStepRef.current = ROUTE_TEST_STEP_TARGET;
                setRouteStart(clickedPoint);
                setRouteTarget(null);
                setRoutePoints([]);
                setRouteDistance(null);
                setRouteStatus("select-target");
                return;
            }

            if (isRoutePlanningRef.current) {
                setRouteTarget(clickedPoint);
                setRouteStart(robotPositionRef.current);
                setRoutePoints([]);
                setRouteDistance(null);
                return;
            }

            if (!isPlanningRef.current) return;

            setWaypoints((prev) => {
                const selectedWaypoint = findNearestWaypoint(map, prev, e.containerPoint);
                const nextLatitude = selectedWaypoint?.latitude ?? lat;
                const nextLongitude = selectedWaypoint?.longitude ?? lng;

                return [...prev, createWaypoint(nextLatitude, nextLongitude)];
            });
        });

        mapInstance.current = map;
        robotMarkerRef.current = robotMarker;
        setLeafletMap(map);

        return () => {
            map.remove();
            mapInstance.current = null;
            baseLayerRef.current = null;
        };
    }, [setWaypoints]);

    // ========================= BASE MAP LAYERS =========================
    useEffect(() => {
        if (!leafletMap) return;

        if (baseLayerRef.current) {
            baseLayerRef.current.remove();
            baseLayerRef.current = null;
        }

        const baseLayer = createBaseLayer(selectedMapLayer).addTo(leafletMap);
        const detachDiagnostics = attachBaseLayerDiagnostics(baseLayer, selectedMapLayer);
        baseLayerRef.current = baseLayer;

        return () => {
            detachDiagnostics();
            baseLayer.remove();
            if (baseLayerRef.current === baseLayer) {
                baseLayerRef.current = null;
            }
        };
    }, [leafletMap, selectedMapLayer]);

    // ========================= UPDATE ROBOT =========================
    useEffect(() => {
        if (!mapInstance.current || !robotMarkerRef.current) return;

        const latitude = gpsData?.latitude ?? DEFAULT_LAT;
        const longitude = gpsData?.longitude ?? DEFAULT_LNG;

        const isDefault = gpsData?.latitude == null || gpsData?.longitude == null;

        const pos = [latitude, longitude];

        robotMarkerRef.current.setLatLng(pos);
        robotMarkerRef.current.setIcon(isDefault ? defaultRobotIcon : robotIcon);

        // Nếu muốn robot chạy đến đâu camera bám theo đến đó thì giữ dòng này
        // Nếu thấy map cứ giật giật khó thao tác waypoint thì comment nó đi
        // mapInstance.current.panTo(pos);
    }, [gpsData]);

    // ========================= UPDATE WAYPOINTS =========================
    useEffect(() => {
        if (!mapInstance.current) return;

        // Xóa marker waypoint cũ
        waypointMarkersRef.current.forEach((marker) => marker.remove());
        waypointMarkersRef.current = [];

        // Xóa polyline cũ
        if (polylineRef.current) {
            polylineRef.current.remove();
            polylineRef.current = null;
        }

        // Vẽ lại waypoint markers
        const markers = waypoints.map((wp, index) => {
            const marker = L.marker([wp.latitude, wp.longitude], {
                icon: createWaypointIcon(index),
                bubblingMouseEvents: false,
            })
                .addTo(mapInstance.current)
                .bindPopup(
                    `
                    <b>Waypoint ${index + 1}</b><br/>
                    Lat: ${wp.latitude.toFixed(7)}<br/>
                    Lng: ${wp.longitude.toFixed(7)}
                `,
                );

            marker.on("click", (event) => {
                if (!isPlanningRef.current) return;

                if (event.originalEvent) {
                    L.DomEvent.stop(event.originalEvent);
                }

                marker.closePopup();
                setWaypoints((prev) => [...prev, createWaypoint(wp.latitude, wp.longitude)]);
            });

            return marker;
        });

        waypointMarkersRef.current = markers;

        // Vẽ đường nối waypoint
        if (waypoints.length >= 2) {
            polylineRef.current = L.polyline(
                waypoints.map((wp) => [wp.latitude, wp.longitude]),
                {
                    color: "#00e5ff",
                    weight: 4,
                    dashArray: "10, 8",
                },
            ).addTo(mapInstance.current);
        }
    }, [setWaypoints, waypoints]);

    // ========================= ACTIONS =========================
    const handleUndo = () => {
        setWaypoints((prev) => prev.slice(0, -1));
    };

    const handleClear = () => {
        setWaypoints([]);
    };

    const handleTogglePlanning = () => {
        const nextPlanning = !isPlanning;

        setIsPlanning(nextPlanning);
        if (nextPlanning) {
            setIsRoutePlanning(false);
            setIsRouteTestPlanning(false);
            routeTestStepRef.current = ROUTE_TEST_STEP_START;
        }
    };

    const handleToggleRoutePlanning = () => {
        const nextRoutePlanning = !isRoutePlanning;

        setIsRoutePlanning(nextRoutePlanning);
        if (nextRoutePlanning) {
            setIsPlanning(false);
            setIsRouteTestPlanning(false);
            routeTestStepRef.current = ROUTE_TEST_STEP_START;
        }
    };

    const handleToggleRouteTestPlanning = () => {
        const nextRouteTestPlanning = !isRouteTestPlanning;

        setIsRouteTestPlanning(nextRouteTestPlanning);
        routeTestStepRef.current = ROUTE_TEST_STEP_START;

        if (nextRouteTestPlanning) {
            setIsPlanning(false);
            setIsRoutePlanning(false);
            setRouteStart(null);
            setRouteTarget(null);
            setRoutePoints([]);
            setRouteDistance(null);
            setRouteStatus("select-start");
            return;
        }

        if (!routeTarget) {
            setRouteStatus("idle");
        }
    };

    const handleClearRoute = () => {
        routeTestStepRef.current = ROUTE_TEST_STEP_START;
        setRouteTarget(null);
        setRouteStart(null);
        setRoutePoints([]);
        setRouteDistance(null);
        setRouteStatus(isRouteTestPlanning ? "select-start" : "idle");
    };

    const handleSendMission = () => {
        if (!waypoints.length) {
            alert("Chưa có waypoint nào");
            return;
        }

        const savedMission = saveWaypointMission(waypoints, missionNameDraft);
        onPublishMission?.(waypoints);
        alert(`Đã gửi ${waypoints.length} waypoint xuống robot${savedMission ? ` (${savedMission.name})` : ""}`);
    };

    const handleSendRouteMission = () => {
        if (!routeTarget) {
            alert("Chưa chọn điểm đích route");
            return;
        }

        if (!routeStart) {
            alert("Chưa có GPS robot để tính route");
            return;
        }

        if (!routePoints.length) {
            alert("Chưa có dữ liệu route");
            return;
        }

        onPublishMission?.(routePoints);
        alert(`Đã gửi route ${routePoints.length} điểm xuống robot`);
    };

    const handleSaveMissionHistory = () => {
        if (!waypoints.length) {
            alert("Chưa có waypoint nào để lưu");
            return;
        }

        const savedMission = saveWaypointMission(waypoints, missionNameDraft);
        if (!savedMission) return;

        alert(`Đã lưu mission "${savedMission.name}"`);
    };

    const handleSelectMission = (missionId) => {
        setSelectedMissionId(missionId);

        const mission = savedWaypointMissions.find((item) => item.id === missionId);
        if (mission) {
            setMissionNameDraft(mission.name);
        }
    };

    const handleLoadSavedMission = () => {
        if (!selectedMission) {
            alert("Chưa chọn mission đã lưu");
            return;
        }

        setWaypoints(
            selectedMission.waypoints.map((waypoint) => createWaypoint(waypoint.latitude, waypoint.longitude)),
        );
        setMissionNameDraft(selectedMission.name);
        alert(`Đã nạp mission "${selectedMission.name}"`);
    };

    const handleSendSavedMission = () => {
        if (!selectedMission) {
            alert("Chưa chọn mission đã lưu");
            return;
        }

        const savedMission = saveWaypointMission(selectedMission.waypoints, selectedMission.name);

        onPublishMission?.(selectedMission.waypoints);
        alert(
            `Đã gửi mission "${(savedMission ?? selectedMission).name}" với ${selectedMission.waypoints.length} waypoint`,
        );
    };

    const handleCenterRobot = () => {
        if (!mapInstance.current) return;

        const latitude = gpsData?.latitude ?? DEFAULT_LAT;
        const longitude = gpsData?.longitude ?? DEFAULT_LNG;

        mapInstance.current.setView([latitude, longitude], 19);
    };

    // ========================= UI =========================
    return (
        <Box sx={{ width: "100%", height: "100%", position: "relative" }}>
            {/* MAP */}
            <Box
                ref={mapRef}
                sx={{ width: "100%", height: "100%" }}
            />

            <OfflineDetailLayer
                map={leafletMap}
                enabled={selectedMapLayer.isOffline}
            />

            <AutoRouteLayer
                map={leafletMap}
                start={routeStart}
                target={routeTarget}
                enabled={isRouteTestPlanning || Boolean(routeTarget)}
                showStartMarker={isRouteTestPlanning}
                onRouteChange={handleRouteChange}
            />

            <MapToolbar
                isPlanning={isPlanning}
                isRoutePlanning={isRoutePlanning}
                isRouteTestPlanning={isRouteTestPlanning}
                mapLayerOptions={MAP_LAYER_OPTIONS}
                routePointsCount={routePoints.length}
                routeDistanceMeters={routeDistance}
                routeStatus={routeStatus}
                selectedMapLayerId={selectedMapLayerId}
                missionNameDraft={missionNameDraft}
                savedWaypointMissions={savedWaypointMissions}
                selectedMissionId={selectedMissionId}
                waypointsCount={waypoints.length}
                onCenterRobot={handleCenterRobot}
                onClearRoute={handleClearRoute}
                onClearWaypoints={handleClear}
                onChangeMissionName={setMissionNameDraft}
                onLoadSavedMission={handleLoadSavedMission}
                onSaveMissionHistory={handleSaveMissionHistory}
                onSelectMapLayer={setSelectedMapLayerId}
                onSelectMission={handleSelectMission}
                onSendMission={handleSendMission}
                onSendRoute={handleSendRouteMission}
                onSendSavedMission={handleSendSavedMission}
                onTogglePlanning={handleTogglePlanning}
                onToggleRoutePlanning={handleToggleRoutePlanning}
                onToggleRouteTestPlanning={handleToggleRouteTestPlanning}
                onUndoWaypoint={handleUndo}
            />
        </Box>
    );
};

export default MapView;

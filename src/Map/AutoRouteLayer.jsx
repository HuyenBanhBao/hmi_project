import { useEffect } from "react";
import L from "leaflet";

const DEFAULT_ROUTER_URLS = ["http://127.0.0.1:5000", "https://router.project-osrm.org"];
const ROUTER_URLS = (import.meta.env.VITE_OSRM_URLS || import.meta.env.VITE_OSRM_URL || DEFAULT_ROUTER_URLS.join(","))
    .split(",")
    .map((url) => url.trim().replace(/\/$/, ""))
    .filter(Boolean);
const ROUTE_WAYPOINT_SPACING_METERS = 4;

const targetIcon = L.divIcon({
    html: `
        <div style="
            width:26px;
            height:26px;
            background:#16a34a;
            border:2px solid white;
            border-radius:50%;
            box-shadow:0 0 12px rgba(22,163,74,0.85);
            position:relative;
        ">
            <div style="
                width:8px;
                height:8px;
                background:white;
                border-radius:50%;
                position:absolute;
                left:50%;
                top:50%;
                transform:translate(-50%,-50%);
            "></div>
        </div>
    `,
    className: "",
    iconSize: [26, 26],
    iconAnchor: [13, 13],
});

const startIcon = L.divIcon({
    html: `
        <div style="
            width:26px;
            height:26px;
            background:#2563eb;
            border:2px solid white;
            border-radius:50%;
            box-shadow:0 0 12px rgba(37,99,235,0.85);
            position:relative;
        ">
            <div style="
                width:8px;
                height:8px;
                background:white;
                border-radius:50%;
                position:absolute;
                left:50%;
                top:50%;
                transform:translate(-50%,-50%);
            "></div>
        </div>
    `,
    className: "",
    iconSize: [26, 26],
    iconAnchor: [13, 13],
});

const toLatLngPath = (coordinates = []) => coordinates.map(([lng, lat]) => [lat, lng]);

const toMissionPoints = (path = []) =>
    path.map(([latitude, longitude]) => ({
        latitude,
        longitude,
    }));

const getDistanceMeters = (from, to) => L.latLng(from[0], from[1]).distanceTo(L.latLng(to[0], to[1]));

const getPathDistanceMeters = (path = []) =>
    path.reduce((total, point, index) => {
        if (index === 0) return total;
        return total + getDistanceMeters(path[index - 1], point);
    }, 0);

const interpolatePoint = (from, to, ratio) => [
    from[0] + (to[0] - from[0]) * ratio,
    from[1] + (to[1] - from[1]) * ratio,
];

const densifyPath = (path = [], spacingMeters = ROUTE_WAYPOINT_SPACING_METERS) => {
    if (path.length < 2 || spacingMeters <= 0) return path;

    const densePath = [path[0]];

    for (let index = 1; index < path.length; index += 1) {
        const from = path[index - 1];
        const to = path[index];
        const distance = getDistanceMeters(from, to);

        if (distance <= 0) continue;

        const extraPointCount = Math.floor(distance / spacingMeters);

        for (let step = 1; step <= extraPointCount; step += 1) {
            const ratio = (spacingMeters * step) / distance;
            if (ratio < 1) densePath.push(interpolatePoint(from, to, ratio));
        }

        densePath.push(to);
    }

    return densePath;
};

const requestRoute = async ({ routerUrl, profile, start, target, signal }) => {
    const url =
        `${routerUrl}/route/v1/${profile}/` +
        `${start.longitude},${start.latitude};${target.longitude},${target.latitude}` +
        "?overview=full&geometries=geojson&steps=false";

    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`${routerUrl} ${response.status}`);

    const data = await response.json();
    const route = data?.routes?.[0];
    const path = toLatLngPath(route?.geometry?.coordinates);

    if (!path.length) throw new Error(`${routerUrl} route is empty`);

    return { route, path };
};

const drawRoutePointDots = (layerGroup, path = []) => {
    path.forEach(([latitude, longitude]) => {
        L.circleMarker([latitude, longitude], {
            radius: 4,
            color: "#097109",
            weight: 1,
            fillColor: "#097109",
            fillOpacity: 1,
            interactive: false,
        }).addTo(layerGroup);
    });
};

const drawDirectRoute = (layerGroup, start, target, waypointSpacingMeters) => {
    const path = [
        [start.latitude, start.longitude],
        [target.latitude, target.longitude],
    ];
    const densePath = densifyPath(path, waypointSpacingMeters);

    L.polyline(path, {
        color: "#ef4444",
        weight: 5,
        dashArray: "12, 10",
    }).addTo(layerGroup);

    drawRoutePointDots(layerGroup, densePath);

    return {
        points: toMissionPoints(densePath),
        distance: getPathDistanceMeters(path),
    };
};

const AutoRouteLayer = ({
    map,
    start,
    target,
    enabled,
    profile = "driving",
    showStartMarker = false,
    waypointSpacingMeters = ROUTE_WAYPOINT_SPACING_METERS,
    onRouteChange,
}) => {
    useEffect(() => {
        if (!map) return undefined;

        const layerGroup = L.layerGroup().addTo(map);
        const controller = new AbortController();
        let active = true;

        if (!enabled) {
            return () => {
                controller.abort();
                layerGroup.remove();
            };
        }

        if (showStartMarker && start) {
            L.marker([start.latitude, start.longitude], { icon: startIcon })
                .addTo(layerGroup)
                .bindPopup(
                    `
                    <b>Route start</b><br/>
                    Lat: ${start.latitude.toFixed(7)}<br/>
                    Lng: ${start.longitude.toFixed(7)}
                `,
                );
        }

        if (!target) {
            return () => {
                controller.abort();
                layerGroup.remove();
            };
        }

        L.marker([target.latitude, target.longitude], { icon: targetIcon })
            .addTo(layerGroup)
            .bindPopup(
                `
                <b>Route target</b><br/>
                Lat: ${target.latitude.toFixed(7)}<br/>
                Lng: ${target.longitude.toFixed(7)}
            `,
            );

        if (!start) {
            onRouteChange?.({ status: "missing-start", points: [] });
            return () => {
                controller.abort();
                layerGroup.remove();
            };
        }

        const fetchRoute = async () => {
            onRouteChange?.({ status: "loading", points: [] });

            try {
                let routeResult = null;
                let lastError = null;

                for (const routerUrl of ROUTER_URLS) {
                    try {
                        routeResult = await requestRoute({
                            routerUrl,
                            profile,
                            start,
                            target,
                            signal: controller.signal,
                        });
                        break;
                    } catch (error) {
                        if (error.name === "AbortError") throw error;
                        lastError = error;
                    }
                }

                if (!routeResult) throw lastError ?? new Error("No route server configured");

                const { route, path } = routeResult;

                const densePath = densifyPath(path, waypointSpacingMeters);

                L.polyline(path, {
                    color: "#ef4444",
                    weight: 5,
                    opacity: 0.95,
                }).addTo(layerGroup);

                drawRoutePointDots(layerGroup, densePath);

                if (active) {
                    onRouteChange?.({
                        status: "ready",
                        points: toMissionPoints(densePath),
                        distance: route.distance ?? getPathDistanceMeters(path),
                        duration: route.duration,
                    });
                }
            } catch (error) {
                if (error.name === "AbortError") return;

                const fallbackRoute = drawDirectRoute(layerGroup, start, target, waypointSpacingMeters);
                if (active) {
                    onRouteChange?.({
                        status: "fallback",
                        points: fallbackRoute.points,
                        distance: fallbackRoute.distance,
                        error: error.message,
                    });
                }
            }
        };

        fetchRoute();

        return () => {
            active = false;
            controller.abort();
            layerGroup.remove();
        };
    }, [enabled, map, onRouteChange, profile, showStartMarker, start, target, waypointSpacingMeters]);

    return null;
};

export default AutoRouteLayer;

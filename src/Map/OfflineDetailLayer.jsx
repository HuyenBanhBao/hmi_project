import { useEffect } from "react";
import L from "leaflet";

const DETAIL_SERVER_URL = (import.meta.env.VITE_OFFLINE_DETAIL_URL || "http://127.0.0.1:5002").replace(/\/$/, "");
const DRIVE_MIN_ZOOM = Number(import.meta.env.VITE_OFFLINE_DETAIL_DRIVE_MIN_ZOOM || 15);
const BUILDINGS_MIN_ZOOM = Number(import.meta.env.VITE_OFFLINE_DETAIL_BUILDINGS_MIN_ZOOM || 16);
const POIS_MIN_ZOOM = Number(import.meta.env.VITE_OFFLINE_DETAIL_POIS_MIN_ZOOM || 15);
const REFRESH_DEBOUNCE_MS = 180;

const drivePaneName = "offline-drive-pane";
const buildingPaneName = "offline-buildings-pane";
const poiPaneName = "offline-pois-pane";

const toRequestBbox = (bounds) => {
    const paddedBounds = bounds.pad(0.12);
    const west = paddedBounds.getWest().toFixed(4);
    const south = paddedBounds.getSouth().toFixed(4);
    const east = paddedBounds.getEast().toFixed(4);
    const north = paddedBounds.getNorth().toFixed(4);

    return `${west},${south},${east},${north}`;
};

const buildDatasetUrl = (datasetName, bbox, zoom) =>
    `${DETAIL_SERVER_URL}/${datasetName}?bbox=${encodeURIComponent(bbox)}&zoom=${encodeURIComponent(zoom)}`;

const getPoiColor = (properties = {}) => {
    const amenity = properties.amenity;
    const education = properties.education;
    const healthcare = properties.healthcare;

    if (healthcare || amenity === "hospital") return "#dc2626";
    if (education || ["school", "university", "college", "kindergarten"].includes(amenity)) return "#2563eb";
    return "#0f766e";
};

const bindNamedTooltip = (layer, feature, zoom) => {
    const name = feature.properties?.name;
    if (!name || zoom < 17) return;

    layer.bindTooltip(name, {
        className: "offline-map-poi-tooltip",
        direction: "top",
        permanent: true,
        sticky: false,
        opacity: 0.9,
    });
};

const getDriveStyle = (properties = {}, zoom) => {
    const highway = properties.highway;

    if (highway === "secondary" || highway === "primary") {
        return {
            color: "#f97316",
            weight: zoom >= 18 ? 4.2 : 3.4,
            opacity: 0.88,
        };
    }

    if (highway === "tertiary") {
        return {
            color: "#f59e0b",
            weight: zoom >= 18 ? 3.4 : 2.8,
            opacity: 0.84,
        };
    }

    return {
        color: "#38bdf8",
        weight: zoom >= 18 ? 2.4 : 1.9,
        opacity: 0.8,
    };
};

const createDriveLayer = (featureCollection, zoom) =>
    L.geoJSON(featureCollection, {
        pane: drivePaneName,
        interactive: false,
        style: (feature) => getDriveStyle(feature?.properties, zoom),
    });

const createBuildingsLayer = (featureCollection, zoom) =>
    L.geoJSON(featureCollection, {
        pane: buildingPaneName,
        interactive: false,
        style: (feature) => {
            const hasName = Boolean(feature?.properties?.name);

            return {
                color: hasName ? "#8c7b67" : "#b3a693",
                weight: zoom >= 18 ? 1 : 0.7,
                fillColor: hasName ? "#d4c4af" : "#d8cebf",
                fillOpacity: zoom >= 18 ? 0.34 : 0.24,
                opacity: 0.9,
            };
        },
    });

const createPoisLayer = (featureCollection, zoom) =>
    L.geoJSON(featureCollection, {
        pane: poiPaneName,
        interactive: false,
        style: (feature) => ({
            color: getPoiColor(feature?.properties),
            weight: 1.2,
            fillColor: getPoiColor(feature?.properties),
            fillOpacity: 0.14,
            opacity: 0.85,
        }),
        pointToLayer: (feature, latlng) =>
            L.circleMarker(latlng, {
                pane: poiPaneName,
                interactive: false,
                radius: zoom >= 18 ? 6 : 5,
                color: "#ffffff",
                weight: 1.2,
                fillColor: getPoiColor(feature?.properties),
                fillOpacity: 0.95,
            }),
        onEachFeature: (feature, layer) => {
            bindNamedTooltip(layer, feature, zoom);
        },
    });

const ensurePane = (map, name, zIndex) => {
    const existingPane = map.getPane(name);
    if (existingPane) return existingPane;

    const pane = map.createPane(name);
    pane.style.zIndex = String(zIndex);
    pane.style.pointerEvents = "none";
    return pane;
};

const fetchGeoJson = async (datasetName, bbox, zoom, signal) => {
    const response = await fetch(buildDatasetUrl(datasetName, bbox, zoom), { signal });
    if (!response.ok) throw new Error(`${datasetName} ${response.status}`);
    return response.json();
};

const OfflineDetailLayer = ({ map, enabled }) => {
    useEffect(() => {
        if (!map) return undefined;

        ensurePane(map, drivePaneName, 335);
        ensurePane(map, buildingPaneName, 330);
        ensurePane(map, poiPaneName, 340);

        const layerGroup = L.layerGroup().addTo(map);
        let debounceTimer = null;
        let requestController = null;
        let requestVersion = 0;

        const clearLayers = () => {
            layerGroup.clearLayers();
        };

        const refresh = async () => {
            if (!enabled) {
                clearLayers();
                return;
            }

            const zoom = map.getZoom();
            const needsDrive = zoom >= DRIVE_MIN_ZOOM;
            const needsBuildings = zoom >= BUILDINGS_MIN_ZOOM;
            const needsPois = zoom >= POIS_MIN_ZOOM;

            if (!needsDrive && !needsBuildings && !needsPois) {
                clearLayers();
                return;
            }

            if (requestController) {
                requestController.abort();
            }

            const bbox = toRequestBbox(map.getBounds());
            const controller = new AbortController();
            const currentVersion = requestVersion + 1;

            requestController = controller;
            requestVersion = currentVersion;

            try {
                const [drive, buildings, pois] = await Promise.all([
                    needsDrive ? fetchGeoJson("drive", bbox, zoom, controller.signal) : Promise.resolve(null),
                    needsBuildings ? fetchGeoJson("buildings", bbox, zoom, controller.signal) : Promise.resolve(null),
                    needsPois ? fetchGeoJson("pois", bbox, zoom, controller.signal) : Promise.resolve(null),
                ]);

                if (controller.signal.aborted || currentVersion !== requestVersion) return;

                clearLayers();

                if (drive?.features?.length) {
                    createDriveLayer(drive, zoom).addTo(layerGroup);
                }

                if (buildings?.features?.length) {
                    createBuildingsLayer(buildings, zoom).addTo(layerGroup);
                }

                if (pois?.features?.length) {
                    createPoisLayer(pois, zoom).addTo(layerGroup);
                }
            } catch (error) {
                if (error.name === "AbortError") return;
                console.error("[offline-detail]", error);
                clearLayers();
            }
        };

        const scheduleRefresh = () => {
            if (debounceTimer) {
                clearTimeout(debounceTimer);
            }

            debounceTimer = window.setTimeout(() => {
                refresh();
            }, REFRESH_DEBOUNCE_MS);
        };

        map.on("moveend", scheduleRefresh);
        map.on("zoomend", scheduleRefresh);

        refresh();

        return () => {
            if (debounceTimer) {
                clearTimeout(debounceTimer);
            }

            if (requestController) {
                requestController.abort();
            }

            map.off("moveend", scheduleRefresh);
            map.off("zoomend", scheduleRefresh);
            clearLayers();
            layerGroup.remove();
        };
    }, [enabled, map]);

    return null;
};

export default OfflineDetailLayer;

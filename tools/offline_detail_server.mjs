import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const host = process.env.OFFLINE_DETAIL_HOST || "127.0.0.1";
const port = Number(process.env.OFFLINE_DETAIL_PORT || 5002);
const rootDir = resolve(new URL("..", import.meta.url).pathname);

const datasetConfigs = {
    buildings: {
        path: process.env.OFFLINE_BUILDINGS_GPKG || "/home/tung/osm_python/hanoi_buildings.gpkg",
        layer: process.env.OFFLINE_BUILDINGS_LAYER || "hanoi_buildings",
        minZoom: Number(process.env.OFFLINE_BUILDINGS_MIN_ZOOM || 16),
        maxFeatures: Number(process.env.OFFLINE_BUILDINGS_MAX_FEATURES || 9000),
    },
    pois: {
        path: process.env.OFFLINE_POIS_GPKG || "/home/tung/osm_python/hanoi_pois.gpkg",
        layer: process.env.OFFLINE_POIS_LAYER || "hanoi_pois",
        minZoom: Number(process.env.OFFLINE_POIS_MIN_ZOOM || 15),
        maxFeatures: Number(process.env.OFFLINE_POIS_MAX_FEATURES || 1500),
    },
    drive: {
        path: process.env.OFFLINE_DRIVE_GPKG || "/home/tung/osm_python/hoankiem_drive.gpkg",
        layer: process.env.OFFLINE_DRIVE_LAYER || "edges",
        minZoom: Number(process.env.OFFLINE_DRIVE_MIN_ZOOM || 15),
        maxFeatures: Number(process.env.OFFLINE_DRIVE_MAX_FEATURES || 6000),
    },
};

const routeSnapshotPath = process.env.OFFLINE_ROUTE_GEOJSON || resolve(rootDir, "data", "offline_roads.geojson");
const baseMapSnapshotPath =
    process.env.OFFLINE_BASEMAP_MBTILES || "/home/tung/osm-offline-server/tiles/vietnam.mbtiles";
const cacheTtlMs = Number(process.env.OFFLINE_DETAIL_CACHE_TTL_MS || 15000);
const responseCache = new Map();

const emptyCollection = () => ({ type: "FeatureCollection", features: [] });

const writeJson = (response, statusCode, payload) => {
    const body = Buffer.from(JSON.stringify(payload));

    response.writeHead(statusCode, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Cache-Control": "no-store",
        "Content-Length": String(body.length),
        "Content-Type": "application/json; charset=utf-8",
    });

    response.end(body);
};

const getPathStat = (path) => {
    if (!path || !existsSync(path)) return null;

    const stat = statSync(path);
    return {
        path,
        sizeBytes: stat.size,
        updatedAt: stat.mtime.toISOString(),
    };
};

const getSnapshotMetadata = () => ({
    basemap: getPathStat(baseMapSnapshotPath),
    buildings: getPathStat(datasetConfigs.buildings.path),
    pois: getPathStat(datasetConfigs.pois.path),
    drive: getPathStat(datasetConfigs.drive.path),
    routing: getPathStat(routeSnapshotPath),
});

const parseBbox = (value) => {
    if (!value) return null;

    const parts = value
        .split(",")
        .map((part) => Number(part.trim()))
        .filter((part) => Number.isFinite(part));

    if (parts.length !== 4) return null;

    const [west, south, east, north] = parts;
    return {
        west: Math.min(west, east),
        south: Math.min(south, north),
        east: Math.max(west, east),
        north: Math.max(south, north),
    };
};

const roundBbox = (bbox) => ({
    west: Number(bbox.west.toFixed(4)),
    south: Number(bbox.south.toFixed(4)),
    east: Number(bbox.east.toFixed(4)),
    north: Number(bbox.north.toFixed(4)),
});

const getSimplifyTolerance = (datasetName, zoom) => {
    if (!Number.isFinite(zoom)) return 0;

    if (datasetName === "buildings") {
        if (zoom <= 16) return 0.00003;
        if (zoom === 17) return 0.000015;
        return 0.000006;
    }

    if (datasetName === "drive") {
        if (zoom <= 15) return 0.00002;
        if (zoom === 16) return 0.00001;
        return 0.000004;
    }

    if (zoom <= 15) return 0.00002;
    if (zoom === 16) return 0.00001;
    return 0;
};

const pickName = (properties = {}) =>
    properties.name ||
    properties["name:vi"] ||
    properties["name:en"] ||
    properties.official_name ||
    properties.short_name ||
    null;

const normalizeProperties = (datasetName, properties = {}) => {
    if (datasetName === "buildings") {
        return {
            id: properties.id ?? properties.fid ?? null,
            name: pickName(properties),
            building: properties.building || properties.building_1 || null,
            levels: properties["building:levels"] || properties.building_levels || null,
            height: properties.height || null,
            amenity: properties.amenity || null,
            shop: properties.shop || null,
            tourism: properties.tourism || null,
            leisure: properties.leisure || null,
            office: properties.office || null,
        };
    }

    if (datasetName === "drive") {
        return {
            id: properties.id ?? properties.fid ?? null,
            name: pickName(properties),
            highway: properties.highway || null,
            lanes: properties.lanes || null,
            maxspeed: properties.maxspeed || null,
            oneway: properties.oneway ?? null,
            ref: properties.ref || null,
            length: properties.length || null,
        };
    }

    return {
        id: properties.id ?? properties.fid ?? null,
        name: pickName(properties),
        amenity: properties.amenity || null,
        education: properties.education || null,
        healthcare: properties.healthcare || null,
        building: properties.building || null,
        operator: properties.operator || null,
        website: properties.website || properties["contact:website"] || null,
    };
};

const trimFeatures = (datasetName, features = [], maxFeatures) => {
    if (features.length <= maxFeatures) return features;

    if (datasetName === "pois") {
        return features
            .sort((left, right) => Number(Boolean(right.properties?.name)) - Number(Boolean(left.properties?.name)))
            .slice(0, maxFeatures);
    }

    if (datasetName === "drive") {
        return features.slice(0, maxFeatures);
    }

    const namedFeatures = features.filter((feature) => feature.properties?.name);
    if (namedFeatures.length >= maxFeatures) {
        return namedFeatures.slice(0, maxFeatures);
    }

    const remaining = maxFeatures - namedFeatures.length;
    const unnamedFeatures = features.filter((feature) => !feature.properties?.name);
    return [...namedFeatures, ...unnamedFeatures.slice(0, remaining)];
};

const buildOgrCommand = ({ datasetName, bbox, zoom }) => {
    const dataset = datasetConfigs[datasetName];
    const tolerance = getSimplifyTolerance(datasetName, zoom);
    const args = [
        "-f",
        "GeoJSON",
        "/vsistdout/",
        dataset.path,
        dataset.layer,
        "-spat",
        String(bbox.west),
        String(bbox.south),
        String(bbox.east),
        String(bbox.north),
        "-t_srs",
        "EPSG:4326",
        "-skipfailures",
    ];

    if (tolerance > 0) {
        args.push("-simplify", String(tolerance));
    }

    return args;
};

const fetchDataset = async ({ datasetName, bbox, zoom }) => {
    const dataset = datasetConfigs[datasetName];
    if (!dataset) throw new Error(`Unknown dataset ${datasetName}`);

    if (!existsSync(dataset.path)) {
        throw new Error(`Dataset file not found: ${dataset.path}`);
    }

    if (Number.isFinite(zoom) && zoom < dataset.minZoom) {
        return {
            ...emptyCollection(),
            meta: { dataset: datasetName, minZoom: dataset.minZoom, skipped: true, reason: "zoom-too-low" },
        };
    }

    const roundedBbox = roundBbox(bbox);
    const cacheKey = `${datasetName}:${zoom}:${roundedBbox.west},${roundedBbox.south},${roundedBbox.east},${roundedBbox.north}`;
    const cached = responseCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.payload;
    }

    const { stdout, stderr } = await execFileAsync("ogr2ogr", buildOgrCommand({ datasetName, bbox: roundedBbox, zoom }), {
        maxBuffer: 64 * 1024 * 1024,
    });

    if (stderr?.trim()) {
        console.warn(`[offline-detail] ogr2ogr ${datasetName}: ${stderr.trim()}`);
    }

    const sourceCollection = stdout ? JSON.parse(stdout) : emptyCollection();
    const normalizedFeatures = (sourceCollection.features || []).map((feature) => ({
        type: "Feature",
        geometry: feature.geometry,
        properties: normalizeProperties(datasetName, feature.properties || {}),
    }));

    const features = trimFeatures(datasetName, normalizedFeatures, dataset.maxFeatures);
    const payload = {
        type: "FeatureCollection",
        features,
        meta: {
            dataset: datasetName,
            requestedZoom: zoom,
            featureCount: features.length,
            sourceFeatureCount: normalizedFeatures.length,
            bbox: roundedBbox,
            datasetPath: dataset.path,
            datasetUpdatedAt: getPathStat(dataset.path)?.updatedAt ?? null,
        },
    };

    responseCache.set(cacheKey, {
        payload,
        expiresAt: Date.now() + cacheTtlMs,
    });

    return payload;
};

const requestHandler = async (request, response) => {
    if (!request.url) {
        writeJson(response, 400, { error: "Missing request URL" });
        return;
    }

    if (request.method === "OPTIONS") {
        writeJson(response, 204, {});
        return;
    }

    if (request.method !== "GET") {
        writeJson(response, 405, { error: "Method not allowed" });
        return;
    }

    const url = new URL(request.url, `http://${host}:${port}`);

    if (url.pathname === "/health") {
        writeJson(response, 200, { ok: true });
        return;
    }

    if (url.pathname === "/meta") {
        writeJson(response, 200, {
            ok: true,
            datasets: datasetConfigs,
            snapshots: getSnapshotMetadata(),
        });
        return;
    }

    if (url.pathname !== "/buildings" && url.pathname !== "/pois" && url.pathname !== "/drive") {
        writeJson(response, 404, { error: "Not found" });
        return;
    }

    const bbox = parseBbox(url.searchParams.get("bbox"));
    if (!bbox) {
        writeJson(response, 400, { error: "bbox must be west,south,east,north" });
        return;
    }

    const zoom = Number(url.searchParams.get("zoom"));

    try {
        const payload = await fetchDataset({
            datasetName: url.pathname.slice(1),
            bbox,
            zoom,
        });
        writeJson(response, 200, payload);
    } catch (error) {
        writeJson(response, 500, {
            error: error.message,
            snapshots: getSnapshotMetadata(),
        });
    }
};

const server = createServer((request, response) => {
    requestHandler(request, response).catch((error) => {
        writeJson(response, 500, { error: error.message });
    });
});

server.listen(port, host, () => {
    console.log(`Offline detail server: http://${host}:${port}`);
    console.log(`Buildings: ${datasetConfigs.buildings.path}`);
    console.log(`POIs: ${datasetConfigs.pois.path}`);
    console.log(`Drive graph: ${datasetConfigs.drive.path}`);
});

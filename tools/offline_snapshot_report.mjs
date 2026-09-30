import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

const rootDir = resolve(new URL("..", import.meta.url).pathname);

const files = [
    {
        label: "Basemap MBTiles",
        path: process.env.OFFLINE_BASEMAP_MBTILES || "/home/tung/osm-offline-server/tiles/vietnam.mbtiles",
    },
    {
        label: "Buildings GPKG",
        path: process.env.OFFLINE_BUILDINGS_GPKG || "/home/tung/osm_python/hanoi_buildings.gpkg",
    },
    {
        label: "POIs GPKG",
        path: process.env.OFFLINE_POIS_GPKG || "/home/tung/osm_python/hanoi_pois.gpkg",
    },
    {
        label: "Drive GPKG",
        path: process.env.OFFLINE_DRIVE_GPKG || "/home/tung/osm_python/hoankiem_drive.gpkg",
    },
    {
        label: "Routing GeoJSON",
        path: process.env.OFFLINE_ROUTE_GEOJSON || resolve(rootDir, "data", "offline_roads.geojson"),
    },
];

const formatSize = (sizeBytes) => {
    if (sizeBytes < 1024) return `${sizeBytes} B`;
    if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
    if (sizeBytes < 1024 * 1024 * 1024) return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(sizeBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

console.log("Offline snapshot report");

for (const file of files) {
    if (!existsSync(file.path)) {
        console.log(`- ${file.label}: missing`);
        console.log(`  path: ${file.path}`);
        continue;
    }

    const stat = statSync(file.path);
    console.log(`- ${file.label}: ${formatSize(stat.size)}`);
    console.log(`  path: ${file.path}`);
    console.log(`  updated: ${stat.mtime.toISOString()}`);
}

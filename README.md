# HMI Offline Map

## Run

Terminal 1: offline tileserver

```bash
cd /home/tung/osm-offline-server
docker run -d --name tileserver-gl -v "$(pwd)/tiles:/data" -p 8080:8080 maptiler/tileserver-gl
```

Terminal 2: offline router

```bash
cd /home/tung/hmi-project
python tools/offline_route_server.py --roads /home/tung/osm_python/hoankiem_drive.gpkg --roads-layer edges --host 127.0.0.1 --port 5000
```

Terminal 3: frontend + offline detail server

```bash
cd /home/tung/hmi-project
npm run dev
```

`npm run dev` now starts:
- Vite frontend
- local launcher server
- offline detail server for building and POI overlays

The offline detail server starts automatically when these files exist:
- `/home/tung/osm_python/hanoi_buildings.gpkg`
- `/home/tung/osm_python/hanoi_pois.gpkg`

## Offline Detail Layers

When `OSM Offline` is selected, the map now loads extra local detail by bbox:
- drive network from `hoankiem_drive.gpkg`
- buildings from `hanoi_buildings.gpkg`
- POIs from `hanoi_pois.gpkg`

Loading rules:
- drive network starts at zoom `15`
- buildings start at zoom `16`
- POIs start at zoom `15`
- only the current map area is requested

Frontend config is in [.env.example](./.env.example):

```env
VITE_OFFLINE_TILE_URL=http://127.0.0.1:8080/styles/basic-preview/{z}/{x}/{y}.png
VITE_OFFLINE_DETAIL_URL=http://127.0.0.1:5002
VITE_OFFLINE_DETAIL_DRIVE_MIN_ZOOM=15
VITE_OFFLINE_DETAIL_BUILDINGS_MIN_ZOOM=16
VITE_OFFLINE_DETAIL_POIS_MIN_ZOOM=15
VITE_OSRM_URLS=http://127.0.0.1:5000,https://router.project-osrm.org
```

Optional local overrides for the detail server:

```bash
export OFFLINE_BUILDINGS_GPKG=/path/to/buildings.gpkg
export OFFLINE_POIS_GPKG=/path/to/pois.gpkg
export OFFLINE_DRIVE_GPKG=/path/to/hoankiem_drive.gpkg
export OFFLINE_BASEMAP_MBTILES=/path/to/tiles.mbtiles
export OFFLINE_ROUTE_GEOJSON=/path/to/offline_roads.geojson
```

Then run:

```bash
npm run dev
```

## Snapshot Check

To inspect which local files are currently being used and when they were last updated:

```bash
cd /home/tung/hmi-project
npm run offline:snapshot
```

This reports the timestamps of:
- offline basemap MBTiles
- building GeoPackage
- POI GeoPackage
- drive GeoPackage
- routing GeoJSON

If these timestamps are far apart, your offline basemap, overlays, and route graph may not line up perfectly.

## Smarter Offline Routing

The local route server now supports:
- GeoJSON road lines
- GeoPackage routing graphs such as `hoankiem_drive.gpkg`
- snapping start/target to the nearest road edge instead of the nearest node
- weighted route cost by road class

Recommended command for Hoan Kiem routing:

```bash
cd /home/tung/hmi-project
python tools/offline_route_server.py --roads /home/tung/osm_python/hoankiem_drive.gpkg --roads-layer edges --host 127.0.0.1 --port 5000
```

Health check:

```bash
curl -s http://127.0.0.1:5000/health
```

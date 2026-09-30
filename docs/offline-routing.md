# Offline Routing

The map can display offline base layers, but road routing also needs offline road
topology. Image tiles alone are not enough to calculate a route.

## Small Area Router

For a small robot operating area, use the included Python route server:

```powershell
python tools\offline_route_server.py --roads data\offline_roads.geojson --host 127.0.0.1 --port 5000
```

For a smarter route on the Hoan Kiem graph, use the GeoPackage road network:

```powershell
python tools\offline_route_server.py --roads /home/tung/osm_python/hoankiem_drive.gpkg --roads-layer edges --host 127.0.0.1 --port 5000
```

On Windows you can also run:

```powershell
powershell -ExecutionPolicy Bypass -File tools\start_offline_route_server.ps1
```

Health check:

```text
http://127.0.0.1:5000/health
```

The React app tries `http://127.0.0.1:5000` before the public OSRM server, so
offline routing works when this server is running and the selected road source
contains road data.

## Create Road Data From OSM

Run this once while the computer still has internet:

```powershell
python tools\download_osm_roads.py --map-config src\Config\mapConfig.js --output data\offline_roads.geojson
```

If Python reports an SSL certificate error, use the HTTP Overpass endpoint:

```powershell
python tools\download_osm_roads.py --map-config src\Config\mapConfig.js --output data\offline_roads.geojson --overpass-url http://overpass-api.de/api/interpreter
```

Then restart the route server. The server only loads `offline_roads.geojson` at
startup.

## Road Data Format

`data/offline_roads.geojson` must be a GeoJSON `FeatureCollection` containing
road `LineString` or `MultiLineString` features. Coordinates are `[longitude, latitude]`.

The router also supports GeoPackage inputs such as `hoankiem_drive.gpkg` when
you pass `--roads-layer edges`.

Intersections must share the same coordinate in the GeoJSON. If two lines cross
visually but do not share a coordinate, the router cannot turn between them.

The upgraded offline router snaps start and target points to the nearest road
edge rather than the nearest road node, and applies a weighted cost by highway
class. This usually produces more stable results than the previous raw-node
approach, especially when using an OSMnx road graph exported to GeoPackage.

## Larger Maps

For larger areas, run a real local router such as OSRM, Valhalla, or GraphHopper
with an offline OSM extract, then set:

```env
VITE_OSRM_URLS=http://127.0.0.1:5000
```

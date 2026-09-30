#!/usr/bin/env python3
import argparse
import json
import re
import urllib.parse
import urllib.request
from pathlib import Path


OVERPASS_URL = "http://overpass-api.de/api/interpreter"
DEFAULT_MAP_CONFIG = "src/Config/mapConfig.js"
DEFAULT_OUTPUT = "data/offline_osm_map.geojson"


def read_map_config_bbox(path):
    text = Path(path).read_text(encoding="utf-8")
    values = {}

    for key in ("latTop", "latBottom", "lonLeft", "lonRight"):
        match = re.search(rf"{key}\s*:\s*([-+]?\d+(?:\.\d+)?)", text)
        if not match:
            raise ValueError(f"Cannot find {key} in {path}")
        values[key] = float(match.group(1))

    return (
        min(values["latTop"], values["latBottom"]),
        min(values["lonLeft"], values["lonRight"]),
        max(values["latTop"], values["latBottom"]),
        max(values["lonLeft"], values["lonRight"]),
    )


def expand_bbox(bbox, padding):
    south, west, north, east = bbox
    return south - padding, west - padding, north + padding, east + padding


def build_query(bbox):
    south, west, north, east = bbox
    return f"""
[out:json][timeout:90];
(
  way["highway"]({south},{west},{north},{east});
  way["building"]({south},{west},{north},{east});
  way["landuse"]({south},{west},{north},{east});
  way["natural"]({south},{west},{north},{east});
  way["leisure"]({south},{west},{north},{east});
  way["amenity"]({south},{west},{north},{east});
  way["waterway"]({south},{west},{north},{east});
);
out tags geom;
"""


def download_overpass(query, overpass_url):
    payload = urllib.parse.urlencode({"data": query}).encode("utf-8")
    request = urllib.request.Request(overpass_url, data=payload, headers={"User-Agent": "hmi-offline-map-renderer/1.0"})

    with urllib.request.urlopen(request, timeout=120) as response:
        return json.loads(response.read().decode("utf-8"))


def get_coordinates(way):
    coordinates = []
    for point in way.get("geometry") or []:
        if "lon" in point and "lat" in point:
            coordinates.append([point["lon"], point["lat"]])
    return coordinates


def is_closed(coordinates):
    return len(coordinates) >= 4 and coordinates[0] == coordinates[-1]


def feature_kind(tags):
    if "building" in tags:
        return "building"
    if tags.get("natural") in {"water", "bay"} or "water" in tags:
        return "water"
    if "waterway" in tags:
        return "waterway"
    if tags.get("leisure") in {"park", "garden", "pitch", "playground"}:
        return "green"
    if tags.get("natural") in {"wood", "grassland", "scrub", "tree_row"}:
        return "green"
    if tags.get("landuse") in {"grass", "forest", "meadow", "recreation_ground", "cemetery"}:
        return "green"
    if "landuse" in tags:
        return "landuse"
    if "amenity" in tags and is_closed:
        return "amenity"
    if "highway" in tags:
        return "road"
    return "other"


def way_to_feature(way):
    tags = way.get("tags", {})
    coordinates = get_coordinates(way)

    if len(coordinates) < 2:
        return None

    kind = feature_kind(tags)
    geometry_type = "Polygon" if kind != "road" and kind != "waterway" and is_closed(coordinates) else "LineString"
    geometry_coordinates = [coordinates] if geometry_type == "Polygon" else coordinates

    return {
        "type": "Feature",
        "properties": {
            "id": way.get("id"),
            "kind": kind,
            "name": tags.get("name"),
            "highway": tags.get("highway"),
            "landuse": tags.get("landuse"),
            "natural": tags.get("natural"),
            "leisure": tags.get("leisure"),
            "amenity": tags.get("amenity"),
            "building": tags.get("building"),
            "waterway": tags.get("waterway"),
        },
        "geometry": {
            "type": geometry_type,
            "coordinates": geometry_coordinates,
        },
    }


def overpass_to_geojson(data):
    features = []

    for element in data.get("elements", []):
        if element.get("type") != "way":
            continue

        feature = way_to_feature(element)
        if feature:
            features.append(feature)

    return {"type": "FeatureCollection", "features": features}


def main():
    parser = argparse.ArgumentParser(description="Download OSM features for local OSM-style raster tile generation.")
    parser.add_argument("--map-config", default=DEFAULT_MAP_CONFIG)
    parser.add_argument("--padding", type=float, default=0.001)
    parser.add_argument("--output", default=DEFAULT_OUTPUT)
    parser.add_argument("--overpass-url", default=OVERPASS_URL)
    args = parser.parse_args()

    bbox = expand_bbox(read_map_config_bbox(args.map_config), args.padding)
    print(f"Downloading OSM map data for bbox south,west,north,east={bbox}")

    data = download_overpass(build_query(bbox), args.overpass_url)
    geojson = overpass_to_geojson(data)

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(geojson, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Wrote {len(geojson['features'])} features to {output_path.resolve()}")


if __name__ == "__main__":
    main()

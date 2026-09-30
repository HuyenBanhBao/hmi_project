#!/usr/bin/env python3
import argparse
import json
import re
import urllib.parse
import urllib.request
from pathlib import Path


OVERPASS_URL = "https://overpass-api.de/api/interpreter"
DEFAULT_MAP_CONFIG = "src/Config/mapConfig.js"
DEFAULT_OUTPUT = "data/offline_roads.geojson"
SKIP_HIGHWAYS = {"construction", "proposed", "raceway"}


def read_map_config_bbox(path):
    text = Path(path).read_text(encoding="utf-8")

    values = {}
    for key in ("latTop", "latBottom", "lonLeft", "lonRight"):
        match = re.search(rf"{key}\s*:\s*([-+]?\d+(?:\.\d+)?)", text)
        if not match:
            raise ValueError(f"Cannot find {key} in {path}")
        values[key] = float(match.group(1))

    south = min(values["latTop"], values["latBottom"])
    north = max(values["latTop"], values["latBottom"])
    west = min(values["lonLeft"], values["lonRight"])
    east = max(values["lonLeft"], values["lonRight"])
    return south, west, north, east


def parse_bbox(value):
    parts = [float(part.strip()) for part in value.split(",")]
    if len(parts) != 4:
        raise ValueError("bbox must be south,west,north,east")
    south, west, north, east = parts
    return min(south, north), min(west, east), max(south, north), max(west, east)


def expand_bbox(bbox, padding):
    south, west, north, east = bbox
    return south - padding, west - padding, north + padding, east + padding


def build_query(bbox):
    south, west, north, east = bbox
    return f"""
[out:json][timeout:60];
(
  way["highway"]({south},{west},{north},{east});
);
out tags geom;
"""


def download_overpass(query, overpass_url):
    payload = urllib.parse.urlencode({"data": query}).encode("utf-8")
    request = urllib.request.Request(overpass_url, data=payload, headers={"User-Agent": "hmi-offline-router/1.0"})

    with urllib.request.urlopen(request, timeout=90) as response:
        return json.loads(response.read().decode("utf-8"))


def way_to_feature(way):
    tags = way.get("tags", {})
    highway = tags.get("highway")

    if highway in SKIP_HIGHWAYS:
        return None

    geometry = way.get("geometry") or []
    coordinates = [[point["lon"], point["lat"]] for point in geometry if "lon" in point and "lat" in point]

    if len(coordinates) < 2:
        return None

    return {
        "type": "Feature",
        "properties": {
            "id": way.get("id"),
            "name": tags.get("name"),
            "highway": highway,
            "oneway": tags.get("oneway"),
        },
        "geometry": {
            "type": "LineString",
            "coordinates": coordinates,
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

    return {
        "type": "FeatureCollection",
        "features": features,
    }


def main():
    parser = argparse.ArgumentParser(description="Download OSM roads into data/offline_roads.geojson for offline routing.")
    parser.add_argument("--bbox", help="south,west,north,east. Defaults to bbox from src/Config/mapConfig.js.")
    parser.add_argument("--map-config", default=DEFAULT_MAP_CONFIG)
    parser.add_argument("--padding", type=float, default=0.001, help="Expand bbox by this many degrees.")
    parser.add_argument("--output", default=DEFAULT_OUTPUT)
    parser.add_argument("--overpass-url", default=OVERPASS_URL)
    args = parser.parse_args()

    bbox = parse_bbox(args.bbox) if args.bbox else read_map_config_bbox(args.map_config)
    bbox = expand_bbox(bbox, args.padding)
    query = build_query(bbox)

    print(f"Downloading OSM roads for bbox south,west,north,east={bbox}")
    data = download_overpass(query, args.overpass_url)
    geojson = overpass_to_geojson(data)

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(geojson, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Wrote {len(geojson['features'])} road features to {output_path.resolve()}")


if __name__ == "__main__":
    main()

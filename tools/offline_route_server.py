#!/usr/bin/env python3
import argparse
import heapq
import json
import math
import subprocess
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse


EARTH_RADIUS_M = 6371008.8
DEFAULT_SPEED_KMH = 4.0
DEFAULT_SNAP_MAX_M = 80.0
HIGHWAY_COST_FACTORS = {
    "motorway": 1.7,
    "motorway_link": 1.6,
    "trunk": 1.55,
    "trunk_link": 1.45,
    "primary": 1.35,
    "primary_link": 1.25,
    "secondary": 1.08,
    "secondary_link": 1.02,
    "tertiary": 1.0,
    "tertiary_link": 1.0,
    "unclassified": 1.0,
    "residential": 1.0,
    "living_street": 1.1,
    "pedestrian": 1.2,
    "service": 1.28,
    "track": 1.45,
    "path": 1.55,
    "footway": 1.7,
    "steps": 2.1,
}


def haversine_m(a, b):
    lon1, lat1 = map(math.radians, a)
    lon2, lat2 = map(math.radians, b)
    d_lon = lon2 - lon1
    d_lat = lat2 - lat1
    value = math.sin(d_lat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(d_lon / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(value))


def node_key(coord):
    return (round(float(coord[0]), 7), round(float(coord[1]), 7))


def is_valid_coord(coord):
    return isinstance(coord, list) and len(coord) >= 2 and isinstance(coord[0], (int, float)) and isinstance(coord[1], (int, float))


def coords_equal(a, b):
    return abs(a[0] - b[0]) < 1e-9 and abs(a[1] - b[1]) < 1e-9


def get_oneway(properties):
    value = str((properties or {}).get("oneway", "")).lower()
    if value in {"yes", "true", "1"}:
        return "forward"
    if value in {"-1", "reverse"}:
        return "reverse"
    return "both"


def iter_lines(geometry):
    if not geometry:
        return

    geometry_type = geometry.get("type")
    coordinates = geometry.get("coordinates") or []

    if geometry_type == "LineString":
        yield coordinates
    elif geometry_type == "MultiLineString":
        yield from coordinates


def dedupe_coords(coords):
    result = []
    for coord in coords:
        coord_tuple = (float(coord[0]), float(coord[1]))
        if result and coords_equal(result[-1], coord_tuple):
            continue
        result.append(coord_tuple)
    return result


def merge_path_coords(*parts):
    merged = []
    for part in parts:
        for coord in part or []:
            coord_tuple = (float(coord[0]), float(coord[1]))
            if merged and coords_equal(merged[-1], coord_tuple):
                continue
            merged.append(coord_tuple)
    return merged


def build_cumulative_distances(line):
    distances = [0.0]
    total = 0.0

    for start, end in zip(line, line[1:]):
        total += haversine_m(start, end)
        distances.append(total)

    return distances


def get_highway_value(properties):
    value = (properties or {}).get("highway")
    if isinstance(value, list):
        return str(value[0]).lower() if value else ""
    return str(value).lower() if value is not None else ""


def get_cost_factor(properties):
    highway = get_highway_value(properties)
    return HIGHWAY_COST_FACTORS.get(highway, 1.0)


def to_local_xy(coord, ref_lat):
    scale = math.cos(math.radians(ref_lat))
    return (
        math.radians(coord[0]) * EARTH_RADIUS_M * scale,
        math.radians(coord[1]) * EARTH_RADIUS_M,
    )


def from_local_xy(x, y, ref_lat):
    scale = math.cos(math.radians(ref_lat))
    if abs(scale) < 1e-12:
        scale = 1e-12
    return (
        math.degrees(x / (EARTH_RADIUS_M * scale)),
        math.degrees(y / EARTH_RADIUS_M),
    )


def nearest_point_on_segment(coord, start, end):
    ref_lat = coord[1]
    px, py = to_local_xy(coord, ref_lat)
    sx, sy = to_local_xy(start, ref_lat)
    ex, ey = to_local_xy(end, ref_lat)
    dx = ex - sx
    dy = ey - sy
    length_sq = dx * dx + dy * dy

    if length_sq <= 1e-12:
        return start, haversine_m(coord, start), 0.0

    ratio = ((px - sx) * dx + (py - sy) * dy) / length_sq
    ratio = max(0.0, min(1.0, ratio))
    proj_x = sx + ratio * dx
    proj_y = sy + ratio * dy
    projected = from_local_xy(proj_x, proj_y, ref_lat)
    distance = math.hypot(px - proj_x, py - proj_y)
    return projected, distance, ratio


def interpolate_line_point(line, cumulative, offset):
    if offset <= 0:
        return line[0], 0

    total = cumulative[-1]
    if offset >= total:
        return line[-1], len(line) - 2 if len(line) >= 2 else 0

    for index in range(len(line) - 1):
        start_distance = cumulative[index]
        end_distance = cumulative[index + 1]
        if offset <= end_distance + 1e-9:
            segment_length = end_distance - start_distance
            if segment_length <= 1e-9:
                return line[index], index

            ratio = (offset - start_distance) / segment_length
            start = line[index]
            end = line[index + 1]
            return (
                (
                    start[0] + (end[0] - start[0]) * ratio,
                    start[1] + (end[1] - start[1]) * ratio,
                ),
                index,
            )

    return line[-1], len(line) - 2 if len(line) >= 2 else 0


def slice_line_between_offsets(line, cumulative, start_offset, end_offset):
    if abs(start_offset - end_offset) <= 1e-6:
        point, _ = interpolate_line_point(line, cumulative, start_offset)
        return [point]

    if start_offset > end_offset:
        return list(reversed(slice_line_between_offsets(line, cumulative, end_offset, start_offset)))

    start_point, start_index = interpolate_line_point(line, cumulative, start_offset)
    end_point, end_index = interpolate_line_point(line, cumulative, end_offset)
    points = [start_point]

    for index in range(start_index + 1, end_index + 1):
        points.append(line[index])

    if not coords_equal(points[-1], end_point):
        points.append(end_point)

    return dedupe_coords(points)


def load_gpkg_features(path, layer_name=None):
    gpkg_layer = layer_name or "edges"
    result = subprocess.run(
        ["ogr2ogr", "-f", "GeoJSON", "/vsistdout/", str(path), gpkg_layer],
        check=True,
        capture_output=True,
        text=True,
    )

    if result.stderr.strip():
        print(result.stderr.strip())

    data = json.loads(result.stdout)
    return data.get("features", []) if data.get("type") == "FeatureCollection" else [data]


class RoadGraph:
    def __init__(self, roads_path, layer_name=None, snap_max_m=DEFAULT_SNAP_MAX_M, speed_kmh=DEFAULT_SPEED_KMH):
        self.roads_path = Path(roads_path)
        self.layer_name = layer_name
        self.snap_max_m = float(snap_max_m)
        self.speed_mps = float(speed_kmh) * 1000 / 3600
        self.nodes = {}
        self.graph = {}
        self.edge_count = 0
        self.base_edges = []
        self.load()

    def load(self):
        self.nodes.clear()
        self.graph.clear()
        self.edge_count = 0
        self.base_edges = []

        if not self.roads_path.exists():
            return

        if self.roads_path.suffix.lower() == ".gpkg":
            features = load_gpkg_features(self.roads_path, self.layer_name)
        else:
            data = json.loads(self.roads_path.read_text(encoding="utf-8"))
            features = data.get("features", []) if data.get("type") == "FeatureCollection" else [data]

        for feature in features:
            geometry = feature.get("geometry") if feature.get("type") == "Feature" else feature
            properties = feature.get("properties", {}) if feature.get("type") == "Feature" else {}
            oneway = get_oneway(properties)
            has_graph_edge_metadata = properties.get("u") is not None or properties.get("from") is not None

            for line in iter_lines(geometry):
                clean_line = dedupe_coords([coord for coord in line if is_valid_coord(coord)])
                if len(clean_line) < 2:
                    continue

                if has_graph_edge_metadata:
                    self.add_base_edge(clean_line, properties, oneway)
                    continue

                for start, end in zip(clean_line, clean_line[1:]):
                    self.add_base_edge([start, end], properties, oneway)

    def add_base_edge(self, line, properties, oneway):
        start = node_key(line[0])
        end = node_key(line[-1])
        if start == end:
            return

        cumulative = build_cumulative_distances(line)
        distance = cumulative[-1]
        if distance <= 0:
            return

        forward_allowed = oneway in {"both", "forward"}
        backward_allowed = oneway in {"both", "reverse"}
        cost_factor = get_cost_factor(properties)
        edge = {
            "id": len(self.base_edges),
            "start": start,
            "end": end,
            "coords": line,
            "cumulative": cumulative,
            "distance": distance,
            "cost_factor": cost_factor,
            "forward": forward_allowed,
            "backward": backward_allowed,
            "highway": get_highway_value(properties),
            "name": (properties or {}).get("name"),
        }

        self.base_edges.append(edge)
        self.nodes[start] = start
        self.nodes[end] = end
        self.graph.setdefault(start, [])
        self.graph.setdefault(end, [])

        if forward_allowed:
            self.graph[start].append(
                {
                    "to": end,
                    "cost": distance * cost_factor,
                    "distance": distance,
                    "coords": line,
                    "edge_id": edge["id"],
                }
            )
            self.edge_count += 1

        if backward_allowed:
            self.graph[end].append(
                {
                    "to": start,
                    "cost": distance * cost_factor,
                    "distance": distance,
                    "coords": list(reversed(line)),
                    "edge_id": edge["id"],
                }
            )
            self.edge_count += 1

    def nearest_edge(self, coord):
        best_edge = None
        best_distance = float("inf")
        best_offset = 0.0
        best_point = None

        for edge in self.base_edges:
            cumulative = edge["cumulative"]
            for index, (start, end) in enumerate(zip(edge["coords"], edge["coords"][1:])):
                projected, distance, ratio = nearest_point_on_segment(coord, start, end)
                if distance >= best_distance:
                    continue

                segment_length = cumulative[index + 1] - cumulative[index]
                best_edge = edge
                best_distance = distance
                best_point = projected
                best_offset = cumulative[index] + segment_length * ratio

        if best_edge is None or best_distance > self.snap_max_m:
            return None, best_distance

        return {
            "edge": best_edge,
            "point": best_point,
            "offset": best_offset,
            "distance_to_edge": best_distance,
        }, best_distance

    def build_start_candidates(self, snapped):
        edge = snapped["edge"]
        offset = snapped["offset"]
        distance_to_start = offset
        distance_to_end = max(0.0, edge["distance"] - offset)
        candidates = []

        if edge["backward"]:
            candidates.append(
                {
                    "node": edge["start"],
                    "distance": distance_to_start,
                    "cost": distance_to_start * edge["cost_factor"],
                    "coords": slice_line_between_offsets(edge["coords"], edge["cumulative"], offset, 0.0),
                }
            )

        if edge["forward"]:
            candidates.append(
                {
                    "node": edge["end"],
                    "distance": distance_to_end,
                    "cost": distance_to_end * edge["cost_factor"],
                    "coords": slice_line_between_offsets(edge["coords"], edge["cumulative"], offset, edge["distance"]),
                }
            )

        return candidates

    def build_goal_candidates(self, snapped):
        edge = snapped["edge"]
        offset = snapped["offset"]
        distance_from_start = offset
        distance_from_end = max(0.0, edge["distance"] - offset)
        candidates = []

        if edge["forward"]:
            candidates.append(
                {
                    "node": edge["start"],
                    "distance": distance_from_start,
                    "cost": distance_from_start * edge["cost_factor"],
                    "coords": slice_line_between_offsets(edge["coords"], edge["cumulative"], 0.0, offset),
                }
            )

        if edge["backward"]:
            candidates.append(
                {
                    "node": edge["end"],
                    "distance": distance_from_end,
                    "cost": distance_from_end * edge["cost_factor"],
                    "coords": slice_line_between_offsets(edge["coords"], edge["cumulative"], edge["distance"], offset),
                }
            )

        return candidates

    def direct_same_edge_route(self, start_snap, goal_snap):
        if start_snap["edge"]["id"] != goal_snap["edge"]["id"]:
            return None

        edge = start_snap["edge"]
        start_offset = start_snap["offset"]
        goal_offset = goal_snap["offset"]

        if start_offset <= goal_offset and edge["forward"]:
            coords = slice_line_between_offsets(edge["coords"], edge["cumulative"], start_offset, goal_offset)
        elif start_offset >= goal_offset and edge["backward"]:
            coords = slice_line_between_offsets(edge["coords"], edge["cumulative"], start_offset, goal_offset)
        else:
            return None

        distance = abs(goal_offset - start_offset)
        return {
            "coords": coords,
            "distance": distance,
            "cost": distance * edge["cost_factor"],
        }

    def route(self, coordinates):
        if len(coordinates) < 2:
            raise ValueError("Need at least two coordinates")

        full_path = []
        total_distance = 0.0
        total_cost = 0.0

        for start_coord, goal_coord in zip(coordinates, coordinates[1:]):
            start_snap, _ = self.nearest_edge(start_coord)
            if start_snap is None:
                raise LookupError(f"No road edge within {self.snap_max_m:g} m of {start_coord[0]},{start_coord[1]}")

            goal_snap, _ = self.nearest_edge(goal_coord)
            if goal_snap is None:
                raise LookupError(f"No road edge within {self.snap_max_m:g} m of {goal_coord[0]},{goal_coord[1]}")

            candidate_routes = []
            direct_route = self.direct_same_edge_route(start_snap, goal_snap)
            if direct_route:
                candidate_routes.append(direct_route)

            for start_candidate in self.build_start_candidates(start_snap):
                for goal_candidate in self.build_goal_candidates(goal_snap):
                    graph_result = self.astar(start_candidate["node"], goal_candidate["node"])
                    if graph_result is None:
                        continue

                    candidate_routes.append(
                        {
                            "coords": merge_path_coords(
                                start_candidate["coords"],
                                graph_result["coords"],
                                goal_candidate["coords"],
                            ),
                            "distance": start_candidate["distance"] + graph_result["distance"] + goal_candidate["distance"],
                            "cost": start_candidate["cost"] + graph_result["cost"] + goal_candidate["cost"],
                        }
                    )

            if not candidate_routes:
                raise LookupError("No route between snapped road edges")

            best_route = min(candidate_routes, key=lambda route: route["cost"])
            full_path = merge_path_coords(full_path, best_route["coords"])
            total_distance += best_route["distance"]
            total_cost += best_route["cost"]

        return {
            "path": [[point[0], point[1]] for point in full_path],
            "distance": total_distance,
            "duration": total_distance / self.speed_mps if self.speed_mps > 0 else total_distance,
            "weight": total_cost,
        }

    def astar(self, start, goal):
        if start == goal:
            return {
                "coords": [start],
                "distance": 0.0,
                "cost": 0.0,
            }

        queue = [(haversine_m(start, goal), 0.0, start)]
        came_from = {}
        edge_from = {}
        cost_so_far = {start: 0.0}
        distance_so_far = {start: 0.0}

        while queue:
            _, current_cost, current = heapq.heappop(queue)

            if current == goal:
                return self.reconstruct_path(came_from, edge_from, distance_so_far[goal], cost_so_far[goal], start, goal)

            if current_cost > cost_so_far.get(current, float("inf")) + 1e-9:
                continue

            for edge in self.graph.get(current, []):
                neighbor = edge["to"]
                new_cost = current_cost + edge["cost"]
                if neighbor not in cost_so_far or new_cost < cost_so_far[neighbor] - 1e-9:
                    cost_so_far[neighbor] = new_cost
                    distance_so_far[neighbor] = distance_so_far[current] + edge["distance"]
                    came_from[neighbor] = current
                    edge_from[neighbor] = edge
                    priority = new_cost + haversine_m(neighbor, goal)
                    heapq.heappush(queue, (priority, new_cost, neighbor))

        return None

    @staticmethod
    def reconstruct_path(came_from, edge_from, total_distance, total_cost, start, goal):
        current = goal
        edge_path = []

        while current != start:
            edge = edge_from.get(current)
            if edge is None:
                return None
            edge_path.append(edge)
            current = came_from[current]

        edge_path.reverse()
        coords = []
        for edge in edge_path:
            coords = merge_path_coords(coords, edge["coords"])

        return {
            "coords": coords,
            "distance": total_distance,
            "cost": total_cost,
        }

    @property
    def source_label(self):
        if self.layer_name:
            return f"{self.roads_path}#{self.layer_name}"
        return str(self.roads_path)


def parse_route_coordinates(path):
    parts = path.strip("/").split("/")
    if len(parts) < 4 or parts[0] != "route" or parts[1] != "v1":
        return None

    coord_text = unquote(parts[3])
    coordinates = []
    for item in coord_text.split(";"):
        lon_lat = item.split(",")
        if len(lon_lat) < 2:
            raise ValueError("Invalid coordinate pair")
        coordinates.append((float(lon_lat[0]), float(lon_lat[1])))

    return coordinates


def make_response(route):
    return {
        "code": "Ok",
        "routes": [
            {
                "geometry": {
                    "type": "LineString",
                    "coordinates": route["path"],
                },
                "distance": route["distance"],
                "duration": route["duration"],
                "weight": route.get("weight", route["duration"]),
                "weight_name": "offline",
                "legs": [],
            }
        ],
        "waypoints": [],
    }


def make_handler(graph):
    class OfflineRouteHandler(BaseHTTPRequestHandler):
        def end_headers(self):
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            super().end_headers()

        def do_OPTIONS(self):
            self.send_response(204)
            self.end_headers()

        def do_GET(self):
            parsed = urlparse(self.path)
            route_path = parsed.path
            if parsed.params:
                route_path = f"{route_path};{parsed.params}"

            if parsed.path == "/health":
                self.write_json(
                    {
                        "status": "ok",
                        "roads": graph.source_label,
                        "nodes": len(graph.nodes),
                        "edges": graph.edge_count,
                        "base_edges": len(graph.base_edges),
                    }
                )
                return

            try:
                coordinates = parse_route_coordinates(route_path)
                if coordinates is None:
                    self.write_json({"code": "InvalidUrl", "message": "Expected /route/v1/<profile>/<lon,lat;lon,lat>"}, 404)
                    return

                if not graph.nodes:
                    self.write_json({"code": "NoData", "message": f"No road data loaded from {graph.source_label}"})
                    return

                self.write_json(make_response(graph.route(coordinates)))
            except Exception as error:
                self.write_json({"code": "NoRoute", "message": str(error)})

        def write_json(self, payload, status=200):
            body = json.dumps(payload).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, fmt, *args):
            print("%s - %s" % (self.address_string(), fmt % args))

    return OfflineRouteHandler


def main():
    parser = argparse.ArgumentParser(description="Small OSRM-compatible offline route server for HMI map tests.")
    parser.add_argument("--roads", default="data/offline_roads.geojson", help="GeoJSON or GeoPackage road network.")
    parser.add_argument("--roads-layer", default=None, help="GeoPackage layer name. Defaults to 'edges' for .gpkg inputs.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=5000)
    parser.add_argument("--snap-max-m", type=float, default=DEFAULT_SNAP_MAX_M)
    parser.add_argument("--speed-kmh", type=float, default=DEFAULT_SPEED_KMH)
    args = parser.parse_args()

    graph = RoadGraph(args.roads, layer_name=args.roads_layer, snap_max_m=args.snap_max_m, speed_kmh=args.speed_kmh)
    server = ThreadingHTTPServer((args.host, args.port), make_handler(graph))

    print(f"Offline route server: http://{args.host}:{args.port}")
    print(f"Road data: {graph.source_label}")
    print(f"Loaded nodes={len(graph.nodes)} edges={graph.edge_count} base_edges={len(graph.base_edges)}")
    server.serve_forever()


if __name__ == "__main__":
    main()

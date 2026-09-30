# Offline Routing Data

`offline_route_server.py` reads `offline_roads.geojson`.

The file must be a GeoJSON `FeatureCollection` with road features as `LineString`
or `MultiLineString` geometries. Coordinates must be `[longitude, latitude]`.

Minimal example:

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": {},
      "geometry": {
        "type": "LineString",
        "coordinates": [
          [105.8680, 21.0360],
          [105.8690, 21.0355],
          [105.8700, 21.0350]
        ]
      }
    }
  ]
}
```

Each road intersection must exist as a shared coordinate in the line data, otherwise
the router cannot turn from one road to another.

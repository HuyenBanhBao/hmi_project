Put offline XYZ raster tiles here when using the "Offline Tiles" base map.

Expected URL pattern:

```
/offline-tiles/{z}/{x}/{y}.png
```

Example file path:

```
public/offline-tiles/18/208194/116221.png
```

To generate tiles from `public/test_map_cut.jpg` and `src/Config/mapConfig.js`:

```powershell
powershell -ExecutionPolicy Bypass -File tools\generate_offline_tiles.ps1
```

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $ProjectRoot

python tools\offline_route_server.py --roads data\offline_roads.geojson --host 127.0.0.1 --port 5000

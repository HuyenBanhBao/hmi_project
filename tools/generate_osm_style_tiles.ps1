param(
    [string]$GeoJsonPath = "data\offline_osm_map.geojson",
    [string]$OutputDir = "public\offline-osm-tiles",
    [int]$MinZoom = 14,
    [int]$MaxZoom = 19,
    [double]$LatTop = 21.04006307237802,
    [double]$LatBottom = 21.03041959846335,
    [double]$LonLeft = 105.8614389947516,
    [double]$LonRight = 105.8752252346087
)

Add-Type -AssemblyName System.Drawing

function Get-TileX([double]$Lon, [int]$Zoom) {
    $n = [Math]::Pow(2, $Zoom)
    return [int][Math]::Floor((($Lon + 180.0) / 360.0) * $n)
}

function Get-TileY([double]$Lat, [int]$Zoom) {
    $n = [Math]::Pow(2, $Zoom)
    $latRad = $Lat * [Math]::PI / 180.0
    return [int][Math]::Floor((1.0 - ([Math]::Log([Math]::Tan($latRad) + (1.0 / [Math]::Cos($latRad))) / [Math]::PI)) / 2.0 * $n)
}

function Get-GlobalPixel([double]$Lon, [double]$Lat, [int]$Zoom) {
    $scale = [Math]::Pow(2, $Zoom) * 256.0
    $latRad = $Lat * [Math]::PI / 180.0
    $x = (($Lon + 180.0) / 360.0) * $scale
    $y = (1.0 - ([Math]::Log([Math]::Tan($latRad) + (1.0 / [Math]::Cos($latRad))) / [Math]::PI)) / 2.0 * $scale
    return @($x, $y)
}

function New-Color([string]$Hex) {
    return [System.Drawing.ColorTranslator]::FromHtml($Hex)
}

function New-Pen([string]$Hex, [float]$Width) {
    $pen = New-Object System.Drawing.Pen (New-Color $Hex), $Width
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    return $pen
}

function Get-PointFArray($Coordinates, [int]$Zoom, [int]$TileX, [int]$TileY) {
    $points = New-Object System.Collections.Generic.List[System.Drawing.PointF]

    foreach ($coord in $Coordinates) {
        if ($coord.Count -lt 2) { continue }
        $pixel = Get-GlobalPixel ([double]$coord[0]) ([double]$coord[1]) $Zoom
        $points.Add([System.Drawing.PointF]::new([float]($pixel[0] - ($TileX * 256)), [float]($pixel[1] - ($TileY * 256))))
    }

    return $points.ToArray()
}

function Get-LineParts($Geometry) {
    if ($Geometry.type -eq "LineString") {
        return @($Geometry.coordinates)
    }
    if ($Geometry.type -eq "MultiLineString") {
        return $Geometry.coordinates
    }
    return @()
}

function Get-PolygonRings($Geometry) {
    if ($Geometry.type -eq "Polygon") {
        return @($Geometry.coordinates[0])
    }
    if ($Geometry.type -eq "MultiPolygon") {
        $rings = @()
        foreach ($polygon in $Geometry.coordinates) {
            $rings += $polygon[0]
        }
        return $rings
    }
    return @()
}

function Get-RoadWidths([string]$Highway, [int]$Zoom) {
    $scale = [Math]::Max(0.75, ($Zoom - 13) * 0.45)

    switch ($Highway) {
        "primary" { return @(8.0 * $scale, 5.2 * $scale) }
        "secondary" { return @(7.0 * $scale, 4.6 * $scale) }
        "tertiary" { return @(6.0 * $scale, 4.0 * $scale) }
        "residential" { return @(5.0 * $scale, 3.2 * $scale) }
        "service" { return @(4.2 * $scale, 2.6 * $scale) }
        "footway" { return @(2.6 * $scale, 1.4 * $scale) }
        "path" { return @(2.6 * $scale, 1.4 * $scale) }
        default { return @(4.6 * $scale, 2.8 * $scale) }
    }
}

function Get-RoadFill([string]$Highway) {
    switch ($Highway) {
        "primary" { return "#f6d982" }
        "secondary" { return "#f7e6a7" }
        "tertiary" { return "#ffffff" }
        "residential" { return "#ffffff" }
        "service" { return "#ffffff" }
        "footway" { return "#f8f4ea" }
        "path" { return "#f8f4ea" }
        default { return "#ffffff" }
    }
}

function Draw-PolygonFeatures($Graphics, $Features, [int]$Zoom, [int]$TileX, [int]$TileY, [string]$Kind, [string]$Fill, [string]$Stroke) {
    $brush = New-Object System.Drawing.SolidBrush (New-Color $Fill)
    $pen = New-Pen $Stroke 1

    foreach ($feature in $Features) {
        if ($feature.properties.kind -ne $Kind) { continue }

        foreach ($ring in (Get-PolygonRings $feature.geometry)) {
            $points = Get-PointFArray $ring $Zoom $TileX $TileY
            if ($points.Length -lt 3) { continue }
            $Graphics.FillPolygon($brush, $points)
            $Graphics.DrawPolygon($pen, $points)
        }
    }

    $brush.Dispose()
    $pen.Dispose()
}

function Draw-RoadLayer($Graphics, $Features, [int]$Zoom, [int]$TileX, [int]$TileY, [bool]$Casing) {
    foreach ($feature in $Features) {
        if ($feature.properties.kind -ne "road") { continue }

        $highway = [string]$feature.properties.highway
        $widths = Get-RoadWidths $highway $Zoom
        $pen = if ($Casing) { New-Pen "#c9c5bc" ([float]$widths[0]) } else { New-Pen (Get-RoadFill $highway) ([float]$widths[1]) }

        foreach ($line in (Get-LineParts $feature.geometry)) {
            $points = Get-PointFArray $line $Zoom $TileX $TileY
            if ($points.Length -lt 2) { continue }
            $Graphics.DrawLines($pen, $points)
        }

        $pen.Dispose()
    }
}

function Draw-Waterways($Graphics, $Features, [int]$Zoom, [int]$TileX, [int]$TileY) {
    $pen = New-Pen "#8fc5e8" 2

    foreach ($feature in $Features) {
        if ($feature.properties.kind -ne "waterway") { continue }

        foreach ($line in (Get-LineParts $feature.geometry)) {
            $points = Get-PointFArray $line $Zoom $TileX $TileY
            if ($points.Length -lt 2) { continue }
            $Graphics.DrawLines($pen, $points)
        }
    }

    $pen.Dispose()
}

function Draw-RoadLabels($Graphics, $Features, [int]$Zoom, [int]$TileX, [int]$TileY) {
    if ($Zoom -lt 17) { return }

    $font = New-Object System.Drawing.Font "Arial", 8
    $brush = New-Object System.Drawing.SolidBrush (New-Color "#4b5563")

    foreach ($feature in $Features) {
        if ($feature.properties.kind -ne "road" -or -not $feature.properties.name) { continue }

        foreach ($line in (Get-LineParts $feature.geometry)) {
            $points = Get-PointFArray $line $Zoom $TileX $TileY
            if ($points.Length -lt 2) { continue }

            $mid = $points[[int][Math]::Floor($points.Length / 2)]
            if ($mid.X -lt -40 -or $mid.X -gt 296 -or $mid.Y -lt -20 -or $mid.Y -gt 276) { continue }
            $Graphics.DrawString([string]$feature.properties.name, $font, $brush, $mid.X + 2, $mid.Y + 2)
            break
        }
    }

    $font.Dispose()
    $brush.Dispose()
}

$features = (Get-Content -Raw -LiteralPath $GeoJsonPath | ConvertFrom-Json).features
$resolvedOutput = Join-Path (Get-Location) $OutputDir
New-Item -ItemType Directory -Force -Path $resolvedOutput | Out-Null

$generated = 0

for ($zoom = $MinZoom; $zoom -le $MaxZoom; $zoom++) {
    $minX = Get-TileX $LonLeft $zoom
    $maxX = Get-TileX $LonRight $zoom
    $minY = Get-TileY $LatTop $zoom
    $maxY = Get-TileY $LatBottom $zoom

    for ($x = $minX; $x -le $maxX; $x++) {
        for ($y = $minY; $y -le $maxY; $y++) {
            $tile = New-Object System.Drawing.Bitmap 256, 256
            $graphics = [System.Drawing.Graphics]::FromImage($tile)
            $graphics.Clear((New-Color "#f2efe9"))
            $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
            $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit

            Draw-PolygonFeatures $graphics $features $zoom $x $y "green" "#cde8c7" "#bad8b3"
            Draw-PolygonFeatures $graphics $features $zoom $x $y "landuse" "#e7dfd4" "#d7cec1"
            Draw-PolygonFeatures $graphics $features $zoom $x $y "water" "#a5cfe8" "#8fc5e8"
            Draw-PolygonFeatures $graphics $features $zoom $x $y "amenity" "#e8e4d8" "#d4cdbf"
            Draw-PolygonFeatures $graphics $features $zoom $x $y "building" "#d8c2b6" "#bba397"
            Draw-Waterways $graphics $features $zoom $x $y
            Draw-RoadLayer $graphics $features $zoom $x $y $true
            Draw-RoadLayer $graphics $features $zoom $x $y $false
            Draw-RoadLabels $graphics $features $zoom $x $y

            $tileDir = Join-Path $resolvedOutput (Join-Path $zoom $x)
            New-Item -ItemType Directory -Force -Path $tileDir | Out-Null
            $tile.Save((Join-Path $tileDir "$y.png"), [System.Drawing.Imaging.ImageFormat]::Png)

            $graphics.Dispose()
            $tile.Dispose()
            $generated++
        }
    }
}

Write-Output "Generated $generated OSM-style tiles in $resolvedOutput"

param(
    [string]$ImagePath = "public\test_map_cut.jpg",
    [string]$OutputDir = "public\offline-tiles",
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

function Get-LonFromTileX([int]$X, [int]$Zoom) {
    $n = [Math]::Pow(2, $Zoom)
    return ($X / $n) * 360.0 - 180.0
}

function Get-LatFromTileY([int]$Y, [int]$Zoom) {
    $n = [Math]::Pow(2, $Zoom)
    $mercator = [Math]::PI - (2.0 * [Math]::PI * $Y / $n)
    return [Math]::Atan([Math]::Sinh($mercator)) * 180.0 / [Math]::PI
}

function Get-SourceX([double]$Lon, [int]$Width) {
    return (($Lon - $LonLeft) / ($LonRight - $LonLeft)) * $Width
}

function Get-SourceY([double]$Lat, [int]$Height) {
    return (($LatTop - $Lat) / ($LatTop - $LatBottom)) * $Height
}

$resolvedImage = Resolve-Path -LiteralPath $ImagePath
$resolvedOutput = Join-Path (Get-Location) $OutputDir
New-Item -ItemType Directory -Force -Path $resolvedOutput | Out-Null

$source = [System.Drawing.Image]::FromFile($resolvedImage)
$tileSize = 256
$generated = 0

try {
    for ($zoom = $MinZoom; $zoom -le $MaxZoom; $zoom++) {
        $minX = Get-TileX $LonLeft $zoom
        $maxX = Get-TileX $LonRight $zoom
        $minY = Get-TileY $LatTop $zoom
        $maxY = Get-TileY $LatBottom $zoom

        for ($x = $minX; $x -le $maxX; $x++) {
            for ($y = $minY; $y -le $maxY; $y++) {
                $tileWest = Get-LonFromTileX $x $zoom
                $tileEast = Get-LonFromTileX ($x + 1) $zoom
                $tileNorth = Get-LatFromTileY $y $zoom
                $tileSouth = Get-LatFromTileY ($y + 1) $zoom

                $interWest = [Math]::Max($tileWest, $LonLeft)
                $interEast = [Math]::Min($tileEast, $LonRight)
                $interNorth = [Math]::Min($tileNorth, $LatTop)
                $interSouth = [Math]::Max($tileSouth, $LatBottom)

                if ($interWest -ge $interEast -or $interSouth -ge $interNorth) {
                    continue
                }

                $tile = New-Object System.Drawing.Bitmap $tileSize, $tileSize
                $graphics = [System.Drawing.Graphics]::FromImage($tile)
                $graphics.Clear([System.Drawing.Color]::FromArgb(229, 231, 235))
                $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
                $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality

                $srcX = Get-SourceX $interWest $source.Width
                $srcY = Get-SourceY $interNorth $source.Height
                $srcW = (Get-SourceX $interEast $source.Width) - $srcX
                $srcH = (Get-SourceY $interSouth $source.Height) - $srcY

                $dstX = (($interWest - $tileWest) / ($tileEast - $tileWest)) * $tileSize
                $dstY = (($tileNorth - $interNorth) / ($tileNorth - $tileSouth)) * $tileSize
                $dstW = (($interEast - $interWest) / ($tileEast - $tileWest)) * $tileSize
                $dstH = (($interNorth - $interSouth) / ($tileNorth - $tileSouth)) * $tileSize

                $srcRect = New-Object System.Drawing.RectangleF ([float]$srcX), ([float]$srcY), ([float]$srcW), ([float]$srcH)
                $dstRect = New-Object System.Drawing.RectangleF ([float]$dstX), ([float]$dstY), ([float]$dstW), ([float]$dstH)
                $graphics.DrawImage($source, $dstRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)

                $tileDir = Join-Path $resolvedOutput (Join-Path $zoom $x)
                New-Item -ItemType Directory -Force -Path $tileDir | Out-Null
                $tilePath = Join-Path $tileDir "$y.png"
                $tile.Save($tilePath, [System.Drawing.Imaging.ImageFormat]::Png)

                $graphics.Dispose()
                $tile.Dispose()
                $generated++
            }
        }
    }
}
finally {
    $source.Dispose()
}

Write-Output "Generated $generated tiles in $resolvedOutput"

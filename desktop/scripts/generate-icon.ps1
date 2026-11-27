Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = "Stop"
function New-RoundedPath([System.Drawing.Rectangle]$r, [int]$radius) {
  $d = $radius * 2
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $p.AddArc($r.X, $r.Y, $d, $d, 180, 90)
  $p.AddArc($r.Right - $d, $r.Y, $d, $d, 270, 90)
  $p.AddArc($r.Right - $d, $r.Bottom - $d, $d, $d, 0, 90)
  $p.AddArc($r.X, $r.Bottom - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}
$root = Split-Path -Parent $PSScriptRoot
$assets = Join-Path $root "assets"
New-Item -ItemType Directory -Force -Path $assets | Out-Null
$bitmap = New-Object System.Drawing.Bitmap 256, 256, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($bitmap)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::FromArgb(10, 15, 30))
$r = New-Object System.Drawing.Rectangle 12, 12, 232, 232
$path = New-RoundedPath $r 44
$brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($r, [System.Drawing.Color]::FromArgb(22, 115, 255), [System.Drawing.Color]::FromArgb(0, 220, 190), 45)
$g.FillPath($brush, $path)
$outline = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(190, 255, 255, 255), 5)
$g.DrawPath($outline, $path)
$font = New-Object System.Drawing.Font("Segoe UI", 82, ([System.Drawing.FontStyle]::Bold), [System.Drawing.GraphicsUnit]::Pixel)
$fmt = New-Object System.Drawing.StringFormat
$fmt.Alignment = [System.Drawing.StringAlignment]::Center
$fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
$g.DrawString("OB", $font, [System.Drawing.Brushes]::White, (New-Object System.Drawing.RectangleF 12, 16, 232, 220), $fmt)
$png = New-Object System.IO.MemoryStream
$bitmap.Save($png, [System.Drawing.Imaging.ImageFormat]::Png)
$bytes = $png.ToArray()
$ico = New-Object System.IO.MemoryStream
$writer = New-Object System.IO.BinaryWriter($ico)
$writer.Write([UInt16]0); $writer.Write([UInt16]1); $writer.Write([UInt16]1)
$writer.Write([Byte]0); $writer.Write([Byte]0); $writer.Write([Byte]0); $writer.Write([Byte]0)
$writer.Write([UInt16]1); $writer.Write([UInt16]32)
$writer.Write([UInt32]$bytes.Length); $writer.Write([UInt32]22); $writer.Write($bytes)
[System.IO.File]::WriteAllBytes((Join-Path $assets "onebrain.ico"), $ico.ToArray())
$writer.Dispose(); $ico.Dispose(); $png.Dispose(); $fmt.Dispose(); $font.Dispose()
$outline.Dispose(); $brush.Dispose(); $path.Dispose(); $g.Dispose(); $bitmap.Dispose()
Write-Host "Generated 256x256 ONE BRAIN icon."

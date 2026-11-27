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
$brainPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(225, 226, 255, 255), 10)
$brainPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$brainPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$brainPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
$leftBrain = New-Object System.Drawing.Drawing2D.GraphicsPath
$leftBrain.AddBezier(128, 54, 98, 34, 65, 49, 68, 84)
$leftBrain.AddBezier(68, 84, 39, 92, 43, 132, 67, 145)
$leftBrain.AddBezier(67, 145, 49, 171, 74, 199, 101, 187)
$leftBrain.AddBezier(101, 187, 110, 202, 122, 198, 128, 184)
$rightBrain = New-Object System.Drawing.Drawing2D.GraphicsPath
$rightBrain.AddBezier(128, 54, 158, 34, 191, 49, 188, 84)
$rightBrain.AddBezier(188, 84, 217, 92, 213, 132, 189, 145)
$rightBrain.AddBezier(189, 145, 207, 171, 182, 199, 155, 187)
$rightBrain.AddBezier(155, 187, 146, 202, 134, 198, 128, 184)
$g.DrawPath($brainPen, $leftBrain)
$g.DrawPath($brainPen, $rightBrain)
$g.DrawLine($brainPen, 128, 59, 128, 185)
$g.DrawLine($brainPen, 77, 93, 105, 93)
$g.DrawLine($brainPen, 105, 93, 105, 119)
$g.DrawLine($brainPen, 179, 93, 151, 93)
$g.DrawLine($brainPen, 151, 93, 151, 119)
$g.DrawLine($brainPen, 75, 151, 104, 151)
$g.DrawLine($brainPen, 104, 151, 104, 169)
$g.DrawLine($brainPen, 181, 151, 152, 151)
$g.DrawLine($brainPen, 152, 151, 152, 169)
$nodeBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(245, 240, 255, 255))
foreach ($point in @(@(77,93),@(105,119),@(179,93),@(151,119),@(75,151),@(104,169),@(181,151),@(152,169))) { $g.FillEllipse($nodeBrush, $point[0]-4, $point[1]-4, 8, 8) }
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
$writer.Dispose(); $ico.Dispose(); $png.Dispose()
$nodeBrush.Dispose(); $brainPen.Dispose(); $leftBrain.Dispose(); $rightBrain.Dispose()
$outline.Dispose(); $brush.Dispose(); $path.Dispose(); $g.Dispose(); $bitmap.Dispose()
Write-Host "Generated 256x256 ONE BRAIN icon."

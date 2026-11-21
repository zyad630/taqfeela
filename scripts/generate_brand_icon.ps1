Add-Type -AssemblyName System.Drawing

$size = 1024
$bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

# Clear transparent
$g.Clear([System.Drawing.Color]::Transparent)

# Helper function for rounded rectangle path
function Get-RoundedRectPath([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $r * 2
    $path.AddArc($x, $y, $d, $d, 180, 90)
    $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
    $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
    $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
    $path.CloseFigure()
    return $path
}

# --- 1. SQUIRCLE BASE CONTAINER ---
$pad = 32.0
$cardW = $size - ($pad * 2)
$cardH = $size - ($pad * 2)
$cornerR = 210.0
$cardPath = Get-RoundedRectPath $pad $pad $cardW $cardH $cornerR

# Ambient drop shadow under squircle
for ($i = 6; $i -ge 1; $i--) {
    $sPad = $pad - ($i * 4)
    $sW = $cardW + ($i * 8)
    $sH = $cardH + ($i * 8)
    $sAlpha = [int](14 - ($i * 2))
    if ($sAlpha -gt 0) {
        $sPath = Get-RoundedRectPath $sPad ($sPad + 12) $sW $sH ($cornerR + ($i * 2))
        $sBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb($sAlpha, 0, 0, 0))
        $g.FillPath($sBrush, $sPath)
        $sBrush.Dispose(); $sPath.Dispose()
    }
}

# Base Gradient: Rich Deep Charcoal to Slate Navy
$pt1 = New-Object System.Drawing.PointF ($size / 2), $pad
$pt2 = New-Object System.Drawing.PointF ($size / 2), ($pad + $cardH)
$bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush ($pt1, $pt2, [System.Drawing.Color]::FromArgb(255, 24, 20, 28), [System.Drawing.Color]::FromArgb(255, 12, 10, 16))
$g.FillPath($bgBrush, $cardPath)
$bgBrush.Dispose()

# Subtle radial glow from top center
$glowPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$glowPath.AddEllipse(212, 40, 600, 450)
$pbg = New-Object System.Drawing.Drawing2D.PathGradientBrush $glowPath
$pbg.CenterColor = [System.Drawing.Color]::FromArgb(55, 238, 127, 20)
$pbg.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 12, 10, 16))
$g.FillPath($pbg, $cardPath)
$pbg.Dispose(); $glowPath.Dispose()

# Elegant Inner Border in warm amber gold
$borderPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(140, 238, 127, 20), 4.0)
$g.DrawPath($borderPen, $cardPath)
$borderPen.Dispose()
$cardPath.Dispose()

# --- 2. POS REGISTER CASHIER TERMINAL (Center-Hero) ---
# Screen Housing (Black Titanium frame)
$termX = 230.0
$termY = 270.0
$termW = 564.0
$termH = 390.0
$termR = 36.0

# Housing drop shadow
$termShadow = Get-RoundedRectPath ($termX - 4) ($termY + 12) ($termW + 8) ($termH + 16) $termR
$termSBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(90, 0, 0, 0))
$g.FillPath($termSBrush, $termShadow)
$termSBrush.Dispose(); $termShadow.Dispose()

# Housing body
$termPath = Get-RoundedRectPath $termX $termY $termW $termH $termR
$termBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush (
    [System.Drawing.PointF]::new($termX, $termY),
    [System.Drawing.PointF]::new($termX, $termY + $termH),
    [System.Drawing.Color]::FromArgb(255, 42, 48, 62),
    [System.Drawing.Color]::FromArgb(255, 22, 26, 35)
)
$g.FillPath($termBrush, $termPath)
$termBrush.Dispose()

$termBorderPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(200, 238, 127, 20), 3.5)
$g.DrawPath($termBorderPen, $termPath)
$termBorderPen.Dispose()
$termPath.Dispose()

# --- 3. CASHIER SCREEN DISPLAY (Active Screen Glow) ---
$scrX = $termX + 22.0
$scrY = $termY + 22.0
$scrW = $termW - 44.0
$scrH = $termH - 44.0
$scrR = 22.0
$scrPath = Get-RoundedRectPath $scrX $scrY $scrW $scrH $scrR

# Screen background: deep blue-black glass
$scrBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush (
    [System.Drawing.PointF]::new($scrX, $scrY),
    [System.Drawing.PointF]::new($scrX, $scrY + $scrH),
    [System.Drawing.Color]::FromArgb(255, 15, 23, 42),
    [System.Drawing.Color]::FromArgb(255, 8, 12, 24)
)
$g.FillPath($scrBrush, $scrPath)
$scrBrush.Dispose()

# Screen top status bar
$barBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 30, 41, 59))
$g.FillRectangle($barBrush, $scrX + 16, $scrY + 16, $scrW - 32, 34)
$barBrush.Dispose()

# Status dots (Wifi, Battery, POS indicator)
$dot1 = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 238, 127, 20)) # Taqfeela Orange
$dot2 = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 16, 185, 129)) # Emerald Green Online
$dot3 = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 56, 189, 248)) # Cyan Link
$g.FillEllipse($dot1, $scrX + 28, $scrY + 28, 10, 10)
$g.FillEllipse($dot2, $scrX + 44, $scrY + 28, 10, 10)
$g.FillEllipse($dot3, $scrX + 60, $scrY + 28, 10, 10)
$dot1.Dispose(); $dot2.Dispose(); $dot3.Dispose()

# Mini sales chart bars on the screen (visualizing successful orders/sales)
$bars = @(
    @{ x = 70;  h = 60;  c = [System.Drawing.Color]::FromArgb(255, 245, 158, 11) },
    @{ x = 115; h = 100; c = [System.Drawing.Color]::FromArgb(255, 238, 127, 20) },
    @{ x = 160; h = 75;  c = [System.Drawing.Color]::FromArgb(255, 245, 158, 11) },
    @{ x = 205; h = 135; c = [System.Drawing.Color]::FromArgb(255, 16, 185, 129) },
    @{ x = 250; h = 160; c = [System.Drawing.Color]::FromArgb(255, 16, 185, 129) }
)
$chartBaseY = $scrY + 280.0
foreach ($b in $bars) {
    $bx = $scrX + $b.x
    $by = $chartBaseY - $b.h
    $barP = Get-RoundedRectPath $bx $by 30.0 $b.h 8.0
    $bBrush = New-Object System.Drawing.SolidBrush $b.c
    $g.FillPath($bBrush, $barP)
    $bBrush.Dispose(); $barP.Dispose()
}

# Big Checkmark Badge on screen right: Order Success!
$badgeX = $scrX + 350.0
$badgeY = $scrY + 110.0
$badgeR = 60.0
$badgePath = New-Object System.Drawing.Drawing2D.GraphicsPath
$badgePath.AddEllipse($badgeX - $badgeR, $badgeY - $badgeR, $badgeR * 2, $badgeR * 2)
$badgeBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush (
    [System.Drawing.PointF]::new($badgeX, $badgeY - $badgeR),
    [System.Drawing.PointF]::new($badgeX, $badgeY + $badgeR),
    [System.Drawing.Color]::FromArgb(255, 34, 197, 94),
    [System.Drawing.Color]::FromArgb(255, 21, 128, 61)
)
$g.FillPath($badgeBrush, $badgePath)
$badgeBrush.Dispose(); $badgePath.Dispose()

# Checkmark icon inside badge
$chkPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White, 10.0)
$chkPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$chkPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$chkPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
$g.DrawLines($chkPen, @(
    [System.Drawing.PointF]::new($badgeX - 24, $badgeY - 2),
    [System.Drawing.PointF]::new($badgeX - 6, $badgeY + 18),
    [System.Drawing.PointF]::new($badgeX + 26, $badgeY - 18)
))
$chkPen.Dispose()

# Sales Total pill on screen
$pillP = Get-RoundedRectPath ($scrX + 300.0) ($scrY + 205.0) 180.0 46.0 23.0
$pillBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(240, 238, 127, 20))
$g.FillPath($pillBrush, $pillP)
$pillBrush.Dispose(); $pillP.Dispose()

# Currency Symbol icon inside pill
$currPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 24, 20, 28), 5.0)
$currPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$g.DrawLine($currPen, $scrX + 360, $scrY + 228, $scrX + 420, $scrY + 228)
$currPen.Dispose()

$scrPath.Dispose()

# --- 4. RECEIPT PRINTER PAPER FEED (Top of Terminal) ---
# Printer slot on terminal top
$slotX = 380.0
$slotY = $termY - 10.0
$slotW = 264.0
$slotH = 16.0
$slotBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 15, 17, 23))
$g.FillRectangle($slotBrush, $slotX, $slotY, $slotW, $slotH)
$slotBrush.Dispose()

# Paper receipt emerging from top
$rcptX = 400.0
$rcptY = 125.0
$rcptW = 224.0
$rcptH = 145.0
$rcptPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$rcptPath.AddLine($rcptX, $rcptY + $rcptH, $rcptX, $rcptY + 12)
# Jagged top cut for realistic thermal paper
$step = 16.0
for ($i = 0; $i -lt 14; $i++) {
    $px = $rcptX + ($i * $step)
    $py = if ($i % 2 -eq 0) { $rcptY } else { $rcptY + 8 }
    $nextPy = if ($i % 2 -eq 0) { $rcptY + 8 } else { $rcptY }
    $rcptPath.AddLine([float]$px, [float]$py, [float]($px + $step), [float]$nextPy)
}
$rcptPath.AddLine($rcptX + $rcptW, $rcptY + 12, $rcptX + $rcptW, $rcptY + $rcptH)
$rcptPath.CloseFigure()

# Receipt paper shadow & body
$rcptShadow = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(40, 0, 0, 0))
$g.FillPath($rcptShadow, $rcptPath)
$rcptShadow.Dispose()

$rcptBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush (
    [System.Drawing.PointF]::new($rcptX, $rcptY),
    [System.Drawing.PointF]::new($rcptX, $rcptY + $rcptH),
    [System.Drawing.Color]::FromArgb(255, 255, 255, 255),
    [System.Drawing.Color]::FromArgb(255, 240, 238, 234)
)
$g.FillPath($rcptBrush, $rcptPath)
$rcptBrush.Dispose()

# Printed lines on receipt paper (Thermal print simulation)
$linePen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(180, 71, 85, 105), 4.5)
$linePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$linePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

$g.DrawLine($linePen, $rcptX + 30, $rcptY + 35, $rcptX + $rcptW - 30, $rcptY + 35)
$g.DrawLine($linePen, $rcptX + 45, $rcptY + 52, $rcptX + $rcptW - 45, $rcptY + 52)
$g.DrawLine($linePen, $rcptX + 30, $rcptY + 70, $rcptX + 110, $rcptY + 70)
$g.DrawLine($linePen, $rcptX + 130, $rcptY + 70, $rcptX + $rcptW - 30, $rcptY + 70)
$g.DrawLine($linePen, $rcptX + 30, $rcptY + 88, $rcptX + $rcptW - 60, $rcptY + 88)
$g.DrawLine($linePen, $rcptX + 30, $rcptY + 106, $rcptX + $rcptW - 30, $rcptY + 106)
$linePen.Dispose(); $rcptPath.Dispose()

# --- 5. TERMINAL METALLIC STAND (Base) ---
$standW = 280.0
$standH = 90.0
$standX = ($size - $standW) / 2
$standY = $termY + $termH - 8
$standPath = Get-RoundedRectPath $standX $standY $standW $standH 24.0

$standBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush (
    [System.Drawing.PointF]::new($standX, $standY),
    [System.Drawing.PointF]::new($standX, $standY + $standH),
    [System.Drawing.Color]::FromArgb(255, 38, 44, 56),
    [System.Drawing.Color]::FromArgb(255, 18, 22, 29)
)
$g.FillPath($standBrush, $standPath)
$standBrush.Dispose()

$standBorderPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(120, 238, 127, 20), 2.5)
$g.DrawPath($standBorderPen, $standPath)
$standBorderPen.Dispose(); $standPath.Dispose()

# --- 6. SIGNATURE COFFEE CUP & STEAM (Right foreground badge) ---
$cupCenterX = 710.0
$cupCenterY = 650.0

# Cup drop shadow
$cShadow = New-Object System.Drawing.Drawing2D.GraphicsPath
$cShadow.AddEllipse($cupCenterX - 95, $cupCenterY + 45, 190, 48)
$csBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(90, 0, 0, 0))
$g.FillPath($csBrush, $cShadow)
$csBrush.Dispose(); $cShadow.Dispose()

# Cup Saucer (Plate)
$saucerPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$saucerPath.AddEllipse($cupCenterX - 100, $cupCenterY + 40, 200, 42)
$saucerBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush (
    [System.Drawing.PointF]::new($cupCenterX, $cupCenterY + 40),
    [System.Drawing.PointF]::new($cupCenterX, $cupCenterY + 82),
    [System.Drawing.Color]::FromArgb(255, 238, 127, 20),
    [System.Drawing.Color]::FromArgb(255, 180, 83, 9)
)
$g.FillPath($saucerBrush, $saucerPath)
$saucerBrush.Dispose(); $saucerPath.Dispose()

# Cup Body
$cupW = 130.0
$cupH = 105.0
$cupX = $cupCenterX - ($cupW / 2)
$cupY = $cupCenterY - 35.0
$cupPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$cupPath.AddArc($cupX, $cupY, 30, 30, 180, 90)
$cupPath.AddLine($cupX + 15, $cupY, $cupX + $cupW - 15, $cupY)
$cupPath.AddArc($cupX + $cupW - 30, $cupY, 30, 30, 270, 90)
$cupPath.AddLine($cupX + $cupW, $cupY + 15, $cupX + $cupW - 18, $cupY + $cupH)
$cupPath.AddArc($cupX + 18, $cupY + $cupH - 24, $cupW - 36, 24, 0, 180)
$cupPath.AddLine($cupX + 18, $cupY + $cupH, $cupX, $cupY + 15)
$cupPath.CloseFigure()

$cupBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush (
    [System.Drawing.PointF]::new($cupX, $cupY),
    [System.Drawing.PointF]::new($cupX + $cupW, $cupY + $cupH),
    [System.Drawing.Color]::FromArgb(255, 255, 166, 68),
    [System.Drawing.Color]::FromArgb(255, 217, 95, 10)
)
$g.FillPath($cupBrush, $cupPath)
$cupBrush.Dispose()

# Cup Handle
$hPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$hPath.AddArc($cupX + $cupW - 14, $cupY + 15, 46, 52, 270, 180)
$hPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 238, 127, 20), 12.0)
$g.DrawPath($hPen, $hPath)
$hPen.Dispose(); $hPath.Dispose()

# Coffee surface inside cup (Dark espresso crema)
$coffeePath = New-Object System.Drawing.Drawing2D.GraphicsPath
$coffeePath.AddEllipse($cupX + 6, $cupY - 4, $cupW - 12, 28)
$coffeeBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush (
    [System.Drawing.PointF]::new($cupCenterX, $cupY - 4),
    [System.Drawing.PointF]::new($cupCenterX, $cupY + 24),
    [System.Drawing.Color]::FromArgb(255, 92, 45, 18),
    [System.Drawing.Color]::FromArgb(255, 45, 20, 8)
)
$g.FillPath($coffeeBrush, $coffeePath)
$coffeeBrush.Dispose(); $coffeePath.Dispose(); $cupPath.Dispose()

# Rising Steam Waves (Golden aroma)
$steamPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(190, 251, 191, 36), 6.0)
$steamPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$steamPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

# Wave 1 (Center)
$sCurve1 = New-Object System.Drawing.Drawing2D.GraphicsPath
$sCurve1.AddBezier(
    [System.Drawing.PointF]::new($cupCenterX - 10, $cupY - 14),
    [System.Drawing.PointF]::new($cupCenterX + 12, $cupY - 42),
    [System.Drawing.PointF]::new($cupCenterX - 18, $cupY - 72),
    [System.Drawing.PointF]::new($cupCenterX + 4,  $cupY - 105)
)
$g.DrawPath($steamPen, $sCurve1)
$sCurve1.Dispose()

# Wave 2 (Right)
$sCurve2 = New-Object System.Drawing.Drawing2D.GraphicsPath
$sCurve2.AddBezier(
    [System.Drawing.PointF]::new($cupCenterX + 22, $cupY - 12),
    [System.Drawing.PointF]::new($cupCenterX + 42, $cupY - 38),
    [System.Drawing.PointF]::new($cupCenterX + 18, $cupY - 65),
    [System.Drawing.PointF]::new($cupCenterX + 35, $cupY - 95)
)
$g.DrawPath($steamPen, $sCurve2)
$sCurve2.Dispose(); $steamPen.Dispose()

# --- 7. BRAND BOTTOM TEXT BANNER: 'تقفيلة' ---
$brandFont = New-Object System.Drawing.Font ("Arial", 46, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$brandFormat = New-Object System.Drawing.StringFormat
$brandFormat.Alignment = [System.Drawing.StringAlignment]::Center
$brandFormat.LineAlignment = [System.Drawing.StringAlignment]::Center

$brandText = "TAQFEELA POS"
$brandBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(220, 245, 158, 11))
$g.DrawString($brandText, $brandFont, $brandBrush, ($size / 2), ($size - 135.0), $brandFormat)
$brandBrush.Dispose(); $brandFont.Dispose(); $brandFormat.Dispose()

# Subtle dot separators
$dotSep = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(160, 238, 127, 20))
$g.FillEllipse($dotSep, ($size / 2) - 170, ($size - 142.0), 8, 8)
$g.FillEllipse($dotSep, ($size / 2) + 162, ($size - 142.0), 8, 8)
$dotSep.Dispose()

# Save Master 1024x1024 PNG
$outPng = "c:\Users\zyad\Downloads\cafe-app\build\icon.png"
$bmp.Save($outPng, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Output "Master Icon generated successfully: $outPng"

# Also save copies for Mobile
$mobilePng1 = "c:\Users\zyad\Downloads\cafe-app\apps\mobile\assets\icon.png"
$mobilePng2 = "f:\taqfeela-mobile\assets\icon.png"
$mobileAdaptive1 = "c:\Users\zyad\Downloads\cafe-app\apps\mobile\assets\adaptive-icon.png"
$mobileAdaptive2 = "f:\taqfeela-mobile\assets\adaptive-icon.png"
$mobileSplash1 = "c:\Users\zyad\Downloads\cafe-app\apps\mobile\assets\splash.png"
$mobileSplash2 = "f:\taqfeela-mobile\assets\splash.png"

$bmp.Save($mobilePng1, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Save($mobilePng2, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Save($mobileAdaptive1, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Save($mobileAdaptive2, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Save($mobileSplash1, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Save($mobileSplash2, [System.Drawing.Imaging.ImageFormat]::Png)

$g.Dispose()
$bmp.Dispose()
Write-Output "All icon files deployed successfully!"

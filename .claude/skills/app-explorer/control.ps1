# Drive another application: move the mouse, click, scroll, type, send keys, and
# capture the screen so Claude can act → look → act again. DPI-aware so capture
# coordinates and click coordinates share one pixel space.
#
# Usage (one -Action per call):
#   powershell -File control.ps1 -Action capture                 # snapshot -> prints WxH -> path
#   powershell -File control.ps1 -Action capture -Monitor 0      # one monitor (0-based)
#   powershell -File control.ps1 -Action cursorpos               # print current cursor X,Y
#   powershell -File control.ps1 -Action move   -X 800 -Y 450    # move cursor only
#   powershell -File control.ps1 -Action click  -X 800 -Y 450    # left click at point
#   powershell -File control.ps1 -Action double -X 800 -Y 450    # left double-click
#   powershell -File control.ps1 -Action right  -X 800 -Y 450    # right click
#   powershell -File control.ps1 -Action middle -X 800 -Y 450    # middle click
#   powershell -File control.ps1 -Action drag   -X 100 -Y 100 -X2 400 -Y2 300   # press-drag-release
#   powershell -File control.ps1 -Action scroll -Amount -3       # wheel: + up, - down (notches)
#   powershell -File control.ps1 -Action scroll -Amount 3 -X 800 -Y 450         # scroll at point
#   powershell -File control.ps1 -Action type   -Text "hello world"             # type literal text
#   powershell -File control.ps1 -Action key    -Keys "^s"       # SendKeys syntax (Ctrl+S)
#   powershell -File control.ps1 -Action key    -Keys "{ENTER}"  # named keys
#   powershell -File control.ps1 -Action cleanup                 # delete this skill's temp screenshots
#
# Coordinates are absolute physical pixels on the virtual desktop (top-left = 0,0),
# matching what -Action capture reports. Capture first, read the PNG, then click.

param(
  [Parameter(Mandatory)]
  [ValidateSet('capture','cursorpos','move','click','double','right','middle','drag','scroll','type','key','cleanup')]
  [string] $Action,

  [int]    $X       = -2147483648,   # sentinel: "not supplied"
  [int]    $Y       = -2147483648,
  [int]    $X2      = -2147483648,
  [int]    $Y2      = -2147483648,
  [string] $Text    = "",
  [string] $Keys    = "",
  [int]    $Amount  = 0,             # scroll notches: + up, - down
  [int]    $Monitor = -1,            # capture: -1 = whole virtual screen; else screen index
  [string] $Out     = "",           # capture: output path; default = temp with timestamp

  # capture region (absolute virtual-desktop pixels). When -RW/-RH > 0, grab just
  # this rectangle instead of a whole monitor — keeps native detail on small areas.
  [int]    $RX      = -2147483648,
  [int]    $RY      = -2147483648,
  [int]    $RW      = 0,
  [int]    $RH      = 0,
  [int]    $Scale   = 1,             # upscale the saved PNG NxN (magnify small text/menus)

  # modifier key(s) held during a click/double/right/middle/drag, e.g. ctrl, alt,
  # shift, or combos like "ctrl+alt". Enables Ctrl-click multi-select etc.
  [string] $Mod     = "",

  [int]    $Delay   = 40            # ms settle between primitive steps
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms, System.Drawing

Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class Native {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, IntPtr extra);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, IntPtr extra);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
}
"@

# Match the OS's true pixel grid so reported = clicked = captured coordinates.
[void][Native]::SetProcessDPIAware()

$NOTSET = -2147483648
function Require-XY {
  if ($X -eq $NOTSET -or $Y -eq $NOTSET) {
    Write-Error "Action '$Action' needs -X and -Y."; exit 1
  }
}
function Settle { Start-Sleep -Milliseconds $Delay }

# mouse_event flags
$MOVE=0x0001; $LDOWN=0x0002; $LUP=0x0004; $RDOWN=0x0008; $RUP=0x0010
$MDOWN=0x0020; $MUP=0x0040; $WHEEL=0x0800

function Move-To([int]$tx, [int]$ty) { [void][Native]::SetCursorPos($tx, $ty); Settle }
function Tap([uint32]$down, [uint32]$up) {
  [Native]::mouse_event($down, 0, 0, 0, [IntPtr]::Zero); Settle
  [Native]::mouse_event($up,   0, 0, 0, [IntPtr]::Zero); Settle
}

# Modifier keys held during a mouse action. -Mod "ctrl+alt" etc.
$VK = @{ ctrl = 0x11; control = 0x11; alt = 0x12; shift = 0x10 }
function Mod-Keys { if ($Mod) { ($Mod -split '[+, ]') | Where-Object { $_ } | ForEach-Object { $VK[$_.ToLower().Trim()] } | Where-Object { $_ } } }
function Mod-Down { foreach ($k in (Mod-Keys)) { [Native]::keybd_event([byte]$k, 0, 0, [IntPtr]::Zero) }; if ($Mod) { Settle } }
function Mod-Up   { foreach ($k in (Mod-Keys)) { [Native]::keybd_event([byte]$k, 0, 2, [IntPtr]::Zero) } }

# SendKeys: escape literal text so special chars are typed verbatim.
function Escape-Literal([string]$s) {
  ($s -replace '([+^%~(){}\[\]])', '{$1}')
}

switch ($Action) {

  'cursorpos' {
    $p = New-Object Native+POINT
    [void][Native]::GetCursorPos([ref]$p)
    Write-Output ("{0},{1}" -f $p.X, $p.Y)
  }

  'capture' {
    if ($RW -gt 0 -and $RH -gt 0) {
      if ($RX -eq $NOTSET -or $RY -eq $NOTSET) { Write-Error "region capture needs -RX and -RY (top-left)."; exit 1 }
      $bounds = New-Object System.Drawing.Rectangle($RX, $RY, $RW, $RH)
    } elseif ($Monitor -ge 0) {
      $screens = [System.Windows.Forms.Screen]::AllScreens
      if ($Monitor -ge $screens.Count) {
        Write-Error "Monitor $Monitor not found (have $($screens.Count): 0..$($screens.Count - 1))."; exit 1
      }
      $bounds = $screens[$Monitor].Bounds
    } else {
      $bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
    }
    if (-not $Out) {
      $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
      $Out = Join-Path $env:TEMP "lumox-control-$stamp.png"
    }
    $bmp = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
    $gfx = [System.Drawing.Graphics]::FromImage($bmp)
    $gfx.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
    $gfx.Dispose()

    if ($Scale -gt 1) {
      $sw = $bounds.Width * $Scale; $sh = $bounds.Height * $Scale
      $big = New-Object System.Drawing.Bitmap($sw, $sh)
      $g2 = [System.Drawing.Graphics]::FromImage($big)
      $g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
      $g2.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
      $g2.DrawImage($bmp, 0, 0, $sw, $sh)
      $g2.Dispose(); $bmp.Dispose(); $bmp = $big
    }
    $finalW = $bmp.Width; $finalH = $bmp.Height
    $bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Output ("{0}x{1} -> {2}" -f $finalW, $finalH, (Resolve-Path $Out))
  }

  'move'   { Require-XY; Move-To $X $Y; Write-Output ("moved -> {0},{1}" -f $X, $Y) }
  'click'  { Require-XY; Move-To $X $Y; Mod-Down; Tap $LDOWN $LUP; Mod-Up; Write-Output ("click -> {0},{1}{2}" -f $X, $Y, ($(if($Mod){" [$Mod]"}))) }
  'right'  { Require-XY; Move-To $X $Y; Mod-Down; Tap $RDOWN $RUP; Mod-Up; Write-Output ("right -> {0},{1}" -f $X, $Y) }
  'middle' { Require-XY; Move-To $X $Y; Mod-Down; Tap $MDOWN $MUP; Mod-Up; Write-Output ("middle -> {0},{1}" -f $X, $Y) }

  'double' {
    Require-XY; Move-To $X $Y
    Mod-Down; Tap $LDOWN $LUP; Tap $LDOWN $LUP; Mod-Up
    Write-Output ("double -> {0},{1}" -f $X, $Y)
  }

  'drag' {
    Require-XY
    if ($X2 -eq $NOTSET -or $Y2 -eq $NOTSET) { Write-Error "drag needs -X2 and -Y2 (destination)."; exit 1 }
    Move-To $X $Y
    Mod-Down
    [Native]::mouse_event($LDOWN, 0, 0, 0, [IntPtr]::Zero); Settle
    Move-To $X2 $Y2
    [Native]::mouse_event($LUP, 0, 0, 0, [IntPtr]::Zero); Settle
    Mod-Up
    Write-Output ("drag -> {0},{1} to {2},{3}{4}" -f $X, $Y, $X2, $Y2, ($(if($Mod){" [$Mod]"}))) }

  'scroll' {
    if ($Amount -eq 0) { Write-Error "scroll needs a non-zero -Amount (notches; + up, - down)."; exit 1 }
    if ($X -ne $NOTSET -and $Y -ne $NOTSET) { Move-To $X $Y }
    $data = [uint32]([int]($Amount * 120) -band 0xFFFFFFFF)   # WHEEL_DELTA = 120 per notch
    [Native]::mouse_event($WHEEL, 0, 0, $data, [IntPtr]::Zero); Settle
    Write-Output ("scroll -> {0} notches" -f $Amount)
  }

  'type' {
    if (-not $Text) { Write-Error "type needs -Text."; exit 1 }
    [System.Windows.Forms.SendKeys]::SendWait((Escape-Literal $Text))
    Write-Output ("typed {0} chars" -f $Text.Length)
  }

  'key' {
    if (-not $Keys) { Write-Error "key needs -Keys (SendKeys syntax, e.g. ^s or {ENTER})."; exit 1 }
    [System.Windows.Forms.SendKeys]::SendWait($Keys)
    Write-Output ("sent keys {0}" -f $Keys)
  }

  'cleanup' {
    # Remove the default-location screenshots this script leaves in %TEMP%
    # (lumox-control-<timestamp>.png). Captures saved elsewhere via -Out are left alone.
    $shots = Get-ChildItem -Path $env:TEMP -Filter "lumox-control-*.png" -File -ErrorAction SilentlyContinue
    $count = 0
    foreach ($f in $shots) {
      try { Remove-Item -LiteralPath $f.FullName -Force; $count++ } catch { }
    }
    Write-Output ("cleaned {0} screenshot(s) from {1}" -f $count, $env:TEMP)
  }
}

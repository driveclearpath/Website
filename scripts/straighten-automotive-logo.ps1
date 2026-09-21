param(
  [string]$Source = (Join-Path $PSScriptRoot '..\assets\clearpath-automotive-white.png'),
  [string]$WhiteOutput = (Join-Path $PSScriptRoot '..\assets\clearpath-automotive-white.png'),
  [string]$NavyOutput = (Join-Path $PSScriptRoot '..\assets\clearpath-automotive-black.png')
)

Add-Type -AssemblyName System.Drawing

$sourcePath = [System.IO.Path]::GetFullPath($Source)
$whitePath = [System.IO.Path]::GetFullPath($WhiteOutput)
$navyPath = [System.IO.Path]::GetFullPath($NavyOutput)
$sourceBitmap = [System.Drawing.Bitmap]::FromFile($sourcePath)
$original = New-Object System.Drawing.Bitmap($sourceBitmap)
$logo = New-Object System.Drawing.Bitmap($sourceBitmap)
$sourceBitmap.Dispose()

try {
  # The supplied artwork contains a path that rises across the word. Remap
  # only the CLEARPATH letter area so that path lands on one horizontal axis,
  # while pinning the top and bottom edges to preserve the wordmark's bounds.
  $targetCenter = 131.0
  $wordBottom = 205.0
  for ($x = 620; $x -le 2200; $x++) {
    $sourceCenter = 139.0 - (($x - 620.0) * (16.0 / 1580.0))
    for ($y = 0; $y -le $wordBottom; $y++) {
      if ($y -le $targetCenter) {
        $sourceY = [int][Math]::Round($y * $sourceCenter / $targetCenter)
      } else {
        $sourceY = [int][Math]::Round($sourceCenter + (($y - $targetCenter) * (($wordBottom - $sourceCenter) / ($wordBottom - $targetCenter))))
      }
      $logo.SetPixel($x, $y, $original.GetPixel($x, $sourceY))
    }

    # Normalize the final opening and its antialiased edges.
    $logo.SetPixel($x, 120, [System.Drawing.Color]::FromArgb(96, 255, 255, 255))
    for ($y = 121; $y -le 140; $y++) {
      $logo.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, 255, 255, 255))
    }
    $logo.SetPixel($x, 141, [System.Drawing.Color]::FromArgb(96, 255, 255, 255))
  }

  $whiteTemp = "$whitePath.tmp.png"
  $logo.Save($whiteTemp, [System.Drawing.Imaging.ImageFormat]::Png)

  $navy = New-Object System.Drawing.Bitmap($logo.Width, $logo.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  try {
    for ($y = 0; $y -lt $logo.Height; $y++) {
      for ($x = 0; $x -lt $logo.Width; $x++) {
        $alpha = $logo.GetPixel($x, $y).A
        $navy.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($alpha, 11, 33, 57))
      }
    }
    $navyTemp = "$navyPath.tmp.png"
    $navy.Save($navyTemp, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $navy.Dispose()
  }

  [System.IO.File]::Move($whiteTemp, $whitePath, $true)
  [System.IO.File]::Move($navyTemp, $navyPath, $true)
} finally {
  $original.Dispose()
  $logo.Dispose()
}

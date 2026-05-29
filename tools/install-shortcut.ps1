# Creates a "PewPew" shortcut on the Desktop (and Start Menu) that launches the
# overlay with no console window, uses the generated icon, and is bound to the
# global hotkey Ctrl+Shift+F7 (Windows launches the shortcut on that hotkey).
#
#   npm run install-desktop
#
$ErrorActionPreference = 'Stop'

$proj = Split-Path -Parent $PSScriptRoot
$electron = Join-Path $proj 'node_modules\electron\dist\electron.exe'
$icon = Join-Path $proj 'assets\pewpew.ico'

if (-not (Test-Path $electron)) {
  Write-Error "Electron not found at $electron. Run 'npm install' first."
}
if (-not (Test-Path $icon)) {
  # Generate the icon if it's missing.
  & node (Join-Path $proj 'tools\make-icon.js')
}

$desktop = [Environment]::GetFolderPath('Desktop')
$startMenu = Join-Path ([Environment]::GetFolderPath('Programs')) 'PewPew.lnk'
$targets = @((Join-Path $desktop 'PewPew.lnk'), $startMenu)

$shell = New-Object -ComObject WScript.Shell
foreach ($lnkPath in $targets) {
  $sc = $shell.CreateShortcut($lnkPath)
  $sc.TargetPath = $electron
  $sc.Arguments = '"' + $proj + '"'   # the app directory (contains main.js)
  $sc.WorkingDirectory = $proj
  $sc.IconLocation = $icon
  $sc.WindowStyle = 1
  $sc.Description = 'PewPew - transparent Asteroids overlay'
  $sc.HotKey = 'CTRL+SHIFT+F7'        # global launch hotkey
  $sc.Save()
  Write-Host "Created shortcut: $lnkPath"
}

Write-Host ""
Write-Host "Done. A 'PewPew' icon is on your Desktop and Start Menu."
Write-Host "Press Ctrl+Shift+F7 anywhere to launch it."

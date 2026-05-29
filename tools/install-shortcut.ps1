# Creates a "Vibeshift" shortcut on the Desktop (and Start Menu) that launches
# the overlay with no console window, uses the generated icon, and is bound to
# the global hotkey Ctrl+Shift+F7 (Windows launches the shortcut on that hotkey).
#
#   npm run install-desktop
#
$ErrorActionPreference = 'Stop'

$proj = Split-Path -Parent $PSScriptRoot
$electron = Join-Path $proj 'node_modules\electron\dist\electron.exe'
$icon = Join-Path $proj 'assets\vibeshift.ico'

if (-not (Test-Path $electron)) {
  Write-Error "Electron not found at $electron. Run 'npm install' first."
}
if (-not (Test-Path $icon)) {
  # Generate the icon if it's missing.
  & node (Join-Path $proj 'tools\make-icon.js')
}

$desktop = [Environment]::GetFolderPath('Desktop')
$programs = [Environment]::GetFolderPath('Programs')

# Remove stale shortcuts from earlier names so a re-run doesn't leave duplicates.
foreach ($old in @('PewPew.lnk', 'Vibe Shift.lnk')) {
  foreach ($dir in @($desktop, $programs)) {
    $p = Join-Path $dir $old
    if (Test-Path $p) { Remove-Item $p -Force; Write-Host "Removed old shortcut: $p" }
  }
}

$startMenu = Join-Path $programs 'Vibeshift.lnk'
$targets = @((Join-Path $desktop 'Vibeshift.lnk'), $startMenu)

$shell = New-Object -ComObject WScript.Shell
foreach ($lnkPath in $targets) {
  $sc = $shell.CreateShortcut($lnkPath)
  $sc.TargetPath = $electron
  $sc.Arguments = '"' + $proj + '"'   # the app directory (contains main.js)
  $sc.WorkingDirectory = $proj
  $sc.IconLocation = $icon
  $sc.WindowStyle = 1
  $sc.Description = 'Vibeshift - transparent Asteroids overlay for vibecoding'
  $sc.HotKey = 'CTRL+SHIFT+F7'        # global launch hotkey
  $sc.Save()
  Write-Host "Created shortcut: $lnkPath"
}

Write-Host ""
Write-Host "Done. A 'Vibeshift' icon is on your Desktop and Start Menu."
Write-Host "Press Ctrl+Shift+F7 anywhere to launch it."

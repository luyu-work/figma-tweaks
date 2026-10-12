# Installs Figma Tweaks. Re-run after a Figma update, it re-points the Start menu shortcut.
$ErrorActionPreference = 'Stop'
$root   = $PSScriptRoot
$vbs    = Join-Path $root 'desktop\Figma.vbs'
$figma  = Join-Path $env:LOCALAPPDATA 'Figma\Figma.exe'
$lnk    = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Figma.lnk'
$backup = Join-Path $root 'desktop\Figma.original.lnk'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js not found. Install it from https://nodejs.org and run again.' }
if (-not (Test-Path $figma)) { throw 'Figma desktop not found in %LOCALAPPDATA%\Figma. Install it from https://www.figma.com/downloads and run again.' }

$sh = New-Object -ComObject WScript.Shell

# Keep the original shortcut once, only if it is still the untouched one.
if ((Test-Path $lnk) -and -not (Test-Path $backup) -and ($sh.CreateShortcut($lnk).TargetPath -notmatch 'wscript')) {
  Copy-Item $lnk $backup
}

$s = $sh.CreateShortcut($lnk)
$s.TargetPath       = Join-Path $env:WINDIR 'System32\wscript.exe'
$s.Arguments        = '"' + $vbs + '"'
$s.WorkingDirectory = Join-Path $root 'desktop'
$s.IconLocation     = "$figma,0"
$s.Description      = 'Figma with tweaks'
$s.Save()

Write-Host 'Done. Start Figma from the Start menu (shortcut "Figma").'

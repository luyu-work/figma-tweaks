@echo off
rem Removes Figma Tweaks in one run. Stops the launcher, points the Figma shortcuts back to Figma.exe and deletes
rem this folder. It copies itself to %TEMP% first, because a script cannot delete the folder it runs from.
setlocal
if /i "%~1"=="--run" goto run
for %%I in ("%~dp0.") do set "FT_ROOT=%%~fI"
if not exist "%FT_ROOT%\desktop\launch.js" (
  echo This is not a Figma Tweaks folder.
  pause
  exit /b 1
)
copy /y "%~f0" "%TEMP%\figma-tweaks-uninstall.bat" >nul
"%TEMP%\figma-tweaks-uninstall.bat" --run "%FT_ROOT%"
exit /b

:run
set "FT_ROOT=%~2"
set "FT_SELF=%~f0"
echo This removes Figma Tweaks and deletes the folder
echo   %FT_ROOT%
choice /m "Continue"
if errorlevel 2 exit /b
:wait
tasklist /fi "imagename eq Figma.exe" /nh | find /i "Figma.exe" >nul
if not errorlevel 1 (
  echo Close Figma completely, then press any key.
  pause >nul
  goto wait
)
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=[IO.File]::ReadAllText($env:FT_SELF); Invoke-Expression $s.Substring($s.LastIndexOf('#PS#')+4)"
if errorlevel 1 (
  echo Something failed, the folder was kept.
  pause
  exit /b 1
)
echo.
echo Done. Figma starts as usual from the Start menu.
pause
(goto) 2>nul & del "%~f0"
exit /b

#PS#
$ErrorActionPreference = 'Stop'  # any failure before the delete step leaves the folder in place
$ic = [StringComparison]::OrdinalIgnoreCase
$root = $env:FT_ROOT
$exe = Join-Path $env:LOCALAPPDATA 'Figma\Figma.exe'
if (-not (Test-Path -LiteralPath (Join-Path $root 'desktop\launch.js'))) { throw 'Not a Figma Tweaks folder.' }

# Launcher processes of this folder.
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.IndexOf((Join-Path $root 'desktop'), $ic) -ge 0 } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

# Shortcuts that install.ps1 or guard.js pointed at Figma.vbs of this folder.
$vbs = Join-Path $root 'desktop\Figma.vbs'
$sh = New-Object -ComObject WScript.Shell
$dirs = @(
  (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'),
  (Join-Path $env:USERPROFILE 'Desktop'),
  (Join-Path $env:PUBLIC 'Desktop'),
  (Join-Path $env:APPDATA 'Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar')
)
foreach ($d in $dirs) {
  Get-ChildItem -LiteralPath $d -Filter 'Figma*.lnk' -ErrorAction SilentlyContinue | ForEach-Object {
    $s = $sh.CreateShortcut($_.FullName)
    if ($s.TargetPath -match 'wscript' -and $s.Arguments.IndexOf($vbs, $ic) -ge 0) {
      $s.TargetPath = $exe
      $s.Arguments = ''
      $s.WorkingDirectory = Split-Path $exe
      $s.IconLocation = "$exe,0"
      $s.Description = ''
      $s.Save()
      Write-Host "restored $($_.FullName)"
    }
  }
}

# The folder, with .version and desktop\launch.log inside.
Set-Location $env:TEMP
Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
if (Test-Path -LiteralPath $root) { Write-Host "Could not delete $root, remove it by hand." } else { Write-Host "deleted $root" }

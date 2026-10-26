// Keeps the tweaks after a Figma update. Squirrel restores the original Start menu shortcut and restarts Figma
// without the launcher. The shortcuts are re-pointed to Figma.vbs once at start and when a new app-* folder appears
// (no polling, only a file system event). // When Figma exits and a plain Figma.exe appears right after (the Squirrel restart), it is closed and started again through the launcher.
const { spawn, execFile, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const FIGMA_ROOT = path.join(process.env.LOCALAPPDATA, 'Figma');
// Start menu, desktop and taskbar shortcuts named Figma*.lnk.
const LNK_DIRS = [
  path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
  path.join(process.env.USERPROFILE, 'Desktop'),
  path.join(process.env.PUBLIC || 'C:/Users/Public', 'Desktop'),
  path.join(process.env.APPDATA, 'Microsoft', 'Internet Explorer', 'Quick Launch', 'User Pinned', 'TaskBar'),
];
const VBS = path.join(__dirname, 'Figma.vbs');
const ICON = path.join(process.env.LOCALAPPDATA, 'Figma', 'Figma.exe');
const q = (s) => s.replace(/'/g, "''");

// Re-points every Figma shortcut that does not target wscript yet.
function fixShortcuts(log) {
  const dirs = LNK_DIRS.map((d) => `'${q(d)}'`).join(',');
  const ps = `$sh=New-Object -ComObject WScript.Shell; foreach ($d in @(${dirs})) { Get-ChildItem $d -Filter 'Figma*.lnk' -ErrorAction SilentlyContinue | ForEach-Object { $s=$sh.CreateShortcut($_.FullName); if ($s.TargetPath -match 'Figma' -and $s.TargetPath -notmatch 'wscript') { $s.TargetPath=Join-Path $env:WINDIR 'System32/wscript.exe'; $s.Arguments='"${q(VBS)}"'; $s.WorkingDirectory='${q(__dirname)}'; $s.IconLocation='${q(ICON)},0'; $s.Save(); 'fixed ' + $_.FullName } } }`;
  execFile('powershell', ['-NoProfile', '-Command', ps], { windowsHide: true }, (err, out) => {
    if (err) log('guard shortcut error', err.message);
    else if (String(out).trim()) log('guard:', String(out).trim().replace(/\r?\n/g, '; '));
  });
}

function running() {
  try { return execFileSync('tasklist', ['/FI', 'IMAGENAME eq Figma.exe', '/NH'], { encoding: 'utf8' }).includes('Figma.exe'); } catch { return false; }
}

// Fixes the shortcuts now, and again after Figma creates a new app-* folder (an update was downloaded).
// Squirrel rewrites the shortcuts a bit later than the folder appears, so the check is repeated a few times, only after that event.
function watchUpdate(log) {
  fixShortcuts(log);
  let running = false;
  try {
    fs.watch(FIGMA_ROOT, (_e, file) => {
      if (running || !file || !/^app-\d/.test(file)) return;
      running = true;
      log('guard: update detected', file);
      for (const sec of [5, 20]) setTimeout(() => fixShortcuts(log), sec * 1000);
      setTimeout(() => { running = false; }, 30000);
    });
  } catch (e) { log('guard watch error', e.message); }
}

// After Figma exited: wait up to 40 seconds for a Figma that was not started by the launcher. Close it and start the launcher again.
function relaunchAfterExit(log, done) {
  let n = 0;
  const t = setInterval(() => {
    if (running()) {
      clearInterval(t);
      log('guard: Figma restarted without tweaks, relaunching');
      fixShortcuts(log);
      try { execFileSync('taskkill', ['/IM', 'Figma.exe'], { stdio: 'ignore' }); } catch {}
      let w = 0;
      const t2 = setInterval(() => {
        if (!running() || ++w > 40) {
          clearInterval(t2);
          if (running()) { try { execFileSync('taskkill', ['/F', '/IM', 'Figma.exe'], { stdio: 'ignore' }); } catch {} }
          spawn(process.execPath, [path.join(__dirname, 'launch.js')], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
          done();
        }
      }, 500);
    } else if (++n > 80) { clearInterval(t); done(); }
  }, 500);
}

module.exports = { watchUpdate, relaunchAfterExit };

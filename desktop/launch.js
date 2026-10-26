// Starts Figma desktop with DevTools over a pipe and injects ../userContent.css into every Figma page.
// Figma files are not modified. Saving userContent.css applies the changes live.
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(process.env.LOCALAPPDATA, 'Figma');
const CSS_FILE = path.join(__dirname, '..', 'userContent.css');
const LOG = path.join(__dirname, 'launch.log');

function log(...a) {
  try { fs.appendFileSync(LOG, `[${new Date().toISOString()}] ${a.join(' ')}\n`); } catch {}
}

function latestExe() {
  const dirs = fs.readdirSync(ROOT)
    .filter((d) => /^app-\d/.test(d) && fs.existsSync(path.join(ROOT, d, 'Figma.exe')))
    .sort((a, b) => {
      const pa = a.slice(4).split('.').map(Number), pb = b.slice(4).split('.').map(Number);
      for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pb[i] || 0) - (pa[i] || 0);
      return 0;
    });
  if (!dirs.length) throw new Error('Figma not found');
  return path.join(ROOT, dirs[0], 'Figma.exe');
}

function figmaRunning() {
  try { return execFileSync('tasklist', ['/FI', 'IMAGENAME eq Figma.exe', '/NH'], { encoding: 'utf8' }).includes('Figma.exe'); } catch { return false; }
}

// CSS body without the @-moz-document wrapper and the UserStyle header.
function readCss() {
  let s = '';
  try { s = fs.readFileSync(CSS_FILE, 'utf8'); } catch (e) { log('css read error', e.message); return ''; }
  const at = s.indexOf('@-moz-document');
  if (at < 0) return s;
  const open = s.indexOf('{', at);
  return s.slice(open + 1, s.lastIndexOf('}'));
}

// Runs in the page: keeps one <style id="figma-tweaks"> with the given CSS.
// Re-adds the style if the page drops it or the document was not ready yet.
const PAGE_FN = `window.__figmaTweaks = function (css) {
  if (!/(^|\\.)figma\\.com$/.test(location.hostname)) return;
  window.__figmaTweaksCss = css;
  var put = function () {
    var root = document.head || document.documentElement;
    if (!root) return;
    var s = document.getElementById('figma-tweaks');
    if (!s) { s = document.createElement('style'); s.id = 'figma-tweaks'; root.appendChild(s); }
    if (s.textContent !== window.__figmaTweaksCss) s.textContent = window.__figmaTweaksCss;
  };
  put();
  // "More" is restyled as "Import" in the CSS: after its click, press Import in the (invisible) menu.
  if (!window.__figmaTweaksImport) {
    window.__figmaTweaksImport = true;
    // Figma opens the menu on pointerdown and its overlay then takes the click, so listen to pointerdown (and click for the keyboard).
    var busy = false;
    var onMore = function (e) {
      if (busy || !e.target.closest || !e.target.closest('[data-testid="new-file-creation-more-button"]')) return;
      busy = true;
      var tries = 0;
      var t = setInterval(function () {
        var item = document.querySelector('[data-testid="file-import-button"]');
        if (item) { clearInterval(t); item.click(); busy = false; }
        else if (++tries > 40) { clearInterval(t); busy = false; }
      }, 25);
    };
    document.addEventListener('pointerdown', onMore, true);
    document.addEventListener('click', onMore, true);
  }
  if (!window.__figmaTweaksTimer) window.__figmaTweaksTimer = setInterval(put, 1000);
};`;

const exe = latestExe();

// Already running: just bring the existing window to front.
if (figmaRunning()) {
  spawn(exe, process.argv.slice(2), { detached: true, stdio: 'ignore' }).unref();
  process.exit(0);
}

const child = spawn(exe, ['--remote-debugging-pipe', ...process.argv.slice(2)], {
  stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'],
  windowsHide: false,
});
const toFigma = child.stdio[3];
const fromFigma = child.stdio[4];
log('started', exe);

let nextId = 1;
const sessions = new Set();
const pending = new Map(); // request id -> callback(result)
function send(method, params = {}, sessionId, cb) {
  const msg = { id: nextId++, method, params };
  if (sessionId) msg.sessionId = sessionId;
  if (cb) pending.set(msg.id, cb);
  try { toFigma.write(JSON.stringify(msg) + '\0'); } catch (e) { log('send error', e.message); }
}

// Variable tooltips: ../variable-tooltips.js (a function expression), reads its data from Figma's own page state.
function tooltipsScript() {
  try {
    const fn = fs.readFileSync(path.join(__dirname, '..', 'variable-tooltips.js'), 'utf8').trim();
    return `\n(${fn})();`;
  } catch (e) { log('tooltips read error', e.message); return ''; }
}

// Update modal: ../update-modal.js defines window.__figmaTweaksShowUpdate(version).
function modalScript() {
  try {
    const fn = fs.readFileSync(path.join(__dirname, '..', 'update-modal.js'), 'utf8').trim();
    return `\n(${fn})();`;
  } catch (e) { log('modal read error', e.message); return ''; }
}

function scriptFor(css) {
  return `${PAGE_FN}\nwindow.__figmaTweaks(${JSON.stringify(css)});${tooltipsScript()}${modalScript()}`;
}

// Self-update. When files changed, show the modal in the first visible Figma page (retry until one takes it).
let updatedVersion = null;
let modalRound = 0;
function showUpdateModal() {
  if (!updatedVersion) return;
  const mode = modalRound < 3 ? 'visible' : modalRound < 6 ? 'focus' : 'any'; // fall back if no page reports itself visible
  modalRound++;
  // All pages at once: a hidden page may never answer, it must not block the visible one.
  for (const sid of sessions) {
    send('Runtime.evaluate', {
      expression: `JSON.stringify([window.__figmaTweaksShowUpdate ? window.__figmaTweaksShowUpdate(${JSON.stringify(updatedVersion)}, ${JSON.stringify(mode)}) : 'nofn', document.visibilityState, document.hasFocus(), location.pathname.slice(0, 30)])`,
      returnByValue: true,
    }, sid, (r) => {
      let v = [];
      try { v = JSON.parse(r.result.value); } catch {}
      if (v[0] === true) { updatedVersion = null; log('update modal shown', mode, v[3]); }
    });
  }
}
setInterval(showUpdateModal, 3000);
require('./update')(log, (version) => { updatedVersion = version; showUpdateModal(); });

// "Перезапустить" in the modal: close Figma gracefully, wait until it is gone, start it via the Start menu shortcut.
function restartFigma() {
  const lnk = path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Figma.lnk').replace(/'/g, "''");
  const ps = `$n=0; while ((Get-Process Figma -ErrorAction SilentlyContinue) -and $n -lt 60) { Start-Sleep -Milliseconds 500; $n++ }; Start-Process '${lnk}'`;
  // Through `cmd /c start /b`: a plain detached powershell child dies together with this process.
  spawn('cmd', ['/c', 'start', '', '/b', 'powershell', '-NoProfile', '-Command', ps], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  execFileSync('taskkill', ['/IM', 'Figma.exe'], { stdio: 'ignore' });
}

// Keeps a single on-new-document script per page, replaced on every CSS change.
const scriptIds = new Map(); // sessionId -> identifier
function setNewDocScript(sessionId, src) {
  const old = scriptIds.get(sessionId);
  if (old) send('Page.removeScriptToEvaluateOnNewDocument', { identifier: old }, sessionId);
  send('Page.addScriptToEvaluateOnNewDocument', { source: src }, sessionId, (r) => {
    if (r && r.identifier) scriptIds.set(sessionId, r.identifier);
  });
}

function inject(sessionId) {
  const src = scriptFor(readCss());
  send('Page.enable', {}, sessionId);
  send('Runtime.enable', {}, sessionId);
  send('Runtime.addBinding', { name: 'figmaTweaksAction' }, sessionId);
  setNewDocScript(sessionId, src);
  send('Runtime.evaluate', { expression: src }, sessionId, (r) => {
    if (r && r.exceptionDetails) log('inject error', JSON.stringify(r.exceptionDetails).slice(0, 300));
  });
}

function attach(info) {
  if (info.type !== 'page' || info.attached) return;
  if (info.url && info.url.startsWith('file:')) return; // tab bar shell
  send('Target.attachToTarget', { targetId: info.targetId, flatten: true });
}

let buf = '';
fromFigma.on('data', (chunk) => {
  buf += chunk.toString('utf8');
  let i;
  while ((i = buf.indexOf('\0')) >= 0) {
    const raw = buf.slice(0, i);
    buf = buf.slice(i + 1);
    let msg;
    try { msg = JSON.parse(raw); } catch { continue; }
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result); pending.delete(msg.id); continue; }
    if (msg.method === 'Target.targetCreated') attach(msg.params.targetInfo);
    else if (msg.method === 'Target.attachedToTarget') {
      const sid = msg.params.sessionId;
      sessions.add(sid);
      inject(sid);
    } else if ((msg.method === 'Page.domContentEventFired' || msg.method === 'Page.frameNavigated') && msg.sessionId) {
      // Backup for pages where the on-new-document script did not run.
      send('Runtime.evaluate', { expression: scriptFor(readCss()) }, msg.sessionId);
    } else if (msg.method === 'Runtime.bindingCalled' && msg.params.name === 'figmaTweaksAction') {
      if (msg.params.payload === 'restart') { log('restart requested'); try { restartFigma(); } catch (e) { log('restart error', e.message); } }
    } else if (msg.method === 'Target.detachedFromTarget') {
      sessions.delete(msg.params.sessionId);
      scriptIds.delete(msg.params.sessionId);
    }
  }
});

send('Target.setDiscoverTargets', { discover: true });

// Live reload on save.
let timer = null;
fs.watch(path.dirname(CSS_FILE), (_e, file) => {
  if (![path.basename(CSS_FILE), 'variable-tooltips.js', 'update-modal.js'].includes(file)) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    const css = readCss();
    for (const sid of sessions) {
      send('Runtime.evaluate', { expression: scriptFor(css) }, sid);
      setNewDocScript(sid, scriptFor(css));
    }
    log('reloaded css');
  }, 150);
});

fromFigma.on('error', (e) => log('pipe error', e.message));
toFigma.on('error', (e) => log('pipe error', e.message));
child.on('exit', (code) => { log('figma exited', code); process.exit(0); });

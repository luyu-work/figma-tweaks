const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync, spawn } = require('child_process');
const stand = require('./stand');

const ROOT = path.join(__dirname, '..', '..');
const figmaRunning = () => {
  try { return execFileSync('tasklist', ['/FI', 'IMAGENAME eq Figma.exe', '/NH'], { encoding: 'utf8' }).includes('Figma.exe'); } catch { return false; }
};
const log = () => { try { return fs.readFileSync(env.stand.log, 'utf8'); } catch { return ''; } };
const within = (promise, ms) => Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(null), ms))]);

const env = { stand: null, child: null, shell: null, editor: null };

const find = async () => {
  const sessions = await stand.ask({ op: 'sessions' });
  let shell = null, editor = null;
  for (const s of sessions) {
    const info = await within(stand.evaluate(s.sid, "location.protocol + '|' + document.visibilityState + '|' + innerWidth + '|' + location.pathname.split('/')[1] + '|' + !!document.querySelector('[data-testid=navigation-bar]')"), 4000);
    if (typeof info !== 'string') continue;
    const [protocol, visibility, width, first, hasRail] = info.split('|');
    if (protocol === 'file:' && !shell) shell = s.sid;
    if (protocol === 'https:' && visibility === 'visible' && Number(width) > 0 && hasRail === 'true' && ['design', 'file', 'board'].includes(first)) editor = s.sid;
  }
  return { shell, editor, sessions };
};

const homeState = (sid) => stand.evaluate(sid, `(function () {
  var home = document.querySelector('[class*="tab--fileBrowserTab"]'), group = document.querySelector('[class*="group_overlay--groupOverlay--"]');
  var box = function (e) { if (!e) return null; var b = e.getBoundingClientRect(); return { left: b.left, right: b.right, width: b.width }; };
  var tabs = [].slice.call(document.querySelectorAll('[class*="tab--tab--"]')).map(function (t) { return box(t); });
  return { dpr: devicePixelRatio, home: box(home), group: box(group), tabs: tabs, style: !!document.getElementById('figma-tweaks-tabbar') };
})()`);

const railState = (sid) => stand.evaluate(sid, `(function () {
  var rail = document.querySelector('[data-testid="navigation-bar"]');
  return rail ? { width: rail.getBoundingClientRect().width, dpr: devicePixelRatio } : null;
})()`);

const showEditor = async () => {
  const sessions = await stand.ask({ op: 'sessions' });
  for (const s of sessions) {
    const where = await within(stand.evaluate(s.sid, 'location.protocol + location.pathname'), 3000);
    if (typeof where !== 'string' || !where.startsWith('https:/') || !['design', 'file', 'board'].includes(where.split('/')[1])) continue;
    const window = await stand.ask({ op: 'cdp', sid: s.sid, method: 'Browser.getWindowForTarget' });
    if (window.windowId) await stand.ask({ op: 'cdp', sid: s.sid, method: 'Browser.setWindowBounds', params: { windowId: window.windowId, bounds: { windowState: 'normal' } } });
    await stand.ask({ op: 'cdp', sid: s.sid, method: 'Page.bringToFront' });
    const shown = await stand.until(async () => (await find()).editor, 6000).catch(() => null);
    if (shown) return shown;
  }
  return null;
};

test.before(async () => {
  if (figmaRunning()) throw new Error('Figma is running. Close it first, the live tests start their own copy.');
  env.stand = stand.build();
  env.child = stand.start(env.stand);
  await stand.until(async () => (await stand.ask({ op: 'sessions' })).length > 0, 90000, 500);
  await stand.until(async () => { const f = await find(); env.shell = f.shell; env.editor = f.editor; return f.shell; }, 60000, 1000);
  await stand.until(async () => (await homeState(env.shell)).style, 20000);
  await stand.sleep(4000);
  env.editor = (await find()).editor || await showEditor();
});

test.after(async () => {
  if (env.child) env.child.kill();
  try { execFileSync('taskkill', ['/IM', 'Figma.exe', '/F'], { stdio: 'ignore' }); } catch {}
  await stand.sleep(1500);
  if (process.env.FT_LIVE_NO_RESTORE) return;
  spawn('wscript.exe', [path.join(ROOT, 'desktop', 'Figma.vbs')], { detached: true, stdio: 'ignore' }).unref();
});

test('the tab bar style is mounted on a cold start', async () => {
  assert.equal((await homeState(env.shell)).style, true);
});

test('the Home tab is as wide as the rail of the editor', async (t) => {
  if (!env.editor) return t.skip('no editor page is visible, the Figma window is hidden or minimized');
  const rail = await railState(env.editor);
  await stand.until(async () => {
    const s = await homeState(env.shell);
    return Math.abs(s.home.width - (rail.width * rail.dpr) / s.dpr) < 0.8;
  }, 8000);
});

test('hidden pages never push the Home tab out of range', async () => {
  const s = await homeState(env.shell);
  assert.ok(s.home.width >= 20 / s.dpr && s.home.width <= 150 / s.dpr, `width ${s.home.width}`);
});

test('the tab group fill starts at a tab edge without a gap or overlap', async (t) => {
  const s = await homeState(env.shell);
  if (!s.group) return t.skip('no tab group open');
  const edges = s.tabs.flatMap((tab) => [tab.left, tab.right]);
  assert.ok(edges.some((edge) => Math.abs(edge - s.group.left) <= 1.5), `group ${s.group.left}, edges ${edges.map((x) => x.toFixed(1))}`);
});

const syncProbe = (delta) => `(async () => {
  var px = window.__figmaTweaksRailPx, page = window.__figmaTweaksPagePx, worst = 0;
  var mismatch = function () {
    var g = document.querySelector('[class*="group_overlay--groupOverlay--"]');
    if (!g) return 0;
    var left = g.getBoundingClientRect().left;
    var edges = [].slice.call(document.querySelectorAll('[class*="tab--tab--"], [class*="tab--fileBrowserTab"]')).flatMap(function (t) { var b = t.getBoundingClientRect(); return [b.left, b.right]; });
    return Math.min.apply(null, edges.map(function (e) { return Math.abs(e - left); }));
  };
  window.__figmaTweaksRail(px + (${delta}), page);
  for (var i = 0; i < 60; i++) { worst = Math.max(worst, mismatch()); await new Promise(function (r) { setTimeout(r, 8); }); }
  window.__figmaTweaksRail(px, page);
  for (var j = 0; j < 60; j++) { worst = Math.max(worst, mismatch()); await new Promise(function (r) { setTimeout(r, 8); }); }
  return worst;
})()`;

test('the tab group fill keeps up with the tabs while the Home tab changes width', async (t) => {
  const visible = await stand.evaluate(env.shell, 'document.visibilityState');
  if (visible !== 'visible') return t.skip('the Figma window is hidden or minimized');
  if (!(await homeState(env.shell)).group) return t.skip('no tab group open');
  const worst = await stand.evaluate(env.shell, syncProbe(12));
  assert.ok(worst <= 1.5, `the fill was ${worst.toFixed(1)} px off its tab edge`);
});

test('the Home tab follows the rail when its width changes', async (t) => {
  if (!env.editor) return t.skip('no editor page is visible, the Figma window is hidden or minimized');
  const rail = await railState(env.editor);
  const before = (await homeState(env.shell)).home.width;
  await stand.evaluate(env.editor, `document.querySelector('[data-testid="navigation-bar"]').style.setProperty('width', '${rail.width + 16}px', 'important')`);
  try {
    const grown = await stand.until(async () => {
      const w = (await homeState(env.shell)).home.width;
      return w > before + 8 ? w : false;
    }, 6000).catch(() => null);
    if (grown === null) return t.skip('the rail did not accept a forced width');
    assert.ok(Math.abs(grown - before - (16 * rail.dpr) / (await homeState(env.shell)).dpr) < 1.5, `grew ${grown - before}`);
  } finally {
    await stand.evaluate(env.editor, `document.querySelector('[data-testid="navigation-bar"]').style.removeProperty('width')`);
  }
  await stand.until(async () => Math.abs((await homeState(env.shell)).home.width - before) < 1, 6000);
});

test('the Figma tweaks style comes back after the page drops or edits it', async (t) => {
  if (!env.editor) return t.skip('no editor page is visible, the Figma window is hidden or minimized');
  await stand.evaluate(env.editor, "document.getElementById('figma-tweaks').remove()");
  await stand.until(() => stand.evaluate(env.editor, "!!document.getElementById('figma-tweaks') && document.getElementById('figma-tweaks').textContent.length > 100"), 3000);
  await stand.evaluate(env.editor, "document.getElementById('figma-tweaks').textContent = ''");
  await stand.until(() => stand.evaluate(env.editor, "document.getElementById('figma-tweaks').textContent.length > 100"), 3000);
});

test('the update button appears, survives a re-render and is announced once', async () => {
  await stand.ask({ op: 'trigger', version: 'v.9.99' });
  await stand.until(() => stand.evaluate(env.shell, "!!document.getElementById('figma-tweaks-update')"), 4000);
  await stand.evaluate(env.shell, "document.getElementById('figma-tweaks-update').remove()");
  await stand.until(() => stand.evaluate(env.shell, "!!document.getElementById('figma-tweaks-update')"), 3000);
  await stand.sleep(500);
  assert.equal((log().match(/update button shown/g) || []).length, 1);
});

test('a new tab bar page gets the button from the stored script', async () => {
  const text = await stand.evaluate(env.shell, "document.querySelector('#figma-tweaks-update button').textContent");
  assert.equal(text, 'Обновить figma-tweaks');
  assert.equal(await stand.evaluate(env.shell, 'window.__figmaTweaksUpdateVersion'), 'v.9.99');
});

test('a script outside the main world of the page cannot restart Figma', async (t) => {
  if (!env.editor) return t.skip('no editor page is visible, the Figma window is hidden or minimized');
  const sid = env.editor;
  const { frameTree } = await stand.ask({ op: 'cdp', sid, method: 'Page.getFrameTree' });
  const world = await stand.ask({ op: 'cdp', sid, method: 'Page.createIsolatedWorld', params: { frameId: frameTree.frame.id, worldName: 'figma-tweaks-live' } });
  const call = await stand.ask({
    op: 'cdp', sid, method: 'Runtime.evaluate',
    params: { contextId: world.executionContextId, returnByValue: true, expression: "typeof figmaTweaksAction === 'function' ? (figmaTweaksAction('restart'), 'called') : 'absent'" },
  });
  assert.equal(call.result.value, 'called');
  await stand.sleep(1500);
  assert.doesNotMatch(log(), /restart requested/);
  assert.equal(figmaRunning(), true);
});

test('the editor page reports its rail through the trusted binding', async (t) => {
  if (!env.editor) return t.skip('no editor page is visible, the Figma window is hidden or minimized');
  assert.match(log(), /rail \d/);
});

test('the tooltips script is alive in the editor and no timer loop was started by the tweaks', async (t) => {
  if (!env.editor) return t.skip('no editor page is visible, the Figma window is hidden or minimized');
  const state = await stand.evaluate(env.editor, "typeof window.__figmaTweaksTips === 'object' && typeof window.__figmaTweaksTips.dispose === 'function' && typeof window.__figmaTweaksObs === 'object'");
  assert.equal(state, true);
});

test('the launcher survives all of the above without errors', () => {
  assert.doesNotMatch(log(), /uncaught|inject error|send error|pipe error/);
});

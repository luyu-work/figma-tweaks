const test = require('node:test');
const assert = require('node:assert/strict');
const { runPage, available } = require('../helpers/chrome');
const { read } = require('../helpers/sources');

const skip = !available && 'Chrome not found';
const tabbar = `(function () { var state = window.state = {};\n${read('tooltips', '60-tabbar.js')}\n})();`;
const record = 'window.actions = []; window.figmaTweaksAction = (a) => window.actions.push(a);';

const shell = {
  scale: 1.25,
  head: '<style>body{margin:0}.tab_bar--container--a{height:38px;border-bottom:1px solid #fff;display:flex}.tab--fileBrowserTab--b{width:72px}.group_overlay--groupOverlay--c{height:38px}</style>',
  body: '<div class="tab_bar--container--a" id="container"><div class="tab--fileBrowserTab--b" id="home">home</div><div class="group_overlay--groupOverlay--c" id="group"></div></div>',
};

const homeStyle = `() => {
  const s = getComputedStyle(document.getElementById('home'));
  return { width: s.width, marginLeft: s.marginLeft, minWidth: s.minWidth, flexBasis: s.flexBasis, flexGrow: s.flexGrow, padding: s.paddingLeft, justify: s.justifyContent, transition: s.transitionProperty };
}`;

test('the tab bar style is mounted in the head', { skip }, async () => {
  const result = await runPage({ ...shell, scripts: [tabbar], test: async () => document.getElementById('figma-tweaks-tabbar').parentElement.tagName });
  assert.equal(result, 'HEAD');
});

test('without a head the style waits for DOMContentLoaded and mounts then', { skip }, async () => {
  const result = await runPage({
    ...shell,
    scripts: [
      "Object.defineProperty(document, 'head', { get: () => null, configurable: true });",
      tabbar,
      "window.beforeMount = document.querySelectorAll('#figma-tweaks-tabbar').length; delete document.head;",
    ],
    test: async () => ({
      before: window.beforeMount,
      after: document.querySelectorAll('#figma-tweaks-tabbar').length,
      parent: document.getElementById('figma-tweaks-tabbar').parentElement.tagName,
    }),
  });
  assert.deepEqual(result, { before: 0, after: 1, parent: 'HEAD' });
});

test('the style is never added to the document itself', { skip }, async () => {
  const result = await runPage({
    ...shell,
    scripts: ["Object.defineProperty(document, 'head', { get: () => null, configurable: true });", tabbar],
    test: async () => document.documentElement.parentNode === document && [...document.childNodes].map((n) => n.nodeName),
  });
  assert.ok(!result.includes('STYLE'));
});

test('the bottom line is solid and the group fill covers it', { skip }, async () => {
  const result = await runPage({
    ...shell,
    scripts: [tabbar],
    test: async () => ({ line: getComputedStyle(document.getElementById('container')).borderBottomColor, fill: getComputedStyle(document.getElementById('group')).height }),
  });
  assert.deepEqual(result, { line: 'rgb(65, 65, 65)', fill: '38.8px' });
});

test('the Home tab is 44 wide with a small inset until the editor reports', { skip }, async () => {
  const result = await runPage({ ...shell, scripts: [tabbar], test: eval(homeStyle) });
  assert.deepEqual(result, { width: '44px', marginLeft: '0.8px', minWidth: '0px', flexBasis: '44px', flexGrow: '0', padding: '0px', justify: 'center', transition: 'all' });
});

test('the Home tab takes the rail width and inset reported by the editor', { skip }, async () => {
  const result = await runPage({
    ...shell,
    scripts: [tabbar],
    test: async () => {
      window.__figmaTweaksRail(68.9, (innerWidth - 2.4) * devicePixelRatio);
      const s = getComputedStyle(document.getElementById('home'));
      return { width: s.width, marginLeft: s.marginLeft, flexBasis: s.flexBasis };
    },
  });
  assert.ok(Math.abs(parseFloat(result.width) - 55.12) < 0.02, result.width);
  assert.equal(result.marginLeft, '1.2px');
  assert.ok(Math.abs(parseFloat(result.flexBasis) - 55.12) < 0.02, result.flexBasis);
});

test('the Home tab changes width at once, so the group fill can follow it', { skip }, async () => {
  const result = await runPage({
    ...shell,
    scripts: [tabbar],
    test: async () => {
      window.__figmaTweaksRail(68.9, 1000);
      const first = getComputedStyle(document.getElementById('home'));
      const transition = first.transitionDuration;
      window.__figmaTweaksRail(80, 1000);
      return { transition, width: parseFloat(getComputedStyle(document.getElementById('home')).width) };
    },
  });
  assert.equal(result.transition, '0s');
  assert.ok(Math.abs(result.width - 64) < 0.02, String(result.width));
});

test('a width known before the page loaded is applied from the start', { skip }, async () => {
  const result = await runPage({
    ...shell,
    scripts: ['window.__figmaTweaksRailPx = 68.9; window.__figmaTweaksPagePx = 1000;', tabbar],
    test: async () => parseFloat(getComputedStyle(document.getElementById('home')).width),
  });
  assert.ok(Math.abs(result - 55.12) < 0.02, String(result));
});

test('Figma measures the tabs again at once, with the new width already in layout', { skip }, async () => {
  const result = await runPage({
    ...shell,
    scripts: [tabbar],
    test: async () => {
      const seen = [];
      window.addEventListener('resize', () => seen.push(parseFloat(getComputedStyle(document.getElementById('home')).width)));
      window.__figmaTweaksRail(68.9, 1000);
      const sync = seen.length;
      await sleep(100);
      return { sync, widths: seen };
    },
  });
  assert.equal(result.sync, 1);
  assert.ok(result.widths.every((w) => Math.abs(w - 55.12) < 0.02), result.widths.join());
  assert.ok(result.widths.length >= 2);
});

const editor = {
  host: 'figma.com',
  scale: 1.25,
  head: '<style>body{margin:0}</style>',
  body: '<nav data-testid="navigation-bar" id="rail" style="width:44px;height:200px"></nav>',
};



test('the editor reports the rail width in physical pixels with its own width', { skip }, async () => {
  const result = await runPage({
    ...editor,
    scripts: [record, tabbar],
    test: async () => { await sleep(300); return { actions: window.actions, expected: `rail:55:${innerWidth * devicePixelRatio}` }; },
  });
  assert.deepEqual(result.actions, [result.expected]);
});

test('the editor reports again when the rail changes and stays silent when it does not', { skip }, async () => {
  const result = await runPage({
    ...editor,
    scripts: [record, tabbar],
    test: async () => {
      await sleep(300);
      const rail = document.getElementById('rail');
      rail.style.height = '300px';
      await sleep(300);
      const same = window.actions.length;
      rail.style.width = '64px';
      await sleep(300);
      return { same, widths: window.actions.map((a) => a.split(':')[1]) };
    },
  });
  assert.equal(result.same, 1);
  assert.deepEqual(result.widths, ['55', '80']);
});

test('rapid rail changes are reported once, after they stopped', { skip }, async () => {
  const result = await runPage({
    ...editor,
    scripts: [record, tabbar],
    test: async () => {
      await sleep(300);
      const rail = document.getElementById('rail');
      for (const w of [50, 56, 60, 64]) { rail.style.width = w + 'px'; await sleep(30); }
      await sleep(300);
      return window.actions.map((a) => a.split(':')[1]);
    },
  });
  assert.deepEqual(result, ['55', '80']);
});

test('a hidden editor page reports nothing, and reports when it is shown', { skip }, async () => {
  const result = await runPage({
    ...editor,
    scripts: [record, "let state = 'hidden'; Object.defineProperty(document, 'visibilityState', { get: () => state, configurable: true }); window.setVisible = (v) => { state = v; document.dispatchEvent(new Event('visibilitychange')); };", tabbar],
    test: async () => {
      await sleep(300);
      const hidden = window.actions.length;
      setVisible('visible');
      await sleep(300);
      return { hidden, shown: window.actions.length };
    },
  });
  assert.deepEqual(result, { hidden: 0, shown: 1 });
});

test('a rail far outside the real range is ignored', { skip }, async () => {
  const result = await runPage({
    ...editor,
    scripts: [record, tabbar],
    test: async () => {
      await sleep(300);
      const rail = document.getElementById('rail');
      rail.style.width = '5px';
      await sleep(300);
      rail.style.width = '400px';
      await sleep(300);
      return window.actions.map((a) => a.split(':')[1]);
    },
  });
  assert.deepEqual(result, ['55']);
});

test('a rail mounted late is picked up when the page tells the watcher', { skip }, async () => {
  const result = await runPage({
    ...editor,
    body: '',
    scripts: [record, tabbar],
    test: async () => {
      await sleep(200);
      const none = window.actions.length;
      const rail = document.createElement('nav');
      rail.setAttribute('data-testid', 'navigation-bar');
      rail.style.cssText = 'width:44px;height:100px';
      document.body.appendChild(rail);
      window.state.watchRail();
      await sleep(300);
      return { none, widths: window.actions.map((a) => a.split(':')[1]) };
    },
  });
  assert.deepEqual(result, { none: 0, widths: ['55'] });
});

test('a replaced rail element is observed again', { skip }, async () => {
  const result = await runPage({
    ...editor,
    scripts: [record, tabbar],
    test: async () => {
      await sleep(300);
      document.getElementById('rail').remove();
      const rail = document.createElement('nav');
      rail.setAttribute('data-testid', 'navigation-bar');
      rail.style.cssText = 'width:56px;height:100px';
      document.body.appendChild(rail);
      window.state.watchRail();
      await sleep(300);
      return window.actions.map((a) => a.split(':')[1]);
    },
  });
  assert.deepEqual(result, ['55', '70']);
});

test('after dispose the editor stops reporting', { skip }, async () => {
  const result = await runPage({
    ...editor,
    scripts: [record, tabbar],
    test: async () => {
      await sleep(300);
      window.state.railOff();
      document.getElementById('rail').style.width = '60px';
      window.dispatchEvent(new Event('resize'));
      await sleep(300);
      return window.actions.length;
    },
  });
  assert.equal(result, 1);
});

test('pages that are neither the shell nor the editor do nothing', { skip }, async () => {
  const result = await runPage({
    host: 'example.org',
    scripts: [record, tabbar],
    test: async () => ({ style: document.getElementById('figma-tweaks-tabbar') === null, actions: window.actions.length, watch: typeof window.state.watchRail }),
  }).catch((e) => e);
  assert.ok(result instanceof Error || (result.style && result.actions === 0 && result.watch === 'undefined'));
});

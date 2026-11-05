const test = require('node:test');
const assert = require('node:assert/strict');
const { runPage, available } = require('../helpers/chrome');
const { tooltipsScript } = require('../helpers/sources');
const { figFile } = require('../helpers/kiwi');

const skip = !available && 'Chrome not found';

const support = `
window.fiber = (el, props, parent) => { el['__reactFiber$test'] = { memoizedProps: props, return: parent || null }; return el; };
window.hover = async (el, wait = 320) => { el.dispatchEvent(new PointerEvent('pointerover', { bubbles: true })); await sleep(wait); };
window.tip = () => {
  const t = document.getElementById('figma-tweaks-tip');
  return t && t.style.display === 'block' ? [...t.children].map((c) => c.textContent) : null;
};
window.fetchLog = [];
window.fetchHandlers = [];
window.fetch = (url) => {
  window.fetchLog.push(String(url));
  for (const handler of window.fetchHandlers) { const r = handler(String(url)); if (r) return Promise.resolve(r); }
  return Promise.resolve({ ok: false });
};
window.scene = {};
window._fullscreen_ = { _store: { getState: () => ({ mirror: { sceneGraph: { get: (id) => window.scene[id] } } }) } };
window.bytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
window.serveCanvas = (delay = 0) => window.fetchHandlers.push((url) => url.includes('/api/file_proxy/style/') ? { ok: true, arrayBuffer: async () => { await sleep(delay); return bytes(window.FIG); } } : null);
window.remote = (hash = 'h1', key = 'k2') => fiber(document.getElementById('style'), { style: { key, node_id: '9:9', file_key: 'LIB', description: 'Remote', isLocal: false, content_hash: hash, library_key: '' } });
window.canvasCalls = (key) => window.fetchLog.filter((u) => u.includes('/api/file_proxy/style/' + key + '/canvas')).length;
window.release = () => document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
`;

const figma = (extra = {}) => ({ host: 'figma.com', path: '/design/FILEKEY/test', scripts: [support, tooltipsScript()], ...extra });
const swatch = (css, id = 's') => `<i id="${id}" style="display:inline-block;width:16px;height:16px;background:${css}"></i>`;
const row = (inner) => `<div data-testid="variable-list-item" id="row" style="position:absolute;left:30px;top:40px;width:200px;height:24px">${inner}</div>`;

test('a variable row shows its description and the colour with opacity', { skip }, async () => {
  const result = await runPage(figma({
    body: row(swatch('rgb(255, 0, 0)')),
    test: async () => {
      fiber(document.getElementById('row'), { variable: { name: 'brand', description: 'Primary brand colour' } });
      await hover(document.getElementById('s'));
      return tip();
    },
  }));
  assert.deepEqual(result, ['Primary brand colour', '#FF0000 · 100%']);
});

test('every colour notation becomes HEX and a percentage', { skip }, async () => {
  const result = await runPage(figma({
    body: row(swatch('rgba(0, 128, 255, 0.5)')),
    test: async () => {
      const cases = ['rgba(0, 128, 255, 0.5)', 'color(srgb 1 0 0 / 0.25)', 'rgb(18 52 86)', '#abcdef', 'rgba(255, 255, 255, 0.07)'];
      const out = [];
      for (const css of cases) {
        const r = document.getElementById('row');
        r.innerHTML = `<i id="s" style="display:inline-block;width:16px;height:16px;background:${css}"></i>`;
        fiber(r, { variable: { name: 'x', description: '' } });
        document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        await hover(document.getElementById('s'));
        out.push(tip());
        document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        await sleep(30);
        r.innerHTML = '';
        await hover(document.body, 30);
      }
      return out;
    },
  }));
  assert.deepEqual(result, [['#0080FF · 50%'], ['#FF0000 · 25%'], ['#123456 · 100%'], ['#ABCDEF · 100%'], ['#FFFFFF · 7%']]);
});

test('a row with only a colour shows the colour line alone', { skip }, async () => {
  const result = await runPage(figma({
    body: row(swatch('rgb(1, 2, 3)')),
    test: async () => {
      fiber(document.getElementById('row'), { variable: { name: 'x' } });
      await hover(document.getElementById('s'));
      const t = document.getElementById('figma-tweaks-tip');
      return { lines: tip(), opacity: t.firstElementChild.style.opacity };
    },
  }));
  assert.deepEqual(result, { lines: ['#010203 · 100%'], opacity: '' });
});

test('a fully transparent swatch is skipped and a row with nothing to say shows no tooltip', { skip }, async () => {
  const result = await runPage(figma({
    body: row(swatch('rgba(0, 0, 0, 0)')),
    test: async () => {
      fiber(document.getElementById('row'), { variable: { name: 'x', description: '' } });
      await hover(document.getElementById('s'));
      const none = tip();
      fiber(document.getElementById('row'), { variable: { name: 'x', description: 'Only text' } });
      await hover(document.body, 30);
      await hover(document.getElementById('s'));
      return { none, text: tip() };
    },
  }));
  assert.deepEqual(result, { none: null, text: ['Only text'] });
});

test('the first small box with a visible fill is the swatch', { skip }, async () => {
  const result = await runPage(figma({
    body: row('<b style="display:inline-block;width:4px;height:4px;background:#111"></b><b style="display:inline-block;width:60px;height:20px;background:#222"></b><i id="s" style="display:inline-block;width:16px;height:16px;background:rgb(10, 20, 30)"></i>'),
    test: async () => {
      fiber(document.getElementById('row'), { variable: { name: 'x', description: 'd' } });
      await hover(document.getElementById('s'));
      return tip();
    },
  }));
  assert.deepEqual(result, ['d', '#0A141E · 100%']);
});

test('the tooltip sits below the swatch, left edges aligned', { skip }, async () => {
  const result = await runPage(figma({
    body: row(swatch('rgb(255, 0, 0)')),
    test: async () => {
      fiber(document.getElementById('row'), { variable: { name: 'x', description: 'd' } });
      await hover(document.getElementById('s'));
      const s = document.getElementById('s').getBoundingClientRect(), t = document.getElementById('figma-tweaks-tip').getBoundingClientRect();
      return { left: t.left - s.left, gap: t.top - s.bottom };
    },
  }));
  assert.deepEqual(result, { left: 0, gap: 8 });
});

test('the tooltip opens above when there is no room below', { skip }, async () => {
  const result = await runPage(figma({
    body: `<div data-testid="variable-list-item" id="row" style="position:fixed;left:30px;bottom:6px;width:200px;height:24px">${swatch('rgb(255, 0, 0)')}</div>`,
    test: async () => {
      fiber(document.getElementById('row'), { variable: { name: 'x', description: 'd' } });
      await hover(document.getElementById('s'));
      const s = document.getElementById('s').getBoundingClientRect(), t = document.getElementById('figma-tweaks-tip').getBoundingClientRect();
      return t.bottom <= s.top;
    },
  }));
  assert.equal(result, true);
});

test('pressing the mouse hides the tooltip', { skip }, async () => {
  const result = await runPage(figma({
    body: row(swatch('rgb(255, 0, 0)')),
    test: async () => {
      fiber(document.getElementById('row'), { variable: { name: 'x', description: 'd' } });
      await hover(document.getElementById('s'));
      const shown = tip();
      document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      return { shown, hidden: tip() };
    },
  }));
  assert.deepEqual(result, { shown: ['d', '#FF0000 · 100%'], hidden: null });
});

test('a tooltip opens quickly right after another one closed', { skip }, async () => {
  const result = await runPage(figma({
    body: row(swatch('rgb(255, 0, 0)')) + '<div data-testid="variable-list-item" id="row2" style="position:absolute;left:30px;top:90px;width:200px;height:24px"><i id="s2" style="display:inline-block;width:16px;height:16px;background:rgb(0, 255, 0)"></i></div>',
    test: async () => {
      fiber(document.getElementById('row'), { variable: { name: 'a', description: 'a' } });
      fiber(document.getElementById('row2'), { variable: { name: 'b', description: 'b' } });
      await hover(document.getElementById('s'));
      const cold = await (async () => { const t = performance.now(); await hover(document.body, 5); return t; })();
      document.getElementById('s2').dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
      await sleep(80);
      return { warm: tip(), cold: cold > 0 };
    },
  }));
  assert.deepEqual(result.warm, ['b', '#00FF00 · 100%']);
});

test('an applied variable chip shows its description and value', { skip }, async () => {
  const result = await runPage(figma({
    body: '<button id="chip" style="position:absolute;left:20px;top:20px;width:150px;height:28px"><span id="label" data-tooltip="variable">chip</span></button>',
    test: async () => {
      const label = document.getElementById('label');
      fiber(label, {}, { memoizedProps: { variableName: 'brand', variableDescription: 'Applied', variableValue: '#123456 · 80%' }, return: null });
      await hover(label);
      return { lines: tip(), own: document.getElementById('label').hasAttribute('data-tooltip') };
    },
  }));
  assert.deepEqual(result, { lines: ['Applied', '#123456 · 80%'], own: false });
});

test('an applied variable with nothing to show has no tooltip', { skip }, async () => {
  const result = await runPage(figma({
    body: '<button id="chip" style="position:absolute;left:20px;top:20px;width:150px;height:28px"><span id="label">chip</span></button>',
    test: async () => {
      const label = document.getElementById('label');
      fiber(label, {}, { memoizedProps: { variableName: 'brand' }, return: null });
      await hover(label);
      return tip();
    },
  }));
  assert.equal(result, null);
});

const styleRow = (attrs = '') => `<div id="style" ${attrs} style="position:absolute;left:20px;top:20px;width:200px;height:28px"><svg id="icon" width="16" height="16"></svg><span id="name">Heading</span></div>`;
const styleProps = (extra = '') => `{ style: { key: 'k1', node_id: '1:2', file_key: 'F', description: 'Page title', isLocal: true, library_key: '' ${extra} } }`;
const textNode = (style, spacing, size = 16) => `window.scene['1:2'] = { type: 'TEXT', fontName: { style: ${JSON.stringify(style)} }, letterSpacing: ${spacing}, fontSize: ${size} };`;

test('a local text style shows weight and letter spacing from the scene graph', { skip }, async () => {
  const result = await runPage(figma({
    body: styleRow('data-tooltip="style_info" data-tooltip-style-description="Page title"'),
    test: async () => {
      window.scene['1:2'] = { type: 'TEXT', fontName: { style: 'Semi Bold' }, letterSpacing: { units: 'PERCENT', value: -2 }, fontSize: 16 };
      fiber(document.getElementById('style'), { style: { key: 'k1', node_id: '1:2', file_key: 'F', description: 'Page title', isLocal: true } });
      await hover(document.getElementById('name'));
      const el = document.getElementById('style');
      return { lines: tip(), figmaTip: el.hasAttribute('data-tooltip'), taken: el.getAttribute('data-ft-style'), description: el.getAttribute('data-ft-description') };
    },
  }));
  assert.deepEqual(result, { lines: ['Page title', 'Semi Bold · -2%'], figmaTip: false, taken: '1', description: 'Page title' });
});

test('letter spacing in pixels becomes a percentage of the font size, a missing one is 0%', { skip }, async () => {
  const result = await runPage(figma({
    body: styleRow('data-tooltip="style_info"'),
    test: async () => {
      fiber(document.getElementById('style'), { style: { key: 'k1', node_id: '1:2', file_key: 'F', description: 'T', isLocal: true } });
      const out = [];
      for (const [spacing, size] of [[{ units: 'PIXELS', value: 2 }, 16], [{ units: 'PIXELS', value: 1 }, 24], [null, 16], [{ units: 'PERCENT', value: 0.123 }, 16]]) {
        window.scene['1:2'] = { type: 'TEXT', fontName: { style: 'Regular' }, letterSpacing: spacing, fontSize: size };
        document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        await hover(document.body, 30);
        await hover(document.getElementById('name'));
        out.push(tip()[1]);
      }
      return out;
    },
  }));
  assert.deepEqual(result, ['Regular · 12.5%', 'Regular · 4.17%', 'Regular · 0%', 'Regular · 0.12%']);
});

test('a numeric weight of a variable font is named after the nearest standard weight', { skip }, async () => {
  const result = await runPage(figma({
    body: styleRow('data-tooltip="style_info"'),
    test: async () => {
      fiber(document.getElementById('style'), { style: { key: 'k1', node_id: '1:2', file_key: 'F', description: 'T', isLocal: true } });
      const out = [];
      for (const weight of ['600', '450', '50', '1000', '400']) {
        window.scene['1:2'] = { type: 'TEXT', fontName: { style: weight }, letterSpacing: null, fontSize: 16 };
        document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        await hover(document.body, 30);
        await hover(document.getElementById('name'));
        out.push(tip()[1].split(' · ')[0]);
      }
      return out;
    },
  }));
  assert.deepEqual(result, ['Semi Bold', 'Medium', 'Thin', 'Black', 'Regular']);
});

test('an edited local style shows the new values on the next hover', { skip }, async () => {
  const result = await runPage(figma({
    body: styleRow('data-tooltip="style_info"'),
    test: async () => {
      fiber(document.getElementById('style'), { style: { key: 'k1', node_id: '1:2', file_key: 'F', description: 'T', isLocal: true } });
      window.scene['1:2'] = { type: 'TEXT', fontName: { style: 'Bold' }, letterSpacing: null, fontSize: 16 };
      await hover(document.getElementById('name'));
      const before = tip()[1];
      document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      await hover(document.body, 30);
      window.scene['1:2'] = { type: 'TEXT', fontName: { style: 'Light' }, letterSpacing: { units: 'PERCENT', value: 5 }, fontSize: 16 };
      await hover(document.getElementById('name'));
      return { before, after: tip()[1] };
    },
  }));
  assert.deepEqual(result, { before: 'Bold · 0%', after: 'Light · 5%' });
});

test('a style row in the Assets panel works without tooltip attributes', { skip }, async () => {
  const result = await runPage(figma({
    body: '<div role="treeitem" id="item" style="position:absolute;left:20px;top:20px;width:200px;height:28px"><svg width="16" height="16"></svg><span id="name">Body</span></div><div role="treeitem" id="other" style="position:absolute;left:20px;top:60px;width:200px;height:28px"><span id="otherName">Fill</span></div>',
    test: async () => {
      window.scene['1:2'] = { type: 'TEXT', fontName: { style: 'Medium' }, letterSpacing: null, fontSize: 16 };
      fiber(document.getElementById('item'), { style: { key: 'k1', node_id: '1:2', file_key: 'F', description: 'Body text', isLocal: true, style_type: 'TEXT' } });
      fiber(document.getElementById('other'), { style: { key: 'k9', node_id: '1:9', file_key: 'F', description: 'Colour', isLocal: true, style_type: 'FILL' } });
      await hover(document.getElementById('name'));
      const text = tip();
      document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      await hover(document.getElementById('otherName'));
      return { text, fill: tip() };
    },
  }));
  assert.deepEqual(result, { text: ['Body text', 'Medium · 0%'], fill: null });
});

const fig = (node) => `window.FIG = '${figFile(node).toString('base64')}';`;
const stored = (entries) => `localStorage.setItem('figmaTweaks.styles', ${JSON.stringify(JSON.stringify(entries))});`;
const remoteStyles = (...extra) => figma({ body: styleRow('data-tooltip="style_info"'), scripts: [...extra, support, tooltipsScript()] });

test('a library style is read from its published file and the tooltip updates when it arrives', { skip }, async () => {
  const result = await runPage({
    ...remoteStyles(fig({ style: 'Bold', fontSize: 16, spacing: -2, units: 'PERCENT' })),
    test: async () => {
      serveCanvas(600);
      remote();
      await hover(document.getElementById('name'));
      const early = tip();
      await sleep(700);
      return { early, loaded: tip(), calls: canvasCalls('k2'), url: window.fetchLog.find((u) => u.includes('/canvas')) };
    },
  });
  assert.deepEqual(result.early, ['Remote']);
  assert.deepEqual(result.loaded, ['Remote', 'Bold · -2%']);
  assert.equal(result.calls, 1);
  assert.match(result.url, /\/api\/file_proxy\/style\/k2\/canvas\?fv=60&ver=h1$/);
});

test('a style that was loaded is not requested again and is stored for later sessions', { skip }, async () => {
  const result = await runPage({
    ...remoteStyles(fig({ style: 'Bold', fontSize: 16, spacing: 3, units: 'PERCENT' })),
    test: async () => {
      serveCanvas();
      remote();
      await hover(document.getElementById('name'), 400);
      release();
      await hover(document.body, 30);
      await hover(document.getElementById('name'), 400);
      await sleep(1200);
      return { calls: canvasCalls('k2'), lines: tip(), saved: JSON.parse(localStorage.getItem('figmaTweaks.styles')).k2 };
    },
  });
  assert.equal(result.calls, 1);
  assert.deepEqual(result.lines, ['Remote', 'Bold · 3%']);
  assert.deepEqual(result.saved, { h: 'h1', w: 'Bold', s: '3%' });
});

test('a stored style is shown at once without any request', { skip }, async () => {
  const result = await runPage({
    ...remoteStyles(stored({ k2: { h: 'h1', w: 'Light', s: '1%' } })),
    test: async () => {
      remote('h1');
      await hover(document.getElementById('name'));
      return { lines: tip(), calls: canvasCalls('k2') };
    },
  });
  assert.deepEqual(result, { lines: ['Remote', 'Light · 1%'], calls: 0 });
});

test('a stored style of an older version is requested again', { skip }, async () => {
  const result = await runPage({
    ...remoteStyles(stored({ k2: { h: 'h1', w: 'Light', s: '1%' } }), fig({ style: 'Black', fontSize: 16, spacing: 0, units: 'PERCENT' })),
    test: async () => {
      serveCanvas();
      remote('h2');
      await hover(document.getElementById('name'), 400);
      return { lines: tip(), calls: canvasCalls('k2') };
    },
  });
  assert.deepEqual(result, { lines: ['Remote', 'Black · 0%'], calls: 1 });
});

test('a failed style request is not repeated for 30 seconds', { skip }, async () => {
  const result = await runPage({
    ...remoteStyles(),
    test: async () => {
      remote();
      await hover(document.getElementById('name'), 300);
      release();
      await hover(document.body, 30);
      await hover(document.getElementById('name'), 300);
      return { lines: tip(), calls: canvasCalls('k2') };
    },
  });
  assert.deepEqual(result, { lines: ['Remote'], calls: 1 });
});

test('the first style of a library loads all its text styles four at a time', { skip, timeout: 30000 }, async () => {
  const styles = Array.from({ length: 9 }, (_, i) => ({ key: `lib${i}`, node_id: `7:${i}`, file_key: 'LIB', style_type: i === 8 ? 'FILL' : 'TEXT', content_hash: 'x' }));
  const result = await runPage({
    ...remoteStyles(fig({ style: 'Regular', fontSize: 16, spacing: 0, units: 'PERCENT' }), `window.STYLES = ${JSON.stringify(styles)};`),
    test: async () => {
      let active = 0, peak = 0;
      window.fetchHandlers.push((url) => {
        if (url.includes('/library/L1/styles')) return { ok: true, json: async () => ({ meta: { styles: window.STYLES } }) };
        if (url.includes('/api/file_proxy/style/lib')) {
          active++;
          peak = Math.max(peak, active);
          return { ok: true, arrayBuffer: async () => { await sleep(80); active--; return bytes(window.FIG); } };
        }
        return null;
      });
      fiber(document.getElementById('style'), { style: { key: 'k5', node_id: '9:9', file_key: 'LIB', description: 'First', isLocal: false, content_hash: 'h', library_key: 'L1' } });
      await hover(document.getElementById('name'), 100);
      release();
      await hover(document.body, 30);
      await hover(document.getElementById('name'), 100);
      await sleep(1500);
      return {
        listCalls: window.fetchLog.filter((u) => u.includes('/library/L1/styles')).length,
        loaded: [...new Set(window.fetchLog.filter((u) => /style\/lib\d/.test(u)).map((u) => u.match(/style\/(lib\d)/)[1]))].sort(),
        peak,
      };
    },
  });
  assert.equal(result.listCalls, 1);
  assert.deepEqual(result.loaded, ['lib0', 'lib1', 'lib2', 'lib3', 'lib4', 'lib5', 'lib6', 'lib7']);
  assert.ok(result.peak <= 4, `peak ${result.peak}`);
});

test('a few seconds after a file opens its libraries with text styles are preloaded', { skip, timeout: 30000 }, async () => {
  const result = await runPage(figma({
    test: async () => {
      window.fetchHandlers.push((url) => {
        if (url.includes('/api/design_systems/v2/libraries?file_key=FILEKEY')) return { ok: true, json: async () => ({ meta: [{ library_key: 'A', num_styles: 2 }, { library_key: 'B', num_styles: 0 }] }) };
        if (url.includes('/library/A/styles')) return { ok: true, json: async () => ({ meta: { styles: [] } }) };
        return null;
      });
      const early = window.fetchLog.length;
      await sleep(3500);
      return { early, log: window.fetchLog.filter((u) => u.includes('design_systems')) };
    },
  }));
  assert.equal(result.early, 0);
  assert.deepEqual(result.log.map((u) => u.replace(/\?.*/, '')), ['/api/design_systems/v2/libraries', '/api/design_systems/v2/library/A/styles']);
});

test('a page that is not a file does not preload anything', { skip, timeout: 30000 }, async () => {
  const result = await runPage(figma({ path: '/files/recent', test: async () => { await sleep(3500); return window.fetchLog.length; } }));
  assert.equal(result, 0);
});

test('injecting again replaces the previous instance completely', { skip }, async () => {
  const result = await runPage(figma({
    scripts: [support, tooltipsScript(), tooltipsScript()],
    body: row(swatch('rgb(255, 0, 0)')),
    test: async () => {
      fiber(document.getElementById('row'), { variable: { name: 'x', description: 'once' } });
      await hover(document.getElementById('s'));
      return { tips: document.querySelectorAll('#figma-tweaks-tip').length, lines: tip() };
    },
  }));
  assert.deepEqual(result, { tips: 1, lines: ['once', '#FF0000 · 100%'] });
});

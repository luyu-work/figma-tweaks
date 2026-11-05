const test = require('node:test');
const assert = require('node:assert/strict');
const { runPage, screenshot, available } = require('../helpers/chrome');
const { decode } = require('../helpers/png');
const { userCss } = require('../helpers/sources');

const skip = !available && 'Chrome not found';
const css = userCss();

const topLevelBlocks = () => {
  let depth = 0, count = 0;
  for (const ch of css.replace(/\/\*[\s\S]*?\*\//g, '')) {
    if (ch === '{') { if (depth === 0) count++; depth++; }
    if (ch === '}') depth--;
  }
  return count;
};

const styled = (extra = '') => ({ head: `<style id="tweaks">${css}</style><style>${extra}</style>` });

test('every rule of userContent.css is valid and kept by the browser', { skip }, async () => {
  const result = await runPage({ ...styled(), test: async () => document.getElementById('tweaks').sheet.cssRules.length });
  assert.equal(result, topLevelBlocks());
});

test('hidden elements disappear and the rest stays', { skip }, async () => {
  const hidden = [
    '<div data-testid="new-slides-file-button"></div>',
    '<div data-testid="new-figmake-file-button"></div>',
    '<div data-testid="new-figspec-file-button"></div>',
    '<div data-testid="new-cooper-file-button"></div>',
    '<div data-testid="new-sites-file-button"></div>',
    '<div data-testid="folder-page-omnicreate-dropdown"></div>',
    '<div data-testid="uub-experiment-upgrade-banner"></div>',
    '<div data-testid="left-panel-assistant-left-rail"></div>',
    '<div class="paid_status_badge_base--container--x1"></div>',
    '<button aria-label="Change plan to Pro"></button>',
    '<div><fieldset><button data-toolbelt-mode="design"></button></fieldset></div>',
  ];
  const shown = ['<div data-testid="new-design-file-button"></div>', '<div data-testid="new-whiteboard-file-button"></div>', '<div data-testid="unrelated"></div>'];
  const section = (kind) => (h) => `<section data-kind="${kind}">${h}</section>`;
  const result = await runPage({
    ...styled(),
    body: hidden.map(section('hidden')).concat(shown.map(section('shown'))).join(''),
    test: async () => ['hidden', 'shown'].map((k) => [...document.querySelectorAll(`[data-kind="${k}"]`)].map((s) => getComputedStyle(s.firstElementChild).display)),
  });
  assert.deepEqual(result[0], hidden.map(() => 'none'));
  assert.deepEqual(result[1], shown.map(() => 'block'));
});

test('nested hidden parts disappear too', { skip }, async () => {
  const result = await runPage({
    ...styled(),
    body: `<button class="multiplayer_view--selfAvatarWithToolsContainer--q"><span id="arrow" class="multiplayer_view--onboardingTarget--q"></span><span id="avatar"></span></button>
      <div class="sidebar_row--sidebarRowContainer--a"><div class="sidebar_row--draftRow--b"></div><button id="plus" aria-label="New file"></button></div>
      <div class="desktop_new_tab_view--root--a"><div id="more" data-testid="new-file-creation-more-button"></div></div>
      <div data-testid="new-file-creation-more-button" id="homeMore"></div>`,
    test: async () => Object.fromEntries(['arrow', 'avatar', 'plus', 'more', 'homeMore'].map((id) => [id, getComputedStyle(document.getElementById(id)).display])),
  });
  assert.equal(result.arrow, 'none');
  assert.equal(result.plus, 'none');
  assert.equal(result.more, 'none');
  assert.notEqual(result.avatar, 'none');
  assert.notEqual(result.homeMore, 'none');
});

test('More is restyled as Import and the sidebar plus is removed', { skip }, async () => {
  const result = await runPage({
    ...styled(),
    body: `<div data-testid="new-file-creation-more-button"><div><div><div id="pad">x</div></div></div><span id="label"><svg id="icon"></svg>More</span></div>
      <div class="sidebar_row--sidebarRowContainer--a" id="row"><div class="sidebar_row--draftRow--b"></div><button id="plus" aria-label="New file"></button></div>`,
    test: async () => ({
      after: getComputedStyle(document.getElementById('label'), '::after').content,
      before: getComputedStyle(document.getElementById('label'), '::before').width,
      fontSize: getComputedStyle(document.getElementById('label')).fontSize,
      icon: getComputedStyle(document.getElementById('icon')).display,
      padding: getComputedStyle(document.getElementById('pad')).paddingLeft,
      plus: getComputedStyle(document.getElementById('plus')).display,
    }),
  });
  assert.deepEqual(result, { after: '"Import"', before: '24px', fontSize: '0px', icon: 'none', padding: '6px', plus: 'none' });
});

test('the invisible import menu is not clickable', { skip }, async () => {
  const result = await runPage({
    ...styled(),
    body: '<div id="wrap"><div role="menu" id="menu"><button data-testid="file-import-button">Import</button></div></div>',
    test: async () => ({ menu: getComputedStyle(document.getElementById('menu')).opacity, events: getComputedStyle(document.getElementById('menu')).pointerEvents }),
  });
  assert.deepEqual(result, { menu: '0', events: 'none' });
});

test('new file tab aligns its header and spaces the team avatar', { skip }, async () => {
  const result = await runPage({
    ...styled(),
    body: '<div class="desktop_new_tab_view--folderHeader--a"><div class="desktop_new_tab_view--content--b" id="content"></div></div><span class="desktop_new_tab_folder_dropdown--teamAvatar--c" id="avatar"></span>',
    test: async () => ({
      display: getComputedStyle(document.getElementById('content')).display,
      align: getComputedStyle(document.getElementById('content')).alignItems,
      gap: getComputedStyle(document.getElementById('avatar')).marginRight,
    }),
  });
  assert.deepEqual(result, { display: 'flex', align: 'center', gap: '4px' });
});

test('the team menu gets spacing, the account menu keeps its layout', { skip }, async () => {
  const menu = (items) => `<div role="menu" class="m"><ul role="group"><ul><li><span role="menuitemradio"><i data-testid="image-avatar"></i></span></li></ul></ul>${items}</div>`;
  const result = await runPage({
    ...styled(),
    body: menu('<div role="menuitem">Create new</div>') + menu('<div role="menuitem">Change theme</div><div role="menuitem">Settings</div>'),
    test: async () => [...document.querySelectorAll('.m')].map((m) => ({
      gap: getComputedStyle(m.querySelector('ul[role="group"]')).display,
      row: getComputedStyle(m.querySelector('li')).height,
    })),
  });
  assert.equal(result[0].gap, 'flex');
  assert.equal(result[0].row, '24px');
  assert.notEqual(result[1].gap, 'flex');
});

test('the text style tag keeps its gap from the name', { skip }, async () => {
  const result = await runPage({
    ...styled(),
    body: '<div role="rowheader" data-tooltip-style-name="x"><span>a</span><span id="tail">b</span></div><span class="style_title--styleTag--z" id="tag"></span>',
    test: async () => [document.getElementById('tail'), document.getElementById('tag')].map((e) => getComputedStyle(e).paddingLeft),
  });
  assert.deepEqual(result, ['3px', '3px']);
});

const pageRow = {
  head: styled(`:root{--color-bg:#111111;--color-border:#444444}
    .paint_panels--opacityInputContainer--b{position:relative;width:40px;height:24px}
    .paint_panels--opacityInputContainer--b::before{content:"";position:absolute;left:0;top:0;height:100%;width:1px;background:#777}
    .chit--chit-a{border-radius:6px;width:16px;height:16px;position:relative;display:block}
    .chit--chitBorder--c{position:absolute;inset:-1px;transform:scale(1.1);border-radius:6px;box-shadow:inset 0 0 0 2px #fff}`).head,
  body: `<div class="background_panel--colorValueContainer--a" id="row" tabindex="-1">
    <input id="field"><div class="paint_panels--opacityInputContainer--b" id="opacity"></div>
    <button class="chit--chit-a" id="chit"><span class="chit--chitBorder--c" id="ring"></span></button></div>
    <div class="paint_panels--opacityInputContainer--b" id="other"></div>`,
};

test('the Page row divider is one border pixel and shows the hover colour on focus', { skip }, async () => {
  const result = await runPage({
    ...pageRow,
    test: async () => {
      const read = () => {
        const s = getComputedStyle(document.getElementById('opacity'), '::before');
        return { width: s.width, border: s.borderLeftWidth, color: s.borderLeftColor, background: s.backgroundImage + '|' + s.backgroundColor };
      };
      const idle = read();
      document.getElementById('field').focus();
      await sleep(50);
      const focused = read();
      const other = getComputedStyle(document.getElementById('other'), '::before').width;
      return { idle, focused, other };
    },
  });
  assert.equal(result.idle.width, '0px');
  assert.equal(result.idle.border, '1px');
  assert.equal(result.idle.color, 'rgb(17, 17, 17)');
  assert.equal(result.idle.background, 'none|rgba(0, 0, 0, 0)');
  assert.equal(result.focused.color, 'rgb(68, 68, 68)');
  assert.equal(result.other, '1px');
});

test('the Page row colour square has one radius for the fill and the ring', { skip }, async () => {
  const result = await runPage({
    ...pageRow,
    test: async () => {
      const chit = getComputedStyle(document.getElementById('chit')), ring = getComputedStyle(document.getElementById('ring'));
      return { radius: chit.borderRadius, ringRadius: ring.borderRadius, inset: [ring.top, ring.left, ring.right, ring.bottom], transform: ring.transform, shadow: ring.boxShadow };
    },
  });
  assert.equal(result.radius, '2px');
  assert.equal(result.ringRadius, '2px');
  assert.deepEqual(result.inset, ['0px', '0px', '0px', '0px']);
  assert.equal(result.transform, 'none');
  assert.equal(result.shadow, 'rgb(68, 68, 68) 0px 0px 0px 1px inset');
});

const switchPage = (withRule, scale) => {
  const rows = Array.from({ length: 10 }, (_, i) => `<span data-fpl-component class="host" style="top:${20 + i * 30 + i / 10}px"><input type="checkbox"><span class="track"></span></span>`).join('');
  return {
    scale,
    head: `<style>body{margin:0;background:#000}.host{position:absolute;left:20px;display:block;width:32px;height:16px}
      input{position:absolute;opacity:0}.track{position:relative;display:flex;align-items:center;width:32px;height:16px;border-radius:8px;background:#444}
      .track::after{content:"";width:12px;height:8px;border-radius:4px;background:#f00;transform:translateX(4px)}</style>${withRule ? `<style>${css}</style>` : ''}`,
    body: rows,
    test: async () => null,
  };
};

const centers = (png, scale) => {
  const x = Math.round((20 + 10) * scale);
  return Array.from({ length: 10 }, (_, i) => {
    const from = Math.floor((20 + i * 30 + i / 10 - 3) * scale), to = Math.ceil((20 + i * 30 + i / 10 + 19) * scale);
    let track = 0, trackW = 0, thumb = 0, thumbW = 0;
    for (let y = from; y < to; y++) {
      const [r, g, b] = png.pixel(x, y);
      const cover = Math.min(1, (r + g + b) / 204), red = Math.max(0, Math.min(1, (r - g) / 255));
      track += cover * y; trackW += cover;
      thumb += red * y; thumbW += red;
    }
    return Math.abs(thumb / thumbW - track / trackW);
  });
};

test('the switch thumb is centred at fractional screen scales', { skip, timeout: 120000 }, async () => {
  for (const scale of [1, 1.125, 1.25, 1.5, 1.75, 2]) {
    const png = decode(await screenshot(switchPage(true, scale), { width: 120, height: 340 }));
    const worst = Math.max(...centers(png, scale));
    assert.ok(worst < 0.3, `scale ${scale}: off by ${worst.toFixed(2)} device pixels`);
  }
});

test('the switch check notices an off-centre thumb without the rule', { skip, timeout: 60000 }, async () => {
  const png = decode(await screenshot(switchPage(false, 1.125), { width: 120, height: 340 }));
  assert.ok(Math.max(...centers(png, 1.125)) >= 0.4);
});

test('a plain checkbox is not touched by the switch rule', { skip }, async () => {
  const result = await runPage({
    ...styled(),
    body: '<span data-fpl-component><input type="checkbox"><span id="box"></span></span>',
    test: async () => getComputedStyle(document.getElementById('box'), '::after').content,
  });
  assert.equal(result, 'none');
});

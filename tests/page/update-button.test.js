const test = require('node:test');
const assert = require('node:assert/strict');
const { runPage, available } = require('../helpers/chrome');
const { updateButtonScript } = require('../helpers/sources');

const skip = !available && 'Chrome not found';
const bar = '<div class="tabContainer"><div class="tab_bar--trafficLightsSpacer--a" id="spacer"></div><div id="home">home</div></div>';
const actions = 'window.actions = []; window.figmaTweaksAction = (a) => window.actions.push(a);';
const page = (extra = {}) => ({ body: bar, scripts: [actions, updateButtonScript()], ...extra });

test('the button is placed right after the traffic lights spacer', { skip }, async () => {
  const result = await runPage(page({
    test: async () => {
      const shown = window.__figmaTweaksShowUpdate('v.1.50');
      const wrap = document.getElementById('figma-tweaks-update');
      return { shown, afterSpacer: wrap.previousElementSibling.id, text: wrap.querySelector('button').textContent, count: document.querySelectorAll('#figma-tweaks-update').length };
    },
  }));
  assert.deepEqual(result, { shown: true, afterSpacer: 'spacer', text: 'Обновить figma-tweaks', count: 1 });
});

test('the button goes first when the bar has no spacer', { skip }, async () => {
  const result = await runPage({
    body: '<div class="tabContainer"><div id="home">home</div></div>',
    scripts: [actions, updateButtonScript()],
    test: async () => {
      window.__figmaTweaksShowUpdate('v.1.50');
      return document.querySelector('.tabContainer').firstElementChild.id;
    },
  });
  assert.equal(result, 'figma-tweaks-update');
});

test('a click on the button asks the launcher to restart', { skip }, async () => {
  const result = await runPage(page({
    test: async () => {
      window.__figmaTweaksShowUpdate('v.1.50');
      document.querySelector('#figma-tweaks-update button').click();
      return window.actions;
    },
  }));
  assert.deepEqual(result, ['update-shown', 'restart']);
});

test('the button follows the hover colour', { skip }, async () => {
  const result = await runPage(page({
    test: async () => {
      window.__figmaTweaksShowUpdate('v.1.50');
      const button = document.querySelector('#figma-tweaks-update button');
      const idle = button.style.background;
      button.dispatchEvent(new MouseEvent('mouseenter'));
      const hover = button.style.background;
      button.dispatchEvent(new MouseEvent('mouseleave'));
      return { idle, hover, back: button.style.background };
    },
  }));
  assert.equal(result.idle, 'rgb(13, 153, 255)');
  assert.equal(result.hover, 'rgb(10, 133, 224)');
  assert.equal(result.back, result.idle);
});

test('the button comes back after Figma re-renders the bar, the launcher hears about it once', { skip }, async () => {
  const result = await runPage(page({
    test: async () => {
      window.__figmaTweaksShowUpdate('v.1.50');
      const bar = document.querySelector('.tabContainer');
      document.getElementById('figma-tweaks-update').remove();
      await sleep(100);
      const first = document.querySelectorAll('#figma-tweaks-update').length;
      bar.innerHTML = '<div class="tab_bar--trafficLightsSpacer--a" id="spacer2"></div>';
      await sleep(100);
      return { first, second: document.querySelectorAll('#figma-tweaks-update').length, after: document.getElementById('figma-tweaks-update').previousElementSibling.id, actions: window.actions };
    },
  }));
  assert.deepEqual(result, { first: 1, second: 1, after: 'spacer2', actions: ['update-shown'] });
});

test('the button appears when the bar is rendered later', { skip }, async () => {
  const result = await runPage({
    scripts: [actions, updateButtonScript()],
    test: async () => {
      const early = window.__figmaTweaksShowUpdate('v.1.50');
      const bar = document.createElement('div');
      bar.className = 'tabContainer';
      document.body.appendChild(bar);
      await sleep(100);
      return { early, shown: document.querySelectorAll('#figma-tweaks-update').length };
    },
  });
  assert.deepEqual(result, { early: false, shown: 1 });
});

test('a burst of changes keeps a single button', { skip }, async () => {
  const result = await runPage(page({
    test: async () => {
      window.__figmaTweaksShowUpdate('v.1.50');
      const bar = document.querySelector('.tabContainer');
      for (let i = 0; i < 100; i++) bar.appendChild(document.createElement('i'));
      document.getElementById('figma-tweaks-update').remove();
      await sleep(100);
      return document.querySelectorAll('#figma-tweaks-update').length;
    },
  }));
  assert.equal(result, 1);
});

test('only the tab bar shell takes the button', { skip }, async () => {
  const result = await runPage({
    host: 'figma.com',
    body: bar,
    scripts: [actions, updateButtonScript()],
    test: async () => ({ shown: window.__figmaTweaksShowUpdate('v.1.50'), buttons: document.querySelectorAll('#figma-tweaks-update').length, version: window.__figmaTweaksUpdateVersion }),
  });
  assert.deepEqual(result, { shown: false, buttons: 0, });
});

test('a page injected after the update already knows the version', { skip }, async () => {
  const result = await runPage({
    body: bar,
    scripts: [actions, 'window.__figmaTweaksUpdateVersion = "v.1.50";', updateButtonScript()],
    test: async () => {
      await sleep(50);
      return { buttons: document.querySelectorAll('#figma-tweaks-update').length, actions: window.actions };
    },
  });
  assert.deepEqual(result, { buttons: 1, actions: ['update-shown'] });
});

test('no version means no button', { skip }, async () => {
  const result = await runPage(page({
    scripts: [actions, 'window.__figmaTweaksUpdateVersion = null;', updateButtonScript()],
    test: async () => document.querySelectorAll('#figma-tweaks-update').length,
  }));
  assert.equal(result, 0);
});

test('a second call replaces the observer instead of stacking another', { skip }, async () => {
  const result = await runPage(page({
    test: async () => {
      window.__figmaTweaksShowUpdate('v.1.50');
      const first = window.__figmaTweaksUpdateObs;
      window.__figmaTweaksShowUpdate('v.1.51');
      return { replaced: first !== window.__figmaTweaksUpdateObs, version: window.__figmaTweaksUpdateVersion, buttons: document.querySelectorAll('#figma-tweaks-update').length };
    },
  }));
  assert.deepEqual(result, { replaced: true, version: 'v.1.51', buttons: 1 });
});

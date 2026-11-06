const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const path = require('path');
const { ROOT, read, tooltipParts, tooltipsScript, updateButtonScript, pageFn, userCss, jsFiles } = require('../helpers/sources');

const compiles = (code, name) => assert.doesNotThrow(() => new vm.Script(code, { filename: name }), name);

test('every script of the project compiles', () => {
  for (const file of jsFiles()) compiles(`(function (exports, require, module, __filename, __dirname) {${read(path.relative(ROOT, file))}\n})`, file);
});

test('the injected scripts compile as the launcher builds them', () => {
  compiles(tooltipsScript(), 'tooltips');
  compiles(updateButtonScript(), 'update-button');
  compiles(pageFn(), 'page-fn');
});

test('tooltip parts have unique ascending numeric prefixes', () => {
  const parts = tooltipParts(), numbers = parts.map((f) => Number(f.match(/^(\d+)-/)[1]));
  assert.ok(parts.length > 0);
  assert.deepEqual(numbers, [...numbers].sort((a, b) => a - b));
  assert.equal(new Set(numbers).size, numbers.length);
  assert.equal(parts[0].startsWith('00-'), true);
});

const BOUNDED_POLLING = ['guard.js'];

test('nothing runs on a timer loop, everything is event driven', () => {
  for (const file of jsFiles()) {
    if (BOUNDED_POLLING.includes(path.basename(file))) continue;
    assert.doesNotMatch(read(path.relative(ROOT, file)), /setInterval/, file);
  }
  assert.doesNotMatch(pageFn(), /setInterval/);
});

test('the only polling left runs after Figma exited and gives up by itself', () => {
  const code = read('desktop', 'guard.js');
  assert.equal((code.match(/setInterval/g) || []).length, 2);
  assert.equal((code.match(/clearInterval/g) || []).length >= 3, true);
  assert.match(code, /\+\+n > 80/);
  assert.match(code, /\+\+w > 40/);
});

test('the update button reacts to DOM changes without polling', () => {
  const code = read('update-button.js');
  assert.match(code, /MutationObserver/);
  assert.doesNotMatch(code, /setInterval|setTimeout/);
});

test('the tab bar rail is observed, not polled', () => {
  const code = read('tooltips', '60-tabbar.js');
  assert.match(code, /ResizeObserver/);
  assert.doesNotMatch(code, /setInterval/);
});

const blocks = (css) => {
  let depth = 0, count = 0;
  for (const ch of css) {
    if (ch === '{') { if (depth === 0) count++; depth++; }
    if (ch === '}') depth--;
    assert.ok(depth >= 0, 'unbalanced braces');
  }
  assert.equal(depth, 0, 'unbalanced braces');
  return count;
};

test('userContent.css keeps its wrapper and balanced braces', () => {
  const css = read('userContent.css');
  assert.match(css, /^\/\* ==UserStyle==[\s\S]*?==\/UserStyle== \*\/\s*@-moz-document domain\("figma\.com"\) \{/);
  assert.ok(blocks(css) > 0);
  assert.ok(blocks(userCss()) > 20);
});

test('selectors never depend on generated class hashes', () => {
  const selectors = userCss().replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{[^{}]*\}/g, '{}').replace(/url\([^)]*\)/g, '');
  const hashed = selectors.match(/\.(_[a-z0-9]{5,}|[a-z]{1,4}[0-9][a-z0-9]{4,})\b/g);
  assert.equal(hashed, null, String(hashed));
});

test('class matches use the stable name prefix before the hash', () => {
  const matches = [...userCss().matchAll(/\[class\*="([^"]+)"\]/g)].map((m) => m[1]);
  assert.ok(matches.length > 0);
  for (const m of matches) assert.match(m, /^[a-z_]+--/, m);
});

test('the switch thumb rule targets the structure of the switch', () => {
  const css = userCss();
  assert.match(css, /\[data-fpl-component\] > input\[type="checkbox"\] \+ span::after \{[^}]*translate: 0 -50% !important;[^}]*will-change: transform !important;/);
  assert.doesNotMatch(css, /toggle--/);
});

test('the Page row rules keep the divider, its hover state and the square', () => {
  const css = userCss();
  assert.match(css, /opacityInputContainer"\]::before \{[^}]*border-left: 1px solid var\(--color-bg\) !important;/);
  assert.match(css, /colorValueContainer"\]:hover [^{]*opacityInputContainer"\]::before,[^{]*:focus-within [^{]*::before \{[^}]*border-left-color: var\(--color-border\) !important;/);
  assert.match(css, /chit--chit-"\] \{[^}]*border-radius: 2px !important;/);
  assert.match(css, /chit--chitBorder"\] \{[^}]*inset: 0 !important;[^}]*box-shadow: inset 0 0 0 1px var\(--color-border\) !important;/);
});

test('the launcher only lets trusted pages use the binding', () => {
  const code = read('desktop', 'launch.js');
  assert.match(code, /Runtime\.executionContextCreated/);
  assert.match(code, /trusted\.has\(msg\.sessionId \+ ':' \+ msg\.params\.executionContextId\)/);
  assert.match(code, /isDefault/);
});

test('the launcher reinjects only a main frame that lacks the tweaks', () => {
  const code = read('desktop', 'launch.js');
  assert.match(code, /Page\.frameNavigated' && !msg\.params\.frame\.parentId/);
  assert.match(code, /typeof window\.__figmaTweaks/);
});

test('a new update refreshes the stored new-document scripts', () => {
  assert.match(read('desktop', 'launch.js'), /for \(const sid of sessions\) setNewDocScript\(sid, scriptFor\(css\)\)/);
});

test('the zip updater cleans stale files and escapes paths', () => {
  const code = read('desktop', 'update.js');
  assert.match(code, /dropStale\(path\.join\(src, 'tooltips'\), path\.join\(ROOT, 'tooltips'\)\)/);
  assert.match(code, /zip\.replace\(\/'\/g, "''"\)/);
  assert.match(code, /tmp\.replace\(\/'\/g, "''"\)/);
});

test('the git updater takes the newest tag that verifies', () => {
  const code = read('desktop', 'update.js');
  assert.match(code, /tags\.sort\(newerTag\)\.reverse\(\)/);
  assert.match(code, /verify-tag/);
  assert.match(code, /--ff-only/);
});

test('the stroke weight steps are removed on dispose and bound to the stroke weight test id', () => {
  assert.match(read('tooltips', '50-events.js'), /if \(state\.strokeOff\) state\.strokeOff\(\);/);
  const code = read('tooltips', '70-stroke-step.js');
  assert.match(code, /input\[data-testid="stroke-weight"\]/);
  assert.match(code, /state\.strokeOff = /);
  assert.doesNotMatch(code, /setInterval|setTimeout/);
});

test('the tab bar style is mounted on DOMContentLoaded when the head is missing', () => {
  assert.match(read('tooltips', '60-tabbar.js'), /addEventListener\('DOMContentLoaded', mountTabbar/);
});

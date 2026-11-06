const test = require('node:test');
const assert = require('node:assert/strict');
const { runPage, available } = require('../helpers/chrome');
const { read } = require('../helpers/sources');

const skip = !available && 'Chrome not found';
const part = `(function () { var state = window.state = {};\n${read('tooltips', '70-stroke-step.js')}\n})();`;

// A stand-in for Figma's number fields. Its own arrow handling only records that it ran, Enter applies the value
// and leaves the field, like in Figma.
const figma = `
  window.committed = []; window.native = []; window.stale = false;
  [].forEach.call(document.querySelectorAll('input'), function (f) {
    var history = [f.value];
    f.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        window.committed.push(f.value);
        var applied = f.value;
        history.push(applied);
        f.blur();
        // Figma redraws the field from its document, which is window.stale commits behind for a moment.
        if (window.stale) { f.value = history[Math.max(0, history.length - 1 - window.stale)]; setTimeout(function () { f.value = applied; }, 100); }
      }
      else if (e.key.indexOf('Arrow') === 0) window.native.push(f.id + ':' + e.key);
    });
  });
  window.press = function (id, key, mods) {
    var el = document.getElementById(id);
    el.focus();
    var ev = new KeyboardEvent('keydown', Object.assign({ key: key, bubbles: true, cancelable: true }, mods));
    el.dispatchEvent(ev);
    return el.value;
  };
`;

const editor = {
  body: '<input id="weight" data-testid="stroke-weight" aria-label="Stroke weight" value="1"><input id="other" data-testid="opacity" value="1">',
  scripts: [part, figma],
};

test('arrows change the stroke weight by 0.01 and shift arrows by 0.1', { skip }, async () => {
  const result = await runPage({
    ...editor,
    test: async () => {
      const seen = [];
      const w = document.getElementById('weight');
      seen.push(press('weight', 'ArrowUp'));
      seen.push(press('weight', 'ArrowUp'));
      seen.push(press('weight', 'ArrowDown'));
      seen.push(press('weight', 'ArrowUp', { shiftKey: true }));
      seen.push(press('weight', 'ArrowDown', { shiftKey: true }));
      w.value = '0';
      for (let i = 0; i < 3; i++) seen.push(press('weight', 'ArrowUp', { shiftKey: true }));
      return { seen, committed: window.committed, native: window.native };
    },
  });
  assert.deepEqual(result.seen, ['1.01', '1.02', '1.01', '1.11', '1.01', '0.1', '0.2', '0.3']);
  assert.deepEqual(result.committed, result.seen);
  assert.deepEqual(result.native, []);
});

test('the weight never goes below 0 or above 1000', { skip }, async () => {
  const result = await runPage({
    ...editor,
    test: async () => {
      const w = document.getElementById('weight');
      w.value = '0.005';
      const low = press('weight', 'ArrowDown');
      w.value = '0';
      const zero = press('weight', 'ArrowDown', { shiftKey: true });
      w.value = '999.99';
      const high = press('weight', 'ArrowUp', { shiftKey: true });
      return { low, zero, high };
    },
  });
  assert.deepEqual(result, { low: '0', zero: '0', high: '1000' });
});

test('the field stays focused with its text selected, so the next arrow works at once', { skip }, async () => {
  const result = await runPage({
    ...editor,
    test: async () => {
      press('weight', 'ArrowUp');
      const w = document.getElementById('weight');
      return { focused: document.activeElement === w, from: w.selectionStart, to: w.selectionEnd, length: w.value.length };
    },
  });
  assert.equal(result.focused, true);
  assert.equal(result.from, 0);
  assert.equal(result.to, result.length);
});

test('the field gets an input event, like typed text', { skip }, async () => {
  const result = await runPage({
    ...editor,
    test: async () => {
      const events = [];
      document.getElementById('weight').addEventListener('input', (e) => events.push(e.target.value));
      press('weight', 'ArrowUp');
      return events;
    },
  });
  assert.deepEqual(result, ['1.01']);
});

test('other fields and other keys keep the native behaviour', { skip }, async () => {
  const result = await runPage({
    ...editor,
    test: async () => {
      const other = press('other', 'ArrowUp');
      const shifted = press('other', 'ArrowDown', { shiftKey: true });
      const side = press('weight', 'ArrowLeft');
      const letter = press('weight', 'a');
      return { other, shifted, side, letter, native: window.native, committed: window.committed };
    },
  });
  assert.equal(result.other, '1');
  assert.equal(result.shifted, '1');
  assert.equal(result.side, '1');
  assert.equal(result.letter, '1');
  assert.deepEqual(result.native, ['other:ArrowUp', 'other:ArrowDown', 'weight:ArrowLeft']);
  assert.deepEqual(result.committed, []);
});

test('arrows with ctrl, alt or meta are left to Figma', { skip }, async () => {
  const result = await runPage({
    ...editor,
    test: async () => {
      const values = ['ctrlKey', 'altKey', 'metaKey'].map((m) => press('weight', 'ArrowUp', { [m]: true }));
      return { values, native: window.native };
    },
  });
  assert.deepEqual(result.values, ['1', '1', '1']);
  assert.equal(result.native.length, 3);
});

test('a value that is not a number, like Mixed, is left to Figma', { skip }, async () => {
  const result = await runPage({
    ...editor,
    test: async () => {
      const w = document.getElementById('weight');
      w.value = 'Mixed';
      const mixed = press('weight', 'ArrowUp');
      w.value = '';
      const empty = press('weight', 'ArrowUp');
      return { mixed, empty, native: window.native };
    },
  });
  assert.equal(result.mixed, 'Mixed');
  assert.equal(result.empty, '');
  assert.deepEqual(result.native, ['weight:ArrowUp', 'weight:ArrowUp']);
});

test('after dispose the stroke weight arrows are native again', { skip }, async () => {
  const result = await runPage({
    ...editor,
    test: async () => {
      window.state.strokeOff();
      const value = press('weight', 'ArrowUp');
      return { value, native: window.native };
    },
  });
  assert.equal(result.value, '1');
  assert.deepEqual(result.native, ['weight:ArrowUp']);
});

test('fast presses count from the last applied value while Figma still shows the old one', { skip }, async () => {
  const result = await runPage({
    ...editor,
    test: async () => {
      window.stale = true;
      for (let i = 0; i < 3; i++) { press('weight', 'ArrowUp'); await sleep(20); }
      press('weight', 'ArrowDown', { shiftKey: true });
      await sleep(250);
      return { committed: window.committed, shown: document.getElementById('weight').value };
    },
  });
  assert.deepEqual(result.committed, ['1.01', '1.02', '1.03', '0.93']);
  assert.equal(result.shown, '0.93');
});

test('fast presses survive Figma showing a value two commits old', { skip }, async () => {
  const result = await runPage({
    ...editor,
    test: async () => {
      window.stale = 2;
      for (let i = 0; i < 6; i++) { press('weight', 'ArrowUp'); await sleep(15); }
      await sleep(250);
      return { committed: window.committed, shown: document.getElementById('weight').value };
    },
  });
  assert.deepEqual(result.committed, ['1.01', '1.02', '1.03', '1.04', '1.05', '1.06']);
  assert.equal(result.shown, '1.06');
});

test('a value typed after the presses is not replaced by an old one', { skip }, async () => {
  const result = await runPage({
    ...editor,
    test: async () => {
      press('weight', 'ArrowUp');
      await sleep(600);
      document.getElementById('weight').value = '5';
      return press('weight', 'ArrowUp');
    },
  });
  assert.equal(result, '5.01');
});

test('a field added later is handled too', { skip }, async () => {
  const result = await runPage({
    ...editor,
    test: async () => {
      document.body.innerHTML = '<input id="late" data-testid="stroke-weight" value="2">';
      document.getElementById('late').addEventListener('keydown', (e) => { if (e.key === 'Enter') window.committed.push(e.target.value); });
      return press('late', 'ArrowDown', { shiftKey: true });
    },
  });
  assert.equal(result, '1.9');
});

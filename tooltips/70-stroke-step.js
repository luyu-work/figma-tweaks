// Part of the tooltips script, see 00-core.js. Parts are joined in file name order into one function by desktop/launch.js.
// Stroke weight field only: arrow keys step 0.01, shift and arrow 0.1 (Figma steps 1 and 10). The field is found by its
// test id, so no other number field changes. Figma applies a typed value on Enter and leaves the field, so the new value is
// written like typing, Enter is sent, and the focus comes back with the text selected for the next arrow.
  var STROKE_WEIGHT = 'input[data-testid="stroke-weight"]';
  var WEIGHT_MAX = 1000;
  // After Enter Figma redraws the field from its document, which is a commit or two behind for a moment. A press that
  // comes right after the last one (key repeat) counts from the value written then when the field shows one of the
  // earlier values of that series. Any other text was typed by the user and is taken as it is.
  var REPEAT_MS = 400;
  var lastWrite = null;

  function setFieldValue(field, text) {
    // The native setter, so a framework that tracks the value sees the change as well.
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(field, text);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function onStrokeKey(e) {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    var field = e.target;
    if (!field || !field.matches || !field.matches(STROKE_WEIGHT)) return;
    // "Mixed" and an empty field have no number to step, Figma handles them itself.
    var current = field.value.trim();
    var now = Date.now();
    var series = lastWrite && lastWrite.field === field && now - lastWrite.at < REPEAT_MS;
    var seen = series ? lastWrite.seen : [];
    if (series && seen.indexOf(current) >= 0) current = lastWrite.value;
    if (!/^\d+(\.\d+)?$/.test(current)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    var step = e.shiftKey ? 0.1 : 0.01;
    var next = parseFloat(current) + (e.key === 'ArrowUp' ? step : -step);
    // Two decimals cut off the float noise (0.1 + 0.2).
    next = Math.min(WEIGHT_MAX, Math.max(0, Math.round(next * 100) / 100));
    seen.push(current);
    lastWrite = { field: field, value: String(next), at: now, seen: seen };
    setFieldValue(field, String(next));
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
    field.focus();
    field.select();
  }

  document.addEventListener('keydown', onStrokeKey, true);
  state.strokeOff = function () { document.removeEventListener('keydown', onStrokeKey, true); };

// Runs in the Figma page. Replaces Figma's tooltips for variables and text styles with a compact one.
// Variables: description and HEX. Text styles: description, font weight and letter spacing.
// Data is read live from Figma's own React props, so it works in any file and with any library: the picker row
// has the variable object, the applied chip has variableDescription and variableValue, a style row has dsStyle.
// Font weight and letter spacing of a style are read from Figma itself, see "Font weight and letter spacing" below.
// This file and the numbered files next to it are one function body: desktop/launch.js joins them in name order.
  // Re-injection (live reload) replaces the previous instance.
  if (window.__figmaTweaksTips && window.__figmaTweaksTips.dispose) window.__figmaTweaksTips.dispose();
  var state = window.__figmaTweaksTips = {};

  function fiberOf(el) {
    var k = Object.keys(el).filter(function (x) { return x.indexOf('__reactFiber') === 0; })[0];
    return k ? el[k] : null;
  }

  // The variable object the picker row was rendered from.
  function variableOf(row) {
    for (var f = fiberOf(row), i = 0; f && i < 20; f = f.return, i++) {
      var v = f.memoizedProps && f.memoizedProps.variable;
      if (v && typeof v === 'object' && 'name' in v) return v;
    }
    return null;
  }

  // The color swatch: first 8-24px box in the row with a visible background.
  function swatchOf(row) {
    var all = row.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) {
      var s = all[i].getBoundingClientRect();
      if (s.width < 8 || s.width > 24 || s.height < 8 || s.height > 24) continue;
      // rgb(r g b / a), rgba(r, g, b, a) or color(srgb r g b / a) with 0-1 channels.
      var m = getComputedStyle(all[i]).backgroundColor.match(/^(\w+)\(([^)]*)\)$/);
      if (!m) continue;
      var halves = m[2].split('/');
      var p = halves[0].trim().split(/[\s,]+/).map(Number).filter(function (n) { return !isNaN(n); });
      if (m[1] === 'color') p = p.map(function (n) { return n * 255; });
      var a = halves[1] !== undefined ? parseFloat(halves[1]) / (halves[1].indexOf('%') >= 0 ? 100 : 1) : (p.length > 3 ? p.pop() : 1);
      if (p.length < 3 || a === 0) continue;
      return { el: all[i], p: p, a: a };
    }
    return null;
  }

  function hexOf(row) {
    var sw = swatchOf(row);
    if (!sw) return null;
    var hex = '#' + sw.p.slice(0, 3).map(function (n) { return ('0' + Math.round(n).toString(16)).slice(-2); }).join('').toUpperCase();
    return hex + ' · ' + Math.round(sw.a * 100) + '%';
  }

  // ---- Text styles ----
  // Figma marks them with data-tooltip="style_info" and shows its own tooltip from these attributes. They are moved
  // to data-ft-* on first hover, so Figma's tooltip never opens and the element stays findable.
  function takeStyle(target) {
    var el = target.closest('[data-tooltip="style_info"]');
    if (el) {
      el.setAttribute('data-ft-style', '1');
      el.setAttribute('data-ft-description', el.getAttribute('data-tooltip-style-description') || '');
      ['data-tooltip', 'data-tooltip-type', 'data-tooltip-style-description', 'data-tooltip-style-name'].forEach(function (a) { el.removeAttribute(a); });
      return el;
    }
    return target.closest('[data-ft-style]');
  }

  // The style object (name, description, file_key, node_id, key) the row was rendered from.
  function dsStyleOf(el) {
    for (var f = fiberOf(el), i = 0; f && i < 25; f = f.return, i++) {
      var p = f.memoizedProps;
      if (!p || typeof p !== 'object') continue;
      for (var k in p) {
        var v = p[k];
        if (v && typeof v === 'object' && !v.$$typeof && typeof v.node_id === 'string' && typeof v.file_key === 'string') return v;
      }
    }
    return null;
  }

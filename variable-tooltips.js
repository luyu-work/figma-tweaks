// Runs in the Figma page. Shows a variable's description and HEX in a tooltip when hovering it in the
// variable picker or on an applied variable. All data is read live from Figma's own React props, so it works
// in any file and with any library: the picker row has the variable object, the applied chip has
// variableDescription and variableValue.
(function () {
  // Re-injection (live reload) replaces the previous instance.
  if (window.__figmaTweaksTips) window.__figmaTweaksTips.dispose();
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

  // Returns { el, description, hex } for the hovered element, or null.
  function resolve(target) {
    var row = target.closest('[data-testid="variable-list-item"]');
    if (row) {
      var v = variableOf(row), hex = hexOf(row);
      if (!v || !(v.description || hex)) return null;
      return { el: row, description: v.description, hex: hex };
    }
    // Applied variable (chip in the properties panel).
    for (var f = fiberOf(target), i = 0; f && i < 12; f = f.return, i++) {
      var p = f.memoizedProps;
      if (p && typeof p === 'object' && typeof p.variableName === 'string') {
        var el = target;
        while (el.parentElement && el.parentElement.getBoundingClientRect().height < 40 && el.parentElement !== document.body) el = el.parentElement;
        if (!p.variableDescription && !p.variableValue) return null;
        return { el: el, description: p.variableDescription, hex: p.variableValue };
      }
    }
    return null;
  }

  var tip = null, timer = null, current = null;
  function hide() {
    clearTimeout(timer); current = null;
    if (tip) tip.style.display = 'none';
  }
  function show(info) {
    if (!tip) {
      tip = document.createElement('div');
      tip.id = 'figma-tweaks-tip';
      tip.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;max-width:260px;padding:6px 8px;border-radius:5px;' +
        'background:#1e1e1e;color:#fff;font:11px/16px Inter,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.4);display:none';
      document.documentElement.appendChild(tip);
    }
    tip.textContent = '';
    if (info.description) {
      var l1 = document.createElement('div');
      l1.textContent = info.description;
      tip.appendChild(l1);
    }
    if (info.hex) {
      var l2 = document.createElement('div');
      l2.textContent = info.hex;
      l2.style.cssText = (info.description ? 'opacity:.6;' : '') + 'font-variant-numeric:tabular-nums';
      tip.appendChild(l2);
    }
    tip.style.display = 'block';
    // 4px below the color swatch, left edges aligned (the row itself if it has no swatch).
    var sw = swatchOf(info.el), r = (sw ? sw.el : info.el).getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
    var x = Math.min(Math.max(4, r.left), window.innerWidth - w - 4);
    var y = r.bottom + 4;
    if (y + h > window.innerHeight - 4) y = r.top - h - 4;
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
  }

  function onOver(e) {
    var el = e.target;
    if (!el || !el.closest || el.closest('#figma-tweaks-tip')) return;
    var info = resolve(el);
    if (!info) { hide(); return; }
    if (info.el === current) return;
    hide(); current = info.el;
    timer = setTimeout(function () { if (current === info.el) show(info); }, 350);
  }
  document.addEventListener('mouseover', onOver, true);
  document.addEventListener('mousedown', hide, true);
  document.addEventListener('scroll', hide, true);
  state.dispose = function () {
    hide();
    document.removeEventListener('mouseover', onOver, true);
    document.removeEventListener('mousedown', hide, true);
    document.removeEventListener('scroll', hide, true);
    if (tip) tip.remove();
  };
})

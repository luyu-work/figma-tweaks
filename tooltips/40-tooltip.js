// Part of the tooltips script, see 00-core.js. Parts are joined in file name order into one function by desktop/launch.js.
  var tip = null, timer = null, current = null, currentInfo = null;
  function hide() {
    clearTimeout(timer); current = null;
    if (tip && tip.style.display === 'block') state.lastHide = Date.now(); // a tooltip was open a moment ago, the next one opens at once
    if (currentInfo) currentInfo.shown = false;
    currentInfo = null;
    if (tip) tip.style.display = 'none';
  }
  function show(info) {
    info.shown = true;
    if (!tip) {
      tip = document.createElement('div');
      tip.id = 'figma-tweaks-tip';
      tip.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;box-sizing:border-box;max-width:260px;padding:6px 8px;border-radius:5px;' +
        'background:#1e1e1e;color:#fff;font:11px/16px Inter,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.4);display:none';
      document.documentElement.appendChild(tip);
    }
    tip.textContent = '';
    if (!info.description && !info.hex) { tip.style.display = 'none'; return; }
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
    var sw = info.chip ? null : info.icon ? iconOf(info.el) : swatchOf(info.el), r = (sw ? sw.el : info.el).getBoundingClientRect();
    // Long text wraps instead of shifting the tooltip off the anchor near the window edge.
    tip.style.maxWidth = Math.max(140, Math.min(260, window.innerWidth - r.left - 8)) + 'px';
    var w = tip.offsetWidth, h = tip.offsetHeight;
    var x = Math.min(Math.max(4, r.left), window.innerWidth - w - 4);
    // A chip in the properties panel: below the whole field. A list row: below the swatch or icon.
    var box = info.chip ? info.el.getBoundingClientRect() : r;
    var gap = info.chip ? 4 : 8;
    var y = box.bottom + gap;
    if (y + h > window.innerHeight - 4) y = box.top - h - gap;
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
  }

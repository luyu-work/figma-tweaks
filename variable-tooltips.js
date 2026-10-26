// Runs in the Figma page. Shows a variable's description in a tooltip when hovering it in the
// variable picker (the native tooltip only exists on an already applied variable).
// `descriptions` is variable-descriptions.json: { "group/--name": { description, light, dark } }.
(function (descriptions) {
  // Re-injection (live reload) replaces the previous instance.
  if (window.__figmaTweaksTips) window.__figmaTweaksTips.dispose();
  var state = window.__figmaTweaksTips = { data: descriptions };

  // Lookup by full name ("base/--background") or by the last segment ("--background"), the picker shows the latter under a group heading.
  var byTail = {};
  function index() {
    byTail = {};
    Object.keys(state.data).forEach(function (k) { byTail[k.slice(k.lastIndexOf('/') + 1)] = state.data[k]; });
  }
  function lookup(text) {
    if (!text || text.length > 60) return null;
    return state.data[text] || byTail[text] || null;
  }

  var tip = null, timer = null, current = null;
  function hide() {
    clearTimeout(timer); current = null;
    if (tip) tip.style.display = 'none';
  }
  function show(el, text) {
    if (!tip) {
      tip = document.createElement('div');
      tip.id = 'figma-tweaks-tip';
      tip.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;max-width:260px;padding:6px 8px;border-radius:5px;' +
        'background:#1e1e1e;color:#fff;font:11px/16px Inter,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.4);display:none';
      document.documentElement.appendChild(tip);
    }
    // Line 1: description, line 2: HEX (one value if both modes match).
    var hex = text.light === text.dark ? text.light : 'Light ' + text.light + ' · Dark ' + text.dark;
    tip.textContent = '';
    var l1 = document.createElement('div'), l2 = document.createElement('div');
    l1.textContent = text.description;
    l2.textContent = hex;
    l2.style.cssText = 'opacity:.6;font-variant-numeric:tabular-nums';
    tip.appendChild(l1);
    tip.appendChild(l2);
    tip.style.display = 'block';
    // Below the row, 4px gap, left edge on the color swatch (first square 8-24px element in the row).
    var r = el.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
    var left = r.left, all = el.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) {
      var s = all[i].getBoundingClientRect();
      if (s.width >= 8 && s.width <= 24 && s.height >= 8 && s.height <= 24 && s.left > r.left + 2) { left = s.left; break; }
    }
    var x = Math.min(Math.max(4, left), window.innerWidth - w - 4);
    var y = r.bottom + 2;
    if (y + h > window.innerHeight - 4) y = r.top - h - 2;
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
  }

  function onOver(e) {
    var el = e.target;
    if (!el || !el.closest || el.closest('#figma-tweaks-tip')) return;
    index();
    // The row is a few levels above the text node: walk up and match on the element's own text.
    var node = el, hit = null, desc = null;
    for (var i = 0; node && node !== document.body && i < 6; i++, node = node.parentElement) {
      desc = lookup((node.textContent || '').trim());
      if (desc) { hit = node; break; }
    }
    if (!hit) { hide(); return; }
    if (hit === current) return;
    hide(); current = hit;
    timer = setTimeout(function () { if (current === hit) show(hit, desc); }, 350);
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

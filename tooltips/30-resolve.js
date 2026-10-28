// Part of the tooltips script, see 00-core.js. Parts are joined in file name order into one function by desktop/launch.js.
  // The "Ag" icon of a style row: first small box in the row.
  function iconOf(row) {
    // The glyph itself (svg, img or the "Ag" text) that sits leftmost in the row. Not a padded wrapper, and not the
    // action buttons that appear on the right when the row is hovered.
    var all = row.querySelectorAll('*'), best = null, bestLeft = Infinity;
    for (var g = 0; g < all.length; g++) {
      var r = all[g].getBoundingClientRect();
      if (r.width < 8 || r.width > 32 || r.height < 8 || r.height > 32) continue;
      var tag = all[g].tagName.toLowerCase();
      var glyph = tag === 'svg' || tag === 'img' || (all[g].children.length === 0 && (all[g].textContent || '').trim() === 'Ag');
      if (glyph && r.left < bestLeft) { best = all[g]; bestLeft = r.left; }
    }
    if (best) return { el: best };
    for (var i = 0; i < all.length; i++) {
      var q = all[i].getBoundingClientRect();
      if (q.width >= 8 && q.width <= 32 && q.height >= 8 && q.height <= 32) return { el: all[i] };
    }
    return null;
  }

  function resolveStyle(el) {
    var ds = dsStyleOf(el);
    var description = (ds && ds.description) || el.getAttribute('data-ft-description') || '';
    var meta = null, key = null;
    if (ds) {
      key = ds.key;
      var local = ds.isLocal ? localStyle(ds) : null;
      if (local) state.styles[key] = local; // always fresh, the style may have been edited
      else {
        if (!state.styles[key]) {
          var hit = recall(ds);
          if (hit) state.styles[key] = hit;
          else if (!(state.asked[key] > Date.now() - 30000)) {
            state.asked[key] = Date.now();
            getStyle(ds, true).then(function (info) { window.__figmaTweaksStyle(key, info); });
          }
        }
        prefetchLibrary(ds.library_key);
      }
      meta = styleMeta(key);
    }
    return { el: el, description: description, hex: meta, styleKey: key, icon: true, chip: el.tagName === 'BUTTON' };
  }

  // Returns { el, description, hex } for the hovered element, or null.
  function resolve(target) {
    var st = takeStyle(target);
    if (st) return resolveStyle(st);
    // Text style row in the Assets panel: no tooltip attributes there, only the style object in the React props.
    var ti = target.closest('[role="treeitem"]');
    if (ti) {
      var ds = dsStyleOf(ti);
      if (ds && ds.style_type === 'TEXT') return resolveStyle(ti);
    }
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
        // The chip's own button, like the text style chip, so both tooltips sit at the same distance.
        var el = target.closest('button') || target;
        while (el.parentElement && el.getBoundingClientRect().height < 20 && el.parentElement !== document.body) el = el.parentElement;
        // Figma's own tooltip sits on a child with data-tooltip, drop it so only ours opens.
        [].slice.call(el.querySelectorAll('[data-tooltip]')).concat(target.closest('[data-tooltip]') || []).forEach(function (n) {
          n.removeAttribute('data-tooltip'); n.removeAttribute('data-tooltip-type');
        });
        if (!p.variableDescription && !p.variableValue) return null;
        return { el: el, description: p.variableDescription, hex: p.variableValue, chip: true };
      }
    }
    return null;
  }

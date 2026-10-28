// Runs in the Figma page. Replaces Figma's tooltips for variables and text styles with a compact one.
// Variables: description and HEX. Text styles: description, font weight and letter spacing.
// Data is read live from Figma's own React props, so it works in any file and with any library: the picker row
// has the variable object, the applied chip has variableDescription and variableValue, a style row has dsStyle.
// Font weight and letter spacing of a style are read from Figma itself, see "Font weight and letter spacing" below.
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

  // ---- Font weight and letter spacing of a style ----
  // Figma serves the node of a published style as a small .fig file (Kiwi binary, two deflate chunks: the schema and
  // the data) from its own endpoint, with the user's session cookie. We read the TEXT node out of it, no token needed.
  function inflate(u8) {
    var ds = new DecompressionStream('deflate-raw'), w = ds.writable.getWriter();
    w.write(u8); w.close();
    return new Response(ds.readable).arrayBuffer().then(function (b) { return new Uint8Array(b); });
  }

  function kiwiDecode(schemaBytes, dataBytes) {
    function Reader(b) { this.b = b; this.i = 0; }
    Reader.prototype.byte = function () { return this.b[this.i++]; };
    Reader.prototype.varuint = function () { var v = 0, s = 0, c; do { c = this.b[this.i++]; v += (c & 127) * Math.pow(2, s); s += 7; } while (c & 128); return v; };
    Reader.prototype.varint = function () { var v = this.varuint(); return v % 2 ? -Math.floor(v / 2) - 1 : Math.floor(v / 2); };
    Reader.prototype.float = function () {
      var f = this.b[this.i];
      if (f === 0) { this.i++; return 0; }
      var bits = f | (this.b[this.i + 1] << 8) | (this.b[this.i + 2] << 16) | (this.b[this.i + 3] << 24);
      this.i += 4;
      bits = (bits << 23) | (bits >>> 9);
      var dv = new DataView(new ArrayBuffer(4)); dv.setInt32(0, bits); return dv.getFloat32(0);
    };
    Reader.prototype.string = function () { var s = this.i; while (this.b[this.i] !== 0) this.i++; var t = new TextDecoder().decode(this.b.subarray(s, this.i)); this.i++; return t; };
    Reader.prototype.varuint64 = function () { var v = 0n, s = 0n, c; do { c = this.b[this.i++]; v |= BigInt(c & 127) << s; s += 7n; } while (c & 128); return v; };

    var native = ['bool', 'byte', 'int', 'uint', 'float', 'string', 'int64', 'uint64'];
    var sr = new Reader(schemaBytes), defs = [], n = sr.varuint();
    for (var d = 0; d < n; d++) {
      var name = sr.string(), kind = sr.byte(), fc = sr.varuint(), fields = [];
      for (var f = 0; f < fc; f++) fields.push({ name: sr.string(), type: sr.varint(), arr: !!sr.byte(), value: sr.varuint() });
      defs.push({ name: name, kind: kind, fields: fields });
    }
    var dr = new Reader(dataBytes);
    function field(fl) { return fl.arr ? Array.from({ length: dr.varuint() }, function () { return read(fl.type); }) : read(fl.type); }
    function read(t) {
      if (t < 0) {
        switch (native[~t]) {
          case 'bool': return !!dr.byte();
          case 'byte': return dr.byte();
          case 'int': return dr.varint();
          case 'uint': return dr.varuint();
          case 'float': return dr.float();
          case 'string': return dr.string();
          default: return String(dr.varuint64());
        }
      }
      var def = defs[t], o = {};
      if (def.kind === 0) { var v = dr.varuint(); var e = def.fields.find(function (x) { return x.value === v; }); return e ? e.name : v; }
      if (def.kind === 1) { def.fields.forEach(function (fl) { o[fl.name] = field(fl); }); return o; }
      for (;;) {
        var id = dr.varuint();
        if (id === 0) break;
        var fl = def.fields.find(function (x) { return x.value === id; });
        if (!fl) throw new Error('unknown field ' + id);
        o[fl.name] = field(fl);
      }
      return o;
    }
    return read(defs.findIndex(function (d) { return d.name === 'Message'; }));
  }

  // { weight: 'Semi Bold', spacing: '-2%' } of a published style, or null.
  function loadStyle(ds) {
    return fetch('/api/file_proxy/style/' + ds.key + '/canvas?fv=60&ver=' + encodeURIComponent(ds.content_hash || ''), { credentials: 'include' })
      .then(function (r) { return r.ok ? r.arrayBuffer() : null; })
      .then(function (buf) {
        if (!buf) return null;
        var b = new Uint8Array(buf), dv = new DataView(buf), off = 12, chunks = [];
        while (off + 4 <= b.length) { var len = dv.getUint32(off, true); chunks.push(b.subarray(off + 4, off + 4 + len)); off += 4 + len; }
        return Promise.all([inflate(chunks[0]), inflate(chunks[1])]);
      })
      .then(function (parts) {
        if (!parts) return null;
        var node = (kiwiDecode(parts[0], parts[1]).nodeChanges || []).find(function (n) { return n.type === 'TEXT'; });
        if (!node || !node.fontName) return null;
        return { weight: node.fontName.style, spacing: spacingPercent(node.letterSpacing, node.fontSize) };
      })
      .catch(function () { return null; });
  }

  // A style of the open file is a node of Figma's live scene graph: its font and letter spacing are read straight from
  // it, no network and no popups. The scene graph object is passed around in the props of several React components.
  function sceneGraph() {
    if (state.sg) return state.sg;
    var el = document.querySelector('button') || document.body, f = fiberOf(el);
    if (!f) return null;
    while (f.return) f = f.return;
    var stack = [f], budget = 150000;
    while (stack.length && budget-- > 0) {
      var n = stack.pop();
      if (n.sibling) stack.push(n.sibling);
      if (n.child) stack.push(n.child);
      var p = n.memoizedProps;
      if (p && typeof p === 'object' && p.sceneGraph && typeof p.sceneGraph.get === 'function') return (state.sg = p.sceneGraph);
    }
    return null;
  }

  function spacingPercent(ls, fontSize) {
    var pct = !ls ? 0 : ls.units === 'PERCENT' ? ls.value : (fontSize ? ls.value / fontSize * 100 : 0);
    return String(Math.round(pct * 100) / 100) + '%';
  }

  // { weight, spacing } of a style that lives in the open file, or null.
  function localStyle(ds) {
    var sg = sceneGraph();
    if (!sg) return null;
    try {
      var n = sg.get(ds.node_id);
      if (!n || n.type !== 'TEXT' || !n.fontName) return null;
      return { weight: n.fontName.style, spacing: spacingPercent(n.letterSpacing, n.fontSize) };
    } catch (e) { state.sg = null; return null; }
  }

  state.styles = {}; // style key -> { weight, spacing }
  state.asked = {};  // style key -> time of the last request, a failed one is retried after 30 s
  function styleMeta(key) {
    var s = state.styles[key];
    if (!s) return null;
    // A number instead of a name (variable font) becomes the nearest standard weight name.
    var names = { 100: 'Thin', 200: 'Extra Light', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'Semi Bold', 700: 'Bold', 800: 'Extra Bold', 900: 'Black' };
    var w = /^\d+$/.test(s.weight) ? names[Math.min(900, Math.max(100, Math.round(s.weight / 100) * 100))] : s.weight;
    return w + ' · ' + s.spacing;
  }
  window.__figmaTweaksStyle = function (key, info) {
    if (info) state.styles[key] = info;
    if (currentInfo && currentInfo.styleKey === key) {
      currentInfo.hex = styleMeta(key);
      if (currentInfo.shown) show(currentInfo);
    }
  };

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
      else if (!state.styles[key] && !(state.asked[key] > Date.now() - 30000)) {
        state.asked[key] = Date.now();
        loadStyle(ds).then(function (info) { window.__figmaTweaksStyle(key, info); });
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

  var tip = null, timer = null, current = null, currentInfo = null;
  function hide() {
    clearTimeout(timer); current = null;
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

  function onOver(e) {
    var el = e.target;
    if (!el || !el.closest || el.closest('#figma-tweaks-tip')) return;
    var info = resolve(el);
    if (!info) { hide(); return; }
    if (info.el === current) return;
    hide(); current = info.el; currentInfo = info;
    timer = setTimeout(function () { if (current === info.el) show(info); }, 350);
  }
  document.addEventListener('pointerover', onOver, true);
  document.addEventListener('mousedown', hide, true);
  document.addEventListener('scroll', hide, true);
  state.dispose = function () {
    hide();
    document.removeEventListener('pointerover', onOver, true);
    document.removeEventListener('mousedown', hide, true);
    document.removeEventListener('scroll', hide, true);
    if (tip) tip.remove();
  };
})

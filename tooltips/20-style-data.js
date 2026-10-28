// Part of the tooltips script, see 00-core.js. Parts are joined in file name order into one function by desktop/launch.js.
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

  // A published style version never changes (content_hash), so results are kept in localStorage and later sessions
  // show them at once.
  var STORE = 'figmaTweaks.styles', saved = {}, saveTimer = null;
  try { saved = JSON.parse(localStorage.getItem(STORE) || '{}'); } catch (e) {}
  function remember(ds, info) {
    saved[ds.key] = { h: ds.content_hash, w: info.weight, s: info.spacing };
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try {
        var keys = Object.keys(saved);
        if (keys.length > 3000) keys.slice(0, keys.length - 3000).forEach(function (k) { delete saved[k]; });
        localStorage.setItem(STORE, JSON.stringify(saved));
      } catch (e) {}
    }, 1000);
  }
  function recall(ds) { var e = saved[ds.key]; return e && e.h === ds.content_hash ? { weight: e.w, spacing: e.s } : null; }

  // Downloads run four at a time, a hovered style goes first.
  var active = 0, waiting = [];
  function pump() {
    while (active < 4 && waiting.length) {
      (function (job) {
        active++;
        job.fn().then(function (v) { active--; job.resolve(v); pump(); });
      })(waiting.shift());
    }
  }
  function getStyle(ds, urgent) {
    var hit = recall(ds);
    if (hit) return Promise.resolve(hit);
    return new Promise(function (resolve) {
      var job = { fn: function () { return loadStyle(ds); }, resolve: resolve };
      if (urgent) waiting.unshift(job); else waiting.push(job);
      pump();
    }).then(function (info) { if (info) remember(ds, info); return info; });
  }

  // All text styles of a library are loaded in the background the first time one of its styles is seen.
  state.libs = {};
  function prefetchLibrary(lk) {
    if (!lk || state.libs[lk]) return;
    state.libs[lk] = true;
    fetch('/api/design_systems/v2/library/' + lk + '/styles?include_realtime=true', { credentials: 'include' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !j.meta) return;
        j.meta.styles.filter(function (st) { return st.style_type === 'TEXT'; }).slice(0, 150).forEach(function (st) {
          getStyle(st, false).then(function (info) { if (info) state.styles[st.key] = info; });
        });
      })
      .catch(function () { state.libs[lk] = false; });
  }
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

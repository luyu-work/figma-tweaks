// Part of the tooltips script, see 00-core.js. Parts are joined in file name order into one function by desktop/launch.js.
  function onOver(e) {
    var el = e.target;
    if (!el || !el.closest || el.closest('#figma-tweaks-tip')) return;
    var info = resolve(el);
    if (!info) { hide(); return; }
    if (info.el === current) return;
    var warm = Date.now() - (state.lastHide || 0) < 500 || (tip && tip.style.display === 'block');
    hide(); current = info.el; currentInfo = info;
    timer = setTimeout(function () { if (current === info.el) show(info); }, warm ? 30 : 250);
  }
  // Opening the style picker or selecting a text with a library style starts loading that library right away.
  var watchTimer = null;
  var watcher = new MutationObserver(function () {
    if (watchTimer) return;
    watchTimer = setTimeout(function () {
      watchTimer = null;
      sceneGraph();
      var els = [].slice.call(document.querySelectorAll('[role="rowheader"], [role="treeitem"]')).slice(0, 40);
      var chip = document.querySelector('button[class*="style_title"]');
      if (chip) els.push(chip);
      els.forEach(function (e) { var ds = dsStyleOf(e); if (ds) prefetchLibrary(ds.library_key); });
    }, 400);
  });
  watcher.observe(document, { childList: true, subtree: true });
  document.addEventListener('pointerover', onOver, true);
  document.addEventListener('mousedown', hide, true);
  document.addEventListener('scroll', hide, true);
  state.dispose = function () {
    hide();
    clearTimeout(state.preloadTimer);
    watcher.disconnect();
    document.removeEventListener('pointerover', onOver, true);
    document.removeEventListener('mousedown', hide, true);
    document.removeEventListener('scroll', hide, true);
    if (tip) tip.remove();
  };

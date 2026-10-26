// Runs in the Figma page. Defines window.__figmaTweaksShowUpdate(version): a small Figma-style modal that says
// an update was downloaded. "Перезапустить" asks the launcher (binding figmaTweaksAction) to restart Figma,
// "Позже" just closes it, the update is already on disk and applies on the next start.
// Returns true when the modal was shown, false when this page is not visible (the launcher then tries another one).
(function () {
  // mode "visible": the page is on screen. "focus": it has keyboard focus. "any": any file page.
  window.__figmaTweaksShowUpdate = function (version, mode) {
    var ok = mode === 'any' ? /^\/(design|file|board|slides|make)\//.test(location.pathname)
      : mode === 'focus' ? document.hasFocus()
      : document.visibilityState === 'visible';
    if (!ok) return false;
    if (document.getElementById('figma-tweaks-update')) return true;

    var host = document.createElement('div');
    host.id = 'figma-tweaks-update';
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483647';
    var root = host.attachShadow({ mode: 'open' });
    root.innerHTML =
      '<style>' +
      '*{box-sizing:border-box;margin:0}' +
      '.back{position:fixed;inset:0;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;' +
      'font:12px/16px Inter,system-ui,sans-serif;color:#fff}' +
      '.box{width:320px;background:#2c2c2c;border-radius:16px;box-shadow:0 0 0 1px rgba(255,255,255,.08),0 10px 40px rgba(0,0,0,.5)}' +
      '.head{display:flex;align-items:center;justify-content:space-between;height:48px;padding:0 12px 0 16px;border-bottom:1px solid rgba(255,255,255,.1)}' +
      '.title{font-weight:600;font-size:12px}' +
      '.x{width:24px;height:24px;border:0;border-radius:5px;background:none;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center}' +
      '.x:hover{background:rgba(255,255,255,.1)}' +
      '.body{padding:16px;color:rgba(255,255,255,.7)}' +
      '.foot{display:flex;justify-content:flex-end;gap:8px;padding:0 16px 16px}' +
      'button.b{height:28px;padding:0 12px;border-radius:6px;font:500 12px Inter,system-ui,sans-serif;cursor:pointer;border:1px solid rgba(255,255,255,.2);background:none;color:#fff}' +
      'button.b:hover{background:rgba(255,255,255,.08)}' +
      'button.p{background:#0d99ff;border-color:#0d99ff}' +
      'button.p:hover{background:#0a85e0}' +
      '</style>' +
      '<div class="back"><div class="box" role="dialog" aria-modal="true">' +
      '<div class="head"><div class="title"></div>' +
      '<button class="x" aria-label="Закрыть"><svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M1 1l10 10M11 1L1 11"/></svg></button></div>' +
      '<div class="body">Вышло новое обновление, перезагрузите Figma, чтобы внеслись обновления</div>' +
      '<div class="foot"><button class="b later">Позже</button><button class="b p restart">Перезапустить</button></div>' +
      '</div></div>';
    root.querySelector('.title').textContent = 'Обновление figma-tweaks ' + version;

    function close() {
      document.removeEventListener('keydown', onKey, true);
      host.remove();
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    root.querySelector('.later').addEventListener('click', close);
    root.querySelector('.x').addEventListener('click', close);
    root.querySelector('.restart').addEventListener('click', function () {
      if (window.figmaTweaksAction) window.figmaTweaksAction('restart');
      close();
    });
    document.addEventListener('keydown', onKey, true);
    document.documentElement.appendChild(host);
    return true;
  };
})

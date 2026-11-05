// Runs in the Figma page. Defines window.__figmaTweaksShowUpdate(version): a blue button at the start of the tab bar,
// the spot of Figma's own "Update now" button. A click asks the launcher (binding figmaTweaksAction) to restart Figma.
// Only the tab bar shell (file: page) takes it, every other page returns false. The page keeps the button itself,
// no timer: a MutationObserver puts it back when Figma re-renders the tab bar and drops it. The launcher calls the
// function once when an update arrives and passes the version to every page it injects later.
(function () {
  var notified = false;

  var place = function () {
    if (document.getElementById('figma-tweaks-update')) return true;
    var bar = document.querySelector('.tabContainer');
    if (!bar) return false;

    var wrap = document.createElement('div');
    wrap.id = 'figma-tweaks-update';
    wrap.style.cssText = 'display:flex;align-items:center;flex:0 0 auto;padding-right:8px;margin:0 0 0 8px;border-right:solid 1px var(--color-bordertranslucent);-webkit-app-region:no-drag';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.style.cssText = 'height:24px;padding:0 10px;border:0;border-radius:5px;background:#0d99ff;color:#fff;' +
      'font:500 11px/16px Inter,system-ui,sans-serif;white-space:nowrap;cursor:pointer';
    btn.textContent = 'Обновить figma-tweaks';
    btn.addEventListener('mouseenter', function () { btn.style.background = '#0a85e0'; });
    btn.addEventListener('mouseleave', function () { btn.style.background = '#0d99ff'; });
    btn.addEventListener('click', function () {
      if (window.figmaTweaksAction) window.figmaTweaksAction('restart');
    });
    wrap.appendChild(btn);

    var spacer = bar.querySelector('[class*="tab_bar--trafficLightsSpacer"]');
    if (spacer) spacer.after(wrap); else bar.prepend(wrap);
    if (!notified && window.figmaTweaksAction) { notified = true; window.figmaTweaksAction('update-shown'); }
    return true;
  };

  window.__figmaTweaksShowUpdate = function (version) {
    if (location.protocol !== 'file:') return false;
    window.__figmaTweaksUpdateVersion = version;
    if (window.__figmaTweaksUpdateObs) window.__figmaTweaksUpdateObs.disconnect();
    var obs = window.__figmaTweaksUpdateObs = new MutationObserver(place);
    obs.observe(document.documentElement || document, { childList: true, subtree: true });
    return place();
  };

  // A page injected after the update arrived (tab bar reopened, live reload).
  if (window.__figmaTweaksUpdateVersion) window.__figmaTweaksShowUpdate(window.__figmaTweaksUpdateVersion);
})

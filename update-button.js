// Runs in the Figma page. Defines window.__figmaTweaksShowUpdate(version): a blue button at the start of the tab bar,
// the spot of Figma's own "Update now" button. A click asks the launcher (binding figmaTweaksAction) to restart Figma.
// Only the tab bar shell (file: page) takes it, every other page returns false. The launcher calls it every second
// until the button is placed, the page re-adds it if Figma re-renders the tab bar and drops it.
(function () {
  window.__figmaTweaksShowUpdate = function (version) {
    if (location.protocol !== 'file:') return false;
    var bar = document.querySelector('.tabContainer');
    if (!bar) return false;
    if (document.getElementById('figma-tweaks-update')) return true;
    var old = document.getElementById('figma-tweaks-update-style');
    if (old) old.remove();

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

    // The button takes the place of the Home tab. The style lives and dies with the button.
    var hide = document.createElement('style');
    hide.id = 'figma-tweaks-update-style';
    hide.textContent = '[class*="tab--fileBrowserTab"]{display:none !important}';
    document.head.appendChild(hide);

    var spacer = bar.querySelector('[class*="tab_bar--trafficLightsSpacer"]');
    if (spacer) spacer.after(wrap); else bar.prepend(wrap);
    return true;
  };
})

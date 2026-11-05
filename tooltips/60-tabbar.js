// Tab bar shell (file: page). The bottom line of the bar is a translucent white border, over a dark page it vanishes, so it is made solid.
// The tab group fill is 38px high and stops short of that border, so it is stretched over it.
// The Home tab is narrowed to the width of the left rail of the editor. That width depends on the screen, so the
// editor page measures it (in physical pixels) and reports it through the launcher, see the rail part below.
if (location.protocol === 'file:') {
  var tabbarStyle = document.getElementById('figma-tweaks-tabbar');
  if (!tabbarStyle) { tabbarStyle = document.createElement('style'); tabbarStyle.id = 'figma-tweaks-tabbar'; document.head.appendChild(tabbarStyle); }
  var applyRail = function () {
    // Physical pixels of the rail to CSS pixels of this page, 44 until the editor reported.
    var w = window.__figmaTweaksRailPx > 0 ? window.__figmaTweaksRailPx / devicePixelRatio : 44;
    // The editor page sits inside the window frame, it is narrower than this page by a pixel or two on each side.
    // The rail starts that far from the left, the Home tab starts there too, the frame line stays visible to its left.
    var inset = window.__figmaTweaksPagePx > 0 ? Math.max(0, (innerWidth - window.__figmaTweaksPagePx / devicePixelRatio) / 2) : 0.8;
    w = Math.round(w * 100) / 100; inset = Math.round(inset * 100) / 100;
    tabbarStyle.textContent =
      '[class*="tab_bar--container"]{border-bottom-color:#414141 !important}' +
      '[class*="group_overlay--groupOverlay--"]{height:calc(100% + 0.8px) !important}' +
      '[class*="tab--fileBrowserTab"]{width:' + w + 'px !important;min-width:0 !important;flex:0 0 ' + w + 'px !important;margin-left:' + inset + 'px !important;padding:0 !important;justify-content:center !important' +
      // Smooth resize, but not for the first measurement at start (44 to the real width).
      (railSmooth ? ';transition:width .25s ease,flex-basis .25s ease,margin-left .25s ease !important' : '') + '}';
  };
  var railSmooth = false;
  window.__figmaTweaksRail = function (px, page) {
    window.__figmaTweaksRailPx = px; window.__figmaTweaksPagePx = page; applyRail();
    if (!railSmooth) setTimeout(function () { railSmooth = true; applyRail(); }, 100);
  };
  applyRail();
  // Width already known (live reload, tab bar page reopened): animate from the next change on.
  if (window.__figmaTweaksRailPx > 0) setTimeout(function () { railSmooth = true; applyRail(); }, 100);
} else if (/(^|\.)figma\.com$/.test(location.hostname) && window.figmaTweaksAction) {
  // Editor page: report the width of the left rail. No polling, only two moments: once when the rail appears after
  // the page opened, and after "Additional labels" is toggled in the main menu (it changes the rail width).
  var lastRail = 0;
  var reportRail = function () {
    var rail = document.querySelector('[data-testid="navigation-bar"]');
    var px = rail ? rail.getBoundingClientRect().width * devicePixelRatio : 0;
    if (px > 0 && Math.abs(px - lastRail) > 0.01) { lastRail = px; window.figmaTweaksAction('rail:' + px + ':' + innerWidth * devicePixelRatio); }
    return px > 0;
  };
  // The rail is mounted a bit after the page, wait for it for up to 30 s.
  var railTries = 0;
  state.railTimer = setInterval(function () { if (reportRail() || ++railTries > 60) clearInterval(state.railTimer); }, 500);
  var onRailMenu = function (e) {
    if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
    var item = e.target.closest && e.target.closest('[role^="menuitem"]');
    if (!item || !/^\s*Additional labels/.test(item.textContent)) return;
    // The rail changes more than 600 ms after the click, measure every 250 ms for 4 s (the report is sent only on a change).
    clearInterval(state.railBurst);
    var n = 0;
    state.railBurst = setInterval(function () { reportRail(); if (++n >= 16) clearInterval(state.railBurst); }, 250);
  };
  document.addEventListener('click', onRailMenu, true);
  document.addEventListener('keydown', onRailMenu, true);
  state.railOff = function () {
    clearInterval(state.railBurst);
    document.removeEventListener('click', onRailMenu, true);
    document.removeEventListener('keydown', onRailMenu, true);
  };
}

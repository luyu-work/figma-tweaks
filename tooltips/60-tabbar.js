// Tab bar shell (file: page). The bottom line of the bar is a translucent white border, over a dark page it vanishes, so it is made solid.
// The first run may come before the document has a head (the new-document script), then the style is added by the run after DOMContentLoaded, never to the document itself, that would make it the root element and blank the page.
// The tab group fill is 38px high and stops short of that border, so it is stretched over it.
// The Home tab is narrowed to the width of the left rail of the editor. That width depends on the screen, so the
// editor page measures it (in physical pixels) and reports it through the launcher, see the rail part below.
if (location.protocol === 'file:') {
  var tabbarStyle = document.getElementById('figma-tweaks-tabbar');
  if (!tabbarStyle) { tabbarStyle = document.createElement('style'); tabbarStyle.id = 'figma-tweaks-tabbar'; if (document.head) document.head.appendChild(tabbarStyle); }
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
  // Figma places the tab group fill from tab positions it measured itself. A width changed only by CSS leaves the fill
  // where it was (a gap or an overlap after the Home tab shrinks), so Figma is made to measure again, at once and when the animation ends.
  var railNudges = [];
  var nudgeTabLayout = function () {
    railNudges.forEach(clearTimeout);
    railNudges = [0, 320].map(function (ms) { return setTimeout(function () { window.dispatchEvent(new Event('resize')); }, ms); });
  };
  window.__figmaTweaksRail = function (px, page) {
    window.__figmaTweaksRailPx = px; window.__figmaTweaksPagePx = page; applyRail();
    if (!railSmooth) setTimeout(function () { railSmooth = true; applyRail(); }, 100);
    nudgeTabLayout();
  };
  applyRail();
  // Width already known (live reload, tab bar page reopened): animate from the next change on.
  if (window.__figmaTweaksRailPx > 0) setTimeout(function () { railSmooth = true; applyRail(); }, 100);
} else if (/(^|\.)figma\.com$/.test(location.hostname) && window.figmaTweaksAction) {
  // Editor page: report the width of the left rail whenever it changes. A ResizeObserver on the rail covers every cause
  // (Additional labels on and off, the rail settling after the file opened, window zoom), and a changed width is reported
  // once it stopped changing. A page in the background does not report, it reports once when it is shown, so the Home tab always
  // matches the editor on screen. The rail may be mounted late or replaced, the DOM watcher of 50-events.js calls watchRail on page changes, there is no timer.
  var lastRail = 0, railEl = null, railObs = null, railDebounce = null;
  var sendRail = function () {
    // Only the page on screen reports. Background pages are hidden, zero sized and have another pixel ratio, their rail width must not reach the tab bar.
    if (document.visibilityState !== 'visible' || !innerWidth) return;
    var rail = document.querySelector('[data-testid="navigation-bar"]');
    var css = rail ? rail.getBoundingClientRect().width : 0;
    // The rail is about 44 to 64 px wide. Anything far outside means the page is mid-render or broken, it must not resize the Home tab.
    if (css < 20 || css > 150) return;
    var px = css * devicePixelRatio;
    if (px > 0 && Math.abs(px - lastRail) > 0.01) { lastRail = px; window.figmaTweaksAction('rail:' + px + ':' + innerWidth * devicePixelRatio); }
  };
  var queueRail = function () { clearTimeout(railDebounce); railDebounce = setTimeout(sendRail, 120); };
  var watchRail = function () {
    if (railEl && railEl.isConnected) return;
    var rail = document.querySelector('[data-testid="navigation-bar"]');
    if (!rail) return;
    if (railObs) railObs.disconnect();
    railEl = rail;
    railObs = new ResizeObserver(queueRail);
    railObs.observe(rail);
    queueRail();
  };
  var onRailShown = function () { if (document.visibilityState === 'visible') { lastRail = 0; queueRail(); } };
  watchRail();
  state.watchRail = watchRail; // the DOM watcher of 50-events.js calls it when the page changes
  window.addEventListener('resize', queueRail);
  document.addEventListener('visibilitychange', onRailShown);
  state.railOff = function () {
    clearTimeout(railDebounce);
    if (railObs) railObs.disconnect();
    window.removeEventListener('resize', queueRail);
    document.removeEventListener('visibilitychange', onRailShown);
  };
}

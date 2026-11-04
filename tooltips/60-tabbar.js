// Tab bar shell (file: page). The bottom line of the bar is a translucent white border, over a dark page it vanishes, so it is made solid.
// The tab group fill is 38px high and stops short of that border, so it is stretched over it.
// The Home tab is narrowed to the width of the left rail of the file browser (44px).
if (location.protocol === 'file:') {
  var tabbarStyle = document.getElementById('figma-tweaks-tabbar');
  if (!tabbarStyle) { tabbarStyle = document.createElement('style'); tabbarStyle.id = 'figma-tweaks-tabbar'; document.head.appendChild(tabbarStyle); }
  tabbarStyle.textContent =
    '[class*="tab_bar--container"]{border-bottom-color:#414141 !important}' +
    '[class*="group_overlay--groupOverlay--"]{height:calc(100% + 0.8px) !important}' +
    '[class*="tab--fileBrowserTab"]{width:44px !important;min-width:0 !important;flex:0 0 44px !important;margin-left:0.8px !important;padding:0 !important;justify-content:center !important}';
}

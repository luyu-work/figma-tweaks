// Part of the tooltips script, see 00-core.js. Parts are joined in file name order into one function by desktop/launch.js.
  // Preload: a few seconds after a file opens, the text styles of the libraries available to it are loaded in the
  // background, so the tooltips already have the font weight and letter spacing by the time a style is hovered.
  // The list comes from Figma's own endpoint, libraries without text styles are skipped, results are cached.
  function preloadLibraries() {
    var m = location.pathname.match(/^\/(?:design|file|board)\/([A-Za-z0-9]+)/);
    if (!m) return;
    fetch('/api/design_systems/v2/libraries?file_key=' + m[1], { credentials: 'include' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        ((j && j.meta) || []).forEach(function (lib) { if (lib.num_styles > 0) prefetchLibrary(lib.library_key); });
      })
      .catch(function () {});
  }
  state.preloadTimer = setTimeout(preloadLibraries, 3000);

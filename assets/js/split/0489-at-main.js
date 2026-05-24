/*
 * Main — application entry point.
 *
 * Flow:
 *   1. Device.system.detectXR()  await XR support probe.
 *   2. URL ?performance         → Performance.displayResults()
 *      (boot the benchmark page instead of the app).
 *   3. window._PROJECT_NAME_    → reroute Dev.pathName /
 *      filesPath under /{name}/HTML/ (for embedded preview
 *      mode inside the AT host site).
 *   4. UnsupportedRedirect.requiresWebGL = true; if the
 *      browser fails the support gate, replace location
 *      with window._UNSUPPORTED_PAGE_.
 *   5. GLUI.init() bootstraps the screen-space UI system.
 *   6. URL ?p=<frag>            → load uil+shaders subset of
 *      Assets.list() then boot Playground.instance (single-
 *      fragment inspector mode).
 *   7. Otherwise: Container.instance() — the full app,
 *      mounts ViewController + all scenes.
 *
 * Standard Fragment plumbing.
 */
Class(function Main() {
  !(async function () {
    if ((await Device.system.detectXR(), Utils.query('performance')))
      return Performance.displayResults();
    !(function init() {
      window._PROJECT_NAME_ &&
        ((Dev.pathName = `/${window._PROJECT_NAME_}/HTML/`), (Dev.filesPath = Dev.pathName));
      if (((UnsupportedRedirect.requiresWebGL = true), UnsupportedRedirect.unsupported()))
        return void window.location.replace(window._UNSUPPORTED_PAGE_);
      if ((GLUI.init(), window.location.search.includes('p=')))
        return AssetLoader.loadAssets(Assets.list().filter(['uil', 'shaders'])).then(
          Playground.instance,
        );
      Container.instance();
    })();
  })();
});

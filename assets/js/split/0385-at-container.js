/*
 * Container — top-level Element singleton: app boot orchestrator
 * inside the DOM. Wires the static `App` (0390) config to the
 * loader, AssetLoader, World, and entry-point class.
 *
 * Boot flow (async IIFE):
 *   1. AppState.set('Global/playground', false) — default OFF.
 *   2. Add `$this` to Stage with `position: static`.
 *   3. Build AssetLoader from the asset list filtered by
 *      `_app.loaderData.assets` (comma-separated whitelist).
 *      Instantiate `window[_app.loaderData.fragment]` as the
 *      loading screen, pass `{loader}` so it can render
 *      progress.
 *   4. `loader.loadModules()` kicks off network loads.
 *   5. `Initializer3D.createWorld()` builds the GL World.
 *   6. `CMSData.ready()` blocks on CMS payload arrival.
 *   7. Fire `Global/loadComplete = true`.
 *   8. Entry split by USING_XR flag (compile-time false here):
 *      - XR path: spawn xrLanding overlay, init XR World, add
 *        entry-point, await user touch (or auto under AURA),
 *        then `XRDeviceManager.startSession()`.
 *      - Non-XR path: `World.init()`, instantiate
 *        `window[_app.entryPointData]`, attach World.ELEMENT.
 *
 * `USING_XR = false` is the compile-time switch baked into this
 * build — the XR branch is dead code in this artefact but kept
 * for reference.
 */
Class(function Container() {
  Inherit(this, Element);
  const self = this,
    $this = this.element,
    USING_XR = false;
  var _app = self.initClass(App);
  !(async function () {
    AppState.set('Global/playground', false);
    (function initHTML() {
      Stage.add($this);
      $this.css({
        position: 'static',
      });
    })();
    (async function loadView() {
      let loader = self.initClass(
        AssetLoader,
        Assets.list().filter(_app.loaderData.assets.split(',').map((f) => f.trim())),
      );
      self.initClass(window[_app.loaderData.fragment], {
        loader: loader,
      });
      loader.loadModules();
      await Initializer3D.createWorld();
      await CMSData.ready();
      AppState.set('Global/loadComplete', true);
      (async function loadComplete() {
        USING_XR
          ? (_app.xrLandingData && Stage.add(self.initClass(window[_app.xrLandingData])),
            (async function waitForInteraction() {
              await World.instance().initXR(RenderManager.WEBVR);
              let ref = self.initClass(window[_app.entryPointData]);
              ref.group && World.SCENE.add(ref.group);
              let click = async (e) => {
                (e && e.isLeaveEvent) ||
                  (await XRDeviceManager.startSession(), Stage.unbind('touchend', click));
              };
              window.AURA ? click() : Stage.bind('touchend', click);
            })())
          : (await World.instance().init(),
            self.initClass(window[_app.entryPointData]),
            $this.add(World.ELEMENT));
      })();
    })();
  })();
}, 'singleton');

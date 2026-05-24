/*
 * World — singleton: top of the Hydra 3D pipeline. Owns the
 * RenderManager, scene, camera, post chain (Nuke), and shared
 * primitive geometries. Most app code never instantiates World
 * directly — `World.instance()` is called by Container (0385).
 *
 * Static surface exposed on the class object (populated in
 * `initWorld`):
 *   - `World.PLANE`   1×1 PlaneGeometry — shared quad for full-
 *     screen and UI shaders.
 *   - `World.PLANEHI` 1×1 high-tess plane (100×50) for vertex-
 *     displacement shaders.
 *   - `World.QUAD`    Utils3D.getQuad — fullscreen NDC quad for
 *     post passes (no MV transform).
 *   - `World.BOX`     unit BoxGeometry.
 *   - `World.BOXHI`   tess box (10×10×10) for vertex effects.
 *   - `World.SPHERE`  unit sphere (16×16) — debug primitives.
 *   - `World.TUBE`    tall thin cylinder (radius 0.1, length 20).
 *   - `World.SCENE` / `RENDERER` / `ELEMENT` / `CAMERA` / `NUKE`
 *     and `World.DPR` (from Tests.getDPR).
 *
 * `init()` (idempotent — guarded on `World.PLANE`):
 *   - Builds primitives.
 *   - `RenderManager.initialize(_type, options)` — the type is
 *     RenderManager.NORMAL by default, switched to WEBVR/WEBAR
 *     via `initXR(type)`. Options pass MSAA samples through
 *     when `Tests.enableWorldNukeMSAA`.
 *   - Disables Renderer shadows (FX layers handle their own),
 *     enables `Nuke.recyclePingPong` (single shared RT pool),
 *     adds FXAA pass if `Tests.renderFXAA` says so.
 *   - Optional debug controls — only when `DebugControls` class
 *     exists AND `?orbit` is set; choose WASD vs orbit by
 *     `?wasd` flag. Otherwise instantiates a `BaseCamera`
 *     locked at z=6. Controls live in `World.CONTROLS`.
 *   - Adds resize listener that updates Renderer size + camera
 *     aspect/projection.
 *   - Hooks `Render.onDrawFrame(loop)` unless `?uilOnly` is
 *     set (UIL-only mode runs the editor without rendering).
 *
 * `loop(t, delta)` — per-frame: update controls if enabled,
 * `RenderManager.render()`.
 *
 * `initXR(type, startImmersive=true)` — set the renderer type
 * first, then `init()`; used by Container/Playground XR paths.
 *
 * `ready()` resolves once `World.NUKE` is populated.
 *
 * Static-init block at end installs `World.instance()` lazy
 * factory.
 */
Class(
  function World() {
    Inherit(this, Component);
    const self = this;
    var _renderer, _scene, _camera, _nuke, _controls;
    World.DPR = Tests.getDPR();
    var _type = RenderManager.NORMAL;
    async function init() {
      World.PLANE ||
        (await (async function initWorld() {
          World.PLANE = new PlaneGeometry(1, 1);
          World.PLANEHI = new PlaneGeometry(1, 1, 100, 50);
          World.QUAD = Utils3D.getQuad();
          World.BOX = new BoxGeometry(1, 1, 1);
          World.BOXHI = new BoxGeometry(1, 1, 1, 10, 10, 10);
          World.SPHERE = new SphereGeometry(1, 16, 16);
          World.TUBE = new CylinderGeometry(0.1, 0.1, 20, 10, 100);
          let options = {
            powerPreference: 'high-performance',
          };
          Tests.enableWorldNukeMSAA() &&
            ((options.samplesAmount = Tests.msaaSamples() || undefined),
            (options.multisample = !!options.samplesAmount));
          RenderManager.initialize(_type, options);
          _renderer = RenderManager.gl;
          _scene = RenderManager.scene;
          _camera = RenderManager.camera.worldCamera;
          _nuke = RenderManager.nuke;
          _renderer.shadows = false;
          Nuke.recyclePingPong = true;
          Tests.renderFXAA() && _nuke.add(new FXAA());
          World.SCENE = _scene;
          World.RENDERER = _renderer;
          World.ELEMENT = $(_renderer.domElement);
          World.CAMERA = _camera;
          World.NUKE = _nuke;
        })(),
        _renderer &&
          (RenderManager.type == RenderManager.NORMAL &&
            (Camera.instance(_camera), (Render.capFPS = Tests.capFPS())),
          (function initControls() {
            if (!window.DebugControls) return;
            const renderTypeNormal = RenderManager.type === RenderManager.NORMAL;
            if (!Utils.query('orbit')) {
              let camera = new BaseCamera();
              return (camera.group.position.set(0, 0, 6), void camera.lock());
            }
            const Controls = Utils.query('wasd') ? WASDControls : DebugControls;
            _controls = new Controls(_camera, World.ELEMENT.div);
            renderTypeNormal
              ? (_controls.target = new Vector3(0, 0, 0))
              : (_controls.enabled = false);
            World.CONTROLS = _controls;
            World.CAMERA.position.z = 6;
          })(),
          (function addHandlers() {
            self.events.sub(Events.RESIZE, resize);
          })(),
          Utils.query('uilOnly') || Render.onDrawFrame(loop)));
    }
    function resize() {
      _renderer.setSize(Stage.width, Stage.height);
      _camera.aspect = Stage.width / Stage.height;
      _camera.updateProjectionMatrix();
    }
    function loop(t, delta) {
      _controls && _controls.enabled && _controls.update();
      RenderManager.render();
    }
    this.initXR = async function (type, startImmersive = true) {
      _type = type;
      await init();
    };
    this.init = function () {
      return init();
    };
    this.ready = function () {
      return self.wait((_) => !!World.NUKE);
    };
  },
  function () {
    var _instance;
    World.instance = function () {
      return (_instance || (_instance = new World()), _instance);
    };
  },
);

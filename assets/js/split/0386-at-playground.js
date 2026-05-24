/*
 * Playground — alternate top-level singleton (instead of
 * Container 0385) used when the URL has a `?p=ClassName` query.
 * Hosts an arbitrary view class in isolation so the developer
 * can prototype views without booting the full app.
 *
 * Boot:
 *   - Wait UILStorage.ready, read `Global.PLAYGROUND = ?p`.
 *   - `initXR()` parses the app's source for an `XRConfig` call,
 *     evals the embedded config object literal, and reapplies
 *     it here (so playground inherits real-app XR settings).
 *   - XR path waits for tap before requesting session.
 *   - Non-XR path: World.init() → initView() → attach
 *     World.ELEMENT to Stage → wire double-click handler.
 *
 * Double-click: raycasts under Mouse against the view scene,
 * finds the first hit whose object has a `uilGraph` and focuses
 * the matching UIL editor folder (handy "click thing → see its
 * editor" affordance).
 *
 * initView():
 *   - Resolves the view class as `window['Playground' + name]`
 *     or `window[name]`.
 *   - If view has `.element`: attach via GLUI or Stage as
 *     appropriate.
 *   - If view has `.root + .$gluiObject` (UI3D): attach via
 *     `initUI3DView` (XR puts it in front of the camera).
 *   - If view has `.rt + .scene + .nuke` (offscreen view): wraps
 *     its output as a ScreenQuad shader on `World.QUAD` and
 *     adds to World.SCENE. Special-cases Figma views as a GLUI
 *     overlay (positioned 40,40 in the corner; portrait halves
 *     the scale).
 *   - Else: adds `_view.group || _view.mesh || _view.object3D ||
 *     new Group()` to World.SCENE.
 *   - Always `Dev.expose('view', _view)` for console access.
 *
 * Camera helper (`initCameraHelper`):
 *   - Spawns an orbit camera (DebugControls) and a WASD camera
 *     (WASDControls), both disabled at boot.
 *   - Keyboard hotkeys (when not focused in input/textarea):
 *     - `!` (Shift+1) — restore the prior nuke.camera, turn
 *       both controls off.
 *     - `@` (Shift+2) — engage orbit camera.
 *     - `#` (Shift+3) — engage WASD camera.
 *   - `?orbit` query auto-engages orbit and re-asserts it at
 *     500/1000/3000ms (overcomes view classes that fight for
 *     the camera during their own init).
 *
 * `XR-relative UI helpers` (addUIToWorldScene / initGLUIView /
 * initUI3DView) place 2D UI groups 1.5m (XR) or 2m (desktop) in
 * front of the camera, oriented toward it, scaled down so DOM
 * pixels translate to world units.
 */
Class(function Playground() {
  Inherit(this, Component);
  const self = this;
  let _view, _isRT;
  const USING_XR = Device.system.xr.vr;
  async function initXR() {
    let app = App.toString();
    app.includes('_this.initClass(XRConfig') &&
      ((app = app.split('_this.initClass(XRConfig,')[1].split(');')[0]),
      self.initClass(XRConfig, eval(app)));
    USING_XR
      ? waitForInteraction()
      : (await World.instance().init(), initView(), Stage.add(World.ELEMENT), initDoubleClick());
  }
  async function waitForInteraction() {
    World.instance().initXR(RenderManager.WEBVR).then(initView);
    let click = async (e) => {
      (e && e.isLeaveEvent) ||
        (self.events.unsub(Mouse.input, Interaction.END, click),
        await XRDeviceManager.startSession());
    };
    window.AURA ? click() : self.events.sub(Mouse.input, Interaction.END, click);
  }
  function initDoubleClick() {
    self.lastClick = performance.now();
    Stage.bind('click', function () {
      performance.now() - self.lastClick < 180 && onDoubleClick();
      self.lastClick = performance.now();
    });
  }
  function onDoubleClick() {
    let camera = _isRT ? _view.nuke.camera : World.NUKE.camera,
      scene = _isRT ? _view.scene : World.SCENE,
      raycaster = Raycaster.find(camera),
      objs = [];
    scene.traverse((obj) => {
      objs.push(obj);
    });
    let intersects = raycaster.checkHit(objs, Mouse),
      found = false;
    intersects.forEach((element) => {
      if (found) return;
      const uilGraph = element?.object?.uilGraph;
      uilGraph && ((found = true), uilGraph?.find?.(element?.object?.uilName)?.focus?.());
    });
  }
  async function addUIToWorldScene(uiGroup) {
    USING_XR ? await RenderManager.scheduleOne(RenderManager.EYE_RENDER) : await defer();
    let group = new Group(),
      v3 = new Vector3(),
      distance = USING_XR ? 1.5 : 2;
    return (
      v3.set(0, 0, -distance).applyQuaternion(World.CAMERA.quaternion),
      group.position.copy(World.CAMERA.position).add(v3),
      group.lookAt(World.CAMERA.position),
      group.add(uiGroup),
      World.SCENE.add(group),
      group
    );
  }
  async function initGLUIView(element) {
    if (USING_XR) {
      (await addUIToWorldScene(element.group)).scale.setScalar(1 / 1024);
    } else GLUI.Stage.add(element);
  }
  async function initUI3DView(ui3d) {
    USING_XR
      ? (await addUIToWorldScene(ui3d.$gluiObject.group), (ui3d.$gluiObject.depthTest = false))
      : Device.mobile
        ? initGLUIView(ui3d.root)
        : (GLUI.Scene.add(ui3d.$gluiObject), await addUIToWorldScene(ui3d.$gluiObject.anchor));
  }
  async function initView() {
    let request = Global.PLAYGROUND.split('/')[0],
      view = window['Playground' + request] || window[request] || null;
    if (!view) throw `No Playground class ${request} found.`;
    if (
      ((_view = view.instance ? view.instance() : self.initClass(view)),
      _view.element
        ? _view.element.mesh
          ? await initGLUIView(_view.element)
          : Stage.add(_view.element)
        : _view.root && _view.$gluiObject && (await initUI3DView(_view)),
      _view.rt && _view.scene && _view.nuke && !_view.isVrWorldMode && !_view.isVrSceneMode)
    ) {
      if (request.includes('Figma')) {
        let dimensions = _view.dimensions,
          $obj = $gl(dimensions[0], dimensions[1], _view.rt.texture);
        $obj.x = 40;
        $obj.y = 40;
        'portrait' === Utils.query('orientation') && (($obj.scale = 0.5), ($obj.y = -300));
        GLUI.Stage.add($obj);
      } else {
        let shader = self.initClass(Shader, 'ScreenQuad', {
            tMap: {
              value: _view,
            },
          }),
          mesh = new Mesh(World.QUAD, shader);
        mesh.frustumCulled = false;
        World.SCENE.add(mesh);
        _isRT = true;
      }
    } else World.SCENE.add(_view.group || _view.mesh || _view.object3D || new Group());
    initCameraHelper(_view.nuke || World.NUKE);
    Dev.expose('view', _view);
  }
  function initCameraHelper(nuke) {
    let orbitCamera = new PerspectiveCamera(30, Stage.width / Stage.height, 0.1, 1e3);
    orbitCamera.position.z = 6;
    let lastCamera,
      timer0,
      timer1,
      timer2,
      wasdCamera = orbitCamera.clone();
    self.onResize((_) => {
      orbitCamera.aspect = wasdCamera.aspect = Stage.width / Stage.height;
      orbitCamera.updateProjectionMatrix();
      wasdCamera.updateProjectionMatrix();
    });
    let orbit = new DebugControls(orbitCamera, World.ELEMENT.div),
      wasd = new WASDControls(wasdCamera, World.ELEMENT.div);
    orbit.enabled = false;
    wasd.enabled = false;
    self.startRender((_) => {
      orbit.update();
      wasd.update();
    });
    self.orbitControls = orbit;
    self.wasdControls = wasd;
    const clearTimers = (_) => {
        clearTimeout(timer0);
        clearTimeout(timer1);
        clearTimeout(timer2);
      },
      goToOrbit = (_) => {
        orbit.enabled = true;
        wasd.enabled = false;
        nuke.camera != wasdCamera && nuke.camera != orbitCamera && (lastCamera = nuke.camera);
        nuke.camera = orbitCamera;
        AppState.set('playground_camera_active', nuke.camera);
        self.activeControls = orbit;
        clearTimers();
      };
    Utils.query('orbit') &&
      (goToOrbit(),
      (timer0 = self.delayedCall(goToOrbit, 500)),
      (timer1 = self.delayedCall(goToOrbit, 1e3)),
      (timer2 = self.delayedCall(goToOrbit, 3e3)));
    self.events.sub(Keyboard.DOWN, (_) => {
      document.activeElement.tagName.toLowerCase().includes(['textarea', 'input']) ||
        (Keyboard.pressing.includes('!') &&
          ((orbit.enabled = false),
          (wasd.enabled = false),
          lastCamera && (nuke.camera = lastCamera),
          AppState.set('playground_camera_active', false),
          clearTimers()),
        Keyboard.pressing.includes('@') && goToOrbit(),
        Keyboard.pressing.includes('#') &&
          ((wasd.enabled = true),
          (orbit.enabled = false),
          nuke.camera != wasdCamera && nuke.camera != orbitCamera && (lastCamera = nuke.camera),
          (nuke.camera = wasdCamera),
          AppState.set('playground_camera_active', nuke.camera),
          (self.activeControls = wasd),
          clearTimers()));
    });
  }
  !(async function () {
    await UILStorage.ready();
    Global.PLAYGROUND = Utils.query('p');
    AppState.set('Global/playground', Global.PLAYGROUND);
    initXR();
  })();
}, 'singleton');

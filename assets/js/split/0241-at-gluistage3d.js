/*
 * GLUIStage3D — 3D-anchored GLUI scenegraph: equivalent to
 * GLUIStage (0240) but for objects placed in world space rather
 * than screen space.
 *
 * Two-list rendering model:
 *   - `_list` (a LinkedList of every deferred GLUI object) drives
 *     the main per-frame `render()`. Objects are flagged dirty via
 *     `_marked` in `mark()` (called before the World scene render),
 *     then their world transform is composed into `group` via
 *     `Utils3D.decompose(obj.anchor, obj.group)` so the actual
 *     draw uses the up-to-date matrix.
 *   - `_externalRenders` is a one-shot queue: `renderToRT(scene, camera)`
 *     enqueues a foreign scene/camera pair, and the next `render()`
 *     drains it (with `decompose` walked over the scene's `glui`
 *     members) — used by FX scenes that draw the same GLUI tree
 *     into multiple RTs per frame.
 *
 * Render path:
 *   - Skips entirely under `window.Metal` (Metal backend has its
 *     own compositor).
 *   - Clears just the depth buffer (`DEPTH_BUFFER_BIT`) before
 *     each pass so 3D GLUI draws on top of the world scene without
 *     wiping its color.
 *   - Forces `autoClear = false` during draws, restores after.
 *
 * `mark()` — invoked from World.NUKE.onBeforeRender:
 *   - For each list member, syncs `group.visible` from
 *     `anchor.determineVisible()` and flags `_marked` when both
 *     the mesh is visible and an anchor parent exists. Cheap
 *     visibility prune that runs once per frame, off the render
 *     hot path.
 *
 * Public:
 *   - `add(obj, parent)`       — register an object; auto-enables
 *     3D and deferred render. `parent` is recorded on `_gluiParent`
 *     so `getAlpha()` can walk up through batches.
 *   - `addDeferred(obj)`       — internal-ish; pushes onto the
 *     list and the scene. Called from `GLUIObject.deferRender`.
 *   - `remove(obj)`            — scene + list eviction.
 *   - `clear()`                — destroy every owned mesh.
 *   - `disableAutoSort()`      — opt out of Scene's auto Z-sort
 *     when consumers manage `renderOrder` themselves.
 *   - `renderToRT(scene, camera)`  — enqueue external scene/camera
 *     pair for next-frame draw (decompose pass included).
 *   - `renderToRT2(scene, rt, camera)` — direct RT render with
 *     `fxscene.clearAlpha` honoured (mirrors GLUIStage.renderToRT).
 *   - `renderDirect(callback)` — bypass: decompose, disable
 *     depthTest, and hand `(_scene, _camera)` to the caller.
 *   - `set('camera', cam)`     — override World.CAMERA.
 *   - `interaction`            — GLUIStageInteraction3D (0235).
 */
Class(function GLUIStage3D() {
  Inherit(this, Object3D);
  const self = this;
  var _camera,
    _externalRenders = [],
    _scene = new Scene(),
    _list = new LinkedList();
  this.alpha = 1;
  this.interaction = new GLUIStageInteraction3D();
  this.add = function (obj, parent) {
    obj.parent = self;
    obj._gluiParent = parent;
    obj.anchor && (obj.anchor._gluiParent = parent);
    obj._3d || obj.enable3D();
    obj.deferRender();
  };
  this.clear = function () {
    _scene.traverse((obj) => {
      obj.geometry && obj.shader && obj.destroy();
    });
    _scene.children.length = _scene.childrenLength = 0;
  };
  this.addDeferred = function (obj) {
    _list.push(obj);
    _scene.add(obj.group || obj.mesh);
  };
  this.remove = function (obj) {
    _scene.remove(obj.group || obj.mesh);
    _list.remove(obj);
  };
  this.disableAutoSort = function () {
    _scene.disableAutoSort = true;
  };
  this.renderToRT = function (scene, camera) {
    camera = camera.camera || camera;
    scene.traverse((mesh) => {
      let obj = mesh.glui || mesh;
      obj &&
        obj.anchor &&
        obj.anchor.determineVisible() &&
        Utils3D.decompose(obj.anchor, obj.group || obj);
    });
    scene._textRenderCamera = camera;
    _externalRenders.push(scene);
  };
  this.renderToRT2 = function (scene, rt, camera) {
    let clearAlpha;
    rt.fxscene &&
      rt.fxscene.clearAlpha > -1 &&
      ((clearAlpha = World.RENDERER.getClearAlpha()), World.RENDERER.setClearAlpha(0));
    let autoClear = World.RENDERER.autoClear;
    World.RENDERER.autoClear = false;
    World.RENDERER.render(scene, camera, rt);
    World.RENDERER.autoClear = autoClear;
    clearAlpha && World.RENDERER.setClearAlpha(clearAlpha);
  };
  this.render = function loop() {
    if (!window.Metal) {
      if (_list.length) {
        let obj = _list.start();
        for (; obj; ) {
          obj._marked && ((obj._marked = false), Utils3D.decompose(obj.anchor, obj.group));
          obj = _list.next();
        }
        let clear = World.RENDERER.autoClear;
        Renderer.context.clear(Renderer.context.DEPTH_BUFFER_BIT);
        World.RENDERER.autoClear = false;
        World.RENDERER.render(_scene, _camera || World.CAMERA);
        World.RENDERER.autoClear = clear;
      }
      if (_externalRenders.length)
        for (; _externalRenders.length; ) {
          let scene = _externalRenders.shift(),
            camera = scene._textRenderCamera,
            clear = World.RENDERER.autoClear;
          Renderer.context.clear(Renderer.context.DEPTH_BUFFER_BIT);
          World.RENDERER.autoClear = false;
          World.RENDERER.render(scene, camera);
          World.RENDERER.autoClear = clear;
        }
    }
  };
  this.mark = function mark() {
    let obj = _list.start();
    for (; obj; ) {
      obj.anchor._parent && (obj.group.visible = obj.anchor.determineVisible());
      obj.mesh && obj.mesh.determineVisible() && obj.anchor._parent && (obj._marked = true);
      obj = _list.next();
    }
  };
  this.renderDirect = function (callback) {
    if (_list.length) {
      let obj = _list.start();
      for (; obj; ) {
        obj._marked && ((obj._marked = false), Utils3D.decompose(obj.anchor, obj.group));
        obj = _list.next();
      }
      _scene.traverse((obj) => {
        obj.shader && (obj.shader.depthTest = false);
      });
      callback(_scene, _camera || World.CAMERA);
    }
  };
  this.set('camera', (c) => {
    _camera = c.camera || c;
  });
});

/*
 * GLUIStage — the 2D GLUI root: hosts a flat `Scene` and an
 * orthographic camera sized in stage pixels (top-left origin, Y
 * down). Owns the `interaction` router (`GLUIStageInteraction2D`)
 * and exposes `add` / `remove` / `clear` / `render` so consumers
 * can treat it as a tiny scenegraph.
 *
 * Camera setup (`resizeHandler`):
 *   - Orthographic frustum from `-Stage.width/2 … +Stage.width/2`
 *     horizontally and `-Stage.height/2 … +Stage.height/2`
 *     vertically.
 *   - Near / far = 0.01 / 1000.
 *   - Camera positioned at (Stage.width/2, -Stage.height/2, 1) so
 *     (0, 0) in stage coords lands at the top-left corner of the
 *     viewport — matches GLUIObject's "Y grows down" convention.
 *   - Re-runs on the `Events.RESIZE` global.
 *
 * Render:
 *   - `render()` skips the draw if the scene is empty.
 *   - Forces `World.RENDERER.autoClear = false` during the draw
 *     so the UI overlays the previously rendered scene rather than
 *     wiping it; restores autoClear afterwards.
 *   - `World.RENDERER.render(_scene, _camera, null, true)` — last
 *     arg forces a manual clear of *just* the alpha channel.
 *
 * `renderToRT(scene, rt)`:
 *   - Used when a GLUI surface needs to be captured into an RT
 *     instead of the default backbuffer (e.g. nested FX scenes).
 *   - Honours `rt.fxscene.clearAlpha` overrides by temporarily
 *     setting the renderer's clear alpha to 0 and restoring after.
 *
 * `renderDirect(callback)`:
 *   - Bypass for engines that want to drive the render manually
 *     (e.g. inside Aura/AR or external compositors). First
 *     traverses the scene to disable depthTest on every shader
 *     (UI is overlay-only), then hands `(_scene, _camera)` to the
 *     caller.
 *
 * `clear()`:
 *   - Traverses the scene destroying every mesh that has both
 *     `geometry` and `shader`, then resets the children arrays
 *     (also clears `childrenLength`, a cached count used by the
 *     custom Scene impl).
 *
 * `disableAutoSort = true` — the GLUI tree owns its own ordering
 * via `mesh.renderOrder`, so the Scene's built-in sort is bypassed.
 *
 * Getters:
 *   - `camera` — the orthographic camera (for external interaction
 *     wiring).
 */
Class(function GLUIStage() {
  Inherit(this, Component);
  const self = this;
  var _scene = new Scene(),
    _camera = new OrthographicCamera(1, 1, 1, 1, 0.1, 1);
  function resizeHandler() {
    _camera.left = Stage.width / -2;
    _camera.right = Stage.width / 2;
    _camera.top = Stage.height / 2;
    _camera.bottom = Stage.height / -2;
    _camera.near = 0.01;
    _camera.far = 1e3;
    _camera.updateProjectionMatrix();
    _camera.position.x = Stage.width / 2;
    _camera.position.y = -Stage.height / 2;
  }
  this.interaction = new GLUIStageInteraction2D(_camera, _scene, Stage);
  this.alpha = 1;
  this.scene = _scene;
  _scene.disableAutoSort = true;
  _camera.position.z = 1;
  (function addListeners() {
    self.events.sub(Events.RESIZE, resizeHandler);
  })();
  resizeHandler();
  this.add = function ($obj) {
    $obj.parent = self;
    _scene.add($obj.group || $obj.mesh);
  };
  this.remove = function ($obj) {
    $obj.parent = null;
    _scene.remove($obj.group);
  };
  this.clear = function () {
    _scene.traverse((obj) => {
      obj.geometry && obj.shader && obj.destroy();
    });
    _scene.children.length = _scene.childrenLength = 0;
  };
  this.renderToRT = function (scene, rt) {
    let clearAlpha;
    rt &&
      rt.fxscene &&
      rt.fxscene.clearAlpha > -1 &&
      ((clearAlpha = World.RENDERER.getClearAlpha()), World.RENDERER.setClearAlpha(0));
    let autoClear = World.RENDERER.autoClear;
    World.RENDERER.autoClear = false;
    World.RENDERER.render(scene, _camera, rt);
    World.RENDERER.autoClear = autoClear;
    clearAlpha && World.RENDERER.setClearAlpha(clearAlpha);
  };
  this.get('camera', () => _camera);
  this.resize = resizeHandler;
  this.render = function loop() {
    if (!_scene.children.length) return;
    let clear = World.RENDERER.autoClear;
    World.RENDERER.autoClear = false;
    World.RENDERER.render(_scene, _camera, null, true);
    World.RENDERER.autoClear = clear;
  };
  this.renderDirect = (callback) => {
    _scene.children.length &&
      (_scene.traverse((obj) => {
        obj.shader && (obj.shader.depthTest = false);
      }),
      callback(_scene, _camera));
  };
});

/*
 * RenderManagerRenderer — facade that hides the choice between
 * "render through Nuke" (postfx pipeline) and "render directly via
 * the underlying renderer" behind a single `render(scene, camera,
 * _, _, directRender)` call.
 *
 *   - `_renderer` is the WebGL renderer (used when there's no Nuke,
 *     or for the `directRender` bypass).
 *   - `_nuke` is the Nuke postprocessing pipeline. When present, its
 *     `render()` is called instead. The renderer also forwards the
 *     current camera onto `_nuke.camera` each call so Nuke's passes
 *     see the correct view matrix.
 *
 * Per-frame hook: `_nuke.onBeforeProcess` fires `RenderManager.RENDER`
 * with `{stage, camera}` so every consumer that needs to do work
 * just before the postfx pass runs (uniforms, RT updates) can listen
 * on a single channel. The `_evt` object is reused (no per-frame
 * allocation).
 *
 * `setSize(w, h)` forwards to the underlying renderer for canvas
 * resize.
 */
Class(function RenderManagerRenderer(_renderer, _nuke) {
  Inherit(this, Component);
  const self = this;
  var _evt = {};
  _nuke.onBeforeProcess = (_) => {
    _evt.stage = Stage;
    _evt.camera = _nuke.camera;
    self.events.fire(RenderManager.RENDER, _evt);
  };
  this.render = function (scene, camera, _1, _2, directRender) {
    _nuke.camera = camera;
    _nuke ? _nuke.render(directRender) : _renderer.render(scene, camera, null, null, directRender);
  };
  this.setSize = function (width, height) {
    _renderer.setSize(width, height);
  };
});

/*
 * MouseFluid — global singleton that runs a 2D Eulerian fluid
 * simulation driven by the mouse cursor. The result is exposed as
 * texture uniforms (`tFluid` = velocity field, `tFluidMask` = fluid
 * RT) that other shaders sample to add swirly mouse-trail effects.
 *
 * Drive (per frame `loop`):
 *   - `_scale` smoothly chases `self.scale` (framerate-normalised
 *     lerp at 0.05) — gives a gentle ease when the consumer changes
 *     the input intensity.
 *   - Position source defaults to the global `Mouse` reading;
 *     `useCustomMouse()` lets a consumer write directly to
 *     `self.mouse` (Vector2) for synthetic drives.
 *   - Computes the cursor delta length; when it exceeds 0.01,
 *     injects velocity into the fluid via `drawInput(x, y, vx*delta,
 *     vy*delta, color, size)`. With `scaleBasedOnVelocity` on, the
 *     splat radius scales from 0..60 px based on speed (then ×0.6
 *     to taste); otherwise constant 25 px.
 *
 * Bootstrap (async):
 *   - Loads the "mousefluid" SceneLayout and grabs its `fluid`
 *     layer (the actual fluid simulation lives in that layer's
 *     class — this file is just the input adapter).
 *   - Wires a UIL "MouseFluid Config" with one `scale` knob.
 *   - In playground mode (`isPlayground()`), forces the fluid mesh
 *     visible so you can see the simulation directly.
 *   - Registers `loop` on `RenderManager.AFTER_LOOPS` so the input
 *     splat runs after world updates but before the rendering pass
 *     that consumes the fluid texture.
 *
 * `applyTo(shader)` is the consumer hook: waits for the fluid
 * layer, then sets `tFluid` (velocity uniform) and `tFluidMask` (the
 * fluid object itself, used by some shaders for further sampling).
 *
 * Declared `'singleton'` — one global fluid sim shared across the
 * scene; multiple consumers attach via `applyTo`.
 */
Class(function MouseFluid(
  _params = {
    active: true,
  },
) {
  Inherit(this, Object3D);
  const self = this;
  var _config, _fluid, _custom;
  this.scale = 1;
  var _scale = 1,
    _last = new Vector2(),
    _mouse = new Vector2(),
    _white = new Color('#ffffff');
  function loop() {
    _scale += (self.scale - _scale) * Math.framerateNormalizeLerpAlpha(0.05);
    _custom || _mouse.copy(Mouse);
    let len = _mouse.distanceTo(_last),
      size = self.scaleBasedOnVelocity ? Math.range(len, 0, 5, 0, 60, true) : 25;
    size *= 0.6;
    let delta = Math.range(len, 0, 15, 0, 10, true);
    len > 0.01 &&
      _fluid.drawInput(
        _mouse.x,
        _mouse.y,
        (_mouse.x - _last.x) * delta,
        (_mouse.y - _last.y) * delta,
        _white,
        size * _scale,
      );
    _last.copy(_mouse);
  }
  this.scaleBasedOnVelocity = true;
  (async function () {
    let layout = self.initClass(SceneLayout, 'mousefluid');
    _fluid = await layout.getLayer('fluid');
    (function initConfig() {
      (_config = InputUIL.create(_fluid.uilInput.prefix + 'mousefluid', _fluid.uilGroup)).setLabel(
        'MouseFluid Config',
      );
      _config.add('scale', 1);
      _config.onUpdate = (key) => {
        if ('scale' === key) self.scale = _config.getNumber('scale');
      };
      _config.onUpdate();
    })();
    self.isPlayground() && _fluid.initMesh();
    self.fluid = _fluid;
    _params.active ? self.startRender(loop, RenderManager.AFTER_LOOPS) : (_fluid.visible = false);
  })();
  this.applyTo = async function (shader) {
    await self.wait('fluid');
    shader.uniforms.tFluid = _fluid.fbos.velocity.uniform;
    shader.uniforms.tFluidMask = {
      value: _fluid,
    };
  };
  this.useCustomMouse = function () {
    _custom = true;
  };
  this.getFluid = async function () {
    return (await self.wait('fluid'), self.fluid);
  };
  this.get('mouse', (_) => _mouse);
}, 'singleton');

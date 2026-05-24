/*
 * FluidFBO — pingpong pair of RGBA float (or half-float on
 * mobile/WebGL2) render-targets used as a single read/write surface
 * by the fluid simulation.
 *
 * Why pingpong: each fluid step reads from one buffer and writes the
 * updated values into the other; the two RTs swap roles via
 * `swap()`. `this.uniform.value` is a stable reference into the
 * "current read" RT so callers that bind it as a sampler don't have
 * to re-bind after a swap.
 *
 * Format choice:
 *   - WebGL2 / mobile → `Texture.HALF_FLOAT` (16-bit float)
 *   - WebGL1 desktop  → `Texture.FLOAT` (32-bit float) — accurate
 *                        but expensive and unsupported on iOS.
 *
 * `disableDepth = true` — fluid passes never need depth.
 * `generateMipmaps = false` — chains of fluid passes don't sample
 *   mip levels, and avoiding mipmap generation per swap is much
 *   faster.
 *
 * `read` / `write` getters expose the underlying RTs by their current
 * role (i.e. respect the latest `swap()` ordering).
 */
Class(function FluidFBO(_width, _height, _filter) {
  Inherit(this, Component);
  const self = this;
  const type =
    Device.mobile || Renderer.type != Renderer.WEBGL1 ? Texture.HALF_FLOAT : Texture.FLOAT;
  let _fbo1 = new RenderTarget(_width, _height, {
    minFilter: _filter,
    magFilter: _filter,
    format: Texture.RGBAFormat,
    type: type,
  });
  let _fbo2 = new RenderTarget(_width, _height, {
    minFilter: _filter,
    magFilter: _filter,
    format: Texture.RGBAFormat,
    type: type,
  });

  this.fbo = _fbo1;
  this.uniform = { value: _fbo1 };
  _fbo1.disableDepth = true;
  _fbo2.disableDepth = true;
  _fbo1.generateMipmaps = false;
  _fbo2.generateMipmaps = false;

  this.swap = function () {
    const temp = _fbo1;
    _fbo1 = _fbo2;
    _fbo2 = temp;
    self.uniform.value = _fbo1;
  };

  this.get('read', () => _fbo1);
  this.get('write', () => _fbo2);
});

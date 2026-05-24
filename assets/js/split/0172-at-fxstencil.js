/*
 * FXStencil — stencil-buffer masking component.
 *
 * Renders `self.mask` first as a stencil write (setupStencilMask),
 * then renders `self.scene` with the stencil test enabled
 * (setupStencilDraw) so its pixels appear only inside / outside the
 * mask depending on `self.mode` (`'inside'` is the default).
 *
 * Mechanics:
 *   - Hangs an invisible (`neverRender = true`) plane mesh inside the
 *     parent scene at `renderOrder = 99999` so its
 *     `onBeforeRender = render` callback fires after the main scene is
 *     mostly painted.
 *   - Walks the parent chain to find the enclosing `Scene`'s
 *     `.nuke` — the post-process pipeline whose camera will be used
 *     for the mask/scene passes.
 *   - Temporarily forces `autoClear = false` around the mask + scene
 *     renders so the existing colour buffer is preserved, then clears
 *     just the stencil channel on exit.
 *
 * Optional hooks `onBeforeMaskRendered` / `onAfterMaskRendered` let
 * callers e.g. swap shaders for the mask pass.
 */
Class(function FXStencil() {
  Inherit(this, Component);
  const self = this;
  let _nuke;

  function findNuke() {
    let p = self.mesh._parent;
    while (p) {
      if (p instanceof Scene) return p.nuke;
      p = p._parent;
    }
  }

  function render() {
    if (!_nuke) _nuke = findNuke();

    const autoClear = World.RENDERER.autoClear;
    World.RENDERER.autoClear = false;

    if (self.enabled) {
      self.onBeforeMaskRendered && self.onBeforeMaskRendered();
      World.RENDERER.setupStencilMask();
      World.RENDERER.render(self.mask, _nuke.camera, 'stencil');
      self.onAfterMaskRendered && self.onAfterMaskRendered();
      World.RENDERER.setupStencilDraw(self.mode);
    }

    World.RENDERER.render(self.scene, _nuke.camera, 'stencil');
    World.RENDERER.autoClear = autoClear;
    World.RENDERER.clearStencil();
  }

  this.mesh = new Mesh(World.PLANE, Utils3D.getTestShader());
  this.scene = new Scene();
  this.mask = new Scene();
  this.mode = 'inside';
  this.enabled = true;

  self.mesh.shader.neverRender = true;
  self.mesh.shader.transparent = true;
  self.mesh.renderOrder = 99999;
  self.mesh.onBeforeRender = render;

  this.onDestroy = function () {
    self.group._parent.remove(self.mesh);
  };
});

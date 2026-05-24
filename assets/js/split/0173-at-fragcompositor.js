/*
 * FragCompositor — convenience mix-in for components that want to
 * expose a "single shader, single fullscreen pass" transition surface.
 *
 * `_initCompositor(obj)` builds:
 *   - `self.shader`      : the transition shader (`obj.shader`), with
 *                          its uniforms pulled from the parent at
 *                          `self.parent[obj.uniforms.slice(1)]` — the
 *                          `.slice(1)` strips a leading sigil
 *                          (typically `_`) from the key name.
 *   - `self.basicShader` : the steady-state shader (`obj.basicShader`
 *                          or the default `'ScreenQuad'`) sharing the
 *                          same uniform set.
 *   - `self.compositor`  : an FXSceneCompositor wrapping both, which
 *                          handles auto-swapping and the
 *                          uTransition tween.
 *
 * In `RenderManager.NORMAL` mode the compositor's fullscreen quad is
 * attached to either an explicit scene `obj.scene` or `World.SCENE` so
 * it appears in the main render path. In non-normal (VR / RTT-only)
 * pipelines the host is expected to plug `self.compositor.mesh` in
 * manually.
 */
Class(function FragCompositor() {
  Inherit(this, Component);
  const self = this;

  this._initCompositor = function (obj) {
    self.shader = self.initClass(Shader, obj.shader, self.parent[obj.uniforms.slice(1)]);
    self.basicShader = self.initClass(
      Shader,
      obj.basicShader || 'ScreenQuad',
      self.parent[obj.uniforms.slice(1)],
    );
    self.compositor = self.initClass(FXSceneCompositor, self.shader, {
      basicShader: self.basicShader,
    });
    if (RenderManager.type == RenderManager.NORMAL) {
      (obj.scene || World.SCENE).add(self.compositor.mesh);
    }
  };
});

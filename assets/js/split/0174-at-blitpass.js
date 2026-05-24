/*
 * BlitPass — the trivial NukePass: a passthrough that just copies the
 * input texture to the output. Used as `Nuke.defaultPass` when the
 * pipeline has no enabled passes but still needs *something* (e.g.
 * because `_dpr` differs from the device pixel ratio, or MSAA is on
 * and a resolve is required).
 *
 * `_forceNuke` — when truthy, the pass is created in "use the shader"
 * mode (the standard NukePass code path). When falsy (the default),
 * `blitFramebuffer = true` makes the renderer perform a direct GPU
 * framebuffer blit (faster, no fragment shader invocation, but loses
 * any per-pixel transformation).
 */
Class(function BlitPass(_forceNuke) {
  Inherit(this, NukePass);
  this.uniforms = {};
  this.init('BlitPass');
  if (!_forceNuke) this.blitFramebuffer = true;
});

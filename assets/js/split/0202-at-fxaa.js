/*
 * FXAA — NukePass that runs the FXAA (Fast Approximate Anti-
 * Aliasing) postprocess fragment shader against the input texture.
 *
 * FXAA is a single-pass screen-space AA technique that detects edges
 * by luma differences between neighbours and blurs across them. It's
 * cheap (one extra fragment-shader pass), runs entirely in colour
 * space, and works even on a 1× framebuffer — useful on platforms
 * where MSAA is unavailable or too expensive (mobile, WebGL1).
 *
 * `tMask`:
 *   Optional grayscale texture used by the shader to gate where FXAA
 *   should run. White = full AA, black = pass through unmodified.
 *   Useful for skipping AA on regions like UI text where it would
 *   harm crispness.
 *
 * Init uses `'FXAA'` for both vertex and fragment shader names so the
 * Shader system loads a matched `FXAA.vs` / `FXAA.fs` pair.
 */
Class(function FXAA() {
  Inherit(this, NukePass);
  this.uniforms = {
    tMask: { value: null },
  };
  this.init('FXAA', 'FXAA');
  this.setMask = function (texture) {
    this.uniforms.tMask.value = texture;
  };
});

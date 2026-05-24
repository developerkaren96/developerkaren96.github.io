/*
 * FluidScene — single-pass fullscreen-quad scene used as a building
 * block by the Fluid simulator (0198).
 *
 * Each fluid step (curl, vorticity, divergence, pressure-jacobi,
 * gradient-subtract, advection, …) gets its own FluidScene wrapping
 * a (vs, fs, uniforms) trio. The fluid loop sets the relevant
 * uniforms and calls `render(rt)` to write into the target FBO.
 *
 * Render is single-mesh:
 *   - Builds a Mesh(World.QUAD, shader) once at construct time.
 *   - `noMatrices = true` — no transform math; the quad fills NDC.
 *   - `depthWrite = false` — fluid passes don't need depth.
 *   - `render(rt)` temporarily disables `autoClear` so callers that
 *     ping-pong into the same buffer don't clobber state, then
 *     restores it.
 *
 * `self.uniforms` is exposed so the fluid loop can poke values
 * between renders without re-creating the shader.
 */
Class(function FluidScene(_vs, _fs, _uniforms) {
  Inherit(this, Component);
  const self = this;
  const _scene = new Scene();

  (function () {
    _uniforms.depthWrite = false;
    const shader = self.initClass(Shader, _vs, _fs, _uniforms);
    const mesh = new Mesh(World.QUAD, shader);
    shader.depthWrite = false;
    mesh.noMatrices = true;
    _scene.add(mesh);
    self.uniforms = shader.uniforms;
  })();

  this.render = function (rt) {
    World.RENDERER.autoClear = false;
    World.RENDERER.renderSingle(_scene.children[0], World.CAMERA, rt);
    World.RENDERER.autoClear = true;
  };
});

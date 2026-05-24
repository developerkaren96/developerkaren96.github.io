/*
 * AntimatterFBO — ping-pong RT manager that runs each AntimatterPass on
 * the previous pass's output and exposes the final composite as `tPos`
 * to the particle mesh's vertex shader. Mixed into Antimatter (see
 * 0061) via `Inherit(this, AntimatterFBO)` so its API lands on the
 * particle system instance.
 *
 * RT topology:
 *   Each pass owns three RTs (`_rts[0..2]`) used in a rotating
 *   read/write swap (see AntimatterPass.swap). We additionally maintain:
 *     `_output`     current "final" texture passed into the mesh as tPos.
 *     `_prevOutput` previous-frame final, exposed as tPrevPos for
 *                   motion-blur / velocity-feedback shaders. Only
 *                   maintained when `storeVelocity` is set.
 *     `_prevRT`     scratch RT (clone of pass-0's RT) that holds the
 *                   previous-frame output via a `copy()` blit each tick.
 *
 * Pass dispatch (`update`):
 *   Skipped while `preventRender` is true (e.g. during async upload).
 *   For each pass:
 *     1. Initialize on first run (constructs internal RTs once we know
 *        the texture size).
 *     2. Hook `tInput` to either the previous pass's output (chain) or
 *        the canonical vertices texture (first pass / not-yet-ready).
 *     3. Render the pass into its current RT.
 *     4. `copy()` the rendered RT into the pass's `output` field so
 *        downstream consumers can sample it without worrying about
 *        which slot is "current".
 *     5. Swap read/write pointers.
 *   At the end, propagate `_output.value` / `_prevOutput.value` /
 *   `uDPR` onto the mesh's shader. The dpr lookup goes through the
 *   parent Nuke (set up in Antimatter.createShader).
 *
 * `copy(input, output)`:
 *   Fast path is `WebGLRenderer.blit` (a direct framebuffer copy).
 *   Falls back to a fullscreen quad pass rendering the input texture
 *   into the output RT — used when the renderer can't blit (older
 *   drivers, conflicting RT formats). The `_copy` mesh is normally
 *   invisible; we toggle it on/off around the render so the regular
 *   scene `_mesh` isn't drawn in its place.
 *
 * Static `getCopyShader()`:
 *   Lazy-initialize a ScreenQuad shader configured for RGBA-float
 *   attachments. Cached across all AntimatterFBO instances since it's
 *   read-only.
 *
 * Pass management:
 *   `addPass(pass, index)`     append or insert.
 *   `findPass(name)`           lookup by `pass.name`.
 *   `removePass(pass)`         remove by ref or trim by index.
 *
 * Cleanup:
 *   Tears down vertices/attribs/passes/mesh on destroy. Passes are
 *   skipped if `persistPasses` is set — useful when the same pass
 *   instance is shared across multiple FBO consumers.
 */
Class(function AntimatterFBO() {
  let self, _gpuGeom, _renderer, _size, _prevRT, _scene, _mesh, _camera, _copy, _geometry;
  Inherit(this, Component);

  // Output uniforms (live values; we mutate `.value` each tick so any
  // shader sampling them sees the current frame).
  const _output     = { type: 't', value: null, ignoreUIL: true };
  const _prevOutput = { type: 't', value: null, ignoreUIL: true };

  /*
   * Texture → texture copy. Prefer the renderer's native blit (a direct
   * framebuffer copy). Falls back to a quad pass: temporarily hide the
   * scene mesh, render the `_copy` mesh into the output RT, restore.
   */
  function copy(input, output) {
    if (World.RENDERER.blit(input, output)) return;
    _copy.visible = true;
    _mesh.visible = false;
    _copy.shader.uniforms.tMap.value = input;
    _renderer.renderSingle(_copy, _camera, output);
    _copy.visible = false;
    _mesh.visible = true;
  }

  this.passes = [];

  // Antimatter calls this after the worker has built geometry; sets up
  // the shared scene/camera/mesh state used by the per-pass dispatch.
  this.init = function (geometry, renderer, size) {
    self = this;
    _gpuGeom  = geometry.attributes.position.array;
    _renderer = renderer;
    _size     = size;
    (function initPasses() {
      _camera   = World.CAMERA;
      _geometry = World.QUAD;
      _scene    = new Scene();

      _mesh = new Mesh(_geometry, null);
      _mesh.frustumCulled = false;
      _mesh.noMatrices    = true;
      _mesh.transient     = true;
      _scene.add(_mesh);

      const copyShader = AntimatterFBO.getCopyShader();
      _copy = new Mesh(_geometry, copyShader);
      _copy.noMatrices = true;
      _scene.add(_copy);
      _copy.visible = false;
    })();
  };

  this.getGPUGeom = function () { return _gpuGeom; };

  this.addPass = function (pass, index) {
    self = this;
    if (!pass.init) pass.initialize(_size);
    if ('number' != typeof index) self.passes.push(pass);
    else                          self.passes.splice(index, 0, pass);
  };

  this.findPass = function (name) {
    self = this;
    for (let i = 0; i < self.passes.length; i++) {
      const pass = self.passes[i];
      if (pass.name == name) return pass;
    }
  };

  this.removePass = function (pass) {
    self = this;
    if ('number' == typeof pass) self.passes.splice(pass);
    else                         self.passes.remove(pass);
  };

  /*
   * Per-frame pass dispatch. Chains each pass's output into the next
   * pass's tInput, copies the latest RT into the pass's external
   * `output` field, then propagates tPos/tPrevPos/uDPR onto the mesh
   * shader. `storeVelocity` enables the motion-blur path that mirrors
   * the previous frame's output into `_prevRT`.
   */
  this.update = function () {
    self = this;
    if (!self.mesh || self.preventRender) return;

    let output = _output.value || self.vertices.texture;

    if (self.storeVelocity) {
      if (_prevRT) {
        copy(_output.value, _prevRT);
        _prevOutput.value = _prevRT;
      } else {
        _prevOutput.value = output;
        _prevRT = self.passes[0].getRT(0).clone();
        _prevRT.upload();
      }
    }

    for (let i = 0; i < self.passes.length; i++) {
      const pass = self.passes[i];
      const needsInit   = !pass.init;
      const firstRender = !pass.first;
      if (needsInit) pass.initialize(_size);
      pass.first = true;

      _mesh.shader = pass.shader;
      _mesh.shader.uniforms.tInput.value = firstRender ? self.vertices.texture : pass.output;
      // Until pass.ready, keep tInput pointed at the canonical vertices
      // texture so we don't sample from uninitialized RTs.
      if (!pass.ready) _mesh.shader.uniforms.tInput.value = self.vertices.texture;

      const rt = firstRender ? pass.getRT(0) : pass.getWrite();
      output = pass.output;
      _renderer.renderSingle(_scene.children[0], _camera, rt);
      copy(rt, output);
      pass.swap();
    }

    if (output) {
      _output.value = output;
      self.mesh.shader.uniforms.tPos.value     = _output.value;
      self.mesh.shader.uniforms.tPrevPos.value = _prevOutput.value;
      self.mesh.shader.uniforms.uDPR.value     = self.mesh?.shader?._parentnuke?.dpr || 1;
    }
  };

  this.onDestroy = function () {
    if (self.vertices && self.vertices.destroy) self.vertices.destroy();
    if (self.attribs  && self.attribs.destroy)  self.attribs.destroy();
    self.passes.forEach(function (pass) {
      pass.first = false;
      if (!self.persistPasses && pass && pass.destroy) pass.destroy();
    });
    self.mesh.destroy();
  };

  this.getOutput     = function () { return _output; };
  this.getPrevOutput = function () { return _prevOutput; };
}, function () {
  // Static: lazy-build the shared copy shader. RGBA-float attachments
  // match the particle data textures we're shuffling around.
  let _shader;
  AntimatterFBO.getCopyShader = function () {
    if (_shader) return _shader;
    _shader = new Shader('ScreenQuad');
    _shader.addUniforms({ tMap: { type: 't', value: null } });
    _shader._attachmentData = {
      format: Texture.RGBAFormat,
      type: Texture.FLOAT,
      attachments: 1,
    };
    return _shader;
  };
});

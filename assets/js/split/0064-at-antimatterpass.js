/*
 * AntimatterPass — one stage in the particle FBO pipeline. Wraps a
 * fragment shader (the simulation kernel) plus three ping-pong
 * render-targets the FBO driver rotates through.
 *
 * Construction args:
 *   `_shader`  shader name (string) or pre-built Shader instance. The
 *              shader is lazily instantiated in `initialize()` so
 *              callers can configure UIL-bound uniforms first.
 *   `_uni`     uniform overrides. Two reserved keys are stripped before
 *              being treated as uniforms:
 *                `unique`         appended to UILPrefix so multiple
 *                                 instances of the same shader don't
 *                                 collide in the live-edit panel.
 *                `customCompile`  raw GLSL macro prepended to the
 *                                 source by the shader preprocessor.
 *   `_clone`   reserved (used by `.clone()`).
 *
 * RTs:
 *   `_rts[0..2]` rotate via `swap()`. `_read` and `_write` both run 0→2
 *   then wrap; once `_write` wraps the first time, `ready=true` (the
 *   pass has had at least one render into each slot). The `_read`
 *   wrap fires `onInit` exactly once — used by AntimatterSpawn (see
 *   0065) to flip its uSetup uniform after warm-up.
 *
 *   RT format: half-float on iOS+WebGL1 (Apple doesn't expose full
 *   float there), full float everywhere else. NEAREST filtering and
 *   no mipmaps because every texel is data, not visual.
 *
 * Shader preprocessing (`prepareShader`):
 *   The pass shader is authored as plain GLSL with `void main()` etc.
 *   Before `void main()` we splice in:
 *     • sampler2D tInput;  (previous-frame data)
 *     • float fSize;       (texture side length)
 *     • varying vec2 vUv;  (texel coord)
 *     • Shaders.getShader('antimatter.glsl')  helper library
 *   so individual pass authors don't have to repeat them. The hook
 *   `onCreateShader` lets pass subclasses post-process the final source.
 *
 * Inputs (`addInput`):
 *   Convert various input types into a uniform of type `t` (texture):
 *     • AntimatterAttribute → its texture
 *     • AntimatterPass      → its output RT
 *     • DataTexture/etc      → used as-is
 *     • already-a-uniform   → passed through
 *   `UILStorage.parse(prefix+name)` lets the live-edit panel restore a
 *   previously-saved texture override. ignoreUIL=true keeps inputs out
 *   of the UIL save set (textures aren't meaningfully serializable).
 *
 * Uniforms (`addUniforms`):
 *   Generic uniform attach with UIL hydration. Array-shaped UIL values
 *   are coerced into VectorN based on length (2/3/4). Then mounted on
 *   whichever uniforms map is active (the inflated shader's, if it
 *   exists; the local _uniforms otherwise).
 *
 * Live mutation:
 *   `setUniform(key, value)` is the imperative path (creates the slot
 *   if missing). `getUniform(key)` returns the value or null.
 *   `tween(key, value, time, ease, delay, …)` runs a MathTween on
 *   `uniforms[key].value` — convenient for animating fSize, decay etc.
 *
 * `initialize(size)`:
 *   One-shot. Allocates the three RTs at the runtime-known particle
 *   texture size. If the shader was passed as a string, inflate it now
 *   with the merged uniforms and the AntimatterPass-specific preCompile
 *   hook. `fSize` uniform is set to the texture size so kernels can
 *   compute neighbor offsets in normalized UV space.
 *
 * `upload`:
 *   Compile the shader, then upload each RT and each uniform value in
 *   series with `defer()` between steps — same staggered preload as
 *   Antimatter's main upload path.
 */
Class(function AntimatterPass(_shader, _uni, _clone) {
  const self = this;
  this.UILPrefix = 'am_' + _shader;

  // Standard inputs every pass shader expects. Both are stamped
  // ignoreUIL so they don't pollute the live-edit save set.
  const _uniforms = {
    tInput: { type: 't', value: null, ignoreUIL: true },
    fSize:  { type: 'f', value: 64,   ignoreUIL: true },
  };

  const _rts = [];
  let _read = 0;
  let _write = 0;

  /*
   * Splice the pass-author standard preamble before `void main()` and
   * let pass subclasses run a final string mutation. Vertex stage is
   * untouched (we ship the default vertex shader).
   */
  function prepareShader(code, type) {
    if ('vs' == type) return code;
    const header = [
      'uniform sampler2D tInput;',
      'uniform float fSize;',
      'varying vec2 vUv;',
      Shaders.getShader('antimatter.glsl'),
    ].join('\n');
    const mainAt = code.indexOf('void main()');
    const before = code.slice(0, mainAt);
    const after  = code.slice(mainAt);
    code = before + header + after;
    if (self.onCreateShader) code = self.onCreateShader(code);
    return code;
  }

  /*
   * Build a data-friendly RenderTarget: NEAREST filtering, RGBA float
   * (or half-float on iOS+WebGL1), no mipmaps.
   */
  function initRT(size) {
    const type =
      'ios' == Device.system.os && Renderer.type == Render.WEBGL1
        ? Texture.HALF_FLOAT
        : Texture.FLOAT;
    const parameters = {
      minFilter: Texture.NEAREST,
      magFilter: Texture.NEAREST,
      format:    Texture.RGBAFormat,
      type,
    };
    const rt = new RenderTarget(size, size, parameters);
    rt.texture.generateMipmaps = false;
    return rt;
  }

  this.uniforms = _uniforms;
  this.output   = initRT(64);            // placeholder; resized in initialize().
  this.name     = _shader;
  this.id       = Utils.timestamp();
  this.ready    = false;

  // Strip reserved keys (unique, customCompile) and copy remaining
  // uniform definitions in.
  (function () {
    if (!_uni) return;
    if (_uni.unique) {
      self.UILPrefix += '_' + _uni.unique.replace('/', '_');
      delete _uni.unique;
    }
    if (_uni.customCompile) {
      self.customCompile = _uni.customCompile || '';
      delete _uni.customCompile;
    }
    for (const key in _uni) _uniforms[key] = _uni[key];
  })();

  /*
   * Attach a texture-shaped input. Dispatches on the source type. UIL
   * hydration replaces the value when a saved override exists.
   */
  this.addInput = function (name, attribute) {
    let uniform;
    if ('object' != typeof attribute || attribute.height || 'string' != typeof attribute.type) {
      if (attribute instanceof AntimatterAttribute) {
        uniform = { type: 't', value: attribute.texture, ignoreUIL: true };
      } else if (attribute instanceof AntimatterPass) {
        uniform = { type: 't', value: attribute.output, ignoreUIL: true };
      } else {
        uniform = { type: 't', value: attribute, ignoreUIL: true };
      }
    } else {
      uniform = attribute;
    }
    const lookup = UILStorage.parse(self.UILPrefix + name);
    if (lookup) uniform.value = lookup.value;
    const uniforms = (_shader && _shader.uniforms) ? _shader.uniforms : _uniforms;
    uniforms[name] = uniform;
    uniform.ignoreUIL = true;
    return uniforms[name];
  };

  /*
   * Bulk uniform attach with UIL hydration. Array-shaped values are
   * coerced to the appropriate VectorN based on length.
   */
  this.addUniforms = function (object) {
    const uniforms = (_shader && _shader.uniforms) ? _shader.uniforms : _uniforms;
    for (const key in object) {
      const uniform = object[key];
      const lookup  = UILStorage.parse(self.UILPrefix + key);
      if (lookup) {
        if (Array.isArray(lookup.value)) {
          switch (lookup.value.length) {
            case 2: lookup.value = new Vector2().fromArray(lookup.value); break;
            case 3: lookup.value = new Vector3().fromArray(lookup.value); break;
            case 4: lookup.value = new Vector4().fromArray(lookup.value); break;
          }
        }
        uniform.value = lookup.value;
      }
      uniforms[key] = uniform;
    }
  };

  this.getRT    = function (index) { return _rts[index]; };
  this.getRead  = function ()      { return _rts[_read];  };
  this.getWrite = function ()      { return _rts[_write]; };
  this.setRead  = function (index) { _read  = index; };
  this.setWrite = function (index) { _write = index; };

  /*
   * Advance the rotating read/write pointers. The first time _write
   * wraps past 2 the pass has fully populated all three RTs (ready=true).
   * The first time _read wraps past 2 we fire onInit (one-shot warm-up
   * callback, e.g. spawn's uSetup→0 flip).
   */
  this.swap = function () {
    if (++_write > 2) { _write = 0; self.ready = true; }
    if (++_read  > 2) {
      if (self.onInit) { self.onInit(); self.onInit = null; }
      _read = 0;
    }
  };

  /*
   * Allocate RTs at the runtime particle texture size, inflate the
   * string-form shader if needed. Idempotent via the `init` flag.
   */
  this.initialize = function (size) {
    if (self.init) return;
    self.init = true;

    for (let i = 0; i < 3; i++) _rts.push(initRT(size));
    self.output.setSize(size, size);

    if (!(_shader instanceof Shader)) {
      _shader = new Shader('AntimatterPass', _shader, { customCompile: self.customCompile });
      _shader._attachmentData = {
        format: Texture.RGBAFormat,
        type:   Texture.FLOAT,
        attachments: 1,
      };
      _shader.preCompile = prepareShader;
      _shader.addUniforms(_uniforms);
      self.uniforms = _shader.uniforms;
      _shader.UILPrefix = self.UILPrefix;
      _shader.id = Utils.timestamp();
    }

    self.shader = _shader;
    _shader.uniforms.fSize.value = size;
  };

  // Imperative single-uniform writers. Mirrors writes onto the inflated
  // shader so the GPU sees the new value next draw.
  this.setUniform = function (key, value) {
    if (!_uniforms[key]) _uniforms[key] = { value };
    _uniforms[key].value = value;
    if (_shader && _shader.uniforms) _shader.uniforms[key].value = value;
  };
  this.getUniform = function (key) {
    return (_shader && _shader.uniforms) ? _shader.uniforms[key].value : null;
  };

  // Animate a uniform's .value via the global tween system.
  this.tween = function (key, value, time, ease, delay, callback, update) {
    return tween(_shader.uniforms[key], { value }, time, ease, delay, callback, update);
  };

  this.clone = function () { return new AntimatterPass(_shader, _uni); };

  this.destroy = function () {
    _rts.forEach(function (rt) { if (rt && rt.destroy) rt.destroy(); });
  };

  /*
   * Staged upload: compile, then RTs one by one with defer-gaps, then
   * each uniform texture. Mirrors Antimatter's preload strategy.
   */
  this.upload = async function () {
    _shader.upload();
    await defer();
    for (let i = 0; i < _rts.length; i++) {
      _rts[i].upload();
      await defer();
    }
    for (const key in _shader.uniforms) {
      const uniform = _shader.uniforms[key];
      if (!uniform.value) continue;
      if (uniform.value.uploadAsync) await uniform.value.uploadAsync();
      else if (uniform.value.upload) { uniform.value.upload(); await defer(); }
    }
  };
});

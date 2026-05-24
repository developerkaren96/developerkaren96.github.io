/*
 * ShaderRendererWebGL — WebGL backend for `Shader`.
 *
 * Responsibilities:
 *   - Compile/link GLSL programs (with pretty error formatting + GLSL linter
 *     in dev), with a shared `_pool` so two Shader instances pointing at the
 *     same (vs, fs, customCompile) tuple reuse one GL program.
 *   - Resolve uniform locations once and cache them on `shader._gl[key]`.
 *     Sentinel value `'U'` means "this uniform lives in a UBO" — handled
 *     elsewhere.
 *   - On each draw: push all uniforms (type-dispatched), bind UBOs, manage
 *     the GL state machine (blending, depth test/func, depth mask, color
 *     mask, polygon offset, face culling, stencil) using `_cached` so we
 *     don't redundantly toggle state that hasn't changed.
 *   - `resetState` / `clearState` for end-of-frame and forced re-init.
 *   - `hotReload(file)` reloads programs whose source contains `file` —
 *     used in dev to refresh shaders without a page reload.
 *
 * The big `switch (uni.type)` covers every primitive uniform shape this
 * renderer can ship. The `'t'` (texture) branch resolves render-target →
 * texture aliases and falls back to an empty placeholder for unloaded
 * textures so the draw is still safe.
 */
Class(function ShaderRendererWebGL(_gl) {
  const self = this;
  const _pool     = {};   // key: vs_fs_customCompile  →  { program, id, count, references[] }
  let   _programID = 0;
  let   _cached   = {};   // last-applied GL state — debounce redundant toggles
  const _uboCache = {};   // shared UBOs by UILPrefix (so PBR variants share a UBO)

  const PROFILER = !!window.OptimizationProfiler;
  const WEBGL2   = Renderer.type == Renderer.WEBGL2;

  // Names of uniforms set by the renderer itself (NOT by user code via
  // `shader.uniforms`). Their locations are looked up once in `setupShaders`.
  const GLOBAL_UNIFORMS = [
    'normalMatrix', 'modelMatrix', 'modelViewMatrix',
    'projectionMatrix', 'viewMatrix',
    'cameraPosition', 'cameraQuaternion',
    'resolution', 'time',
    'shadowMatrix', 'shadowLightPos', 'shadowSize',
  ];

  const DEPTH_FUNC_KEYS = {
    [Shader.DEPTH_FUNC_NEVER]:    'NEVER',
    [Shader.DEPTH_FUNC_LESS]:     'LESS',
    [Shader.DEPTH_FUNC_EQUAL]:    'EQUAL',
    [Shader.DEPTH_FUNC_LEQUAL]:   'LEQUAL',
    [Shader.DEPTH_FUNC_GREATER]:  'GREATER',
    [Shader.DEPTH_FUNC_NOTEQUAL]: 'NOTEQUAL',
    [Shader.DEPTH_FUNC_GEQUAL]:   'GEQUAL',
    [Shader.DEPTH_FUNC_ALWAYS]:   'ALWAYS',
  };

  /** Mirror `uni.value` into a (cached) Float32Array — required by `uniform*fv`. */
  function toTypedArray(uni) {
    if (!uni._gl) uni._gl = {};
    if (uni._gl.array && uni._gl.array.length == uni.value.length) {
      uni._gl.array.set(uni.value);
    } else {
      uni._gl.array = new Float32Array(uni.value);
    }
    return uni._gl.array;
  }

  /**
   * Compile one shader stage. On error, render a clickable, highlighted
   * source listing in the console (`Hydra.LOCAL` only).
   */
  function createShader(str, type, name = 'Shader') {
    const shader = _gl.createShader(type);
    // Spector.js metadata, ignored at runtime when extension isn't present.
    if (window.SPECTOR !== undefined) shader.__SPECTOR_Metadata = { name };
    _gl.shaderSource(shader, str);
    _gl.compileShader(shader);

    if (Hydra.LOCAL && !_gl.getShaderParameter(shader, _gl.COMPILE_STATUS)) {
      // Pretty-print: highlight error lines with red CSS in the console.
      (function logPrettyShaderError(shader) {
        const shaderSrc = _gl.getShaderSource(shader).split('\n')
          .map((line, index) => `${index}: ${line}`);
        const shaderLog   = _gl.getShaderInfoLog(shader);
        const splitShader = shaderLog.split('\n');
        const dedupe = {};
        const lineNumbers = splitShader
          .map((line) => parseFloat(line.replace(/^ERROR\: 0\:([\d]+)\:.*$/, '$1')))
          .filter((n) => !(!n || dedupe[n]) && (dedupe[n] = true, true));
        const logArgs = [''];
        lineNumbers.forEach((number) => {
          shaderSrc[number - 1] = `%c${shaderSrc[number - 1]}%c`;
          logArgs.push('background: #FF0000; color:#FFFFFF; font-size: 10px', 'font-size: 10px');
        });
        logArgs[0] = shaderSrc.join('\n');
        console.error(shaderLog);
        console.groupCollapsed('click to view full shader code');
        console.warn(...logArgs);
        console.groupEnd();
      })(shader);
      _gl.deleteShader(shader);
    }
    return shader;
  }

  /**
   * Build a GL program from a Shader's vs/fs sources. Each source goes
   * through `Shader.runPreProcess` (#include resolution, light injection,
   * etc.) and an `onBeforeCompile` hook so callers can mutate the final
   * GLSL. OptimizationProfiler (when active) can rewrite either stage.
   */
  function createProgram(shader) {
    if (!shader.vertexShader) Shader.runPreProcess(shader);
    if (self.multiViewOverride) self.multiViewOverride(shader);

    let vsCode = shader.onBeforeCompile(shader.vertexShader,   'vs');
    let fsCode = shader.onBeforeCompile(shader.fragmentShader, 'fs');
    if (PROFILER && OptimizationProfiler.active) {
      [vsCode, fsCode] = OptimizationProfiler.override(shader, vsCode, fsCode);
    }

    RenderCount.add('shader', shader);
    const vs = createShader(vsCode, _gl.VERTEX_SHADER,   `${shader.vsName} - ${shader.UILPrefix}`);
    const fs = createShader(fsCode, _gl.FRAGMENT_SHADER, `${shader.fsName} - ${shader.UILPrefix}`);

    if (Hydra.LOCAL && window.GLSLLinter) GLSLLinter.lint(shader, vsCode, fsCode);

    const program = _gl.createProgram();
    _gl.attachShader(program, vs);
    _gl.attachShader(program, fs);
    _gl.linkProgram(program);

    if (Hydra.LOCAL && !_gl.getProgramParameter(program, _gl.LINK_STATUS)) {
      console.warn(`Shader: ${shader.vsName} | ${shader.vsName}`);
      console.error(`Could not compile WebGL program. ${shader.vsName} ${shader.fsName} \n\n`
        + _gl.getProgramInfoLog(program));
    }

    // Shader stages can be deleted as soon as they're linked into a program.
    _gl.deleteShader(vs);
    _gl.deleteShader(fs);
    return program;
  }

  /**
   * Resolve uniform locations and assign per-key handles on `shader._gl`.
   * Special handling:
   *   - UBO uniforms (`uniform.ubo`): WebGL2 packs into shader.ubo (shared
   *     per UILPrefix via `_uboCache`); WebGL1 falls back to per-uniform
   *     locations.
   *   - `uniform.lightUBO` flips `uboLight` so the global lights UBO is
   *     bound during draw.
   *   - `setupGlobals` happens once per program: cache `GLOBAL_UNIFORMS`
   *     locations so `appendUniform` is O(1) after the first call.
   */
  function setupShaders(shader) {
    for (let i = shader._uniformKeys.length - 1; i > -1; i--) {
      const key     = shader._uniformKeys[i];
      const uniform = shader._uniformValues[i];
      if (shader._gl[key] !== undefined || !uniform) continue;

      if (uniform.ubo) {
        if (WEBGL2) {
          // Reuse existing UBO for this UILPrefix if present.
          if (_uboCache[shader.UILPrefix] && !shader.ubo) shader.ubo = _uboCache[shader.UILPrefix];
          if (_uboCache[shader.UILPrefix]) { shader._gl[key] = 'U'; continue; }
          if (!shader.ubo) shader.ubo = new UBO(1, _gl);
          shader.ubo.push(uniform);
          shader._gl[key] = 'U';
        } else {
          shader._gl[key] = _gl.getUniformLocation(shader._gl.program, key);
        }
      } else if (WEBGL2 && uniform.lightUBO) {
        shader._gl[key]  = 'U';
        shader.uboLight  = true;
      } else {
        shader._gl[key] = _gl.getUniformLocation(shader._gl.program, key);
      }
    }
    if (shader.ubo && !_uboCache[shader.UILPrefix]) _uboCache[shader.UILPrefix] = shader.ubo;

    if (!shader._gl.setupGlobals) {
      shader._gl.setupGlobals = true;
      GLOBAL_UNIFORMS.forEach((key) => {
        shader._gl[key] = _gl.getUniformLocation(shader._gl.program, key);
      });
    }

    // Warm the uniform-block index cache so the first draw doesn't pay for it.
    if (shader.uboLight) _gl.getUniformBlockIndex(shader._gl.program, 'lights');
    if (WEBGL2)          _gl.getUniformBlockIndex(shader._gl.program, 'global');
  }

  /**
   * Bind an array of textures to consecutive units and push the resulting
   * indices as a sampler array. The renderer reuses `shader._gl.texArray`
   * across frames to avoid GC.
   */
  function uniformTextureArray(uni, uLoc, shader) {
    const array = shader._gl.texArray || [];
    array.length = 0;
    shader._gl.texArray = array;
    for (let i = 0; i < uni.value.length; i++) {
      array.push(shader._gl.texIndex);
      let texture = uni.value[i];
      if (texture.loaded === false) texture = Utils3D.getEmptyTexture();
      if (texture._gl === undefined || texture.needsReupload) Texture.renderer.upload(texture);
      _gl.activeTexture(_gl['TEXTURE' + shader._gl.texIndex++]);
      _gl.bindTexture(_gl.TEXTURE_2D, texture._gl);
    }
    _gl.uniform1iv(uLoc, array);
  }

  /**
   * One-time program upload + uniform setup. Hits `_pool` if another Shader
   * already compiled the same (vs, fs, customCompile) — in that case we
   * just bump the ref-count and adopt its program/id.
   */
  this.upload = function (shader) {
    if (PROFILER && OptimizationProfiler.active) OptimizationProfiler.setupShader(shader);
    if (!shader._gl) {
      shader._gl = {};
      const key    = `${shader.vsName}_${shader.fsName}_${shader.customCompile}`;
      const cached = _pool[key];
      if (cached) {
        shader._gl.program = cached.program;
        shader._gl._id     = cached.id;
        shader.onBeforePrecompilePromise.resolve();
        cached.count++;
        if (Hydra.LOCAL) _pool[key].references.push(shader);
      } else {
        shader._gl.program = createProgram(shader);
        shader._gl._id     = _programID++;
        _pool[key] = { count: 1, program: shader._gl.program, id: shader._gl._id };
        Shader.registerPreProcess(shader);
        if (Hydra.LOCAL) _pool[key].references = [shader];
      }
    }
    setupShaders(shader);
    if (shader.ubo) shader.ubo.upload();
    // Free source strings on WebGL2 (FXLayer holds onto them on WebGL1 — see hotReload).
    if (!(Renderer.type == Renderer.WEBGL1 && FXLayer.exists)) {
      shader.vertexShader = shader.fragmentShader = '';
    }
  };

  /**
   * Hot-path lookup: if another Shader has already compiled this (vs/fs)
   * tuple, attach its program here. Returns true if a cache hit; false if
   * the caller still needs to `upload`.
   */
  this.findCachedProgram = function (shader) {
    const key    = `${shader.vsName}_${shader.fsName}_${shader.customCompile}`;
    const cached = _pool[key];
    if (!cached) return false;
    shader._gl = {};
    shader._gl.program = cached.program;
    shader._gl._id     = cached.id;
    shader.onBeforePrecompilePromise.resolve();
    if (_uboCache[shader.UILPrefix]) shader.ubo = shader.UILPrefix;
    cached.count++;
    if (Hydra.LOCAL) _pool[key].references.push(shader);
    return true;
  };

  /**
   * Per-draw shader pass: switch program (if needed), bind UBOs, push every
   * uniform, then apply state-machine settings (blending, depth, cull, etc.)
   * gated by `_cached` to skip no-op transitions.
   */
  this.draw = function (shader) {
    if (shader._gl === undefined) this.upload(shader);

    // RenderMonitor: GPU timing queries per shader.
    if (WEBGL2 && RenderMonitor.active && !shader.renderTimeQuery) {
      shader.renderTimeQuery = RenderMonitor.createQuery(_gl, shader);
    }
    if (WEBGL2 && RenderMonitor.active) shader.renderTimeQuery?.beginTest?.();

    shader._gl.texIndex = 0;
    // Switch program only when it actually changes.
    if (shader._gl.program != _cached.program) {
      _gl.useProgram(shader._gl.program);
      _cached.program = shader._gl.program;
    }
    if (shader.ubo)      shader.ubo.bind(shader._gl.program, 'ubo');
    if (shader.uboLight) Lighting.bindUBO(shader._gl.program);

    // ── Per-uniform dispatch ───────────────────────────────────────
    let uniform;   // hoisted — referenced inside the inline type-inference IIFE
    for (let i = shader._uniformKeys.length - 1; i > -1; i--) {
      const key = shader._uniformKeys[i];
      const uni = shader._uniformValues[i];
      if (!uni) continue;

      let uLoc = shader._gl[key];
      // First-time hit: lazy setupShaders to fill in this key's location.
      if (uLoc === undefined) { setupShaders(shader); uLoc = shader._gl[key]; }
      if (uLoc === null || uLoc === -1 || uLoc === 'U') continue;

      if (uni.value === null) uni.value = Utils3D.getEmptyTexture();
      if (Hydra.LOCAL && uni.value === undefined) {
        throw `Uniform ${key} value is undefined. | ${shader.vsName} ${shader.fsName}`;
      }

      // Infer uniform type on first use (cached on `uni.type` thereafter).
      if (!uni.type) {
        uniform = uni;
        uni.type
          = typeof uniform.type === 'string'  ? uniform.type
          : typeof uniform.value === 'boolean' ? 'b'
          : (uniform.value === null
             || uniform.value instanceof Texture
             || uniform.value.texture
             || (uniform.value.rt && uniform.value.rt.texture)) ? 't'
          : uniform.value instanceof Vector2                                      ? 'v2'
          : uniform.value instanceof Vector3 || uniform.value instanceof Vector3D ? 'v3'
          : uniform.value instanceof Vector4                                      ? 'v4'
          : uniform.value instanceof Matrix4                                      ? 'm4'
          : uniform.value instanceof Matrix3                                      ? 'm3'
          : uniform.value instanceof Color                                        ? 'c'
          : uniform.value instanceof Quaternion                                   ? 'q'
          : Array.isArray(uniform.value) && uniform.value[0] instanceof Texture   ? 'tv'
          : 'f';
      }

      switch (uni.type) {
        case 'f':  _gl.uniform1f (uLoc, uni.value);                                   break;
        case 'i':  _gl.uniform1i (uLoc, Math.floor(uni.value));                       break;
        case 'b':  _gl.uniform1i (uLoc, uni.value);                                   break;
        case 'v2': _gl.uniform2f (uLoc, uni.value.x, uni.value.y);                    break;
        case 'v3': _gl.uniform3f (uLoc, uni.value.x, uni.value.y, uni.value.z);       break;
        case 'c':  _gl.uniform3f (uLoc, uni.value.r, uni.value.g, uni.value.b);       break;
        case 'q':
        case 'v4': _gl.uniform4f (uLoc, uni.value.x, uni.value.y, uni.value.z, uni.value.w); break;
        case 'v3v': _gl.uniform3fv(uLoc, toTypedArray(uni));                          break;
        case 'v4v': _gl.uniform4fv(uLoc, toTypedArray(uni));                          break;
        case 'v2v': _gl.uniform2fv(uLoc, toTypedArray(uni));                          break;
        case 'fv':  _gl.uniform1fv(uLoc, toTypedArray(uni));                          break;
        case 'm4':  _gl.uniformMatrix4fv(uLoc, false, uni.value.elements);            break;
        case 'm3':  _gl.uniformMatrix3fv(uLoc, false, uni.value.elements);            break;
        case 'tv':  uniformTextureArray(uni, uLoc, shader);                           break;
        case 't': {
          // Resolve RT → texture, with fallback to empty texture if not loaded.
          let texture = uni.value;
          if (!texture.isTexture) {
            if (uni.value.rt)      texture = uni.value.rt.overrideTexture || uni.value.rt.texture;
            if (uni.value.texture) texture = uni.value.texture;
          }
          if (texture.loaded === false) texture = Utils3D.getEmptyTexture();
          const texIndex = shader._gl.texIndex++;
          if (uni.value.vrRT) { shader._gl.vrRT = true; uni.value._glTexIndex = texIndex; }
          Texture.renderer.draw(texture, uLoc, key, texIndex);
          break;
        }
      }
    }

    // ── GL state machine (skipped if shader manages its own state) ──
    if (!shader.glCustomState) {
      // Polygon offset (rarely changes — diff against last key string).
      if (shader.polygonOffset) {
        const key = shader.polygonOffsetFactor + '_' + shader.polygonOffsetUnits;
        if (_cached.polygonOffset != key) {
          _gl.enable(_gl.POLYGON_OFFSET_FILL);
          _gl.polygonOffset(shader.polygonOffsetFactor, shader.polygonOffsetUnits);
        }
        _cached.polygonOffset = key;
      } else {
        if (_cached.polygonOffset) _gl.disable(_gl.POLYGON_OFFSET_FILL);
        _cached.polygonOffset = false;
      }

      // Blend enable/disable.
      if (shader.transparent || shader.opacity) {
        if (!_cached.transparent) _gl.enable(_gl.BLEND);
        _cached.transparent = true;
      } else {
        if (_cached.transparent) _gl.disable(_gl.BLEND);
        _cached.transparent = false;
      }

      // Blend equation/func mode.
      if (_cached.blending != shader.blending) {
        switch (shader.blending) {
          case Shader.ADDITIVE_BLENDING:
            _gl.blendEquation(_gl.FUNC_ADD);
            _gl.blendFunc(_gl.SRC_ALPHA, _gl.ONE);                                    break;
          case Shader.PREMULTIPLIED_ALPHA_BLENDING:
            _gl.blendEquation(_gl.FUNC_ADD);
            _gl.blendFunc(_gl.ONE, _gl.ONE_MINUS_SRC_ALPHA);                          break;
          case Shader.REVERSE_PREMULTIPLIED_ALPHA_BLENDING:
            _gl.blendEquation(_gl.FUNC_ADD);
            _gl.blendFunc(_gl.ONE_MINUS_DST_ALPHA, _gl.ONE);                          break;
          case Shader.ADDITIVE_COLOR_ALPHA:
            _gl.blendEquation(_gl.FUNC_ADD);
            _gl.blendFunc(_gl.ONE, _gl.ONE);                                          break;
          case Shader.MAX:
            _gl.blendEquation(WEBGL2 ? _gl.MAX : Renderer.extensions.minMax.MAX_EXT);
            _gl.blendFunc(_gl.ONE, _gl.ONE);                                          break;
          case Shader.MIN:
            _gl.blendEquation(WEBGL2 ? _gl.MIN : Renderer.extensions.minMax.MIN_EXT);
            _gl.blendFunc(_gl.ONE, _gl.ONE);                                          break;
          default:
            // Standard "premultiplied alpha for color, additive for alpha".
            _gl.blendEquationSeparate(_gl.FUNC_ADD, _gl.FUNC_ADD);
            _gl.blendFuncSeparate(_gl.SRC_ALPHA, _gl.ONE_MINUS_SRC_ALPHA,
                                  _gl.ONE,       _gl.ONE_MINUS_SRC_ALPHA);
        }
        _cached.blending = shader.blending;
      }

      // Depth test.
      if (shader.depthTest) {
        if (!_cached.depthTest) _gl.enable(_gl.DEPTH_TEST);
        _cached.depthTest = true;
      } else {
        if (_cached.depthTest) _gl.disable(_gl.DEPTH_TEST);
        _cached.depthTest = false;
      }
      const depthFunc = _gl[DEPTH_FUNC_KEYS[shader.depthFunc || Shader.DEPTH_FUNC_LESS]];
      if (_cached.depthFunc !== depthFunc) {
        _gl.depthFunc(depthFunc);
        _cached.depthFunc = depthFunc;
      }

      // Stencil. `stencilMask=true` writes to the stencil buffer; otherwise
      // it tests against ref=1 inside (EQUAL) or outside (NOTEQUAL).
      if (shader.stencilTest) {
        if (!_cached.stencilTest) _gl.enable(_gl.STENCIL_TEST);
        _cached.stencilTest = true;
        if (shader.stencilMask) {
          _gl.stencilFunc(_gl.ALWAYS, 1, 255);
          _gl.stencilOp(_gl.KEEP, _gl.KEEP, _gl.REPLACE);
          _gl.stencilMask(255);
          _gl.colorMask(false, false, false, false);
          _gl.disable(_gl.DEPTH_TEST);
        } else {
          _gl.colorMask(true, true, true, true);
          _gl.enable(_gl.DEPTH_TEST);
          const mode = 'inside';
          _gl.stencilFunc(mode == 'inside' ? _gl.EQUAL : _gl.NOTEQUAL, 1, 255);
          _gl.stencilOp(_gl.KEEP, _gl.KEEP, _gl.KEEP);
        }
      } else {
        if (_cached.stencilTest) _gl.disable(_gl.STENCIL_TEST);
        _cached.stencilTest = false;
      }

      // Face culling — BACK_SIDE shows back faces (cull FRONT), etc.
      switch (shader.side) {
        case Shader.BACK_SIDE:
          if (_cached.side != Shader.BACK_SIDE) {
            _gl.enable(_gl.CULL_FACE); _gl.cullFace(_gl.FRONT);
            _cached.side = Shader.BACK_SIDE;
          }
          break;
        case Shader.DOUBLE_SIDE:
          if (_cached.side != Shader.DOUBLE_SIDE) {
            _gl.disable(_gl.CULL_FACE);
            _cached.side = Shader.DOUBLE_SIDE;
          }
          break;
        default:
          if (_cached.side != Shader.FRONT_SIDE) {
            _gl.enable(_gl.CULL_FACE); _gl.cullFace(_gl.BACK);
            _cached.side = Shader.FRONT_SIDE;
          }
      }

      // Depth write toggle.
      if (_cached.depthMask != shader.depthWrite) {
        _gl.depthMask(!!shader.depthWrite);
        _cached.depthMask = shader.depthWrite;
      }

      // Color mask — either explicit [r,g,b,a] array or one of the named modes.
      if (shader.colorMask && shader.colorMask.push) {
        _gl.colorMask(
          shader.colorMask[0] || false,
          shader.colorMask[1] || false,
          shader.colorMask[2] || false,
          shader.colorMask[3] || false,
        );
      } else {
        switch (shader.colorMask) {
          case Shader.COLOR_MASK_NONE:
            if (_cached.colorMask != shader.colorMask) {
              _gl.colorMask(true, true, true, true);
              _cached.colorMask = shader.colorMask;
            }
            break;
          case Shader.COLOR_MASK_RGB:
            if (_cached.colorMask != shader.colorMask) {
              _gl.colorMask(false, false, false, true);
              _cached.colorMask = shader.colorMask;
            }
            break;
          case Shader.COLOR_MASK_RGBA:
            if (_cached.colorMask != shader.colorMask) {
              _gl.colorMask(false, false, false, false);
              _cached.colorMask = shader.colorMask;
            }
            break;
        }
      }
    }

    // Free-form GL state callbacks attached to the shader (e.g. enable scissor,
    // set blendBarrier, etc.). Each entry: { fn: '<gl method>', params: [...] }.
    if (shader.customState) {
      for (let i = 0; i < shader.customState.length; i++) {
        const obj = shader.customState[i];
        _gl[obj.fn].apply(_gl, obj.params);
      }
    }
  };

  this.destroy = function (shader) {
    delete shader._gl;
    if (shader.ubo) shader.ubo.destroy();
  };

  /**
   * Push a renderer-side uniform (matrices, camera info, shadow data, …)
   * directly without going through `shader.uniforms`. The `hint` tells us
   * how to interpret raw Float32Array payloads ('matrix' | 'float' | 'vec3').
   * Texture arrays (plain JS array of textures with `_gl`) get bound to
   * consecutive units like in `uniformTextureArray`.
   */
  this.appendUniform = function (shader, key, value, hint) {
    let loc = shader._gl[key];
    if (loc === undefined) loc = _gl.getUniformLocation(shader._gl.program, key);
    if (loc === null) return;

    if (value.isMatrix4)        _gl.uniformMatrix4fv(loc, false, value.elements);
    else if (value.isMatrix3)   _gl.uniformMatrix3fv(loc, false, value.elements);
    else if (value.isVector4)   _gl.uniform4f(loc, value.x, value.y, value.z, value.w);
    else if (value.isQuaternion) _gl.uniform4f(loc, value.x, value.y, value.z, value.w);
    else if (value.isVector3)   _gl.uniform3f(loc, value.x, value.y, value.z);
    else if (value.isVector2)   _gl.uniform2f(loc, value.x, value.y);
    else if (value instanceof Float32Array) {
      switch (hint) {
        case 'matrix': _gl.uniformMatrix4fv(loc, false, value); break;
        case 'float':  _gl.uniform1fv(loc, value);              break;
        case 'vec3':   _gl.uniform3fv(loc, value);              break;
      }
    } else if (Array.isArray(value)) {
      const array = shader._gl.texArray || [];
      array.length = 0;
      shader._gl.texArray = array;
      for (let i = 0; i < value.length; i++) {
        array.push(shader._gl.texIndex);
        _gl.activeTexture(_gl['TEXTURE' + shader._gl.texIndex++]);
        _gl.bindTexture(_gl.TEXTURE_2D, value[i]._gl);
      }
      _gl.uniform1iv(loc, array);
    } else {
      _gl.uniform1f(loc, value);
    }
  };

  /**
   * Reset known-divergent state to defaults at frame boundaries. Used by
   * `Renderer.render` after a frame to leave the GL state predictable for
   * non-Hydra GL consumers (e.g. WebXR compositor steps).
   */
  this.resetState = function () {
    if (!_cached.depthMask) { _gl.depthMask(true); _cached.depthMask = true; }
    if (!_cached.depthTest)   _gl.enable(_gl.DEPTH_TEST);
    _cached.depthTest = true;
    if (_cached.depthFunc !== _gl.LESS) _gl.depthFunc(_gl.LESS);
    _cached.depthFunc = _gl.LESS;
    if (_cached.colorMask != Shader.COLOR_MASK_NONE) {
      _gl.colorMask(true, true, true, true);
      _cached.colorMask = Shader.COLOR_MASK_NONE;
    }
    _cached.program = null;
  };

  /** Forget all cached state (used after context loss / external GL mutators). */
  this.clearState = function () { _cached = {}; };

  /**
   * Hot-reload all shaders whose pool key includes `file` (e.g. `foo.fs`
   * matches every program built from `foo.fs`). Skips instancing variants
   * and a few mutating wrappers (`Line3D`, `MergedLine`) that own custom
   * preprocessing.
   *
   * For each affected pool entry: rebuild the program once on the first
   * reference, then point the other references at the new program/id.
   */
  this.hotReload = function (file) {
    file = file.split('.')[0].trim();
    for (const key in _pool) {
      if (!key.includes(file)) continue;
      if (['|instance', '|Line3D', '|MergedLine'].find((part) => key.includes(part))) continue;

      const obj = _pool[key];
      const rootShader = obj.references[0];
      for (let i = 0; i < obj.references.length; i++) {
        const shader = obj.references[i];
        if (i === 0) {
          // Recompile the leader.
          shader.restoreFS = shader.restoreVS = null;
          shader.resetProgram();
          shader._gl = {};
          shader._gl.program = createProgram(shader);
          shader._gl._id     = _programID++;
          obj.program = shader._gl.program;
          obj.id      = shader._gl._id;
        } else {
          // Re-point followers at the new program (no recompile).
          shader.destroy();
          shader.restoreFS    = rootShader.restoreFS;
          shader.restoreVS    = rootShader.restoreVS;
          shader.vertexShader = rootShader.vertexShader;
          shader.fragmentShader = rootShader.fragmentShader;
          shader._gl = {};
          shader._gl.program = obj.program;
          shader._gl._id     = obj.id;
        }
        setupShaders(rootShader);
      }
    }
  };

  /** Drop a single program from the pool — forces a recompile on next `upload`. */
  this.hotReloadClearProgram = function (id) {
    for (const key in _pool) if (key.includes(id)) delete _pool[key];
  };
});

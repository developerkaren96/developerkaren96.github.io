/*
 * Shader — the engine-level "material" abstraction. Wraps a vertex/fragment
 * shader pair plus its uniforms and GL state (blending, depth, stencil,
 * culling, polygon-offset, color-mask, …) into a single Class instance.
 *
 * Construction is overloaded:
 *   new Shader('myShader')                                — vs == fs == 'myShader'
 *   new Shader('vs', 'fs', params, onBeforeBuild, postfix)
 *   new Shader({ name, uniforms })                        — object form
 *
 * Lifecycle:
 *   1. Constructor resolves source file names, parses params (splitting
 *      uniforms vs material flags), and — unless the program is already
 *      cached / pre-processed — runs `Shader.runPreProcess` which:
 *       - calls `Shader.process` on both stages (header injection, GLSL
 *         version, extensions, std140 `global` UBO, lights placeholder,
 *         ssReflections varyings).
 *       - scans the vertex shader for `//js name = value` and `uniform
 *         sampler2D foo` lines and auto-generates a `window[vsName]`
 *         function that injects them into per-instance uniforms.
 *   2. `upload(mesh, geom)` hands off to the backend renderer (which then
 *      goes through `onBeforeCompile` for the final GLSL pass — dedup
 *      varyings/uniforms, expand lights, convert WebGL1↔2, run user
 *      preCompile).
 *   3. `draw(mesh, geom)` issues the actual GL draw, plus lazy lighting
 *      init for receiveLight shaders.
 *   4. `destroy()` releases unless `persists`.
 *
 * Receive-shadow tracking: a static `_shaderShadowMap` keyed by
 * `vsName_fsName` survives shader recreation, so any new instance of a
 * shader pair that previously had a shadow-receiver gets one again. The
 * setter on `receiveShadow` also auto-installs a `shadowMap` uniform
 * (initially a 1-element empty-texture array) so the GLSL compiles even
 * before Lighting has populated the real maps.
 */
Class(
  function Shader(_vertexShader, _fragmentShader, _params, _onBeforeBuild, _postfix) {
    // Object form: new Shader({ name, uniforms }) — unpack into positional args.
    if ('object' == typeof _vertexShader) {
      _fragmentShader = _vertexShader.uniforms;
      _vertexShader   = _vertexShader.name;
    }

    const self = this;

    // ── Defaults: material/state ───────────────────────────────────────────
    this.uniforms             = Shader.createUniforms(this);
    this.side                 = Shader.FRONT_SIDE;
    this.blending             = Shader.NORMAL_BLENDING;
    this.colorMask            = Shader.COLOR_MASK_NONE;
    this.polygonOffset        = false;
    this.polygonOffsetFactor  = 0;
    this.polygonOffsetUnits   = 1;
    this.depthTest            = true;
    this.depthWrite           = true;
    this.ssReflections        = _params?.ssReflections || false;
    this.depthFunc            = Shader.DEPTH_FUNC_LESS;
    this.stencilTest          = false;
    this.stencilMask          = false;
    this.wireframe            = false;
    this.transparent          = false;
    this.visible              = true;
    this.persists             = false;
    this.precision            = 'high';
    this.customCompile        = _params?.customCompile || '';
    this.onBeforePrecompilePromise = Promise.create();

    // Single-name form: new Shader('myShader') — fs falls back to vs name.
    if ('string' != typeof _fragmentShader) {
      _params         = _fragmentShader;
      _fragmentShader = _vertexShader;
    }
    _params = _params || {};

    self.vsParam      = _vertexShader;
    self.fsParam      = _fragmentShader;
    self.params       = _params;
    self.onBeforeBuild = _onBeforeBuild;
    self.vsName       = _vertexShader;
    self.fsName       = (_fragmentShader || _vertexShader) + (_postfix || '');

    // Overrides from params.
    if (_params.vsName)    { self.vsName    = _params.vsName;    delete _params.vsName; }
    if (_params.precision) { self.precision = _params.precision; }

    // Shadow-receivers always use high precision (depth comparison reads).
    if (_params.receiveShadow) {
      self.receiveLight = true;
      if (World.RENDERER.shadows) self.precision = 'high';
    }

    // UIL (UI/asset Library) storage prefix: groups uniforms by shader name +
    // optional `unique` discriminator so multiple instances can be tweaked
    // independently in the editor.
    let vs = _vertexShader, fs = _fragmentShader;
    if (_params.uilFrom) { vs = _params.uilFrom; fs = _params.uilFrom; delete _params.uilFrom; }
    self.UILPrefix = _params.UILPrefix || `${vs}/${fs}/${_params.unique ? _params.unique + '/' : ''}`;

    // Sort params into uniforms vs material flags.
    Shader.parseParams(_params, self);

    // Skip the GLSL preprocessor if the renderer already has a cached program
    // or another instance has already pre-processed this same name+compile.
    if (!Shader.renderer.findCachedProgram(self) && !Shader.hasAlreadyPreProcessed(self)) {
      Shader.runPreProcess(self);
    }
  },
  (_) => {
    /*
     * Build the lights uniform block for a shader that receives lighting.
     * If the scene's lighting count is 0 we still need shadow uniforms (shadow
     * maps are independent from the lights array). Otherwise we emit a packed
     * `lights` UBO with 6 vec4 arrays per light.
     */
    function getLightingCode(self) {
      // Mirror the static shadow-map: if a shader of this pair previously
      // received shadow, this instance should too.
      if (!self.receiveShadow && Shader.shouldReceiveShadow(self)) self.receiveShadow = true;
      if (!self.receiveLight || self.isShadow) return '';

      const numLights = Lighting.getLighting(self).position.length / 4;
      if (0 == numLights) return Lighting.getShadowUniforms(self);

      return [
        `#define NUM_LIGHTS ${numLights}`,
        'uniform lights {',
        `vec4 lightPos[${numLights}];`,
        `vec4 lightColor[${numLights}];`,
        `vec4 lightData[${numLights}];`,
        `vec4 lightData2[${numLights}];`,
        `vec4 lightData3[${numLights}];`,
        `vec4 lightProperties[${numLights}];`,
        '};',
      ].join('\n') + Lighting.getShadowUniforms(self);
    }

    /*
     * Splice the deferred-buffer pre-amble into a vertex shader for
     * screen-space reflections. The user shader MUST contain the literal
     * `vec3 pos = position;` so we have a known insertion site.
     */
    function setupssReflections(code, type, self) {
      if ('vs' != type) return code;
      if (!code.includes('vec3 pos = position;')) {
        throw `Shader ${self.vsName} needs to have "vec3 pos = position;" in order for dynamic merging to work`;
      }
      const vsDeferred = `
            vPosDeferred = modelViewMatrix * vec4(pos, 1.);
            vNormalDeferred = normalMatrix * normal;
            vST = uv;
            `;
      const main = code.split('vec3 pos = position;');
      main[1] = '\n' + vsDeferred + main[1];
      return main.join('vec3 pos = position;');
    }

    // ── Static enums (string sentinels used by the backend dispatch) ────────
    Shader.FRONT_SIDE                          = 'shader_front_side';
    Shader.BACK_SIDE                           = 'shader_back_side';
    Shader.DOUBLE_SIDE                         = 'shader_double_side';
    Shader.DOUBLE_SIDE_TRANSPARENCY            = 'shader_double_side_trasparency';
    Shader.ADDITIVE_BLENDING                   = 'shader_additive_blending';
    Shader.NORMAL_BLENDING                     = 'shader_normal_blending';
    Shader.PREMULTIPLIED_ALPHA_BLENDING        = 'shader_premultiplied_alpha_blending';
    Shader.ADDITIVE_COLOR_ALPHA                = 'shader_additive_color_alpha';
    Shader.REVERSE_PREMULTIPLIED_ALPHA_BLENDING= 'shader_reverse_premultiplied_alpha_blending';
    Shader.MAX                                 = 'shader_max';
    Shader.MIN                                 = 'shader_min';
    Shader.CUSTOM_DEPTH                        = 'shader_custom_depth';
    Shader.COLOR_MASK_RGB                      = 'shader_colormask_rgb';
    Shader.COLOR_MASK_RGBA                     = 'shader_colormask_rgba';
    Shader.COLOR_MASK_NONE                     = 'shader_colormask_none';
    Shader.DEPTH_FUNC_NEVER                    = 'shader_depth_func_never';
    Shader.DEPTH_FUNC_LESS                     = 'shader_depth_func_less';
    Shader.DEPTH_FUNC_EQUAL                    = 'shader_depth_func_equal';
    Shader.DEPTH_FUNC_LEQUAL                   = 'shader_depth_func_lequal';
    Shader.DEPTH_FUNC_GREATER                  = 'shader_depth_func_greater';
    Shader.DEPTH_FUNC_NOTEQUAL                 = 'shader_depth_func_notequal';
    Shader.DEPTH_FUNC_GEQUAL                   = 'shader_depth_func_gequal';
    Shader.DEPTH_FUNC_ALWAYS                   = 'shader_depth_func_always';

    /*
     * Triage constructor params:
     *   - `receiveShadow` / `receiveLight` → direct properties (they have
     *     custom getters/setters).
     *   - Anything with a `.value` key   → goes into `uniforms`, possibly
     *     overlaid by UILStorage (the editor's persisted values).
     *   - `unique`                         → consumed by UILPrefix, drop here.
     *   - Anything else                    → material property on `self`.
     */
    Shader.parseParams = function (_params, self) {
      for (const key in _params) {
        if ('receiveShadow' == key) {
          self.receiveShadow = _params[key];
        } else if ('receiveLight' == key) {
          self.receiveLight = _params[key];
        } else if (_params[key] && undefined !== _params[key].value) {
          if (window.UILStorage && UILStorage.hasData()) {
            self.uniforms[key] = UILStorage.parse(self.UILPrefix + key, _params[key].value) || _params[key];
            if (_params[key].ubo) self.uniforms[key].ubo = true;
          } else {
            self.uniforms[key] = _params[key];
          }
        } else {
          if ('unique' == key) continue;
          self[key] = _params[key];
        }
      }
    };

    /*
     * Pull raw GLSL from `Shaders` cache, run it through `Shader.process`, and
     * — for the vertex shader only — auto-detect:
     *   - `//js foo = expr`         → registers a uniform { value: eval(expr) }
     *   - `uniform sampler2D foo;`  → registers a uniform { value: null }
     *     (and, if the line contains "repeat", a getTexture for repeat-wrap)
     *
     * The detected adders are stashed into `window[vsName]` as a single
     * function — called by the renderer for every Mesh that uses this shader,
     * giving each its own copy of the auto-uniforms.
     */
    Shader.runPreProcess = function (shader) {
      shader.vertexShader   = Shader.process(Shaders.getShader(shader.vsParam + '.vs'), 'vs', shader, shader.onBeforeBuild);
      shader.fragmentShader = Shader.process(Shaders.getShader(shader.fsParam + '.fs'), 'fs', shader, shader.onBeforeBuild);

      if (!shader.vertexShader.includes('//js') || window[shader.vsName]) return;

      const code = shader.vertexShader.split('\n');
      const adders = [];
      code.forEach((line) => {
        if (line.includes('//js')) {
          const name  = line.split(' ')[2].replace(';', '');
          const value = line.split('//js ')[1].replace(';', '');
          adders.push((obj) => { obj[name] = { value: eval(value) }; });
        } else if (line.includes('sampler2D')) {
          const name = line.split(' ')[2].replace(';', '');
          if (name.includes('sampler')) return; // skip sampler3D, samplerCube, etc.
          adders.push((obj) => {
            obj[name] = { value: null };
            if (line.includes('repeat')) obj[name].getTexture = Utils3D.getRepeatTexture;
          });
        }
      });

      window[shader.vsName] = function (_mesh, _shader) {
        const uniforms = {};
        adders.forEach((addTo) => addTo(uniforms));
        _shader.addUniforms(uniforms);
      };
    };

    /*
     * The big GLSL header-injection pass. Produces a self-contained 300-es
     * (or WebGL1 equivalent) shader by prepending:
     *   - GLSL version + needed extensions (drawBuffers, derivatives, LOD,
     *     external OES image on Android AURA, etc.).
     *   - Precision qualifiers for float/int and (WebGL2) sampler3D/usampler/
     *     isampler.
     *   - Stage-specific built-in attributes (uv/position/normal on vs).
     *   - The std140 `global` UBO mirror — projection/view/cameraPosition/
     *     cameraQuaternion/resolution/time/timeScale.
     *   - A `__ACTIVE_THEORY_LIGHTS__` marker that `onBeforeCompile` swaps
     *     out for the actual lights/shadow uniforms once Lighting has
     *     resolved the count.
     *   - `#define AURA` when the host page is the AURA web-app (gates
     *     AR/face-tracking codepaths).
     *   - Caller-supplied `defines`.
     *
     * Then it scans the user code for `uniform sampler2D foo` lines and
     * registers an empty `{ value: null }` uniform so the renderer has
     * somewhere to write to.
     *
     * If ssReflections is on, inject the deferred-buffer outputs at the top
     * of `main()` (fs) — writes ssReflectivity / IORrefl / rougness / GI
     * intensity to MRT slots through the `#drawbuffer` directive.
     */
    Shader.process = function (code, type, self, _onBeforeBuild) {
      const WEBGL2 = Renderer.type == Renderer.WEBGL2;
      if (!code) throw 'No shader found! ' + self.vsName + ' | ' + self.fsName;

      // Capability detection for WebGL1 extension fallbacks.
      const externalOES   = code.includes('samplerExternalOES') && window.AURA && 'android' == Device.system.os;
      const standardDeriv = !WEBGL2 && code.includes(['fwidth', 'dFdx', 'dFdy']);
      const drawBuffers   = !WEBGL2 && code.includes(['gl_FragData', '#drawbuffer']) &&
                            window.World && World.NUKE.useDrawBuffers;
      let levelOfDetail   = !WEBGL2 && code.includes([
        'textureGrad', 'textureProjGrad', 'texture2DGrad', 'textureCubeGrad', 'texture2DProjGrad',
      ]);
      if (!levelOfDetail && !WEBGL2 && 'fs' === type) {
        levelOfDetail = code.includes(['textureLod', 'texture2DLod', 'textureCubeLod', 'texture2DProjLod']);
      }
      const layoutsDefined = code.includes('layout') || self.ssReflections;

      let header;
      if ('vs' == type) {
        header = [
          '#version 300 es',
          externalOES   ? '#extension GL_OES_EGL_image_external_essl3 : require' : '',
          levelOfDetail ? '#extension GL_EXT_shader_texture_lod : enable'        : '',
          `precision ${self.precision}p float;`,
          `precision ${self.precision}p int;`,
          WEBGL2 ? `precision ${self.precision}p sampler3D;`  : '',
          WEBGL2 ? `precision ${self.precision}p usampler2D;` : '',
          WEBGL2 ? `precision ${self.precision}p isampler2D;` : '',
          'attribute vec2 uv;',
          'attribute vec3 position;',
          'attribute vec3 normal;',
          'uniform mat3 normalMatrix;',
          'uniform mat4 modelMatrix;',
          'uniform mat4 modelViewMatrix;',
          'uniform global {',
          'mat4 projectionMatrix;',
          'mat4 viewMatrix;',
          'vec3 cameraPosition;',
          'vec4 cameraQuaternion;',
          'vec2 resolution;',
          'float time;',
          'float timeScale;',
          '};',
        ].join('\n');
      } else {
        header = [
          '#version 300 es',
          externalOES   ? '#extension GL_OES_EGL_image_external_essl3 : require' : '',
          standardDeriv ? '#extension GL_OES_standard_derivatives : enable'      : '',
          drawBuffers   ? '#extension GL_EXT_draw_buffers : require'             : '',
          levelOfDetail ? '#extension GL_EXT_shader_texture_lod : enable'        : '',
          `precision ${self.precision}p float;`,
          `precision ${self.precision}p int;`,
          WEBGL2 ? `precision ${self.precision}p sampler3D;`  : '',
          WEBGL2 ? `precision ${self.precision}p usampler2D;` : '',
          WEBGL2 ? `precision ${self.precision}p isampler2D;` : '',
          'uniform mat3 normalMatrix;',
          'uniform mat4 modelMatrix;',
          'uniform mat4 modelViewMatrix;',
          'uniform global {',
          'mat4 projectionMatrix;',
          'mat4 viewMatrix;',
          'vec3 cameraPosition;',
          'vec4 cameraQuaternion;',
          'vec2 resolution;',
          'float time;',
          'float timeScale;',
          '};',
          layoutsDefined ? '' : 'out vec4 FragColor;',
        ].join('\n');
      }

      // Lights placeholder — substituted by `onBeforeCompile` once Lighting
      // has resolved the per-shader light count.
      header += '\n__ACTIVE_THEORY_LIGHTS__\n\n';
      if (window.AURA) header += '#define AURA\n';
      if (self.defines) self.defines.forEach((d) => (header += `#define ${d.toUpperCase()}\n`));

      // Caller hook — can rewrite raw user code before we splice it into the
      // composed shader (e.g., inject custom defines per material instance).
      if (_onBeforeBuild) code = _onBeforeBuild(code, type);

      // ssReflections: deferred-buffer varying contract.
      if (self.ssReflections) {
        header += [
          'uniform float ssReflectivity;',
          'uniform float ssIORrefl;',
          'uniform float ssRougness;',
          'uniform float ssgiIntensity;',
          'uniform sampler2D tReflectivity;',
          'uniform sampler2D tRoughness;',
          'varying vec4 vPosDeferred;',
          'varying vec3 vNormalDeferred;',
          'varying vec2 vST;',
        ].join('\n');
      }

      // Auto-register uniform sampler2D declarations so the renderer has a
      // matching JS slot for every texture name the shader references.
      const split = code.split('\n');
      for (let i = split.length - 1; i > -1; i--) {
        const line = split[i];
        if (line.includes('uniform sampler2D')) {
          const name = line.split('sampler2D ')[1].replace(';', '').trim();
          if (!self.uniforms[name]) self.uniforms[name] = { value: null };
        }
      }

      code = header + code;

      // ssReflections fs: write the MRT slots at the top of main().
      if (self.ssReflections && 'fs' == type) {
        const buffersDeferred = `
            float ssReflectionMap = texture(tReflectivity, vST).r;
            float ssRougnessMap = texture(tRoughness, vST).r;
            #drawbuffer PositionLayer gl_FragColor = vPosDeferred;
            #drawbuffer NormalsLayer gl_FragColor = vec4(vNormalDeferred, 1.);
            #drawbuffer ReflectivityLayer gl_FragColor = vec4(ssIORrefl, ssReflectivity * ssReflectionMap, ssRougness * ssRougnessMap, ssgiIntensity);
            `;
        const main = code.split('main() {');
        main[1] = '\n' + buffersDeferred + main[1];
        code = main.join('main() {');
      }

      return code;
    };

    const prototype = Shader.prototype;

    /*
     * Copy uniforms from this shader to another.
     *   linked=true   → both shaders share the same uniform object (so live
     *                   updates propagate). Useful for follower shaders.
     *   linked=false  → shallow snapshot { type, value }.
     *   ignore        → optional array of keys to skip.
     */
    prototype.copyUniformsTo = function (shader, linked, ignore) {
      for (const key in this.uniforms) {
        if (undefined === this.uniforms[key]) continue;
        if (ignore && ignore.includes?.(key)) continue;
        shader.uniforms[key] = linked
          ? this.uniforms[key]
          : { type: this.uniforms[key].type, value: this.uniforms[key].value };
      }
    };

    /* Share the *whole* uniforms map (including the renderer's internal
     * `_uniformKeys` / `_uniformValues` caches) — used by hot-reload to swap
     * a program without re-resolving every uniform location. */
    prototype.replicateUniformsTo = function (shader) {
      shader.uniforms       = this.uniforms;
      shader._uniformKeys   = this._uniformKeys;
      shader._uniformValues = this._uniformValues;
    };

    /* Merge a uniform dictionary in. During hot-reload, existing values are
     * preserved (so tween state isn't reset). */
    prototype.addUniforms = function (uniforms) {
      if (uniforms.UILPrefix) { this.UILPrefix = uniforms.UILPrefix; delete uniforms.UILPrefix; }
      for (const key in uniforms) {
        if (this.hotReloading && this.uniforms[key]) continue;
        this.uniforms[key] = uniforms[key];
      }
    };

    prototype.draw = function (mesh, geom) {
      // Lazy lighting wiring: first draw resolves the lights array for this
      // shader so subsequent draws can reuse the cached `__lighting` block.
      if (this.receiveLight && !this.__lighting) Lighting.getLighting(this);
      Shader.renderer.draw(this, mesh, geom);
    };

    prototype.upload = function (mesh, geom) {
      // Restore the receive-shadow flag if a previous shader of this pair had
      // it (the static map tracks vs/fs name).
      if (!this.receiveShadow && Shader.shouldReceiveShadow(this)) this.receiveShadow = true;
      Shader.renderer.upload(this, mesh, geom);
      if (this.receiveShadow && !this.shadow) Lighting.initShadowShader(this, mesh);
    };

    prototype.destroy = function () {
      if (!this.persists) {
        Shader.renderer.destroy(this);
        if (this.shadow) this.shadow.destroy();
      }
      if (this.receiveLight) Lighting.destroyShader(this);
    };

    /*
     * Last-mile GLSL fixup, called by the backend renderer right before the
     * shader is handed to the GL compiler. Steps:
     *   1. Walk up the parent chain to find the owning Scene (so nuke can
     *      do its own onBeforeShaderCompile hook).
     *   2. ssReflections vertex-shader splice (deferred varyings).
     *   3. Strip `#drawbuffer Color` markers (handled by the MRT layer);
     *      collect every `varying ...` / `uniform ...` line.
     *   4. Deduplicate varyings/uniforms by removing all-but-first occurrence
     *      of any line that appears more than once (cheap dedup — caller may
     *      have prepended a header that duplicates user declarations).
     *   5. WebGL2: gl_FragColor → FragColor; WebGL1: strip #applyShadow.
     *   6. Substitute `__ACTIVE_THEORY_LIGHTS__` with the real lights/shadow
     *      uniform block (or empty).
     *   7. If the code references SHADOW_MAPS, run it through the optimizer
     *      with the resolved shadow count.
     *   8. Caller-supplied `preCompile` hook.
     *   9. ShaderCode converter for WebGL1↔2 syntax differences.
     */
    prototype.onBeforeCompile = function (code, type) {
      const WEBGL2 = Renderer.type == Renderer.WEBGL2;
      code = code.trim();
      if ('}' != code[code.length - 1]) code += '\n}';

      // Find the owning Scene up the parent chain (defaults to World.SCENE).
      let scene = World.SCENE;
      for (let p = this.mesh; p; p = p._parent) {
        if (p instanceof Scene) scene = p;
      }

      // Hand off to the scene's nuke (post-processing) for any per-shader
      // tweaks (e.g. injecting bloom/SSAO-related defines). If there is no
      // nuke hook, resolve the precompile promise immediately so anyone
      // awaiting can proceed.
      if (scene.nuke && scene.nuke.onBeforeShaderCompile) {
        scene.nuke.onBeforeShaderCompile(this.mesh);
      } else {
        this.onBeforePrecompilePromise.resolve();
      }

      if (this.receiveShadow) this.receiveLight = true;

      // Pass 1: per-line scan for declarations + #drawbuffer rewrites.
      if (this.ssReflections) code = setupssReflections(code, type, this);
      const varyings = [], uniforms = [];
      const lines = code.split('\n');
      lines.forEach((line, index) => {
        if ('fs' == type && line.includes('#drawbuffer')) {
          // `#drawbuffer Color` is the default-color attachment marker —
          // strip it; everything else (NormalsLayer, ReflectivityLayer, …)
          // is handled by the MRT layer and dropped here so the GLSL parses.
          if (line.includes('#drawbuffer Color')) lines[index] = line.replace('#drawbuffer Color', '');
          else                                   lines[index] = '';
        }
        if (line.includes('varying')) varyings.push(line.trim());
        if (line.includes('uniform')) uniforms.push(line.trim());
      });
      code = lines.join('\n');

      // Dedup helper — removes (count - 1) trailing occurrences of every line
      // that appears more than once. The first occurrence is kept (so
      // ordering remains stable for shader-introspection tools).
      const process = function (array) {
        let replace;
        const counts = [];
        array.forEach((value) => {
          let count = 0;
          array.forEach((v2) => { if (value == v2) count++; });
          if (count > 1) {
            if (!replace) replace = [];
            if (!replace.includes(value)) { replace.push(value); counts.push(count); }
          }
        });
        if (!replace) return;
        replace.forEach((value, i) => {
          const count = counts[i];
          for (let j = 0; j < count - 1; j++) {
            const index = code.lastIndexOf(value);
            code = code.substring(0, index) + code.substring(index + value.length);
          }
        });
      };
      process(varyings);
      process(uniforms);

      // WebGL2 uses a named `out vec4 FragColor`; WebGL1 keeps gl_FragColor
      // and uses a separate #applyShadow macro that we strip here.
      if ('fs' == type) {
        if (WEBGL2) {
          if (code.includes('gl_FragColor')) code = code.replace(/gl_FragColor/g, 'FragColor');
        } else if (code.includes('#applyShadow')) {
          code = code.replace('#applyShadow', '');
        }
      }

      // Expand the lights marker.
      code = code.replace('__ACTIVE_THEORY_LIGHTS__', getLightingCode(this));

      // SHADOW_MAPS preprocessing: run a GLSL optimizer pass with the
      // resolved shadow count baked in (loops become countable, etc.).
      if ('fs' == type && code.includes('SHADOW_MAPS')) {
        code = require('GLSLOptimizer')(code.replaceAll('SHADOW_COUNT', Lighting.getShadowCount(this)));
      }

      if (this.preCompile) code = this.preCompile(code, type);

      // Final GLSL-version conversion.
      const converter = require('ShaderCode');
      return WEBGL2
        ? converter.convertWebGL2(code, type)
        : converter.convertWebGL1(code, type);
    };

    /* Set a uniform value. Clears any running tween so a manual `set` wins.
     * For UBO-backed uniforms, mark the UBO dirty so the next bind re-uploads. */
    prototype.set = function (key, value, ref) {
      const self = ref || this;
      if (!self.uniforms[key]) {
        console.warn(`No key ${key} found on shader`, self);
        return;
      }
      if (undefined !== value) {
        TweenManager.clearTween(self.uniforms[key]);
        self.uniforms[key].value = value;
        if (self.ubo) self.ubo.needsUpdate = true;
      }
      return self.uniforms[key].value;
    };

    prototype.get = function (key, ref) {
      const self = ref || this;
      return self.uniforms[key] && self.uniforms[key].value;
    };

    /* Tween a uniform. For numeric values we tween the wrapping `{ value }`
     * object; for compound values (Vector, Color, …) we tween the value
     * object itself in place. */
    prototype.tween = function (key, value, time, ease, delay, callback, update, scaledTime) {
      if ('number' == typeof value) {
        return tween(this.uniforms[key], { value: value }, time, ease, delay, callback, update, null, scaledTime);
      }
      return tween(this.uniforms[key].value, value, time, ease, delay, callback, update, null, scaledTime);
    };

    /*
     * Clone the shader: same vs/fs and params, fresh GL program. Cloning a
     * shadow-receiver also clones the shadow setup unless `noShadows` is
     * passed. We deep-copy every uniform (so independent tween/animation),
     * but skip cached names, raw uniforms, `_uniform*` and `_gl*` (they're
     * recreated by the renderer) and any functions (those live on prototype).
     */
    prototype.clone = function (noShadows, postfix) {
      const self = this;
      if (noShadows) self.params.receiveShadow = false;
      const shader = new Shader(self.vsParam, self.fsParam, self.params, null, postfix);
      for (const key in self) {
        if (key.includes(['vsName', 'fsName', 'uniforms', '_uniform', '_gl'])) continue;
        if ('function' == typeof self[key]) continue;
        shader[key] = self[key];
      }
      for (const key in self.uniforms) {
        shader.uniforms[key] = { type: self.uniforms[key].type, value: self.uniforms[key].value };
      }
      return shader;
    };

    /* Destroy the program and re-process both stages — used after a shader
     * source edit (hot reload) when we don't want to throw away uniforms. */
    prototype.resetProgram = function () {
      this.destroy();
      this.vertexShader   = this.restoreVS || Shader.process(Shaders.getShader(this.vsName + '.vs'), 'vs', this, this.onBeforeBuild);
      this.fragmentShader = this.restoreFS || Shader.process(Shaders.getShader(this.fsName + '.fs'), 'fs', this, this.onBeforeBuild);
    };

    // ── receiveShadow setter: static tracking + auto-uniform ─────────────────
    // The static `_shaderShadowMap` survives Shader instances so reloads /
    // clones inherit the shadow-receiver state of any previous instance with
    // the same vs/fs name. Setting it to true also seeds a single empty
    // texture into `uniforms.shadowMap` so the shader compiles even before
    // Lighting populates the real maps.
    const _shaderShadowMap = {};
    let _emptyShadowMap;
    Object.defineProperty(prototype, 'receiveShadow', {
      set: function (v) {
        _shaderShadowMap[this.vsName + '_' + this.fsName] = v;
        this._receiveShadow = v;
        if (v && !this.uniforms.shadowMap) {
          if (!_emptyShadowMap) _emptyShadowMap = [Utils3D.getEmptyTexture()];
          this.uniforms.shadowMap = { value: _emptyShadowMap };
        }
      },
      get: function () { return this._receiveShadow; },
    });

    // ── preprocess de-dup table ──────────────────────────────────────────────
    // Keyed by `vsName_vsName_customCompile` (note: vsName twice — matches
    // the original; the customCompile term differentiates per-permutation
    // shader variants). Once any instance has been through `runPreProcess`,
    // future instances skip the source-scan step.
    const shaders = {};

    Shader.hasAlreadyPreProcessed = function (shader) {
      const key = shader.vsName + '_' + shader.vsName + '_' + shader.customCompile;
      return shaders[key];
    };
    Shader.registerPreProcess = function (shader) {
      const key = shader.vsName + '_' + shader.vsName + '_' + shader.customCompile;
      shaders[key] = true;
    };
    Shader.shouldReceiveShadow = function (shader) {
      return _shaderShadowMap[shader.vsName + '_' + shader.fsName];
    };
  },
);

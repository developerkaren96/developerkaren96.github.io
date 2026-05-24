/*
 * Nuke — the top-of-stack post-processing controller.
 *
 * Owns the *pingpong* render-targets that downstream passes (NukePass
 * subclasses) sample/write through. Each call to `render()`:
 *
 *   1. Filters `self.passes` down to enabled passes; if none and the
 *      pipeline isn't required (no dpr mismatch, no multisample),
 *      renders the scene straight to `self.rtt` (or to screen) and
 *      bails out.
 *   2. Otherwise, renders the scene once into `_rttBuffer` (the input
 *      buffer, which may have multiple draw-buffer attachments for
 *      FXLayer output), then sweeps the enabled passes in order:
 *      `_rttBuffer → ping → pong → ping → …`, finishing into
 *      `self.rtt` (or screen for the very last pass).
 *
 * Pingpong RTs are shared globally across all Nuke instances at the
 * same `(width, height, format, multisample, samples)` shape via the
 * static `Nuke.getRT` pool — only the *input* RT (`_rttBuffer`) is
 * per-instance (it can have draw-buffer attachments unique to this
 * pipeline) and per-pass scissor / multisample state.
 *
 * Draw-buffer (MRT) integration:
 *   - `attachDrawBuffer(texture)` registers an extra colour
 *     attachment that an FXLayer wants written alongside `tDiffuse`.
 *   - `onBeforeShaderCompile(obj)` post-processes a shader's
 *     fragment source so any `#drawbuffer` markers route to the
 *     matching `layout(location=N) out vec4 …` (WebGL2) or
 *     `gl_FragData[N]` (WebGL1 with GL_EXT_draw_buffers) slot. The
 *     main `gl_FragColor` write is rewritten to a `tmpFragColor`
 *     temp so it can be steered into the location-0 slot too.
 *
 * Lifecycle hooks fired during `render()`:
 *   Nuke.RENDER, Nuke.BEFORE_PASSES, Nuke.BEFORE_POST_RENDER,
 *   Nuke.POST_RENDER — plus `self.onBefore{Render,Process,Passes}`
 *   and `self.postRender` direct callbacks.
 *
 * `self.useDrawBuffers` defaults to true on WebGL2 / Metal but can be
 * forced off via `?noDrawBuffers` query, `Nuke.NO_DRAWBUFFERS` flag,
 * or explicit `_params.useDrawBuffers = false`.
 *
 * Static side: `Nuke.getRT` is the pool getter; `Nuke.renameRT`
 * re-keys a pooled RT after a resize so its slot survives.
 */
Class(
  function Nuke(_stage, _params) {
    Inherit(this, Component);
    const self = this;

    if (!_params.renderer) console.error('Nuke :: Must define renderer');

    self.stage = _stage;
    self.renderer = _params.renderer;
    self.camera = _params.camera;
    self.scene = _params.scene;
    self.rtt = _params.rtt;
    self.enabled = _params.enabled != 0;
    self.passes = _params.passes || [];
    self.format = _params.format || Texture.RGBFormat;
    self.useDrawBuffers =
      !Utils.query('noDrawBuffers') &&
      !Nuke.NO_DRAWBUFFERS &&
      (_params.useDrawBuffers !== undefined
        ? _params.useDrawBuffers
        : !(Renderer.type != Renderer.WEBGL2 && !window.Metal));

    let _width;
    let _height;
    let _nukeMesh;
    let _rttPing;
    let _rttPong;
    let _rttBuffer;
    const _finalTexture = { texture: Utils3D.getEmptyTexture() };
    let _dpr = _params.dpr || 1;
    const _drawBuffers = [];
    const _enabledPasses = [];
    const _multisample = _params.multisample || false;
    const _samplesAmount = _params.samplesAmount || 4;

    function resizeHandler() {
      const width = self.stage.width * _dpr;
      const height = self.stage.height * _dpr;
      _rttPing.setSize(width, height);
      _rttPong.setSize(width, height);
      _rttBuffer.setSize(width, height);
      Nuke.renameRT(_width, _height, width, height, false, 1, self.format, false, _samplesAmount);
      Nuke.renameRT(_width, _height, width, height, false, 2, self.format, false, _samplesAmount);
      Nuke.renameRT(
        _width,
        _height,
        width,
        height,
        self.useDrawBuffers,
        -1,
        self.format,
        _multisample,
        _samplesAmount,
      );
      _width = width;
      _height = height;
    }

    self.scene.nuke = self;

    // Lazy-create a global default passthrough; first-instance wins.
    (function initDefaultPass() {
      if (Nuke.defaultPass) return;
      Nuke.defaultPass = new BlitPass();
      const upload = Nuke.defaultPass.upload;
      Nuke.defaultPass.upload = function () {
        upload.apply(this, arguments);
        Nuke.defaultPass.uploaded = true;
      };
    })();

    (function initNuke() {
      const width = self.stage.width * _dpr;
      const height = self.stage.height * _dpr;
      _rttPing = Nuke.getRT(width, height, false, 1, self.format, false, _samplesAmount);
      _rttPong = Nuke.getRT(width, height, false, 2, self.format, false, _samplesAmount);
      _rttBuffer = Nuke.getRT(
        width,
        height,
        self.useDrawBuffers,
        -1,
        self.format,
        _multisample,
        _samplesAmount,
      );
      _nukeMesh = new Mesh(World.QUAD, null);
      _nukeMesh.frustumCulled = false;
      _nukeMesh.noMatrices = true;
      _nukeMesh.transient = true;
      _width = width;
      _height = height;
      if (_params.vrRT) {
        self.vrRT = true;
        _rttBuffer.vrRT = true;
      }
    })();

    self.events.sub(Events.RESIZE, resizeHandler);

    self.forceResize = resizeHandler;

    // Late shader hook: when the renderer is about to compile a
    // fragment shader belonging to this Nuke's scene and FXLayer
    // draw-buffer targets are attached, rewrite the FS to route
    // gl_FragColor / named outputs to the right MRT slots.
    self.onBeforeShaderCompile = function (obj) {
      if (!obj) return;
      const shader = obj.shader;
      if (!(shader && shader.fragmentShader && self.useDrawBuffers && _drawBuffers.length)) return;
      if (shader.fragmentShader.includes('layout(location')) return;
      const WEBGL2 = Renderer.type == Renderer.WEBGL2;
      let matched = false;

      _drawBuffers.forEach((t, i) => {
        const name = t.fxLayer.getName();
        const keyExpr = WEBGL2
          ? new RegExp(`\\b${name}\\s*=`)
          : new RegExp(`\\bgl_FragData\\[${i + 1}\\]\\s*=`);
        let defaultOutput = t.fxLayer.defaultOutputColor || 'vec4(0.0)';
        if (defaultOutput === 'Color') defaultOutput = 'tmpFragColor';

        if (!keyExpr.test(shader.fragmentShader) && self.useDrawBuffers) {
          let fs = shader.fragmentShader;
          if (!fs.includes(`#drawbuffer ${name} gl_FragColor`)) {
            const idx = fs.lastIndexOf('}');
            fs =
              fs.slice(0, idx) +
              `#drawbuffer ${name} gl_FragColor = ${defaultOutput};\n` +
              fs.slice(idx);
            shader.fragmentShader = fs;
          }
          t.fxLayer.add(obj);
          matched = true;
        }
      });

      const colorWritten = (WEBGL2 ? /\bColor\s*=/ : /\bgl_FragData\[0\]\s*=/).test(
        shader.fragmentShader,
      );
      if (!colorWritten) {
        let fs = shader.fragmentShader;
        if (!fs.includes('layout(location=0) out vec4 reflectionsData')) {
          if (!WEBGL2) fs = '#extension GL_EXT_draw_buffers : require\n' + fs;
          const parts = fs.split('void main() {');
          fs = parts[0] + 'void main() {\nvec4 tmpFragColor;\n' + parts[1];
          fs = fs.replace(/gl_FragColor/g, 'tmpFragColor');
          const idx = fs.lastIndexOf('}');
          if (matched) {
            fs = WEBGL2
              ? fs.slice(0, idx) + 'Color = tmpFragColor;\n' + fs.slice(idx)
              : fs.slice(0, idx) + 'gl_FragData[0] = tmpFragColor;\n' + fs.slice(idx);
          } else {
            fs =
              fs.slice(0, idx) + '#drawbuffer Color gl_FragColor = tmpFragColor;\n' + fs.slice(idx);
          }
        }
        shader.fragmentShader = fs;
      }
      shader.onBeforePrecompilePromise.resolve();
    };

    self.add = function (pass, index) {
      if (typeof index != 'number') self.passes.push(pass);
      else self.passes.splice(index, 0, pass);
    };

    self.remove = function (pass) {
      if (typeof pass == 'number') self.passes.splice(pass);
      else self.passes.remove(pass);
    };

    self.render = function (directCallback) {
      if (self.paused) return;
      RenderStats.update('Nuke');
      RenderManager.fire(self);
      self.events.fire(Nuke.RENDER, self, true);
      self.onBeforeRender && self.onBeforeRender();

      const count = self.passes.length;
      _enabledPasses.length = 0;
      for (let i = 0; i < count; i++) {
        const pass = self.passes[i];
        if (!pass.disabled) _enabledPasses.push(pass);
      }

      // Force the default blit pass in when we still need a copy
      // because dpr / multisample requires a resolve step.
      if (
        self.enabled &&
        _enabledPasses.length === 0 &&
        !self.rtt &&
        (_dpr !== Device.pixelRatio || _multisample) &&
        Nuke.defaultPass
      ) {
        _enabledPasses.push(Nuke.defaultPass);
      }

      if (!self.enabled || !_enabledPasses.length) {
        const autoClear = self.renderer.autoClear;
        if (self.autoClear == 0) self.renderer.autoClear = false;
        self.renderer.render(self.scene, self.camera, self.rtt, null, directCallback);
        self.onBeforeProcess && self.onBeforeProcess();
        self.events.fire(Nuke.BEFORE_PASSES, self, true);
        self.events.fire(Nuke.BEFORE_POST_RENDER, self, true);
        self.postRender && self.postRender();
        self.events.fire(Nuke.POST_RENDER, self, true);
        if (self.autoClear == 0) {
          self.renderer.autoClear = autoClear;
          self.renderer.clearColor();
        }
        return;
      }

      RenderStats.update('NukePass', _enabledPasses.length);
      self.hasRendered = true;
      self.onBeforeProcess && self.onBeforeProcess();

      const autoClear = self.renderer.autoClear;
      if (self.autoClear == 0) self.renderer.autoClear = false;
      if (self.parent.scissor) _rttBuffer.scissor = self.parent.scissor;
      if (!self.preventNewRender) self.renderer.render(self.scene, self.camera, _rttBuffer);
      if (self.autoClear == 0) self.renderer.autoClear = autoClear;
      self.onBeforePasses && self.onBeforePasses(_rttBuffer);

      let pingPong = true;
      const skipMultisample = self.rtt && self.rtt.multisample;
      if (skipMultisample) self.rtt.multisample = false;

      const passCount = _enabledPasses.length;
      self.events.fire(Nuke.BEFORE_PASSES, self, true);
      for (let i = 0; i < passCount; i++) {
        const shader = _enabledPasses[i].pass;
        const inTexture =
          i === 0 ? _rttBuffer.texture : pingPong ? _rttPing.texture : _rttPong.texture;
        let outTexture = pingPong ? _rttPong : _rttPing;
        if (i === passCount - 1) outTexture = self.rtt;
        _nukeMesh.shader = shader;
        _nukeMesh.shader.depthTest = false;
        _nukeMesh.shader.depthWrite = false;
        _nukeMesh.shader.uniforms.tDiffuse.value = inTexture;
        if (self.parent.scissor) outTexture.scissor = self.parent.scissor;
        self.renderer.renderSingle(
          _nukeMesh,
          self.camera || World.CAMERA,
          outTexture,
          i === passCount - 1 ? directCallback : null,
        );
        _enabledPasses[i]?.onRenderCallBack?.();
        pingPong = !pingPong;
        if (outTexture) _finalTexture.texture = outTexture.texture;
      }
      if (skipMultisample) self.rtt.multisample = true;
      self.events.fire(Nuke.BEFORE_POST_RENDER, self, true);
      self.postRender && self.postRender();
      self.events.fire(Nuke.POST_RENDER, self, true);
      if (self.autoClear == 0) self.renderer.clearColor(_rttBuffer);
    };

    self.setSize = function (width, height) {
      if (width == _width && height == _height) return;
      _width = width;
      _height = height;
      resizeHandler();
      self.events.unsub(Events.RESIZE, resizeHandler);
    };

    self.attachDrawBuffer = function (texture) {
      if (self.hasRendered) {
        console.warn(
          'Attempt to attach draw buffer after first render! Create FXLayer instance before first render.',
        );
      }
      _drawBuffers.push(texture);
      if (_rttBuffer && _rttBuffer.attachments) {
        _rttBuffer.attachments = [
          self.rtt && self.rtt.attachments ? self.rtt.attachments[0] : _rttBuffer.attachments[0],
        ];
        for (let i = 0; i < _drawBuffers.length; i++) {
          _rttBuffer.attachments.push(_drawBuffers[i]);
          if (self.rtt && self.rtt.attachments) self.rtt.attachments.push(_drawBuffers[i]);
        }
      }
      return _drawBuffers.length;
    };

    self.upload = function () {
      if (self.passes.length && self.enabled) {
        _rttPing.upload();
        _rttPong.upload();
        _rttBuffer.upload();
      }
      if (_rttBuffer.depth) _rttBuffer.depth.upload();
      if (self.rtt) self.rtt.upload();
    };

    self.set('dpr', function (v) {
      _dpr = v;
      resizeHandler();
    });
    self.get('dpr', () => _dpr);

    self.get('output', () =>
      _nukeMesh.shader && _nukeMesh.shader.uniforms ? _nukeMesh.shader.uniforms.tDiffuse.value : null,
    );
    self.get('finalTexture', () => _finalTexture);
    self.get('rttBuffer', () => _rttBuffer);
    self.set('rttBuffer', (v) => {
      _rttBuffer = v;
    });
    self.get('prevFrameRT', () => (_rttBuffer && _rttBuffer.texture ? _rttBuffer.texture : null));
    self.get('nukeScene', () => _nukeScene);
    self.get('ping', () => _rttPing);
    self.get('pong', () => _rttPong);
    self.get('attachments', () => (_rttBuffer.attachments ? _rttBuffer.attachments.length : 0));

    self.disable = function () {
      self.enabled = false;
      self.passes.forEach((pass) => {
        pass.enabled = false;
      });
    };

    this.onDestroy = function () {
      _rttBuffer.destroy();
    };

    this.clearMemory = function () {
      _rttBuffer.destroy();
      _rttPing.destroy();
      _rttPong.destroy();
    };
  },
  // Static side.
  function () {
    Nuke.RENDER = 'nuke_render';
    Nuke.BEFORE_PASSES = 'nuke_before_passes';
    Nuke.BEFORE_POST_RENDER = 'nuke_before_post_render';
    Nuke.POST_RENDER = 'nuke_post_render';

    const _rts = {};

    Nuke.getRT = function (width, height, multi, index, format, multisample, samplesAmount) {
      const key = `${width}_${height}_${multi}_${index}_${format}_${multisample}_${samplesAmount}`;
      const exists = _rts[key];
      if (exists) return exists;
      const rt = multi
        ? Utils3D.createMultiRT(width, height, undefined, format, multisample, samplesAmount)
        : Utils3D.createRT(width, height, undefined, format, multisample, samplesAmount);
      if (Nuke.recyclePingPong && !multi) _rts[key] = rt;
      return rt;
    };

    Nuke.renameRT = function (
      prevWidth,
      prevHeight,
      width,
      height,
      multi,
      index,
      format,
      multisample,
      samplesAmount,
    ) {
      const newKey = `${width}_${height}_${multi}_${index}_${format}_${multisample}_${samplesAmount}`;
      const oldKey = `${prevWidth}_${prevHeight}_${multi}_${index}_${format}_${multisample}_${samplesAmount}`;
      _rts[newKey] = _rts[oldKey];
    };
  },
);

/*
 * FX.UnrealBloom — Unreal-style bloom postprocessing pass (port
 * of the technique popularised by Unreal Engine and used
 * verbatim in three.js's UnrealBloomPass).
 *
 * Pipeline:
 *   - Luminosity pre-pass: writes pixels above a threshold into
 *     a working RT (per-pixel `max(0, luma - threshold) * smoothing`).
 *   - MIP chain (`_nMips` levels, default 3): each level
 *     downscales the previous, then runs a separable Gaussian
 *     blur (horizontal pass into `_renderTargetsHorizontal[i]`,
 *     then vertical into `_renderTargetsVertical[i]`). DPR-aware
 *     so blur radius is consistent across DPRs.
 *   - Composite: weighted sum of all MIPs blended over the
 *     scene's main texture. Weights default to a falling geometric
 *     series; options can override.
 *
 * Constructor overloads:
 *   - `(nuke, options, unique)`     — explicit.
 *   - `(appState)`                  — `isAppState` payload with
 *     `nuke / unique / ...rest` → resolves nuke from parent →
 *     payload → `World.NUKE`.
 *   - `(uniqueString, ...)`         — first arg string → treat as
 *     uniqueness key; nuke = World.NUKE.
 *
 * Common options: `nMips`, `dpr`, `threshold`, `strength`,
 * `radius`, plus the per-MIP weight overrides.
 */
FX.Class(
  function UnrealBloom(_nuke, options, _unique) {
    Inherit(this, Component);
    var _triangleGeometry,
      _luminosityShader,
      _compositeShader,
      _mesh,
      _inputTexture,
      self = this;
    if ('object' == typeof _nuke && _nuke.isAppState) {
      let params = _nuke;
      _nuke = self.parent.nuke || params.nuke || World.NUKE;
      _unique = params.unique;
      options = params;
    }
    'string' == typeof options
      ? ((_unique = _params), (options = {}), (_nuke = World.NUKE))
      : 'string' == typeof _nuke
        ? ((_unique = _nuke), (options = {}), (_nuke = World.NUKE))
        : !_nuke || _nuke instanceof Nuke
          ? ((_nuke = _nuke || World.NUKE), (options = options || {}), (_unique = _unique || ''))
          : ((options = _nuke), (_nuke = World.NUKE));
    var _oldClearColor = new Color(),
      _oldClearAlpha = 1,
      _renderTargetsHorizontal = [],
      _renderTargetsVertical = [],
      _separableBlurShaders = [],
      _nMips = options.nMips || 3,
      _DPR = options.dpr || _nuke.dpr,
      _blurDirectionX = new Vector2(_DPR, 0),
      _blurDirectionY = new Vector2(0, _DPR),
      _kernelSizeArray = options.kernelSizeArray || [3, 5, 7, 9, 11],
      _bloomFactors = options.bloomFactors || [1, 0.8, 0.6, 0.4, 0.2],
      _useRTPool = false !== options.useRTPool;
    function render() {
      if (!self.enabled || false === self.visible) return;
      let renderer = _nuke.renderer;
      _oldClearColor.copy(renderer.getClearColor());
      _oldClearAlpha = renderer.getClearAlpha();
      let oldAutoClear = renderer.autoClear;
      renderer.autoClear = true;
      renderer.setClearColor(self.clearColor, 0);
      let inputRenderTarget = _inputTexture || _nuke.rttBuffer.texture;
      _luminosityShader.uniforms.luminosityThreshold.value > 0.01 &&
        ((_luminosityShader.uniforms.tDiffuse.value = inputRenderTarget),
        (_mesh.shader = _luminosityShader),
        renderer.renderSingle(_mesh, _nuke.camera, self.renderTargetBright),
        (inputRenderTarget = self.renderTargetBright));
      for (let i = 0; i < _nMips; i++) {
        _mesh.shader = _separableBlurShaders[i];
        _separableBlurShaders[i].uniforms.colorTexture.value = inputRenderTarget;
        _separableBlurShaders[i].uniforms.direction.value = _blurDirectionX;
        renderer.renderSingle(_mesh, _nuke.camera, _renderTargetsHorizontal[i]);
        _separableBlurShaders[i].uniforms.colorTexture.value = _renderTargetsHorizontal[i].texture;
        _separableBlurShaders[i].uniforms.direction.value = _blurDirectionY;
        renderer.renderSingle(_mesh, _nuke.camera, _renderTargetsVertical[i]);
        inputRenderTarget = _renderTargetsVertical[i];
      }
      _mesh.shader = _compositeShader;
      renderer.renderSingle(_mesh, _nuke.camera, _renderTargetsHorizontal[0]);
      renderer.setClearColor(_oldClearColor, _oldClearAlpha);
      renderer.autoClear = oldAutoClear;
    }
    function resizeHandler() {
      self.resolution.set(_nuke.stage.width, _nuke.stage.height).multiplyScalar(_DPR);
      _blurDirectionX.x = _DPR;
      _blurDirectionY.y = _DPR;
      let resx = Math.round(self.resolution.x / 2),
        resy = Math.round(self.resolution.y / 2);
      self.renderTargetBright && self.renderTargetBright.setSize(resx, resy);
      for (var i = 0; i < _renderTargetsHorizontal.length; i++) {
        _renderTargetsHorizontal[i].setSize(resx, resy);
        _renderTargetsVertical[i].setSize(resx, resy);
        let shader = _separableBlurShaders[i];
        shader && (shader.uniforms.texSize.value = new Vector2(resx, resy));
        resx = Math.round(resx / 2);
        resy = Math.round(resy / 2);
      }
    }
    this.uniforms = {
      tUnrealBloom: {
        value: null,
        ignoreUIL: true,
      },
      unique: _unique,
    };
    this.resolution = new Vector2(_nuke.stage.width * _DPR, _nuke.stage.height * _DPR);
    this.clearColor = new Color(0, 0, 0);
    this.enabled = undefined === options.enabled || options.enabled;
    this.outputTexture = null;
    (function initRTs() {
      if (FX.UnrealBloom.hasRTs) return;
      let pars = {
          minFilter: Texture.LINEAR,
          magFilter: Texture.LINEAR,
          format: Texture.RGBAFormat,
        },
        resx = Math.round(self.resolution.x / 2),
        resy = Math.round(self.resolution.y / 2);
      self.renderTargetBright = new RenderTarget(resx, resy, pars);
      self.renderTargetBright.texture.generateMipmaps = false;
      FX.UnrealBloom.putRT('renderTargetBright', self.renderTargetBright);
      for (let i = 0; i < _nMips; i++) {
        let renderTargetHorizonal = new RenderTarget(resx, resy, pars);
        renderTargetHorizonal.texture.generateMipmaps = false;
        _renderTargetsHorizontal.push(renderTargetHorizonal);
        FX.UnrealBloom.putRT('mipHorizontal' + i, renderTargetHorizonal);
        let renderTargetVertical = new RenderTarget(resx, resy, pars);
        renderTargetVertical.texture.generateMipmaps = false;
        _renderTargetsVertical.push(renderTargetVertical);
        FX.UnrealBloom.putRT('mipVertical' + i, renderTargetVertical);
        resx = Math.round(resx / 2);
        resy = Math.round(resy / 2);
      }
      self.outputTexture = _renderTargetsHorizontal[0].texture;
      self.uniforms.tUnrealBloom.value = _renderTargetsHorizontal[0].texture;
    })();
    (function initScene() {
      _triangleGeometry = World.QUAD;
      _luminosityShader = self.initClass(Shader, 'UnrealBloomLuminosity', {
        tDiffuse: {
          value: null,
          ignoreUIL: true,
        },
        luminosityThreshold: {
          value: 1,
        },
        smoothWidth: {
          value: 0.01,
          ignoreUIL: true,
        },
        defaultColor: {
          value: new Color(0),
          ignoreUIL: true,
        },
        defaultOpacity: {
          value: 0,
          ignoreUIL: true,
        },
        unique: _unique,
      });
      (_mesh = new Mesh(_triangleGeometry, _luminosityShader)).frustumCulled = false;
    })();
    (function initBlurShaders() {
      let resx = Math.round(self.resolution.x / 2),
        resy = Math.round(self.resolution.y / 2);
      for (let i = 0; i < _nMips; i++) {
        let shader = self.initClass(
          Shader,
          'UnrealBloomGaussian',
          {
            unique: _unique,
            colorTexture: {
              value: null,
            },
            texSize: {
              value: new Vector2(resx, resy),
            },
            direction: {
              value: new Vector2(0.5, 0.5),
            },
          },
          null,
          (glsl) =>
            `\n#define KERNEL_RADIUS ${_kernelSizeArray[i]}\n#define SIGMA ${_kernelSizeArray[i]}\n${glsl}`,
          `gaussian${i}`,
        );
        _separableBlurShaders.push(shader);
        resx = Math.round(resx / 2);
        resy = Math.round(resy / 2);
      }
    })();
    (function initCompositeShader() {
      let uniforms = {
        bloomStrength: {
          value: 1,
        },
        bloomTintColor: {
          value: new Color('#ffffff'),
        },
        bloomRadius: {
          value: 0,
        },
        unique: _unique,
      };
      for (let i = 0; i < _nMips; i++)
        uniforms[`blurTexture${i + 1}`] = {
          value: _useRTPool ? null : _renderTargetsVertical[i].texture,
          ignoreUIL: true,
        };
      (_compositeShader = self.initClass(
        Shader,
        'UnrealBloomComposite',
        uniforms,
        null,
        (glsl, type) => {
          if ('vs' === type) return glsl;
          let compositeUniforms = '',
            compositeMain = '';
          for (let i = 0; i < _nMips; i++) {
            compositeUniforms += `uniform sampler2D blurTexture${i + 1};\n`;
            compositeMain += `lerpBloomFactor(${_bloomFactors[i].toFixed(4)}) * vec4(bloomTintColor, 1.0) * texture2D(blurTexture${i + 1}, vUv) ${i < _nMips - 1 ? '+ ' : ''}`;
          }
          return (glsl = glsl.replace(
            'uniform sampler2D blurTexture1;',
            compositeUniforms,
          )).replace(
            'lerpBloomFactor(1.0) * vec4(bloomTintColor, 1.0) * texture2D(blurTexture1, vUv)',
            compositeMain,
          );
        },
      )).needsUpdate = true;
    })();
    (function initPass() {
      self.pass = self.initClass(NukePass, 'UnrealBloomPass', self.uniforms);
    })();
    (function addListeners() {
      self.events.sub(Events.RESIZE, resizeHandler);
      self.events.sub(_nuke, Nuke.BEFORE_PASSES, render);
      self.startRender(() => {});
    })();
    options.noUIL ||
      self.delayedCall((_) => {
        ShaderUIL.add(_luminosityShader).setLabel('UnrealBloom Luminosity');
        ShaderUIL.add(_compositeShader).setLabel('UnrealBloom Composite');
      }, 2e3);
    this.set('texture', (texture) => {
      _inputTexture = texture;
    });
    this.get('luminosityShader', (_) => _luminosityShader);
    this.get('compositeShader', (_) => _compositeShader);
    this.set('dpr', (dpr) => {
      _DPR = dpr;
      resizeHandler();
    });
    this.renderBloom = render;
    this.renderMesh = _mesh;
    this.onDestroy = function () {
      _renderTargetsHorizontal.forEach((r) => r.destroy());
      _renderTargetsVertical.forEach((r) => r.destroy());
      self.renderTargetBright && self.renderTargetBright.destroy();
    };
    this.getRTs = function () {
      const rt = FX.UnrealBloom.getRT;
      self.renderTargetBright = rt('renderTargetBright');
      _renderTargetsHorizontal = [];
      _renderTargetsVertical = [];
      for (let i = 0; i < _nMips; i++) {
        _renderTargetsHorizontal.push(rt('mipHorizontal' + i));
        _renderTargetsVertical.push(rt('mipVertical' + i));
        _compositeShader.uniforms[`blurTexture${i + 1}`].value = _renderTargetsVertical[i].texture;
      }
      self.outputTexture = _renderTargetsHorizontal[0].texture;
      self.uniforms.tUnrealBloom.value = _renderTargetsHorizontal[0].texture;
      resizeHandler();
    };
    this.putRTs = function () {
      self.renderTargetBright = null;
      _renderTargetsHorizontal = [];
      _renderTargetsVertical = [];
    };
    this.onInvisible = function () {
      self.putRTs();
      self.visible = false;
    };
    this.onVisible = function () {
      self.getRTs();
      self.visible = true;
    };
  },
  (_) => {
    var _pool = {};
    FX.UnrealBloom.putRT = function (key, rt) {
      FX.UnrealBloom.hasRTs = true;
      _pool[key] = rt;
    };
    FX.UnrealBloom.getRT = function (key) {
      return _pool[key];
    };
  },
);

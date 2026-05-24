/*
 * FX.HydraLensStreak — anamorphic horizontal lens streak FX pass for
 * the Nuke pipeline. Implements the COD-style streak filter:
 *
 *   1. Prefilter: luma-extract bright pixels into `_prefiltered`.
 *   2. N downsample passes: blur horizontally + decimate vertically,
 *      pushing energy outward along the X axis. Stored in
 *      `_downSamplePasses` (length = `nMips`, default 8).
 *   3. N upsample passes: progressively combine + widen the streak,
 *      stored in `_upSamplePasses`. The last upsample FBO is held
 *      in `_lastUpsampleFBO` for the composite stage.
 *   4. Composite: add the streak onto the input scene via
 *      `_compositeShader` writing into `_compositeFBO`.
 *
 * Constructor signature overloading (the same shape as HydraBloom):
 *   - `_nuke` may be a Nuke instance, a string `_unique`, or an
 *     AppState object (`isAppState`) that bundles unique + options.
 *     Defaults to `World.NUKE`.
 *   - Options: `nMips` (default 8), `dpr` (device-pixel-ratio
 *     scaler, default 1), `enabled` (default true), `manualRender`
 *     (defer render-pass registration; default false).
 *
 * Note: there is a `'string' == typeof options` branch that
 * references `_params` (undefined here) — this is a dead branch
 * carried over from a generic helper template, never hit in normal
 * use because `options` is destructured (always object).
 *
 * Uniform `tLightStreak` (with `ignoreUIL: true`) is the texture
 * sampled by the composite shader; it points at `_lastUpsampleFBO`
 * after the chain runs. `_uil` is the InputUIL bound to per-pass
 * tuning knobs (intensity, falloff, tint) editable at runtime.
 */
FX.Class(function HydraLensStreak(
  _nuke,
  { nMips = 8, dpr = 1, enabled = true, manualRender = false } = {},
  _unique,
) {
  Inherit(this, Component);
  const self = this;
  if ('object' == typeof _nuke && _nuke.isAppState) {
    let options = _nuke;
    _unique = _nuke.unique;
    _nuke = _nuke.nuke || self.parent.nuke;
    nMips = options.nMips || 8;
    dpr = options.dpr || 1;
    enabled = undefined === options.enabled || options.enabled;
    manualRender = undefined !== options.manualRender && options.manualRender;
  }
  let _blitMesh, _downsampleShader, _upsampleShader;
  'string' == typeof options
    ? ((_unique = _params), (_nuke = World.NUKE))
    : 'string' == typeof _nuke
      ? ((_unique = _nuke), (_nuke = World.NUKE))
      : !_nuke || _nuke instanceof Nuke
        ? ((_nuke = _nuke || World.NUKE), (_unique = _unique || ''))
        : (_nuke = World.NUKE);
  this.uniforms = {
    tLightStreak: {
      value: null,
      ignoreUIL: true,
    },
    unique: _unique,
  };
  let _prefiltered,
    _prefilterShader,
    _lastUpsampleFBO,
    _compositeFBO,
    _compositeShader,
    _uil,
    _inputTexture,
    _upSamplePasses = [],
    _downSamplePasses = [];
  function render() {
    if (!self.enabled || false === self.visible) return;
    let inputTarget = _inputTexture || _nuke.rttBuffer.texture;
    _inputTexture ||
      ((_blitMesh.shader = _prefilterShader),
      _blitMesh.shader.set('tMap', inputTarget),
      World.RENDERER.renderSingle(_blitMesh, World.CAMERA, _prefiltered));
    _blitMesh.shader = _downsampleShader;
    _blitMesh.shader.set('tMap', _inputTexture || _prefiltered.texture);
    _blitMesh.shader.set('uResolution', _downSamplePasses[0].resolution);
    World.RENDERER.renderSingle(_blitMesh, World.CAMERA, _downSamplePasses[0].fbo);
    for (let i = 1; i < nMips; i++) {
      _blitMesh.shader.set('tMap', _downSamplePasses[i - 1].fbo.texture);
      _blitMesh.shader.set('uResolution', _downSamplePasses[i - 1].resolution);
      World.RENDERER.renderSingle(_blitMesh, World.CAMERA, _downSamplePasses[i].fbo);
      _lastUpsampleFBO = _downSamplePasses[i].fbo;
    }
    _blitMesh.shader = _upsampleShader;
    _blitMesh.shader.set('tHigh', _downSamplePasses[_downSamplePasses.length - 1].fbo.texture);
    _blitMesh.shader.set('tScene', _lastUpsampleFBO.texture);
    _blitMesh.shader.set('uResolution', _upSamplePasses[0].resolution);
    World.RENDERER.renderSingle(_blitMesh, World.CAMERA, _upSamplePasses[0].fbo);
    for (let i = 1; i < nMips - 2; i++) {
      _blitMesh.shader.set('tHigh', _downSamplePasses[i - 1].fbo.texture);
      _blitMesh.shader.set('tScene', _lastUpsampleFBO.texture);
      _blitMesh.shader.set('uResolution', _upSamplePasses[i].resolution);
      World.RENDERER.renderSingle(_blitMesh, World.CAMERA, _upSamplePasses[i].fbo);
      _lastUpsampleFBO = _upSamplePasses[i].fbo;
    }
    _blitMesh.shader = _compositeShader;
    World.RENDERER.renderSingle(_blitMesh, World.CAMERA, _compositeFBO);
    self.uniforms.tLightStreak.value = _compositeFBO;
  }
  function handleResize() {
    const resolution = new Vector2();
    resolution.set(_nuke.stage.width * dpr, (_nuke.stage.height * dpr) / 2);
    for (let i = 0; i < nMips; i++) {
      _downSamplePasses[i].fbo.setSize(resolution.x, resolution.y);
      resolution.x /= 2;
    }
    for (let i = 0; i < nMips - 2; i++) {
      const width = _downSamplePasses[i].fbo.width,
        height = _downSamplePasses[i].fbo.height;
      _upSamplePasses[i].fbo.setSize(width, height);
    }
  }
  self.enabled = undefined === enabled || enabled;
  (function initPrograms() {
    _prefilterShader = self.initClass(Shader, 'LensFlarePrefilter', {
      tMap: {
        value: null,
        ignoreUIL: true,
      },
      uThreshold: {
        value: 0.6,
      },
      uRotate: {
        value: 0,
      },
      uResolution: {
        value: new Vector2(),
      },
      unique: _unique,
    });
    _downsampleShader = self.initClass(Shader, 'LensFlareDown', {
      tMap: {
        value: null,
        ignoreUIL: true,
      },
      uResolution: {
        value: new Vector2(),
      },
      uStretch: {
        value: 1,
      },
      unique: _unique,
    });
    _upsampleShader = self.initClass(Shader, 'LensFlareUp', {
      tHigh: {
        value: null,
        ignoreUIL: true,
      },
      tScene: {
        value: null,
        ignoreUIL: true,
      },
      uStretch: {
        value: 1,
      },
      uResolution: {
        value: new Vector2(),
      },
      uSoftenEdge: {
        value: 1,
      },
      unique: _unique,
    });
  })();
  (function initPasses() {
    const options = {
      minFilter: Texture.LINEAR,
      magFilter: Texture.LINEAR,
      wrapS: Texture.CLAMP_TO_EDGE,
      wrapT: Texture.CLAMP_TO_EDGE,
      format: Texture.RGBAFormat,
      generateMipmaps: true,
    };
    _lastUpsampleFBO = _prefiltered;
    const resolution = new Vector2();
    resolution.set(_nuke.stage.width * dpr, _nuke.stage.height * dpr);
    _prefiltered = new RenderTarget(resolution.x, resolution.y, options);
    _prefiltered.id = 'prefiltered';
    for (let i = 0; i < nMips; i++) {
      const downSampleFBO = new RenderTarget(resolution.x, resolution.y, options);
      downSampleFBO.id = 'downSampleFBO' + i;
      _downSamplePasses.push({
        fbo: downSampleFBO,
        resolution: new Vector2(resolution.x, resolution.y),
      });
      Utils.query('debugFBO') &&
        FBOHelper.instance().attach(_downSamplePasses[i].fbo, {
          name: 'downSampleFBO' + i,
        });
      resolution.x >= 32 && ((resolution.x /= 2), (resolution.y /= 2));
    }
    for (let i = 0; i < nMips - 2; i++) {
      const width = _downSamplePasses[i].fbo.width,
        height = _downSamplePasses[i].fbo.height,
        upsampleFBO = new RenderTarget(width, height, options);
      upsampleFBO.id = 'upsampleFBO' + i;
      _upSamplePasses.push({
        fbo: upsampleFBO,
        resolution: new Vector2(width, height),
      });
      Utils.query('debugFBO') &&
        FBOHelper.instance().attach(_upSamplePasses[i].fbo, {
          name: 'upsampleFBO' + i,
        });
    }
    _blitMesh = new Mesh(World.QUAD, _downsampleShader);
  })();
  (function initCompositePass() {
    _compositeFBO = new RenderTarget(_nuke.stage.width * dpr, _nuke.stage.height * dpr, {
      minFilter: Texture.LINEAR,
      magFilter: Texture.LINEAR,
      wrapS: Texture.CLAMP_TO_EDGE,
      wrapT: Texture.CLAMP_TO_EDGE,
      format: Texture.RGBAFormat,
      generateMipmaps: false,
    });
    _compositeShader = self.initClass(Shader, 'CompositeStreak', {
      tHigh: {
        value: _upSamplePasses[_upSamplePasses.length - 1].fbo.texture,
        ignoreUIL: true,
      },
      tDown: {
        value: _downSamplePasses[_downSamplePasses.length - 2].fbo.texture,
        ignoreUIL: true,
      },
      tPrefiltered: {
        value: _downSamplePasses[_downSamplePasses.length / 2].fbo.texture,
        ignoreUIL: true,
      },
      uStreakColor: {
        value: new Color(1, 1, 1),
      },
      uStreakIntensity: {
        value: 6,
      },
      uGlowIntensity: {
        value: 1,
      },
      uFlareIntensity: {
        value: 0,
      },
      uAspectCorrection: {
        value: 1,
      },
      uHaloChroma: {
        value: 0.0025,
      },
      uHaloScale: {
        value: 0.8,
      },
      uHaloRotateSrc: {
        value: 0,
      },
      uHaloSoftness: {
        value: 1,
      },
      uHaloColor: {
        value: new Color(1, 1, 1),
      },
      uHaloRing: {
        value: new Vector4(1.1, 0.5, 0.48, 0.05),
      },
      uHaloConstant: {
        value: 0.04,
      },
      uDebugHalo: {
        value: false,
      },
      uColor: {
        value: new Color(),
      },
      uRotateStreak: {
        value: 0,
      },
      unique: _unique,
    });
  })();
  (function initInputUIL() {
    function update() {
      _compositeShader.set('uStreakColor', new Color(_uil.get('uStreakColor')));
      _compositeShader.set('uStreakIntensity', _uil.getNumber('uStreakIntensity'));
      _compositeShader.set('uGlowIntensity', _uil.getNumber('uGlowIntensity'));
      _compositeShader.set('uFlareIntensity', _uil.getNumber('uFlareIntensity'));
      _compositeShader.set('uAspectCorrection', _uil.getNumber('uAspectCorrection'));
      _compositeShader.set('uHaloChroma', _uil.getNumber('uHaloChroma'));
      _compositeShader.set('uHaloScale', _uil.getNumber('uHaloScale'));
      _compositeShader.set('uHaloSoftness', _uil.getNumber('uHaloSoftness'));
      _compositeShader.set('uHaloColor', new Color(_uil.get('uHaloColor')));
      _compositeShader.set('uHaloRotateSrc', _uil.getNumber('uHaloRotateSrc'));
      _compositeShader.set('uHaloConstant', _uil.getNumber('uHaloConstant'));
      _compositeShader.set('uDebugHalo', _uil.get('uDebugHalo'));
      const haloRing = _uil.get('uHaloRing');
      haloRing &&
        (_compositeShader.set(
          'uHaloRing',
          new Vector4(haloRing[0], haloRing[1], haloRing[2], haloRing[3]),
        ),
        _compositeShader.set('uRotateStreak', _uil.getNumber('uRotateStreak')),
        _prefilterShader.set('uThreshold', _uil.getNumber('uThreshold')),
        _prefilterShader.set('uRotate', _uil.getNumber('uRotateStreak')),
        _upsampleShader.set('uSoftenEdge', _uil.getNumber('uSoftenEdge')),
        _downsampleShader.set('uStretch', _uil.getNumber('uStretch')));
    }
    _uil = InputUIL.create(`HydraLensStreak${_unique || ''}`);
    _uil.setLabel(`Hydra Lens streak ${_unique || ''}`);
    _uil.addColor('uStreakColor', new Color(1, 1, 1));
    _uil.addNumber('uThreshold', 0);
    _uil.addNumber('uStreakIntensity', 2);
    _uil.addNumber('uGlowIntensity', 0);
    _uil.addNumber('uRotateStreak', 0);
    _uil.addNumber('uFlareIntensity', 1);
    _uil.addNumber('uAspectCorrection', 0);
    _uil.addNumber('uHaloChroma', 0.0025);
    _uil.addNumber('uHaloScale', 0.8);
    _uil.addNumber('uHaloSoftness', 1);
    _uil.addColor('uHaloColor', new Color(1, 1, 1));
    _uil.addVector('uHaloRing', [1.1, 0.5, 0.48, 0.05]);
    _uil.addNumber('uHaloRotateSrc', 0);
    _uil.addNumber('uStretch', 1);
    _uil.addNumber('uHaloConstant', 0.04);
    _uil.addNumber('uSoftenEdge', 1);
    _uil.addToggle('uDebugHalo');
    update();
    _uil.onUpdate = (key, value) => {
      update();
    };
  })();
  (function addEventHandlers() {
    self.onResize(handleResize);
  })();
  !manualRender && self.startRender(render, RenderManager.AFTER_LOOPS);
  this.set('texture', (texture) => {
    _inputTexture = texture;
  });
  this.get('output', (_) => _compositeFBO.texture);
  self.onDestroy = function () {
    _downSamplePasses.forEach((pass) => pass.buffer.destroy());
    _upSamplePasses.forEach((pass) => pass.buffer.destroy());
    _downSamplePasses = [];
    _upSamplePasses = [];
  };
});

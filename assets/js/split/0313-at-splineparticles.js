/*
 * SplineParticles — Proton particle behavior that flows particles
 * along a baked spline atlas (from SplineLoader 0312). Decorates a
 * Proton instance with:
 *
 *   1. A sampling shader pass (`SplineParticleLife`) added at
 *      stage 0 of the antimatter pipeline. Outputs particle "life"
 *      data (uSetup=1 means initial seeding; flips to 0 after a
 *      100ms delayedCall to start advancing). Its uniforms drive
 *      the spline-following behaviour:
 *        - uDecayRate/Range, uFlowRange, uSplineSpeed,
 *          uTimeMultiplier, uStartOffset/Spacing — flow shape.
 *        - uMaxDelay / uMaxSDelay / uHoldBack(2) — staggered start.
 *        - uInfinite / uRelease / uIHold / uDelayStart — looping
 *          vs one-shot release.
 *        - uLifeSlow — vec4 channel-wise slowdown.
 *        - HZ = Render.HZ_MULTIPLIER — frame-rate normalisation.
 *      `ShaderUIL.add(pass, _group).setLabel('Life')` exposes them
 *      in the UIL editor.
 *
 *   2. Spline atlas uniforms on the proton behaviour & render
 *      shader: `tSpline`, `uSplineTexSize`, `uPerSpline`,
 *      `uSplineCount`, plus `tLifeData = _life.output`.
 *
 *   3. A small `InputUIL` config with `json` (path) and `infinite`
 *     (loop toggle). `infinite` is reflected into the life shader
 *     on change.
 *
 * Public API:
 *   - `loadFile(file)`         — load a new spline atlas (path or
 *     pre-loaded SplineLoader data object). Falls back to
 *     `self.parent.data.splineFile` or the config's `json`.
 *   - `loadConfig(fromKey, toKey)` — clone Spline & life uniforms
 *     between two prefixes in UILStorage (used by editor when
 *     duplicating a particle effect).
 *   - `release()` / `hold()` / `loop()` / `reset()` —  one-shot
 *     emit, freeze, infinite, full restart.
 *   - `set('releaseSections', n)` — divides the spline into N
 *     emit windows (cycles through them on each release()).
 *   - `set('holdBack', v)` — additional uHoldBack2 controls.
 *   - `get('splineJSON')` returns the configured path.
 *
 * Static block registers a `ProtonPresets` entry "Spline" that
 * stitches `splineparticles.fs` + `curl.glsl` + the body of
 * `SplineParticlePreset.fs` into a Proton preset, with default
 * thickness/distribution/curl uniforms.
 */
Class(
  function SplineParticles(_proton, _group, _input) {
    Inherit(this, Component);
    const self = this;
    var _config, _life;
    async function initFile(file) {
      if (
        (file ||
          (file =
            self.parent.data && self.parent.data.splineFile
              ? self.parent.data.splineFile
              : _config.get('json')),
        !file)
      )
        return (_proton.visible = _proton.group.visible = false);
      let data = 'string' == typeof file ? await SplineLoader.load(file) : file;
      _proton.behavior.addUniforms({
        tSpline: {
          value: data.texture,
          ignoreUIL: true,
        },
        uSplineTexSize: {
          value: data.textureSize,
          ignoreUIL: true,
        },
        uPerSpline: {
          value: data.perSpline,
          ignoreUIL: true,
        },
        uSplineCount: {
          value: data.splines,
          ignoreUIL: true,
        },
        uSetup: {
          value: 1,
          ignoreUIL: true,
        },
      });
      await (async function initLifeBehavior() {
        let pass = self.initClass(AntimatterPass, 'SplineParticleLife', {
          unique: _input.prefix,
          uMaxCount: _proton.behavior.uniforms.uMaxCount,
          uSplineCount: _proton.behavior.uniforms.uSplineCount,
          uSetup: _proton.behavior.uniforms.uSetup,
          tAttribs: _proton.behavior.uniforms.tAttribs,
          tOrigin: _proton.behavior.uniforms.tOrigin,
          uDecayRate: {
            value: 0,
          },
          uDecayRange: {
            value: new Vector2(1, 1),
          },
          uFlowRange: {
            value: new Vector2(1, 1),
          },
          uSplineSpeed: {
            value: new Vector2(1, 1),
          },
          uTimeMultiplier: {
            value: 1,
          },
          uStartOffset: {
            value: 0,
          },
          uStartSpacing: {
            value: 0,
          },
          uDelayStart: {
            value: 0,
            ignoreUIL: true,
          },
          uIHold: {
            value: 0,
            ignoreUIL: true,
          },
          uMaxDelay: {
            value: 0,
          },
          uMaxSDelay: {
            value: 0,
          },
          uHoldBack: {
            value: 0,
          },
          uHoldBack2: {
            value: 0,
            ignoreUIL: true,
          },
          uInfinite: {
            value: _config.get('infinite') ? 1 : 0,
            ignoreUIL: true,
          },
          uRelease: {
            value: new Vector2(0, 1),
            ignoreUIL: true,
          },
          uLifeSlow: {
            value: new Vector4(1, 1, 1, 1),
          },
          HZ: {
            value: Render.HZ_MULTIPLIER,
            ignoreUIL: true,
          },
        });
        ShaderUIL.add(pass, _group).setLabel('Life');
        pass.addInput('tPos', _proton.behavior.output);
        _proton.antimatter.addPass(pass, 0);
        _proton.behavior.addInput('tLife', pass.output);
        self.life = _life = pass;
      })();
      _config.onUpdate = (key) => {
        'infinite' == key && _life.setUniform('uInfinite', _config.get('infinite') ? 1 : 0);
      };
      _proton.behavior.setUniform('uSetup', 1);
      _life.setUniform('uSetup', 1);
      _proton.behavior.onInit = (_) => {
        self.delayedCall((_) => {
          _proton.behavior.setUniform('uSetup', 0);
          _life.setUniform('uSetup', 0);
          self.flag('setup', true);
        }, 100);
      };
      _proton.shader.addUniforms({
        uSplineCount: {
          value: data.splines,
          ignoreUIL: true,
        },
        tLifeData: {
          value: _life.output,
          ignoreUIL: true,
        },
        tSpline: {
          value: data.texture,
          ignoreUIL: true,
        },
        uSplineTexSize: {
          value: data.textureSize,
          ignoreUIL: true,
        },
        uPerSpline: {
          value: data.perSpline,
          ignoreUIL: true,
        },
      });
      self.flag('setup', true);
    }
    !(function initConfig() {
      (_config = InputUIL.create(_input.prefix + 'SplineConfig', _group)).setLabel('Spline Config');
      _config.add('json');
      _config.addToggle('infinite');
    })();
    initFile();
    this.loadFile = initFile;
    this.loadConfig = function (fromKey, toKey) {
      let copyConfig = InputUIL.create(fromKey.split('P_')[1] + 'SplineConfig', null);
      _config.copyFrom(copyConfig, ['json', 'infinite']);
      let baseFromKey = `am_SplineParticleLife_${fromKey.split('P_')[1]}`,
        baseToKey = `am_SplineParticleLife_${toKey.split('P_')[1]}`;
      [
        'uDecayRate',
        'uDecayRange',
        'uFlowRange',
        'uSplineSpeed',
        'uTimeScale',
        'uStartOffset',
        'uMaxDelay',
        'uMaxSDelay',
        'uHoldBack',
      ].forEach((name) => {
        let val = UILStorage.get(baseFromKey + name);
        val && UILStorage.set(baseToKey + name, val);
      });
    };
    this.saveValues = function () {
      return _life.shader;
    };
    this.ready = function () {
      return self.wait('setup');
    };
    this.release = async function () {
      await self.wait('life');
      let v = _life.uniforms.uRelease.value;
      ++v.x >= v.y && (v.x = 0);
      _life.setUniform('uIHold', 0);
      _life.setUniform('uDelayStart', World.RENDERER.time.value);
    };
    this.hold = async function () {
      await self.wait('life');
      _life.setUniform('uDelayStart', 9999999999);
      _life.setUniform('uIHold', 1);
    };
    this.loop = async function () {
      await self.wait('life');
      _proton.behavior.setUniform('uInfinite', 1);
      _life.setUniform('uInfinite', 1);
    };
    this.reset = async function () {
      await self.wait('life');
      _proton.behavior.setUniform('uSetup', 1);
      _life.setUniform('uSetup', 1);
      await self.wait(100);
      _proton.behavior.setUniform('uSetup', 0);
      _life.setUniform('uSetup', 0);
    };
    this.set('releaseSections', async (v) => {
      await self.wait('life');
      _life.uniforms.uRelease.value.y = v;
    });
    this.set('holdBack', async (v) => {
      await self.wait('life');
      _life.uniforms.uHoldBack2.value = v;
    });
    this.get('splineJSON', (_) => _config.get('json'));
  },
  (_) => {
    Shaders.ready().then((_) => {
      ProtonPresets.register('Spline', (input) => {
        let shader = Shaders.getShader('SplineParticlePreset.fs');
        shader = shader.split('void main() {')[1].slice(0, -1);
        let code = '#require(curl.glsl)\n#require(splineparticles.fs)\n' + shader;
        input.setValue(
          'uniforms',
          '\n            uSplineThickness: 1\n            uThicknessStep: [1, 1]\n            uThicknessSpeed: 0\n            uRangeThickness: 0\n            uRangeScale: 1\n            uDistribution: 1\n            uDistributionRange: [1, 1]\n            uExtrudeRandom: 1\n            uSCurlNoiseScale: 1\n            uSCurlTimeScale: 0\n            uSCurlNoiseSpeed: 0\n            ',
        );
        input.get('code') || input.setValue('code', code);
      });
    });
  },
);

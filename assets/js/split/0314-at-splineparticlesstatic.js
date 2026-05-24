/*
 * SplineParticlesStatic — static (one-shot positioned) flavour of
 * SplineParticles (0313). Instead of running a Life pass to advance
 * particles along the spline every frame, it asks SplineLoader for
 * a flat array of `particleCount` random points sampled along the
 * curves, then writes that buffer once into the Proton antimatter
 * vertex stream.
 *
 * Flow:
 *   - `_proton.antimatter.preventRender = true` while loading so the
 *     half-initialised buffer doesn't blit garbage.
 *   - UIL config: a single `json` path.
 *   - After `SplineLoader.loadStatic(file, _proton.particleCount)`
 *     resolves, `bufferData(data, 4)` uploads a vec4-per-particle
 *     attribute and rendering is re-enabled. `self.flag('initialized')`
 *     gates `loaded()` consumers.
 *
 * Static block registers this class name with
 * `Proton.forceCloneVertices` so duplicated proton instances get a
 * fresh vertex buffer rather than aliasing the shared one (each
 * static cloud needs its own sampled positions).
 */
Class(
  function SplineParticlesStatic(_proton, _group, _input) {
    Inherit(this, Component);
    const self = this;
    var _config;
    !(function initConfig() {
      _proton.antimatter.preventRender = true;
      (_config = InputUIL.create(_input.prefix + 'SplineConfig', _group)).setLabel('Spline Config');
      _config.add('json');
    })();
    (async function initFile() {
      let file = _config.get('json');
      if (!file) return;
      let data = await SplineLoader.loadStatic(file, _proton.particleCount);
      _proton.antimatter.vertices.bufferData(data, 4);
      _proton.antimatter.preventRender = false;
      self.flag('initialized', true);
    })();
    this.loaded = function () {
      return self.wait('initialized');
    };
  },
  (_) => {
    Hydra.ready().then((_) => {
      Proton.forceCloneVertices.push('SplineParticlesStatic');
    });
  },
);

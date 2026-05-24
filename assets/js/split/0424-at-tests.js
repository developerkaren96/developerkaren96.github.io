/*
 * Tests — static singleton (note `'static'` flag) that gates
 * expensive rendering features behind GPU class detection.
 * Used everywhere via Tests.<feature>() calls — see Home /
 * Footer / CleanRoom / About / Hexagon / Particle classes.
 *
 * Methods are queried at boot to scale the pipeline to the
 * device class:
 *
 *   - getDPR() — DPR ladder by GPU.lt / GPU.mobileLT tiers,
 *     0.8 (oversized) → 2.0 (top-tier desktop).
 *   - capFPS() — caps refresh-rate target: 30 on low-tier,
 *     60/100 on mid, uncapped on top tier.
 *   - renderFXAA() — currently hard-coded false; FXAA is
 *     replaced by MSAA-4x scene-side.
 *   - noMusic() — true on mobile (autoplay restrictions +
 *     bandwidth conservation).
 *   - enableWorldNukeMSAA() — false (composite pass uses
 *     World.NUKE without MSAA — MSAA is applied per-scene's
 *     own FX scenes).
 *   - videoVFX() — always true.
 *   - msaaSamples() — 4.
 *   - particleCount() / flowerParticleCount() /
 *     detailParticleCount() / logoParticleCount() — tiered
 *     counts 16 384 … 1 048 576 by GPU class.
 *   - hideChain() — skip chain instancing on low-end.
 *   - lensStreak() / bloom() — gated by GPU.lt(3) +
 *     GPU.mobileLT(3).
 *   - pingPongRender() — extra ping-pong pass when FPS cap
 *     is below 40 OR GPU is mid-tier.
 *   - volumetricLight() — requires WebGL2 and GPU.lt(2)+.
 *   - interactiveTubes() — implies volumetricLight().
 *
 * Standard Fragment plumbing (static singleton variant).
 */
Class(function Tests() {
  const self = this;
  Inherit(self, Component);
  Inherit(self, XComponent);
  self.fragName = 'Tests';
  self.contexts = 'Component';
  this.isFragment = true;
  var _promises = [];
  !(async function () {
    self.element && (self.element.onMountedHook = (_) => self.onMounted?.());
    self.parent?.layers && (self.layers = self.parent.layers);
    self.layout?.getAllLayers && (self.layers = await self.layout.getAllLayers());
    self.getDPR = (_) =>
      GPU.OVERSIZED
        ? 0.8
        : GPU.lt(0)
          ? 0.9
          : GPU.lt(1) || GPU.lt(2)
            ? Math.min(Device.pixelRatio, 1)
            : GPU.lt(3)
              ? Math.min(Device.pixelRatio, 1.25)
              : GPU.lt(4)
                ? Math.max(1.5, Math.min(Device.pixelRatio, 1.5))
                : GPU.lt(5)
                  ? Math.max(1.5, Math.max(Device.pixelRatio, 2))
                  : GPU.mobileLT(0)
                    ? 1
                    : GPU.mobileLT(1) || GPU.mobileLT(2)
                      ? Math.min(Device.pixelRatio, 1)
                      : GPU.mobileLT(3)
                        ? Math.min(Device.pixelRatio, 1.25)
                        : GPU.mobileLT(4)
                          ? Math.min(Device.pixelRatio, 1.5)
                          : GPU.mobileLT(5)
                            ? Math.min(Device.pixelRatio, 1.75)
                            : 1;
    self.capFPS = (_) =>
      GPU.lt(2) || GPU.mobileLT(2)
        ? 30.001
        : GPU.lt(3)
          ? Render.REFRESH_RATE > 60
            ? 60.001
            : null
          : Device.mobile && GPU.mobileLT(3) && Render.REFRESH_RATE > 100
            ? 100.001
            : null;
    self.renderFXAA = (_) => (false !== self.msaaSamples() || GPU.lt(1) || GPU.mobileLT(2), false);
    self.noMusic = (_) => !!Device.mobile;
    self.enableWorldNukeMSAA = (_) => false;
    self.videoVFX = (_) => true;
    self.msaaSamples = (_) => 4;
    self.particleCount = (_) =>
      GPU.mobileLT(2)
        ? 16384
        : GPU.mobileLT(4)
          ? 65536
          : GPU.mobileLT(5)
            ? 262144
            : GPU.lt(2)
              ? 16384
              : GPU.lt(3)
                ? 65536
                : GPU.lt(4)
                  ? 524288
                  : 1048576;
    self.flowerParticleCount = (_) =>
      GPU.mobileLT(3)
        ? 16384
        : GPU.mobileLT(4)
          ? 65536
          : GPU.mobileLT(5)
            ? 262144
            : GPU.lt(2)
              ? 16384
              : GPU.lt(3)
                ? 65536
                : GPU.lt(4)
                  ? 262144
                  : 524288;
    self.detailParticleCount = (_) =>
      GPU.mobileLT(2)
        ? 16384
        : GPU.mobileLT(4)
          ? 65536
          : GPU.lt(2)
            ? 16384
            : GPU.lt(3)
              ? 65536
              : 262144;
    self.logoParticleCount = (_) => (GPU.mobileLT(3) || GPU.lt(2) ? 16384 : 65536);
    self.hideChain = (_) => !!GPU.mobileLT(4) || !!GPU.lt(2);
    self.lensStreak = (_) => !GPU.lt(3) && !GPU.mobileLT(3);
    self.pingPongRender = (_) =>
      self.capFPS() < 40 ? GPU.lt(0) || GPU.mobileLT(1) : !!GPU.lt(3) || !!GPU.mobileLT(3);
    self.bloom = (_) => !GPU.lt(3) && !GPU.mobileLT(3);
    self.volumetricLight = (_) => !!Device.graphics.webgl.webgl2 && !GPU.lt(2) && !GPU.mobileLT(2);
    self.interactiveTubes = (_) => !!self.volumetricLight();
    for (let key in self)
      if (self[key]?.then) {
        let store = self[key];
        store.then((val) => (self[key] = val));
        _promises.push(store);
      }
    _promises.length && (await Promise.all(_promises));
    _promises = null;
    self.flag?.('__ready', true);
    self.onInit?.();
  })();
}, 'static');

/*
 * WorkDetailParticles — FragFXScene rendering the per-project
 * particle field used as the WorkDetail cube's refraction RT.
 *
 * On init: camera.lock(); on mobile camera.still() (no idle
 * tilt drift). Pulls 'Work/video' and registers tVideo +
 * uSizeBias on the particles shader. uSizeBias attenuation
 * is tier-scaled by Tests.particleCount() so weak GPUs render
 * larger particles (so the silhouette stays visible at low
 * counts):
 *   ≤16384  → 1.4
 *   ≤65536  → 1.2
 *   ≤262144 → 1.1
 *   else    → 1.0
 *
 * Standard Fragment plumbing.
 */
Class(function WorkDetailParticles(_params, ...restArgs) {
  const self = this;
  Inherit(self, FragFXScene, 'WorkDetailParticles');
  Inherit(self, XComponent);
  self.fragName = 'WorkDetailParticles';
  self.contexts = 'FragFXScene, "WorkDetailParticles"';
  self.params = _params;
  self.args = arguments;
  this.isFragment = true;
  var _promises = [];
  !(async function () {
    self.element && (self.element.onMountedHook = (_) => self.onMounted?.());
    self._initFXScene(World.NUKE, null, {
      format: undefined,
      type: undefined,
      minFilter: undefined,
      magFilter: undefined,
      multiRenderTarget: undefined,
      mipmaps: undefined,
      screenQuad: undefined,
      vrMode: undefined,
      multisample: undefined,
      samplesAmount: undefined,
    });
    self.params = _params;
    self.args = arguments;
    self.parent?.layers && (self.layers = self.parent.layers);
    self.layout?.getAllLayers && (self.layers = await self.layout.getAllLayers());
    self.layers.camera.lock();
    Device.mobile && self.layers.camera.still();
    let video = await self.get('Work/video');
    await self.layers.particles.ready();
    let attenuation = 1;
    Tests.particleCount() <= 16384
      ? (attenuation = 1.4)
      : Tests.particleCount() <= 65536
        ? (attenuation = 1.2)
        : Tests.particleCount() <= 262144 && (attenuation = 1.1);
    self.layers.particles.shader.addUniforms({
      tVideo: {
        value: video,
      },
      uSizeBias: {
        value: attenuation,
      },
    });
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
});

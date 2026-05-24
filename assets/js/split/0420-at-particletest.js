/*
 * ParticleTest — Frag3D fragment that wires the global video
 * texture into a sub-tree's particles/video/bg/logo layers.
 * Adds a per-particle-count size attenuation:
 *   - ≤ 16 384 particles → 1.6
 *   - ≤ 65 536           → 1.4
 *   - ≤ 262 144          → 1.2
 *   - otherwise          → 1
 *   - mobile.phone scales the attenuation by 0.9 so points
 *     stay readable on small screens.
 * Result is pushed onto the particles shader as uSizeBias.
 *
 * Standard Fragment plumbing.
 */
Class(function ParticleTest(_params, ...restArgs) {
  const self = this;
  Inherit(self, Frag3D, 'ParticleTest');
  Inherit(self, XComponent);
  self.fragName = 'ParticleTest';
  self.contexts = 'Frag3D, "ParticleTest"';
  self.params = _params;
  self.args = arguments;
  this.isFragment = true;
  var _promises = [];
  !(async function () {
    self.element && (self.element.onMountedHook = (_) => self.onMounted?.());
    self.params = _params;
    self.args = arguments;
    self.parent?.layers && (self.layers = self.parent.layers);
    self.layout?.getAllLayers && (self.layers = await self.layout.getAllLayers());
    self.onInit = async (_) => {
      let video = await self.get('ViewController/video');
      self.layers.video.shader.uniforms.tMap = video.uniform;
      self.layers.bg.shader.uniforms.tMap = video.uniform;
      self.layers.logo.shader.uniforms.tVideo = video.uniform;
      await self.layers.particles.ready();
      self.layers.particles.shader.uniforms.tVideo = video.uniform;
      let attenuation = 1;
      Tests.particleCount() <= 16384
        ? (attenuation = 1.6)
        : Tests.particleCount() <= 65536
          ? (attenuation = 1.4)
          : Tests.particleCount() <= 262144 && (attenuation = 1.2);
      Device.mobile.phone && (attenuation *= 0.9);
      self.layers.particles.shader.addUniforms({
        uSizeBias: {
          value: attenuation,
        },
      });
    };
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

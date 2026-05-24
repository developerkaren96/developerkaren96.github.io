/*
 * LogoParticle — Frag3D fragment for the logo particle layer
 * inside a TreeScene parent. Tiny — just wires the parent's
 * scrollProgress into the logo shader's uScroll uniform each
 * frame, and binds the global video texture to tVideo.
 *
 * Standard Fragment plumbing.
 */
Class(function LogoParticle(_params, ...restArgs) {
  const self = this;
  Inherit(self, Frag3D, 'LogoParticle');
  Inherit(self, XComponent);
  self.fragName = 'LogoParticle';
  self.contexts = 'Frag3D, "LogoParticle"';
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
      await self.layers.logo.ready();
      self.layers.logo.shader.uniforms.tVideo = video.uniform;
      self.layers.logo.isReady = true;
    };
    let root = self.findParent('TreeScene');
    self.startRender((_) => {
      root &&
        root.scrollProgress &&
        self.layers.logo &&
        self.layers.logo.isReady &&
        (self.layers.logo.shader.uniforms.uScroll.value = root.scrollProgress);
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

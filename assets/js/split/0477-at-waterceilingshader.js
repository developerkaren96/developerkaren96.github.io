/*
 * WaterCeilingShader — Component for the inverted water
 * ceiling mesh (CleanRoom). Adds tMap (repeat-tiled water
 * pattern) and tVideo, the latter wired from
 * ViewController/video during onInit so the ceiling
 * picks up the same reel/matcap source as everything else
 * downstream.
 *
 * Standard Fragment plumbing.
 */
Class(function WaterCeilingShader(_mesh, _shader, _input, _group) {
  const self = this;
  if (
    (Inherit(self, Component),
    Inherit(self, XComponent),
    (self.fragName = 'WaterCeilingShader'),
    (self.contexts = 'Component'),
    (self.mesh = _mesh),
    (self.shader = _shader),
    (self.uilInput = _input),
    (self.uilFolder = _group),
    self.uilFolder?.addButton)
  ) {
    let a = self.uilFolder;
    self.uilFolder = self.uilInput;
    self.uilInput = a;
  }
  this.isFragment = true;
  var _promises = [];
  !(async function () {
    if (
      (self.element && (self.element.onMountedHook = (_) => self.onMounted?.()),
      (self.mesh = _mesh),
      (self.shader = _shader),
      (self.uilInput = _input),
      (self.uilFolder = _group),
      self.uilFolder?.addButton)
    ) {
      let a = self.uilFolder;
      self.uilFolder = self.uilInput;
      self.uilInput = a;
    }
    self.parent?.layers && (self.layers = self.parent.layers);
    self.layout?.getAllLayers && (self.layers = await self.layout.getAllLayers());
    fbr(self.shader);
    self.shader.addUniforms({
      tMap: {
        value: null,
        getTexture: Utils3D.getRepeatTexture,
      },
      tVideo: {
        value: null,
      },
    });
    self.onInit = async (_) => {
      let video = await self.get('ViewController/video');
      self.shader.uniforms.tVideo = video.uniform;
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

/*
 * TreeWaterShader — XComponent decorator for the tree-scene
 * water plane. Adds tWaterNormal (repeat-wrapped), uSpeed,
 * uScale, uWaterUVStrength, uBrightness uniforms, then
 * creates an FX.Mirror (size 1024) bound to the water mesh
 * and adds every non-water sibling layer with a clonable
 * shader into the mirrored scene. logo_particle is special-
 * cased to add the inner `logo.mesh` after its ready().
 *
 * Standard Fragment plumbing.
 */
Class(function TreeWaterShader(_mesh, _shader, _input, _group) {
  const self = this;
  if (
    (Inherit(self, Component),
    Inherit(self, XComponent),
    (self.fragName = 'TreeWaterShader'),
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
      tWaterNormal: {
        value: null,
        getTexture: Utils3D.getRepeatTexture,
      },
      uSpeed: {
        value: 1,
      },
      uScale: {
        value: 1,
      },
      uWaterUVStrength: {
        value: 1,
      },
      uBrightness: {
        value: 1,
      },
    });
    let mirror = self.createFragment(FX.Mirror, self.mesh, {
      size: 1024,
    });
    mirror.start();
    self.onInit = async (_) => {
      let video = await self.get('ViewController/video');
      self.shader.uniforms.tVideo = video.uniform;
      await self.waitLayers();
      for (let key in self.layers) {
        if ('water' == key) continue;
        let layer = self.layers[key];
        'logo_particle' == key &&
          ((layer = layer.layers.logo), await layer.ready(), (layer = layer.mesh));
        layer.shader && layer.clone && mirror.add(layer);
      }
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

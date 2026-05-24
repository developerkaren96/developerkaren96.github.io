/*
 * FloorShader — XComponent decorator for the home/footer
 * floor mesh. Adds reflection support by spawning a
 * `FX.Mirror` (RT-based planar mirror, 1280px size) and
 * cloning every layer except floor/arealight/camera/floaters
 * into the mirror scene. The `glass` layer is special-cased
 * to use a 'GlassReflection' transparent shader in the
 * mirror copy so it doesn't fully occlude the reflected
 * surfaces behind it.
 *
 * Uniforms added to the floor's own shader (via fbr() hook):
 *   - uDistortStrength
 *   - uMirrorStrength
 *   - uRUVOffset (Vector2)
 *   - uRUVScale
 *
 * Mirror starts only after onInit (which awaits waitLayers)
 * so the cloned scene is built once layers are ready.
 *
 * Standard Fragment plumbing.
 */
Class(function FloorShader(_mesh, _shader, _input, _group) {
  const self = this;
  if (
    (Inherit(self, Component),
    Inherit(self, XComponent),
    (self.fragName = 'FloorShader'),
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
    function updateGlassShader(obj) {
      obj.shader = self.createFragment(Shader, 'GlassReflection', {
        transparent: true,
      });
    }
    self.parent?.layers && (self.layers = self.parent.layers);
    self.layout?.getAllLayers && (self.layers = await self.layout.getAllLayers());
    fbr(self.shader);
    self.shader.addUniforms({
      uDistortStrength: {
        value: 1,
      },
      uMirrorStrength: {
        value: 1,
      },
      uRUVOffset: {
        value: new Vector2(),
      },
      uRUVScale: {
        value: 1,
      },
    });
    self.normal = new Vector3(0, 1, 0);
    self.onInit = async (_) => {
      await self.waitLayers();
      for (let key in self.layers)
        if (
          'floor' != key &&
          'arealight' != key &&
          'camera' != key &&
          'floaters' != key &&
          self.layers[key].clone
        ) {
          let obj = await self.mirror.add(self.layers[key]);
          'glass' == key && updateGlassShader(obj);
        }
      self.mirror.start();
    };
    for (let key in self)
      if (self[key]?.then) {
        let store = self[key];
        store.then((val) => (self[key] = val));
        _promises.push(store);
      }
    _promises.length && (await Promise.all(_promises));
    self.mirror = self.initClass(
      FX.Mirror,
      AppState.createLocal(
        {
          mesh: self.mesh,
          normal: self.normal,
          size: 1280,
        },
        true,
      ),
    );
    self.mirror.isFragment && _promises.push(self.wait(self.mirror, '__ready'));
    _promises = null;
    self.flag?.('__ready', true);
    self.onInit?.();
  })();
});

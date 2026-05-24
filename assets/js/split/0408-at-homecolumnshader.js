/*
 * HomeColumnShader — XComponent decorator for the Home/Footer
 * column meshes. Adds the refraction/video sampler set to
 * whatever shader is bound. Counterpart to HomeLogoShader
 * (0409) — smaller uniform set since columns don't need
 * the bump-mapped normal pass.
 *
 * Uniforms added:
 *   - tMap (matcap-test.jpg — fallback look)
 *   - tRefraction (set from Home/Footer's SnapshotFrame)
 *   - tVideo (bound onInit from ViewController/video.uniform)
 *   - uVisible / uOffset / uDirection / uAlpha
 *   - transparent: true
 *
 * `fbr(self.shader)` registers the shader with the
 * fallback-renderer hook (matches About/CleanRoom pattern).
 *
 * Standard Fragment plumbing.
 */
Class(function HomeColumnShader(_mesh, _shader, _input, _group) {
  const self = this;
  if (
    (Inherit(self, Component),
    Inherit(self, XComponent),
    (self.fragName = 'HomeColumnShader'),
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
        value: Utils3D.getTexture('assets/images/room/matcap-test.jpg'),
        getTexture: Utils3D.getRepeatTexture,
      },
      tRefraction: {
        value: null,
        getTexture: Utils3D.getRepeatTexture,
      },
      tVideo: {
        value: null,
        getTexture: Utils3D.getRepeatTexture,
      },
      uVisible: {
        value: 1,
      },
      uOffset: {
        value: 0,
      },
      uDirection: {
        value: 1,
      },
      uAlpha: {
        value: 1,
      },
      transparent: true,
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

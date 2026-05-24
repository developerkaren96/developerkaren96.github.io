/*
 * TreeFBR — XComponent decorator for tree-scene meshes.
 * Adds uScroll uniform, binds video texture (skipped when
 * Global.PLAYGROUND is true so editor previews don't pull
 * the main app's video pipeline), and pushes parent
 * TreeScene's scrollProgress into uScroll each frame.
 * Locks the camera layer.
 *
 * Standard Fragment plumbing.
 */
Class(function TreeFBR(_mesh, _shader, _input, _group) {
  const self = this;
  if (
    (Inherit(self, Component),
    Inherit(self, XComponent),
    (self.fragName = 'TreeFBR'),
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
      uScroll: {
        value: 1,
      },
    });
    self.onInit = async (_) => {
      if (!Global.PLAYGROUND) {
        let video = await self.get('ViewController/video');
        self.shader.uniforms.tVideo = video.uniform;
      }
    };
    let root = self.findParent('TreeScene');
    self.startRender((_) => {
      root &&
        null != root.scrollProgress &&
        (self.shader.uniforms.uScroll.value = root.scrollProgress);
    });
    self.layers.camera && self.layers.camera.lock();
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

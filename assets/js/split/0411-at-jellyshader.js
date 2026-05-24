/*
 * JellyShader — XComponent decorator for the JellyInstancer
 * (0410) meshes. Adds the refraction/video samplers plus a
 * mouse-tilt uniform so the jellies sway with cursor angle.
 *
 * Uniforms added:
 *   - tRefraction (resolved onInit from Home/refraction)
 *   - tVideo (resolved onInit from ViewController/video.uniform)
 *   - uScroll / uDirection / uReflection (Vector2 1,1)
 *   - uMouse (Vector2, lerp(Mouse.tilt, 0.1) each frame)
 *
 * Standard Fragment plumbing.
 */
Class(function JellyShader(_mesh, _shader, _input, _group) {
  const self = this;
  if (
    (Inherit(self, Component),
    Inherit(self, XComponent),
    (self.fragName = 'JellyShader'),
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
      tRefraction: {
        value: null,
      },
      tVideo: {
        value: null,
      },
      uScroll: {
        value: 0,
      },
      uDirection: {
        value: 1,
      },
      uMouse: {
        value: new Vector2(),
      },
      uReflection: {
        value: new Vector2(1, 1),
      },
    });
    self.onInit = async (_) => {
      let refraction = await self.get('Home/refraction');
      self.shader.set('tRefraction', refraction);
      let video = await self.get('ViewController/video');
      self.shader.uniforms.tVideo = video.uniform;
    };
    self.startRender((_) => {
      self.shader.uniforms.uMouse.value.lerp(Mouse.tilt, 0.1);
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

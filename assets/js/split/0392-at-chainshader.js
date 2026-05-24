/*
 * ChainShader — XComponent decorator for the chain link
 * shader used by ChainInstancer (0391). Adds:
 *   - tRefraction (null initially; bound on init from
 *     `Work/refraction` AppState slot).
 *   - uScroll (driven per-frame by ChainInstancer).
 *   - uReflection (Vector2 multipliers for env reflections).
 *
 * `fbr(self.shader)` is the back-buffer-ready hook (see 0389).
 *
 * Same fragment plumbing as other XComponent shader fragments
 * (uilInput/uilFolder swap, layers inheritance, promise
 * unwrap, `__ready` flag).
 */
Class(function ChainShader(_mesh, _shader, _input, _group) {
  const self = this;
  if (
    (Inherit(self, Component),
    Inherit(self, XComponent),
    (self.fragName = 'ChainShader'),
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
      uScroll: {
        value: 0,
      },
      uReflection: {
        value: new Vector2(1, 1),
      },
    });
    self.onInit = async (_) => {
      let refraction = await self.get('Work/refraction');
      self.shader.set('tRefraction', refraction);
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

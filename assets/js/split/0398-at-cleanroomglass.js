/*
 * CleanRoomGlass — XComponent decorator that wires the glass
 * mesh's shader for the CleanRoom (0397) scene's glass effect.
 *
 * Adds uniforms:
 *   - tRefraction (RT from `CleanRoom/refraction` AppState)
 *   - tEnv         environment cubemap (bound later).
 *   - uDistortStrength / uFresnelPow / uRefractionRatio — IOR
 *     and edge-falloff parameters.
 *
 * Inner-surface trick: spawns a sibling FXScene fragment off
 * the parent CleanRoom's nuke, adds the same glass mesh into
 * it with a `GlassInner` shader configured as BACK_SIDE, then
 * binds the resulting RT into the outer glass shader as
 * `tInner`. This gives a single transparent mesh a convincing
 * back-face refraction without ray marching.
 *
 * `await self.waitLayers()` blocks until the parent layout has
 * the `glass` layer ready before adding it to the inner FXScene.
 *
 * Standard Fragment plumbing.
 */
Class(function CleanRoomGlass(_mesh, _shader, _input, _group) {
  const self = this;
  if (
    (Inherit(self, Component),
    Inherit(self, XComponent),
    (self.fragName = 'CleanRoomGlass'),
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
    self.shader.addUniforms({
      tRefraction: {
        value: null,
      },
      tEnv: {
        value: null,
      },
      uDistortStrength: {
        value: 1,
      },
      uFresnelPow: {
        value: 1,
      },
      uRefractionRatio: {
        value: 1,
      },
    });
    await self.waitLayers();
    let inner = self.createFragment(FXScene, self.findParent('CleanRoom').nuke);
    inner.add(self.layers.glass).shader = self.createFragment(Shader, 'GlassInner', {
      side: Shader.BACK_SIDE,
    });
    self.shader.set('tInner', inner);
    let rt = await self.get('CleanRoom/refraction');
    self.shader.set('tRefraction', rt);
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

/*
 * AboutLogoShader — XComponent that decorates the About logo
 * mesh's shader with the uniform set the parent About fragment
 * (0388) expects. Lives as a "ShaderUIL decorator fragment":
 * the editor generated this class so the uniform names and
 * default textures match what the visual graph references.
 *
 * Construction args (`_mesh, _shader, _input, _group`) come
 * from the FragFXScene plumbing. `_input` / `_group` are sometimes
 * supplied in swapped order (UIL folder vs UIL input) — the
 * `addButton` sniff on `_group` reorders them.
 *
 * Uniform additions via `shader.addUniforms`:
 *   - tMap        matcap-test JPG (default fallback).
 *   - tRefraction null — fed by About's SnapshotFrame.
 *   - tVideo      null — fed by ViewController/video AppState.
 *   - tNormal     null — caller may bind a normal map.
 *   - uVisible    0 — fade-in driver.
 *   - uAlpha      1.
 *   - uScrollDelta 0 — driven each frame by About's scroll.
 *   - uNormalScale 1.
 *   - transparent flag enabled.
 *
 * `fbr(self.shader)` is a shader pre-process hook (likely
 * "feed-back ready" — see fbr definition elsewhere) that wires
 * the shader for back-buffer composition.
 *
 * The `for (key in self)` promise-unwrap and `__ready` flag is
 * the same wait-for-children pattern used in every fragment
 * class (see 0388).
 */
Class(function AboutLogoShader(_mesh, _shader, _input, _group) {
  const self = this;
  if (
    (Inherit(self, Component),
    Inherit(self, XComponent),
    (self.fragName = 'AboutLogoShader'),
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
      tNormal: {
        value: null,
        getTexture: Utils3D.getRepeatTexture,
      },
      uVisible: {
        value: 0,
      },
      uAlpha: {
        value: 1,
      },
      uScrollDelta: {
        value: 0,
      },
      uNormalScale: {
        value: 1,
      },
      transparent: true,
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

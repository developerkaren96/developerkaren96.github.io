/*
 * TreeMirror — Object3D-based XComponent that adds an
 * FX.Mirror (size 1024) plane-mirror under the water layer
 * of a TreeScene parent. Every sibling layer with a `.shader`
 * is added to the mirror's reflected scene. console.log(key)
 * is left in the editor build to log which layers got mirrored.
 *
 * Standard Fragment plumbing.
 */
Class(function TreeMirror(_input, _group) {
  const self = this;
  Inherit(self, Object3D);
  Inherit(self, XComponent);
  self.fragName = 'TreeMirror';
  self.contexts = 'Object3D';
  self.uilInput = _input;
  self.uilFolder = _group;
  this.isFragment = true;
  var _promises = [];
  !(async function () {
    self.element && (self.element.onMountedHook = (_) => self.onMounted?.());
    self.uilInput = _input;
    self.uilFolder = _group;
    self.parent?.layers && (self.layers = self.parent.layers);
    self.layout?.getAllLayers && (self.layers = await self.layout.getAllLayers());
    await self.waitLayers();
    let mirror = self.createFragment(FX.Mirror, self.layers.water.mesh, {
      size: 1024,
    });
    mirror.start();
    for (let key in self.layers)
      self.layers[key].shader && (console.log(key), mirror.add(self.layers[key]));
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

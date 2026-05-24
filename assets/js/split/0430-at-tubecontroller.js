/*
 * TubeController — minimal XComponent decorator that flips a
 * Proton tubes renderer into vertex-colour mode
 * (proton.tubes.useColor()). Used in the home scene when
 * the tubes interaction is enabled.
 *
 * Standard Fragment plumbing.
 */
Class(function TubeController(_proton, _group, _input) {
  const self = this;
  Inherit(self, Component);
  Inherit(self, XComponent);
  self.fragName = 'TubeController';
  self.contexts = 'Component';
  self.proton = _proton;
  self.uilInput = _input;
  self.uilFolder = _group;
  this.isFragment = true;
  var _promises = [];
  !(async function () {
    self.element && (self.element.onMountedHook = (_) => self.onMounted?.());
    self.proton = _proton;
    self.uilInput = _input;
    self.uilFolder = _group;
    self.parent?.layers && (self.layers = self.parent.layers);
    self.layout?.getAllLayers && (self.layers = await self.layout.getAllLayers());
    self.proton.tubes.useColor();
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

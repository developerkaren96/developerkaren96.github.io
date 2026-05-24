/*
 * ScrollPlayer — empty PlayerView subclass used as the
 * `playerClass` slot in MobileSync's MultiplayerConfig
 * (0415). All state (scroll, mousex, mousey, mousedown,
 * lastaction) is set via PlayerModel from MobileSync; this
 * fragment exists only as the class hook the Multiplayer
 * room instantiates per connected peer.
 *
 * Standard Fragment plumbing.
 */
Class(function ScrollPlayer(_params, ...restArgs) {
  const self = this;
  Inherit(self, PlayerView);
  Inherit(self, XComponent);
  self.fragName = 'ScrollPlayer';
  self.contexts = 'PlayerView';
  self.params = _params;
  self.args = arguments;
  this.isFragment = true;
  var _promises = [];
  !(async function () {
    self.element && (self.element.onMountedHook = (_) => self.onMounted?.());
    self.params = _params;
    self.args = arguments;
    self.parent?.layers && (self.layers = self.parent.layers);
    self.layout?.getAllLayers && (self.layers = await self.layout.getAllLayers());
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

/*
 * CleanRoomRefractionScene — sibling FXScene Fragment of
 * CleanRoom (0397). Renders the room contents into a separate
 * RT (exposed via the `CleanRoom/refraction` AppState slot) so
 * CleanRoomGlass (0398) can sample what's behind the glass
 * without re-rendering the whole scene.
 *
 * No custom logic beyond the standard FragFXScene init — its
 * sole purpose is to be a render target with its own
 * scene/camera that the editor graph populates with the
 * geometry that should appear in the refraction.
 *
 * Standard Fragment plumbing.
 */
Class(function CleanRoomRefractionScene(_params, ...restArgs) {
  const self = this;
  Inherit(self, FragFXScene, 'CleanRoomRefractionScene');
  Inherit(self, XComponent);
  self.fragName = 'CleanRoomRefractionScene';
  self.contexts = 'FragFXScene, "CleanRoomRefractionScene"';
  self.params = _params;
  self.args = arguments;
  this.isFragment = true;
  var _promises = [];
  !(async function () {
    self.element && (self.element.onMountedHook = (_) => self.onMounted?.());
    self._initFXScene(World.NUKE, null, {
      format: undefined,
      type: undefined,
      minFilter: undefined,
      magFilter: undefined,
      multiRenderTarget: undefined,
      mipmaps: undefined,
      screenQuad: undefined,
      vrMode: undefined,
      multisample: undefined,
      samplesAmount: undefined,
    });
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

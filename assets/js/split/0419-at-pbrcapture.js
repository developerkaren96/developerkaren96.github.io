/*
 * PBRCapture — editor utility fragment. Adds a "Save" button
 * to a UIL folder that captures the current scene to an
 * equirectangular HDRI image. Used by the artists for
 * baking PBR environment maps from positions inside the
 * scene.
 *
 * Wiring:
 *   - CubeCamera (near 0.1, far 100, size 2048) attached to
 *     self.group → walks up the parent chain to find the
 *     containing Scene, renders 6-faces into a cubemap RT.
 *   - CubemapToEquirectangular(2048, cube) converts cube to
 *     a single 2048-tall equirect and calls toBlob() to
 *     trigger a download.
 *
 * Standard Fragment plumbing.
 */
Class(function PBRCapture(_input, _group) {
  const self = this;
  Inherit(self, Object3D);
  Inherit(self, XComponent);
  self.fragName = 'PBRCapture';
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
    let [input, appState] = self.createUIL('pbrcapture_' + self.uilInput.prefix, self.uilFolder);
    self.input = input;
    self.input.setLabel('PBR Capture');
    self.input.addButton('save', {
      label: 'Save',
      actions: [
        {
          title: 'Save',
          callback: function save() {
            let scene = World.SCENE,
              p = self.group._parent;
            for (; p; ) {
              p instanceof Scene && (scene = p);
              p = p._parent;
            }
            cube.render(scene);
            equi.render();
            equi.toBlob();
          },
        },
      ],
    });
    let cube = new CubeCamera(0.1, 100, 2048);
    self.add(cube);
    let equi = new CubemapToEquirectangular(2048, cube);
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

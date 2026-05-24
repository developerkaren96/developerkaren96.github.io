/*
 * WorkItemUIShader — Component wrapper attached by fbr to the
 * Work/pane_ui mesh (the GLUI text overlay). Adds:
 *   tMap          WorkPaneUI bitmap RT (title/copy/logo)
 *   uColor        batchUnique per-item project color
 *   uCamDistance  distance pane→camera (drives near-pane
 *                 dim / aspect adjust in shader)
 *   uAlpha        master alpha (1 by default)
 *   uHover        mirror of WorkItem mesh.uHover (lerped)
 *
 * Standard Fragment plumbing (UIL input/folder arg-swap
 * shim).
 */
Class(function WorkItemUIShader(_mesh, _shader, _input, _group) {
  const self = this;
  if (
    (Inherit(self, Component),
    Inherit(self, XComponent),
    (self.fragName = 'WorkItemUIShader'),
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
      tMap: {
        value: null,
      },
      uColor: {
        value: new Color(Utils.randomColor()),
        batchUnique: true,
      },
      uCamDistance: {
        value: 0,
      },
      uAlpha: {
        value: 1,
      },
      uHover: {
        value: 0,
      },
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

/*
 * SpineInstancer — XComponent decorator that clones a single
 * "spine vertebra" mesh 40 times along Y stacked at 0.65
 * spacing and 0.4-rad rotation per copy, batched into a
 * MeshBatch. Source mesh hidden. group.position follows the
 * source so the stack moves as a single rig.
 *
 * Standard Fragment plumbing.
 */
Class(function SpineInstancer(_mesh, _shader, _input, _group) {
  const self = this;
  if (
    (Inherit(self, Component),
    Inherit(self, Object3D),
    Inherit(self, XComponent),
    (self.fragName = 'SpineInstancer'),
    (self.contexts = 'Component,Object3D'),
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
    let batch = self.createFragment(MeshBatch),
      meshes = [];
    for (let i = 0; i < 40; i++) {
      let mesh = self.mesh.clone();
      mesh.position.set(0, 0, 0);
      mesh.position.y = -0.65 * i + 4;
      mesh.rotation.y = 0.4 * i;
      batch.add(mesh);
      meshes.push(mesh);
    }
    self.mesh.visible = false;
    self.startRender((_) => {
      self.group.position.copy(self.mesh.position);
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

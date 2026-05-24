/*
 * ChainInstancer — Fragment that clones a base mesh into 80
 * stacked copies forming a downward chain that spins as the
 * page scrolls. Uses MeshBatch (instanced rendering) so all 80
 * copies draw in one call.
 *
 * Layout:
 *   - 80 clones of `_mesh`, each at `y = -0.22 * i`.
 *   - rotation.y stepped by 90° per link (helical twist).
 *   - scale 2.6 (squashed: scale.y × 0.8).
 *
 * Per-frame: looks up the `Work` ancestor view's `scrollProgress`,
 * writes it into each link shader's `uScroll`, and rotates each
 * link by `90°·i − scrollProgress·360°·4` (four full revolutions
 * across the scroll range, layered on top of the constant
 * 90° offset).
 *
 * `Tests.hideChain()` short-circuits: hides the source mesh and
 * skips instancing — used by editor preview / performance
 * profile to disable expensive geometry.
 *
 * Standard XComponent fragment plumbing (uilInput/uilFolder
 * swap, layers inheritance, promise-unwrap, `__ready` flag) is
 * identical to other generated fragments — see 0388 header.
 */
Class(function ChainInstancer(_mesh, _shader, _input, _group) {
  const self = this;
  if (
    (Inherit(self, Component),
    Inherit(self, Object3D),
    Inherit(self, XComponent),
    (self.fragName = 'ChainInstancer'),
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
    if (
      (self.parent?.layers && (self.layers = self.parent.layers),
      self.layout?.getAllLayers && (self.layers = await self.layout.getAllLayers()),
      Tests.hideChain())
    )
      return void (self.mesh.visible = false);
    let meshes = [],
      batch = self.createFragment(MeshBatch);
    for (let i = 0; i < 80; i++) {
      let mesh = self.mesh.clone();
      mesh.position.y = -0.22 * i;
      mesh.rotation.y = Math.radians(90) * i;
      mesh.scale.setScalar(2.6);
      mesh.scale.y *= 0.8;
      batch.add(mesh);
      meshes.push(mesh);
    }
    self.mesh.visible = false;
    let root = self.findParent('Work');
    self.startRender((_) => {
      root &&
        null != root.scrollProgress &&
        (self.group.position.copy(self.mesh.position),
        meshes.forEach((mesh, i) => {
          mesh.shader.uniforms.uScroll.value = root.scrollProgress;
          mesh.rotation.y = Math.radians(90) * i - root.scrollProgress * Math.radians(360) * 4;
        }));
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

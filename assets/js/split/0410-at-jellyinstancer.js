/*
 * JellyInstancer — XComponent decorator that replaces a
 * single source mesh with 4 cloned, scattered instances
 * batched into a MeshBatch — the "jellyfish" floaters in the
 * Home/Footer scenes that drift upward through the column.
 *
 * Tests.hideChain() short-circuit: hides the source mesh and
 * skips instancing entirely (low-end / a11y opt-out).
 *
 * Clone setup: 4 copies, each `reset(mesh)` randomises:
 *   - x/z ∈ ±[4..12] via Utils.headsTails sign flip
 *   - y starting at random[-12..-10]
 *   - scaleX/Z random[1.5..3], scaleY × 1.5 (elongated jelly)
 *   - frustumCulled = false (so they don't pop when off-axis)
 *
 * Per-frame startRender (parent is Home OR Footer — whichever
 * findParent returns first):
 *   - batch.group anchors to source mesh position.
 *   - batch.group.rotation.y = -scrollProgress·360°·0.6 -
 *     3e-5·Render.TIME (slow continuous spin + scroll-driven
 *     counter-rotation).
 *   - Per-mesh: uScroll = scrollProgress, uDirection = 0 in
 *     Footer (reverses streak direction); position.y rises
 *     0.01/frame until > 60 → reset and respawn at the
 *     bottom; per-mesh rotation.y = 90°·i - scroll·720° -
 *     5e-4·Render.TIME.
 *
 * Standard Fragment plumbing.
 */
Class(function JellyInstancer(_mesh, _shader, _input, _group) {
  const self = this;
  if (
    (Inherit(self, Component),
    Inherit(self, Object3D),
    Inherit(self, XComponent),
    (self.fragName = 'JellyInstancer'),
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
    for (let i = 0; i < 4; i++) {
      let mesh = self.mesh.clone();
      reset(mesh);
      mesh.position.y += Math.range(i, 0, 4, 30, -30);
      mesh.frustumCulled = false;
      batch.add(mesh);
      meshes.push(mesh);
    }
    function reset(mesh) {
      mesh.position.x = Utils.headsTails(-1, 1) * Math.random(4, 12);
      mesh.position.z = Utils.headsTails(-1, 1) * Math.random(4, 12);
      mesh.position.y = Math.random(-10, -12);
      mesh.scale.setScalar(Math.random(1.5, 3, 3));
      mesh.scale.y *= 1.5;
    }
    batch.frustumCulled = false;
    self.mesh.visible = false;
    let root1 = self.findParent('Home'),
      root2 = self.findParent('Footer');
    self.startRender((_) => {
      self.group.position.copy(self.mesh.position);
      let root = root1 || root2;
      root &&
        null != root.scrollProgress &&
        ((batch.group.rotation.y =
          -root.scrollProgress * Math.radians(360) * 0.6 - 3e-5 * Render.TIME),
        meshes.forEach((mesh, i) => {
          mesh.shader.uniforms.uScroll.value = root.scrollProgress;
          root2 && (mesh.shader.uniforms.uDirection.value = 0);
          mesh.position.y += 0.01;
          mesh.position.y > 60 && reset(mesh);
          mesh.rotation.y =
            Math.radians(90) * i - root.scrollProgress * Math.radians(360) * 2 - 5e-4 * Render.TIME;
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

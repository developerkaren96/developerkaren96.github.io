/*
 * VRInputControllerHand — "fake hand" model used when the
 * underlying input device is a physical controller but the app
 * has opted into hand-mode UI (via VRInput.useControllerHands).
 * Subclass of VRAbstractHand (0376), so it presents the same
 * `tips`/`pointer`/`index`/`body` API as the real hand.
 *
 * Construction loads `vrhands/pointy_hand_<left|right>` via
 * GeomThread, attaches the mesh with a small Y-rotation (-90,0,
 * -90) and a 0.03 X offset (mirrored per hand) so the hand
 * geometry aligns with the grip pose. Sets `uStatic = 1` on the
 * shader to distinguish from animated hand-tracking.
 *
 * Tips: one synthetic fingertip (a 0.02 debug sphere offset
 * forward by Z = -0.125 with a small X bias) — `tips[0]` is
 * driven by `updateStatic(position, quaternion)` so it reports
 * a stable forward-pointing transform.
 *
 * `update(matrix)` — driven by VRInput each frame with the
 * controller's grip matrix:
 *   - decomposes into `self.group` position/quaternion/scale.
 *   - refreshes tip world position into the static-tip slot.
 *   - PhysicalSync re-alignment if present.
 *
 * `ready()` resolves once the async geometry load completes;
 * VRInput.handsReady() waits on this for fake-hand modality.
 */
Class(function VRInputControllerHand(_type, _controller) {
  Inherit(this, VRAbstractHand);
  const self = this;
  var _geom,
    _mesh,
    _tip,
    _grip = new Matrix4();
  this.tips = [];
  (async function () {
    _geom = await GeomThread.loadGeometry('vrhands/pointy_hand_' + _type);
    self.flag('loaded', true);
    self.shader.uniforms.uStatic.value = 1;
    (_mesh = new Mesh(_geom, self.shader)).scale.multiplyScalar(0.01);
    self.add(_mesh);
    _mesh.frustumCulled = false;
    _mesh.rotation.set(Math.radians(-90), 0, Math.radians(-90));
    _mesh.position.x = 0.03 * ('left' == _type ? -1 : 1);
    (_tip = Utils3D.createDebug(0.02)).position.set(
      0.014 * ('left' == _type ? -1 : 1),
      0.02,
      -0.125,
    );
    _tip.shader.neverRender = true;
    self.add(_tip);
    self.tips[0] = self.initClass(VRHandFingerTip, _tip);
    RenderManager.camera.wrapper.add(self.group);
    self.group.add(self.body);
  })();
  this.update = function (matrix) {
    16 == matrix.length &&
      (_grip.fromArray(matrix),
      _grip.decompose(self.group.position, self.group.quaternion, self.group.scale),
      self.tips[0] && self.tips[0].updateStatic(_tip.getWorldPosition(), self.group.quaternion),
      window.PhysicalSync && PhysicalSync.realignObject(self.group),
      self.group.updateMatrixWorld(true));
  };
  this.ready = function () {
    return self.wait('loaded');
  };
  this.get('index', (_) => self.tips[0]);
});

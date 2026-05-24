/*
 * VRHandFingerTip — lightweight transform proxy for one
 * fingertip joint. Constructed with the tip bone and its
 * parent (`_prev`) so it can derive both position and a
 * pointing direction from the bone pair.
 *
 * Fields:
 *   - position / quaternion / direction — fingertip pose.
 *   - velocity — VelocityTracker on position.
 *   - body — invisible 0.01-scale sphere used as a collision
 *     proxy (Interaction3D feeds it into raycasters as a tip
 *     pickable). The matrixWorld elements are stamped directly
 *     so updateMatrixWorld is unnecessary.
 *
 * `update()` — animated path:
 *   - Reads world positions of bone and prev (divided by 100
 *     because XR joint poses are in centimetres while Hydra
 *     scene is metres in this codebase).
 *   - direction = (bone - prev).normalize.
 *   - Builds quaternion by aiming a temporary Group from prev→
 *     bone (with the `isCamera = true` flag so its lookAt uses
 *     the camera convention).
 *   - Transforms position into the camera-wrapper space so the
 *     tip sits in the same parent as the rest of the scene.
 *   - Stamps the body's matrix/matrixWorld translation columns
 *     directly to avoid a matrix recompute.
 *
 * `updateStatic(position, quaternion)` — fake/static path used
 * by VRInputControllerHand to drive tips from a baked controller
 * pose rather than tracked joints.
 */
Class(function VRHandFingerTip(_bone, _prev) {
  const self = this;
  this.position = new Vector3();
  this.quaternion = new Quaternion();
  var _null = new Group(),
    _velocity = new VelocityTracker(this.position);
  this.velocity = _velocity.value;
  this.direction = new Vector3();
  this.body = new Mesh(World.SPHERE, Utils3D.getTestShader());
  this.body.visible = false;
  this.body.scale.setScalar(0.01);
  this.update = function () {
    _bone.getWorldPosition(self.position);
    _prev.getWorldPosition(_null.position);
    self.position.divideScalar(100);
    _null.position.divideScalar(100);
    self.direction.copy(_bone.position).sub(_prev.position).normalize();
    _null.isCamera = true;
    _null.lookAt(self.position);
    self.quaternion.copy(_null.quaternion);
    self.position.applyMatrix4(RenderManager.camera.wrapper.matrixWorld);
    self.body.position.x = self.position.x;
    self.body.position.y = self.position.y;
    self.body.position.z = self.position.z;
    self.body.matrix.elements[12] = self.body.matrixWorld.elements[12] = self.position.x;
    self.body.matrix.elements[13] = self.body.matrixWorld.elements[13] = self.position.y;
    self.body.matrix.elements[14] = self.body.matrixWorld.elements[14] = self.position.z;
    _velocity.update();
  };
  this.updateStatic = function (position, quaternion) {
    self.position.copy(position);
    self.quaternion.copy(quaternion);
    self.direction.set(0, 0, -1).applyQuaternion(quaternion);
    self.body.position.copy(self.position);
    self.body.matrix.elements[12] = self.body.matrixWorld.elements[12] = self.position.x;
    self.body.matrix.elements[13] = self.body.matrixWorld.elements[13] = self.position.y;
    self.body.matrix.elements[14] = self.body.matrixWorld.elements[14] = self.position.z;
  };
});

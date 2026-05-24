/*
 * CameraBase3D — abstract base for camera node types (Perspective, Orthographic,
 * Cube, …). Extends `Base3D` (transform-bearing scene-graph node) with the
 * two extra matrices every camera needs:
 *
 *   - `matrixWorldInverse` — inverse of `matrixWorld`. Used as the view
 *     matrix (world → camera-space).
 *   - `projectionMatrix`   — camera-space → clip-space. Owned by the
 *     subclass; subclasses call `updateProjectionMatrix()` to fill it.
 *
 * `updateMatrixWorld` is overridden so the inverse stays in lock-step with
 * any transform changes — every frame the renderer can rely on both being
 * current. `offsetMatrixWorld` (when set) is a post-multiply applied right
 * before the inversion — used by stereo / XR rigs to nudge the eye.
 */
class CameraBase3D extends Base3D {
  constructor() {
    super();
    this.matrixWorldInverse = new Matrix4();
    this.projectionMatrix   = new Matrix4();
    this.isCamera = true;
  }

  copy(source, recursive) {
    Base3D.prototype.copy.call(this, source, recursive);
    this.matrixWorldInverse.copy(source.matrixWorldInverse);
    this.projectionMatrix.copy(source.projectionMatrix);
    return this;
  }

  /** After computing the world transform, fold in the eye offset (if any) and invert. */
  updateMatrixWorld(force) {
    Base3D.prototype.updateMatrixWorld.call(this, force);
    if (this.offsetMatrixWorld) this.matrixWorld.multiply(this.offsetMatrixWorld);
    this.matrixWorldInverse.getInverse(this.matrixWorld);
  }

  clone() {
    return new this.constructor().copy(this);
  }
}

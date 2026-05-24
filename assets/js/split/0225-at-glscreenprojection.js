/*
 * GLScreenProjection — convenience wrapper that drives a 3D
 * "marker" object from a 2D screen-space target, exposing both
 * the unprojected world position and a precomputed projection
 * matrix as uniforms ready to be plugged into a Shader.
 *
 * Use case: pinning a 3D label/cursor/decoration to a 2D pointer
 * or UI anchor while keeping all the math on the GPU.
 *
 * Per-frame `loop()`:
 *   - Copies the 2D `_target` into `self.pos`.
 *   - Unprojects it through `ScreenProjection` for the camera to
 *     get `self.pos3D` (world-space).
 *   - Updates `self.group.matrixWorld`.
 *   - Composes `self.matrix = camera.projection * camera.viewInv`
 *     and copies `camera.matrixWorld` into `normalMatrix.value` and
 *     `self.group.matrixWorld` into `modelMatrix.value` so a downstream
 *     shader can do its own projection if it wants to.
 *
 * Public:
 *   - `pos`        — 2D screen coords (mutable).
 *   - `pos3D`      — 3D unprojected position (read-only output).
 *   - `matrix`     — proj * viewInv (read-only output).
 *   - `uniforms`   — pre-bound for use in a Shader's uniform table.
 *   - `set('camera', cam)` / `set('target', target)` — swap inputs.
 *   - `update()`   — single-shot recompute (== loop()).
 *   - `start()` / `stop()` — register/unregister the per-frame tick.
 */
Class(function GLScreenProjection(_camera = World.CAMERA, _target = new Vector2()) {
  Inherit(this, Object3D);
  var self = this,
    _projection = new ScreenProjection(_camera),
    _m0 = new Matrix4(),
    _m1 = new Matrix4();
  function loop() {
    self.pos.set(_target.x, _target.y);
    self.pos3D.copy(_projection.unproject(self.pos));
    self.group.updateMatrixWorld(true);
    _m0.copy(_camera.projectionMatrix);
    _m1.getInverse(_camera.matrixWorld);
    self.matrix.multiplyMatrices(_m0, _m1);
    self.uniforms.normalMatrix.value.copy(_camera.matrixWorld);
    self.uniforms.modelMatrix.value.copy(self.group.matrixWorld);
  }
  this.resolution = new Vector2();
  this.pos = new Vector2();
  this.pos3D = new Vector3();
  this.matrix = new Matrix4();
  this.uniforms = {
    projMatrix: {
      type: 'm4',
      value: this.matrix,
    },
    pos: {
      type: 'v2',
      value: this.pos,
    },
    pos3D: {
      type: 'v3',
      value: this.pos3D,
    },
    normalMatrix: {
      type: 'm4',
      value: new Matrix4(),
    },
    modelMatrix: {
      type: 'm4',
      value: new Matrix4(),
    },
  };
  this.set('camera', (v) => {
    _camera = v;
    _projection.camera = _camera;
  });
  this.set('target', (v) => {
    _target = v;
  });
  this.update = loop;
  this.start = function () {
    self.startRender(loop);
  };
  this.stop = function () {
    self.stopRender(loop);
  };
});

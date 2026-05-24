/*
 * VRCamera — per-eye XR camera adapter. Translates each XRView
 * (one per eye) into a Hydra PerspectiveCamera on demand.
 *
 * Transform hierarchy:
 *   - `_wrapper0` ("offset") — exposed as `self.wrapper` / `offset`
 *     (= `_wrapper0.position`). The app moves the player around
 *     by writing to this. Added to `World.SCENE` lazily on the
 *     first `getRenderCamera` call.
 *   - `_wrapper1` ("inset") — child of wrapper0, holds the
 *     per-frame eye-pose from XR. App-visible as `self.inset`.
 *   - `self.worldCamera` — the camera actually returned each
 *     frame; updated to mirror whichever `_tempCameras` (per-eye
 *     PerspectiveCamera) the renderer is currently drawing.
 *
 * `getFrameOfReference()` — tries 'bounded-floor' (room-scale)
 * first, falls back to 'local-floor' (seated/standing) on
 * rejection. Cached in `_frame` until `reset()`.
 *
 * `getRenderCamera(view, pose)` — called by VRRenderer per
 * XRView. Three states:
 *   1. No pose → returns undefined (skip rendering this view).
 *   2. Same eye already populated this frame → applyCamera()
 *      from cache and return worldCamera (no recompute).
 *   3. First time this eye this frame → lazily create a per-eye
 *      PerspectiveCamera in `_tempCameras`, copy XR projection
 *      matrix, decompose `_wrapper1` into the camera, cache in
 *      `_map.set(view.eye, camera)`, applyCamera, return.
 *
 * `newFrame()` — clear the per-frame cache so the next XR
 * frame re-derives eye cameras.
 *
 * `applyCamera(camera)` — copies camera's projection/position/
 * quaternion/matrixWorld onto `worldCamera`. Also propagates
 * `near`/`far` into `session.renderState.depthNear/Far` (with
 * tolerance to avoid churn on tiny float differences).
 *
 * `forceUpdate()` — sync worldCamera from `_wrapper1` without
 * waiting for an XR view (used when the app mutates the
 * wrapper transform mid-frame).
 *
 * `absoluteCameraPos` exposes the raw XR transform position
 * (before wrapper offsets) for code that needs the headset
 * position in session-local space.
 */
Class(function VRCamera(_gl, _nuke) {
  Inherit(this, Component);
  const self = this;
  var _session,
    _frame,
    _added,
    _map = new Map(),
    _tempCameras = new Map(),
    _wrapper0 = new Group(),
    _wrapper1 = new Group();
  function applyCamera(camera) {
    self.worldCamera.projectionMatrix.copy(camera.projectionMatrix);
    (function applyDepthClipPlanes() {
      let { near: depthNear, far: depthFar } = self.worldCamera;
      (Math.abs(_session.renderState.depthNear - depthNear) < 0.001 &&
        Math.abs(_session.renderState.depthFar - depthFar) < 1) ||
        _session.updateRenderState({
          depthNear: depthNear,
          depthFar: depthFar,
        });
    })();
    self.worldCamera.position.copy(camera.position);
    self.worldCamera.quaternion.copy(camera.quaternion);
    self.worldCamera.matrixWorld.copy(camera.matrixWorld);
    self.worldCamera.matrix.copy(camera.matrix);
  }
  this.worldCamera = new PerspectiveCamera(30, Stage.width / Stage.height, 0.1, 1e3);
  this.offset = _wrapper0.position;
  this.inset = _wrapper1.position;
  this.wrapper = _wrapper0;
  this.absoluteCameraPos = new Vector3();
  _wrapper0.add(_wrapper1);
  this.getFrameOfReference = async function () {
    if (_frame) return _frame;
    _session = await XRDeviceManager.getVRSession();
    try {
      _frame = await _session.requestReferenceSpace('bounded-floor');
    } catch (e) {
      _frame = await _session.requestReferenceSpace('local-floor');
    }
    return _frame;
  };
  this.newFrame = function () {
    _map.clear();
  };
  this.getRenderCamera = function (view, pose) {
    if (!pose) return;
    if (_map.has(view.eye)) return (applyCamera(_map.get(view.eye)), self.worldCamera);
    _tempCameras.has(view.eye) ||
      _tempCameras.set(view.eye, new PerspectiveCamera(30, Stage.width / Stage.height, 0.1, 1e3));
    let camera = _tempCameras.get(view.eye);
    return (
      _added || (World.SCENE.add(_wrapper0), (_added = true)),
      self.absoluteCameraPos.copy(view.transform.position),
      _wrapper1.position.copy(view.transform.position),
      _wrapper1.quaternion.copy(view.transform.orientation),
      _wrapper0.updateMatrixWorld(true),
      camera.projectionMatrix.fromArray(view.projectionMatrix),
      Utils3D.decompose(_wrapper1, camera),
      camera.updateMatrixWorld(true),
      _map.set(view.eye, camera),
      applyCamera(camera),
      self.worldCamera
    );
  };
  this.forceUpdate = function () {
    _wrapper0.updateMatrixWorld(true);
    Utils3D.decompose(_wrapper1, self.worldCamera);
    self.worldCamera.updateMatrixWorld(true);
  };
  this.reset = function () {
    _frame = null;
  };
});

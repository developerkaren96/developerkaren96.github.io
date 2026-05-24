/*
 * ARCamera — minimal PerspectiveCamera wrapper that mirrors a
 * WebXR view+pose into a Three-style camera each frame.
 * Consumed by ARRenderer (0369) per eye.
 *
 * `worldCamera` is the actual Object3D camera (30° FOV initial
 * guess; the projection matrix gets overwritten from XR view
 * each frame so the 30° is just a placeholder).
 *
 * Methods:
 *   - `getFrameOfReference()` — requests `'local'` reference
 *     space from the AR session (so positions are relative to
 *     headset start). Awaits XRDeviceManager.getARSession.
 *   - `getRenderCamera(view, pose)` — guarded on `pose`
 *     truthy; copies XRView's pose-transform position/orientation
 *     into the camera, calls `updateMatrixWorld(true)`, and
 *     overwrites `projectionMatrix` from the XRView's
 *     `projectionMatrix`. Returns the camera.
 */
Class(function ARCamera() {
  Inherit(this, Component);
  const self = this;
  var _session;
  this.worldCamera = new PerspectiveCamera(30, Stage.width / Stage.height, 0.1, 1e3);
  this.getFrameOfReference = async function () {
    return (
      (_session = await XRDeviceManager.getARSession()),
      await _session.requestReferenceSpace('local')
    );
  };
  this.getRenderCamera = function (view, pose) {
    if (pose)
      return (
        self.worldCamera.position.copy(view.transform.position),
        self.worldCamera.quaternion.copy(view.transform.orientation),
        self.worldCamera.updateMatrixWorld(true),
        self.worldCamera.projectionMatrix.fromArray(view.projectionMatrix),
        self.worldCamera
      );
  };
});

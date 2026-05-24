/*
 * Audio3DN — static helper for the native-shell GVR (Google VR /
 * Ambisonic) audio engine. Surfaces a single `audioContext()` entry
 * point that lazy-inits the native engine on first call and starts a
 * per-frame loop pushing the camera transform into the engine so its
 * head-relative spatialization tracks the scene camera.
 *
 * Why a static class?
 *   GVRAudio is process-global (a single engine handle per page),
 *   so a static is the right shape — multiple Audio3DNBuffer
 *   instances all share the same engine and we want exactly one
 *   `initEngine` call.
 *
 * `loop` (per-frame):
 *   Push the camera world position + quaternion into the engine.
 *   GVR uses this to compute per-source head-relative spatialization
 *   (HRTF-style binaural rendering). The check on `window.GVRAudio`
 *   keeps the loop safe when the native shell isn't actually loaded
 *   (during dev / browser preview).
 *
 * `audioContext()`:
 *   First-call latch. Initializes the GVR engine at
 *   `GlobalAudio3D.quality` (LOW/MED/HIGH), starts the render loop.
 *   Subsequent calls are no-ops. Callers (Audio3DNBuffer with
 *   backendType='GVR') call this in their constructor.
 */
Class(function Audio3DN() {
  Inherit(this, Component);
  const self = this;
  let _init;

  // Per-frame: feed camera transform to GVR for head-relative
  // spatialization.
  function loop() {
    if (!window.GVRAudio) return;
    GVRAudio.setHeadPos(
      World.CAMERA.position.x,
      World.CAMERA.position.y,
      World.CAMERA.position.z,
    );
    GVRAudio.setHeadRotation(
      World.CAMERA.quaternion.x,
      World.CAMERA.quaternion.y,
      World.CAMERA.quaternion.z,
      World.CAMERA.quaternion.w,
    );
  }

  // Idempotent engine bootstrap.
  this.audioContext = function () {
    if (!window.GVRAudio || _init) return;
    GVRAudio.initEngine(GlobalAudio3D.quality);
    _init = true;
    self.startRender(loop);
  };
}, 'static');

/*
 * Audio3DBase — shared spatial-position primitives for any positional
 * audio backend. Inherits Object3D so it can sit in the scene graph
 * (the actual audio source attaches to `this.group`).
 *
 * The four helpers below all answer "where should this sound be
 * relative to the listener?" but in different reference frames:
 *
 *   `audioPosition()`
 *     World-space position of the audio's group. If the sound isn't
 *     attached to anything yet (`group._parent` falsy), fall back to
 *     the camera position — the sound is centered on the listener,
 *     i.e. nonspatial.
 *
 *   `audioPositionInverse()`
 *     Same world position but transformed into camera-local space via
 *     `matrixWorldInverse`. Backends like AVF expect listener-relative
 *     coordinates (they treat the listener as the origin); this is
 *     the conversion. Only applied when the sound has a parent —
 *     unparented sounds already sit at the listener and need no
 *     transform.
 *
 *   `audioOrientationInverse()`
 *     Listener-relative Euler. Lazy-initialize the Quaternion/Euler
 *     scratch on first call. For attached sounds, decompose the
 *     group's world quaternion to euler; for unattached sounds return
 *     identity. AVF wants this to point its directional cone at the
 *     listener.
 *
 *   `listenerPosition()`
 *     The camera's world position. Returned when the sound is parented
 *     (i.e. positional); for unattached sounds returns the cached
 *     `_position` which by then holds the listener pos from a prior
 *     `audioPosition()` call. Used by backends that explicitly track
 *     listener position separately from source position.
 *
 * `_position` is intentionally module-scoped (shared Vector3) — every
 * call mutates and returns it, so callers must consume the value
 * before the next call. Avoids per-frame Vector3 allocations on what
 * are typically very hot paths.
 */
Class(function Audio3DBase() {
  Inherit(this, Object3D);
  const self = this;
  let _quaternion, _euler;
  let _position = new Vector3();

  // World position. Falls back to the camera (i.e. listener) for
  // unparented sounds so they're effectively nonspatial.
  this.audioPosition = function () {
    return (_position = self.group._parent
      ? self.group.getWorldPosition()
      : Audio3DWA.getCamera().getWorldPosition());
  };

  // Listener-relative position (multiply by camera's inverse world).
  this.audioPositionInverse = function () {
    _position = self.audioPosition();
    if (self.group._parent) _position.applyMatrix4(Audio3DWA.getCamera().matrixWorldInverse);
    return _position;
  };

  // Listener-relative orientation as an Euler. Lazy scratch alloc.
  this.audioOrientationInverse = function () {
    if (!_quaternion) {
      _quaternion = new Quaternion();
      _euler      = new Euler();
    }
    if (self.group.parent) {
      self.group.getWorldQuaternion(_quaternion);
      _euler.setFromQuaternion(_quaternion);
    } else {
      _euler.set(0, 0, 0);
    }
    return _euler;
  };

  // Listener world position (only updated for parented sounds; otherwise
  // `_position` holds the last value set by audioPosition()).
  this.listenerPosition = function () {
    if (self.group._parent) _position = Audio3DWA.getCamera().getWorldPosition();
    return _position;
  };
});

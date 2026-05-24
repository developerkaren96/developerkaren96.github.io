/*
 * CameraLookAtHelper — small Component that lets a TweenUIL
 * `alpha` value (0..1) crossfade the camera's `lookAt` target
 * between its original world-space point and a tracked object's
 * position.
 *
 * Wiring (in `create(camera, object, tween)`):
 *   - Snapshots `camera.lookAt` as `_defaultLookAt`.
 *   - Waits for `tween.loaded()` (TweenUIL is async at boot).
 *   - Replaces `camera.lookAt` with the local `_lookAt` Vector3
 *     so subsequent renders read from this component.
 *   - Subscribes to `TweenUIL.UPDATED` → `update()`.
 *
 * Per-tween update:
 *   - `_lookAt.copy(_defaultLookAt)`.
 *   - When `alpha > 0`, lerps toward `object.position` by `alpha`
 *     with the third arg `false` (no HZ correction — alpha is
 *     authored, not time-based).
 *
 * `self.get('tweener')` exposes the `{alpha}` object so external
 * tween code can write to it directly (TweenUIL binds to fields
 * by reference).
 */
Class(function CameraLookAtHelper() {
  Inherit(this, Component);
  const self = this;
  let _camera,
    _object,
    _defaultLookAt,
    _tweener = {
      alpha: 0,
    },
    _lookAt = new Vector3();
  function update() {
    _lookAt.copy(_defaultLookAt);
    _tweener.alpha > 0 && _lookAt.lerp(_object.position, _tweener.alpha, false);
  }
  self.get('tweener', () => _tweener);
  self.create = async function (camera, object, tween) {
    _camera = camera;
    _object = object;
    _defaultLookAt = _camera.lookAt;
    await tween.loaded();
    _camera.lookAt = _lookAt;
    self.events.sub(tween, TweenUIL.UPDATED, update);
  };
});

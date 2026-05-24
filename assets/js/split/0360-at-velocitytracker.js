/*
 * VelocityTracker — wraps a Vector2 or Vector3 and exposes
 * `this.value`, the per-frame Δposition normalised to the
 * display's expected refresh rate.
 *
 * Construction picks the matching Vector class by sniffing
 * `.z`: numeric → Vector3, missing → Vector2.
 *
 * Per-frame `loop` (runs after `start()`):
 *   - `_vec = (current - _last) / (Render.DELTA /
 *     (1000 / Render.REFRESH_RATE))` — divides the raw delta by
 *     a "frames at expected rate" factor, so the reported
 *     velocity is rate-independent (consistent magnitude at
 *     60 Hz vs 120 Hz).
 *   - Stores `current` into `_last` for the next frame.
 *   - Only writes `_velocity` if `_vec.length() > 0` — this
 *     preserves the *last* non-zero direction during idle
 *     frames (so consumers like trails don't snap to zero on
 *     pause).
 *
 * `copy()` syncs `_last` from `_vector` without producing
 * output — used to re-baseline after a teleport so the first
 * post-teleport frame doesn't emit a huge bogus velocity.
 *
 * `start()` / `stop()` / `onDestroy` toggle the loop;
 * `update(time, delta)` exposes the loop body for manual
 * stepping if needed.
 */
Class(function VelocityTracker(_vector) {
  Inherit(this, Component);
  var self = this,
    Vector = 'number' == typeof _vector.z ? Vector3 : Vector2,
    _vec = new Vector(),
    _velocity = new Vector(),
    _last = new Vector();
  function loop(time, delta) {
    _vec.subVectors(_vector, _last).divideScalar(Render.DELTA / (1e3 / Render.REFRESH_RATE));
    _last.copy(_vector);
    _vec.length() > 0 && _velocity.copy(_vec);
  }
  this.value = _velocity;
  this.start = function () {
    self.startRender(loop);
  };
  this.onDestroy = this.stop = function () {
    self.stopRender(loop);
  };
  this.copy = function () {
    _last.copy(_vector);
  };
  this.update = loop;
});

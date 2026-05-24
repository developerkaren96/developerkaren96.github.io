/*
 * OrbitTargetHelper — when attached to a 3D object inside the
 * Playground, this helper keeps the orbit-controls' look-target
 * locked to the object's current position, but only re-snaps after
 * the user stops dragging.
 *
 * Mechanism:
 *   - `VelocityTracker` is a tiny per-frame delta tracker (frame-
 *     normalised by `Render.DELTA`) over either Vector3 or Vector2,
 *     depending on whether the input vector has a `z` field.
 *   - On every frame, if the position has any velocity, raise the
 *     `needsReset` flag and subscribe to `Mouse.input` END events.
 *   - When the user releases the pointer, `set()` runs once: copy
 *     the position into `Playground.instance().orbitControls.target`,
 *     clear the flag, and unsubscribe.
 *
 * Why the deferred snap: snapping the orbit target every frame while
 * the user is actively dragging fights against their input. Snapping
 * only on pointer-release respects the user's interaction and then
 * recenters orbit on the new resting point.
 *
 * Only runs when `Global.PLAYGROUND` is truthy (i.e. in the in-app
 * inspector / playground build), and waits one `defer()` tick so the
 * Playground singleton has been constructed.
 */
Class(function OrbitTargetHelper() {
  Inherit(this, Object3D);
  const self = this;

  const _velocity = new (function VelocityTracker(_vector) {
    const Vector = typeof _vector.z === 'number' ? Vector3 : Vector2;
    const _velocity = new Vector();
    const _last = new Vector();
    this.value = _velocity;
    this.update = function loop(time, delta) {
      _velocity.subVectors(_vector, _last).divideScalar((delta || Render.DELTA) / (1e3 / 60));
      _last.copy(_vector);
    };
  })(self.group.position);

  function set() {
    self.flag('needsReset', false);
    Playground.instance().orbitControls.target.copy(self.group.position);
    self.events.unsub(Mouse.input, Interaction.END, set);
  }

  (async function () {
    if (!Global.PLAYGROUND) return;
    await defer();
    Playground.instance().orbitControls.target.copy(self.group.position);
    self.startRender(() => {
      _velocity.update();
      if (_velocity.value.length() > 0) {
        self.flag('needsReset', true);
        self.events.sub(Mouse.input, Interaction.END, set);
      }
    });
  })();
});

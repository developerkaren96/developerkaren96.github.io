/*
 * TweenTimeline — sequence multiple MathTween/FrameTween instances along
 * a single timeline driven by `self.elapsed ∈ [0,1]`. The timeline owns
 * the playback and forwards `interpolate(localElapsed)` to each child.
 *
 * Model:
 *   `_tweens` holds child tweens constructed in *manual* mode (their
 *   own update isn't registered with TweenManager — we tick them
 *   ourselves from `loop`). `_total` is the maximum (time+delay) across
 *   all children, computed in `calculate()` after each `add()`. Sorting
 *   descending by (time+delay) is just so the iteration order in `loop`
 *   matches the original insertion semantics for the framework's needs.
 *
 * Playback:
 *   `tween(to, time, ease, delay, callback)`
 *     Tweens `self.elapsed` from current value → `to` with the given
 *     parameters, hooking `loop` as the onUpdate so each frame of the
 *     parent tween dispatches to all children.
 *   `start()` / `stop()` use Component's render-binding helpers to
 *     drive `loop` every frame at fixed elapsed (callers set
 *     `self.elapsed` themselves between frames in this mode).
 *   `update()` / `seek(e)` are imperative single-shot updates.
 *
 * Children:
 *   `add(object, props, time, ease, delay)` constructs a child tween in
 *   manual mode and queues it. Accepts an already-built MathTween/
 *   FrameTween as the first arg — its construction args are unpacked.
 *   Dispatch is based on object type: HydraObject → FrameTween (DOM
 *   layer), anything else → MathTween (plain JS numbers).
 *   `defer(calculate)` debounces the recompute when callers add many
 *   tweens back-to-back.
 *
 * Loop:
 *   For each child, compute `relativeTime = timelineTime - delay` clamped
 *   to its own duration, then call `interpolate(elapsed)` to write
 *   values without re-evaluating the global frame tick.
 *
 * Cleanup:
 *   `onDestroy` stops the driving tween, unbinds the render callback,
 *   and stops every child tween.
 */
Class(function TweenTimeline() {
  Inherit(this, Component);
  const self = this;
  let _tween;
  let _total = 0;
  const _tweens = [];

  // Sort children so the last item (in insertion-time order) is the
  // longest, then take _total from the first item — i.e. the maximum
  // (time + delay) anywhere in the timeline.
  function calculate() {
    _tweens.sort(function (a, b) {
      const ta = a.time + a.delay;
      return b.time + b.delay - ta;
    });
    const first = _tweens[0];
    _total = first.time + first.delay;
  }

  // Per-frame fanout. Each child's local elapsed is derived from the
  // timeline's normalized elapsed and its own delay/time.
  function loop() {
    const time = self.elapsed * _total;
    for (let i = _tweens.length - 1; i > -1; i--) {
      const t = _tweens[i];
      const relativeTime = time - t.delay;
      const elapsed = Math.clamp(relativeTime / t.time, 0, 1);
      t.interpolate(elapsed);
    }
    self.events.fire(Events.UPDATE, self, true);
  }

  this.elapsed = 0;

  // Convenience: how long until elapsed reaches 1 (in seconds).
  this.get('timeRemaining', () => _total - self.elapsed * _total);

  /*
   * Queue a child tween. Accepts either explicit args or an existing
   * MathTween/FrameTween (unpacked into its arg form). Dispatch:
   *   HydraObject → FrameTween (CSS/transform target)
   *   anything else → MathTween (plain numeric target)
   * The 7th arg `true` puts each tween in manual mode so it doesn't get
   * registered with the global TweenManager loop — we drive them.
   */
  this.add = function (object, props, time, ease, delay = 0) {
    if (object instanceof MathTween || object instanceof FrameTween) {
      props  = object.props;
      time   = object.time;
      ease   = object.ease;
      delay  = object.delay;
      object = object.object;
    }
    const tween = object instanceof HydraObject
      ? new FrameTween(object, props, time, ease, delay, null, true)
      : new MathTween (object, props, time, ease, delay, null, true);
    _tweens.push(tween);
    defer(calculate);
    return tween;
  };

  /*
   * Drive `self.elapsed` from its current value to `to`. `loop` is hooked
   * as onUpdate so every frame of the driver propagates to all children.
   */
  this.tween = function (to, time, ease, delay, callback) {
    self.clearTween();
    _tween = tween(self, { elapsed: to }, time, ease, delay)
      .onUpdate(loop)
      .onComplete(callback);
    return _tween;
  };

  this.clearTween = function () {
    if (_tween && _tween.stop) _tween.stop();
  };

  // Manual playback modes. `start/stop` rely on Component's
  // startRender/stopRender to bind `loop` to the global render tick.
  this.start  = function () { self.startRender(loop); };
  this.stop   = function () { self.stopRender(loop);  };
  this.update = function () { loop(); };
  this.seek   = function (elapsed) { self.elapsed = elapsed; loop(); };

  this.onDestroy = function () {
    self.clearTween();
    Render.stop(loop);
    for (let i = 0; i < _tweens.length; i++) _tweens[i].stop();
  };
});

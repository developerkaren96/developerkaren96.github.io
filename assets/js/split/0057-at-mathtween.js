/*
 * MathTween — interpolates numeric properties on a plain JS object over
 * time. Companion to FrameTween (which targets CSS/transforms on
 * HydraObject) and TweenTimeline (which sequences both).
 *
 * Lifecycle:
 *   1. Constructor stashes args, defer()s actual start to next microtask
 *      so the caller has a chance to call `.onUpdate(...)` and
 *      `.promise()` on the returned object before any frame ticks.
 *   2. `start()` (inner closure):
 *        • If the object is in multiTween mode, any existing tween whose
 *          prop string matches gets stopped — i.e. tweens on the same
 *          properties replace each other while tweens on disjoint
 *          properties coexist.
 *        • `_object._mathTween = self` (single-slot mode).
 *        • multiTween mode pushes a `{props, tween}` wrapper into
 *          `_object._mathTweens` so the wrapper can be located + removed
 *          on clear without scanning by identity.
 *        • String eases are resolved once via `Interpolation.convertEase`.
 *          Functional eases (typeof function) take spring/damping
 *          parameters; numeric eases (cubic-bezier values arrays) go
 *          through `Interpolation.solve`.
 *        • Timebase: `scaledTime` → `Render.now()` (responds to global
 *          time scaling, pauses, etc); else `performance.now()`.
 *        • Snapshot current numeric values into `_startValues`.
 *        • Pluck off any `spring`/`damping` keys from props for use as
 *          ease params.
 *   3. `update(dt)` integrates `_currentTime`. While < `_startTime` we
 *      remain in delay; once past, compute elapsed∈[0,1] and call
 *      `interpolate(elapsed)`. At elapsed==1, fire callback / resolve
 *      Promise / cleanup.
 *
 * `interpolate(elapsed)` evaluates the ease, then linearly mixes
 * each numeric start/end pair. Non-numeric end values (e.g. strings)
 * are skipped — they're not animatable here.
 *
 * `overrideValues(self, …)` hook: a subclass or external mutator can
 * intercept the deferred start and replace any of the props/time/ease/
 * delay. Used by debugging tools to globally remap durations.
 *
 * Cleanup (`clear()`):
 *   Detaches from `_object._mathTween`, removes from TweenManager's
 *   tick list, removes the wrapper from `_mathTweens` if multiTween,
 *   nulls out internal fields via `Utils.nullObject` to release closures.
 *
 * Imperative controls:
 *   pause/resume, stop (final), setEase (live-swap), setElapsed (jump
 *   to a specific normalized progress — used by manual/timeline drivers).
 *   promise() lazily creates a completion Promise.
 *   onUpdate(cb) / onComplete(cb) fluent setters.
 */
Class(function MathTween(_object, _props, _time, _ease, _delay, _callback, _manual, _scaledTime) {
  const self = this;
  let _startTime, _startValues, _endValues;
  let _easeFunction, _paused, _newEase;
  let _spring, _damping, _update, _currentTime;
  let _elapsed = 0;

  // Tear down: drop both slot references, free the closure, remove from
  // the manager's loop and (if multi) from the per-prop wrapper list.
  function clear() {
    if (!_object && !_props) return false;
    _object._mathTween = null;
    TweenManager._removeMathTween(self);
    Utils.nullObject(self);
    if (_object._mathTweens) _object._mathTweens.remove(self._tweenWrapper);
  }

  // Public read-only echo of construction args (used by TweenTimeline.add
  // to re-derive a tween from an existing one).
  self.object = _object;
  self.props  = _props;
  self.time   = _time;
  self.ease   = _ease;
  self.delay  = _delay;

  /*
   * Deferred start. Run on the next microtask so callers can attach
   * onUpdate/onComplete/.promise() before the first update tick.
   */
  defer(function () {
    if (self.stopped) return;

    // Optional intercept hook: lets tooling rewrite any of the tween
    // parameters before the tween actually arms itself.
    if (self.overrideValues) {
      const values = self.overrideValues(self, _object, _props, _time, _ease, _delay);
      if (values) {
        self.props  = _props  = values.props  || _props;
        self.time   = _time   = values.time   || _time;
        self.ease   = _ease   = values.ease   || _ease;
        self.delay  = _delay  = values.delay  || _delay;
      }
    }

    if (!_object || !_props) return;
    self.object = _object;
    if ('number' != typeof _time) throw 'MathTween Requires object, props, time, ease';

    (function start() {
      // Single-slot mode: a fresh tween on the same object clears the
      // previous tween. multiTween mode skips this — collisions are
      // resolved at the per-prop level below.
      if (!_object.multiTween && _object._mathTween && !_manual) {
        TweenManager.clearTween(_object);
      }
      // Manual mode (driven by a timeline) bypasses the global tick.
      if (!_manual) TweenManager._addMathTween(self);

      self.time  = _time;
      self.delay = _delay;

      // Concatenate the names of numeric props for the multiTween prop
      // string (used to identify "the same animation" for replacement).
      const propString = (function getPropString() {
        let string = '';
        for (const key in _props) {
          if ('number' == typeof _props[key]) string += key + ' ';
        }
        return string;
      })();

      _object._mathTween = self;

      if (_object.multiTween) {
        if (!_object._mathTweens) _object._mathTweens = [];
        // Replace any existing tween touching the same props.
        _object._mathTweens.forEach((t) => {
          if (t.props == propString) t.tween.stop();
        });
        self._tweenWrapper = { props: propString, tween: self };
        _object._mathTweens.push(self._tweenWrapper);
      }

      if (!_ease) _ease = 'linear';
      if ('string' == typeof _ease) {
        _ease = TweenManager.Interpolation.convertEase(_ease);
        _easeFunction = 'function' == typeof _ease;
      }

      // Timebase: scaledTime uses Render.now() (engine-controlled, pause-
      // aware); otherwise wall-clock from performance.now().
      _startTime   = _scaledTime ? Render.now() : performance.now();
      _currentTime = _startTime;
      _startTime  += _delay;

      _endValues   = _props;
      _startValues = {};
      if (_props.spring)  _spring  = _props.spring;
      if (_props.damping) _damping = _props.damping;

      // Snapshot starting values for every numeric prop. Non-numeric
      // entries are intentionally left out so they're skipped on update.
      self.startValues = _startValues;
      for (const prop in _endValues) {
        if ('number' == typeof _object[prop]) _startValues[prop] = _object[prop];
      }
    })();
  });

  /*
   * Per-frame tick. Stay in delay until current time crosses startTime,
   * then advance elapsed∈[0,1] and write the interpolated state. At
   * elapsed==1 fire callback / Promise / clean up.
   */
  this.update = function (dt) {
    if (_paused) return;
    _currentTime += _scaledTime ? dt : Render.DT;
    if (_currentTime < _startTime) return;

    _elapsed = (_currentTime - _startTime) / _time;
    if (_elapsed > 1) _elapsed = 1;

    const delta = this.interpolate(_elapsed);
    if (_update) _update(delta);

    if (1 == _elapsed) {
      if (_callback) _callback();
      if (self.completePromise) self.completePromise.resolve();
      clear();
    }
  };

  this.pause  = function () { _paused = true;  };
  this.resume = function () { _paused = false; };

  // Hard stop. Returns null so callers can `_tween = _tween.stop();` to
  // both stop and clear the slot in one expression.
  this.stop = function () {
    self.stopped = true;
    clear();
    return null;
  };

  // Swap to a different ease mid-flight. Cached function-vs-values flag
  // is updated alongside.
  this.setEase = function (ease) {
    if (_newEase == ease) return;
    _newEase = ease;
    _ease = TweenManager.Interpolation.convertEase(ease);
    _easeFunction = 'function' == typeof _ease;
  };

  this.getValues = function () {
    return { start: _startValues, end: _endValues };
  };

  /*
   * Evaluate the ease and write interpolated values. Returns the eased
   * delta (∈[0,1]) for consumers like TweenTimeline that drive a
   * scrub bar.
   */
  this.interpolate = function (elapsed) {
    const delta = _easeFunction
      ? _ease(elapsed, _spring, _damping)
      : TweenManager.Interpolation.solve(_ease, elapsed);
    for (const prop in _startValues) {
      if ('number' == typeof _startValues[prop] && 'number' == typeof _endValues[prop]) {
        const start = _startValues[prop];
        const end   = _endValues[prop];
        _object[prop] = start + (end - start) * delta;
      }
    }
    return delta;
  };

  this.onUpdate   = function (callback) { _update   = callback; return this; };
  this.onComplete = function (callback) { _callback = callback; return this; };

  // Lazily create a completion Promise. Resolved at elapsed==1.
  this.promise = function () {
    if (!self.completePromise) self.completePromise = Promise.create();
    return self.completePromise;
  };

  // Scrub to a normalized progress. Resets the wall clock so subsequent
  // update() ticks pick up from that point.
  this.setElapsed = function (elapsed) {
    _startTime   = performance.now();
    _currentTime = _startTime + _time * elapsed;
  };
});

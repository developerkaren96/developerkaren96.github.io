/*
 * FrameTween — per-frame JS-driven tween for HydraObjects, used when CSS
 * transitions aren't suitable (e.g., `Device.tween.transition === false`, or
 * properties the engine wants full control over).
 *
 * The constructor splits `_props` into two pools:
 *   • _transformStart / _transformEnd   — transform-style props (x/y/scale/…)
 *   • _startValues   / _endValues       — plain CSS props (numeric or string)
 * and then delegates the actual interpolation to two `tween()` calls
 * (TweenManager's underlying JS tween). The `update()` callback writes the
 * current pool snapshots back to the object every frame; completion is
 * routed through whichever pool was used (CSS preferred when both exist —
 * so the completion handler only fires once).
 *
 * `_manual`         — caller drives the tween via `interpolate(elapsed)`;
 *                     skips the implicit override of any existing CSS tween.
 * `multiTween`      — the host object opts into concurrent overlapping
 *                     tweens (e.g., parallel x and rotation tweens). When
 *                     enabled, FrameTween appends itself to `_cssTweens`
 *                     rather than overwriting `_cssTween`.
 * `overrideValues`  — subclass hook that can mutate the supplied props/time/
 *                     ease/delay just before the tween fires. The deferred
 *                     wrapper lets the caller install the hook between
 *                     constructor return and tween start.
 *
 * On start, any currently-applied CSS transition on the underlying DOM
 * element is cleared so the transition engine doesn't fight the per-frame
 * writes.
 *
 * `copy()` is a shallow numeric-only clone used to snapshot the start pool
 * (so the tween mutates a working copy, not the user's prop object).
 */
Class(function FrameTween(_object, _props, _time, _ease, _delay, _callback, _manual) {
  const self = this;
  let _endValues, _transformEnd, _transformStart, _startValues;
  let _isTransform, _isCSS, _transformProps;
  let _cssTween, _transformTween, _update;

  function copy(obj) {
    const newObj = {};
    for (const key in obj) if ('number' == typeof obj[key]) newObj[key] = obj[key];
    return newObj;
  }

  function clear() {
    if (_object._cssTweens) _object._cssTweens.remove(self);
    self.playing      = false;
    _object._cssTween = null;
    _object = _props  = null;
  }

  function update() {
    function killed() { return self.kill || !_object || !_object.div || !_object.css; }
    if (killed()) return;

    if (_isCSS) _object.css(_props);
    if (_isTransform) {
      if (_object.multiTween) {
        // multiTween: each transform property is written directly onto the
        // object so multiple FrameTweens can stack without clobbering each
        // other's snapshots; transform() reads them on its own.
        for (const key in _transformProps) {
          if ('number' == typeof _transformProps[key]) _object[key] = _transformProps[key];
        }
        _object.transform();
      } else {
        _object.transform(_transformProps);
      }
    }
    if (_update) _update();
  }

  function tweenComplete() {
    if (!self.playing) return;
    clear();
    if (_callback) _callback();
    if (self.completePromise) self.completePromise.resolve();
  }

  this.playing = true;
  self.object  = _object;
  self.props   = _props;
  self.time    = _time;
  self.ease    = _ease;
  self.delay   = _delay;

  defer(function () {
    // Subclass override hook — can rewrite props/time/ease/delay just before
    // start.
    if (self.overrideValues) {
      const values = self.overrideValues(self, _object, _props, _time, _ease, _delay);
      if (values) {
        self.props  = _props  = values.props || _props;
        self.time   = _time   = values.time  || _time;
        self.ease   = _ease   = values.ease  || _ease;
        self.delay  = _delay  = values.delay || _delay;
      }
    }

    // Object-form ease (e.g., a custom curve) isn't supported here — fall
    // back to a sensible default.
    if ('object' == typeof _ease) _ease = 'easeOutCubic';
    if (!_object || !_props) return;

    self.object = _object;
    if ('number' != typeof _time) throw 'FrameTween Requires object, props, time, ease';

    (function initValues() {
      if (_props.math) delete _props.math;
      // Cancel any native CSS transition on this element so our JS frame-by-
      // frame writes aren't double-interpolated.
      if (Device.tween.transition && _object.div && _object.div._transition) {
        _object.div.style[HydraCSS.styles.vendorTransition] = '';
        _object.div._transition = false;
      }
      self.time   = _time;
      self.delay  = _delay;
      _endValues       = {};
      _transformEnd    = {};
      _transformStart  = {};
      _startValues     = {};
      // For non-multiTween targets, default x/y/z to the object's current
      // values so the transform tween has all 3 fields populated and we
      // don't snap unset axes back to 0.
      if (!_object.multiTween) {
        if (undefined === _props.x) _props.x = _object.x;
        if (undefined === _props.y) _props.y = _object.y;
        if (undefined === _props.z) _props.z = _object.z;
      }

      for (const key in _props) {
        if (key.includes(['damping', 'spring'])) {
          // Spring/damping config — pass straight through to the tweener.
          _endValues[key]    = _props[key];
          _transformEnd[key] = _props[key];
        } else if (TweenManager._isTransform(key)) {
          _isTransform           = true;
          _transformStart[key]   = _object[key] || ('scale' == key ? 1 : 0);
          _transformEnd[key]     = _props[key];
        } else {
          _isCSS = true;
          const v = _props[key];
          if ('string' == typeof v) {
            // String values (e.g. "red") aren't interpolated — write once.
            _object.div.style[key] = v;
          } else if ('number' == typeof v) {
            _startValues[key] = _object.css ? Number(_object.css(key)) : 0;
            _endValues[key]   = v;
          }
        }
      }
    })();

    (function startTween() {
      // Override any previous tween unless we're explicitly multi-tween or
      // manual.
      if (_object._cssTween && !_manual && !_object.multiTween) _object._cssTween.kill = true;
      self.time   = _time;
      self.delay  = _delay;
      if (_object.multiTween) {
        if (!_object._cssTweens) _object._cssTweens = [];
        _object._cssTweens.push(self);
      }
      _object._cssTween = self;
      self.playing      = true;

      // Working copies so the underlying numeric tween mutates these,
      // not the user-supplied prop maps.
      _props          = copy(_startValues);
      _transformProps = copy(_transformStart);

      if (_isCSS) {
        _cssTween = tween(_props, _endValues, _time, _ease, _delay, null, _manual)
          .onUpdate(update)
          .onComplete(tweenComplete);
      }
      if (_isTransform) {
        // Avoid double-completion: only attach onComplete to the transform
        // tween when there's no CSS tween to drive it.
        _transformTween = tween(_transformProps, _transformEnd, _time, _ease, _delay, null, _manual)
          .onComplete(_isCSS ? null : tweenComplete)
          .onUpdate  (_isCSS ? null : update);
      }
    })();
  });

  this.stop = function () {
    if (!this.playing) return;
    if (_cssTween && _cssTween.stop)             _cssTween.stop();
    if (_transformTween && _transformTween.stop) _transformTween.stop();
    clear();
  };

  // Manual driver — `elapsed` is the current millisecond position.
  this.interpolate = function (elapsed) {
    if (_cssTween)       _cssTween.interpolate(elapsed);
    if (_transformTween) _transformTween.interpolate(elapsed);
    update();
  };

  this.getValues = function () {
    return {
      start:          _startValues,
      transformStart: _transformStart,
      end:            _endValues,
      transformEnd:   _transformEnd,
    };
  };

  this.setEase = function (ease) {
    if (_cssTween)       _cssTween.setEase(ease);
    if (_transformTween) _transformTween.setEase(ease);
  };

  this.onUpdate    = function ()           { return this; };
  this.onComplete  = function (callback)   { _callback = callback; return this; };
  this.promise     = function () {
    if (!self.completePromise) self.completePromise = Promise.create();
    return self.completePromise;
  };
});

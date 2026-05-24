/*
 * TweenManager — single global tween loop and ease registry.
 *
 * Loop: `Render.start(updateTweens)` ticks every registered MathTween/
 * FrameTween once per frame, walking in reverse so a tween's `clear()`
 * (which removes itself from the array) is splice-safe. A tween that
 * returns no `update` method is treated as already-spent and removed.
 *
 * Public surface:
 *   tween(object, props, time, ease, delay, complete, isManual, scaledTime)
 *     The shorthand the rest of the codebase imports as `window.tween`.
 *     Constructs a `MathTween`. If `complete` is a Promise, its `resolve`
 *     becomes the completion callback and the Promise is returned in
 *     place of the tween — so callers can `await tween(...)`. The
 *     numeric-typeof check on `delay` allows callers to drop `delay` and
 *     pass `complete` straight after `ease`.
 *
 *   clearTween(object)
 *     Stops any tweens attached to the object. Two slots:
 *       • `_mathTween`  — the single-tween slot used in normal mode.
 *       • `_mathTweens` — array of `{props, tween}` wrappers used when
 *                        `multiTween` is enabled on the object (lets
 *                        independent property groups animate
 *                        concurrently without overriding each other).
 *
 *   addCustomEase({name, curve})
 *     Registers a named easing. Two curve syntaxes are accepted:
 *       • SVG path (`m…`) — requires the EasingPath module; the path is
 *                           pre-baked into a `solve(t)` sampler.
 *       • cubic-bezier(x1,y1,x2,y2) — stored as numeric values for the
 *                           Interpolation solver to consume.
 *     Duplicate `name` registrations are no-ops.
 *
 * Internal getters (used by MathTween / Interpolation.convertEase):
 *   _getEase(name, asValues)
 *     `asValues=true`  → return `solve(t)` callable (path eases) or the
 *                        numeric values array (bezier eases). Used by
 *                        `Interpolation.solve` to drive cubic-bezier.
 *     `asValues=false` → return the original curve string (for inspection
 *                        / serialization). Returns false if no match.
 *
 * `Math.interpolate(start, end, alpha, ease)` is patched onto the global
 * Math so non-tween callers can sample an ease without constructing a
 * MathTween. Built-in easings expose direct `(t) => v` functions; custom
 * eases hand a values array to `Interpolation.solve` instead.
 *
 * `window.tween` / `window.clearTween` are also exposed for convenience.
 */
Class(function TweenManager() {
  Namespace(this);
  const self = this;
  const _tweens = [];

  // Per-frame driver. Reverse-iterate because tween.update may remove
  // the tween from `_tweens` on completion.
  function updateTweens(time, dt) {
    for (let i = _tweens.length - 1; i >= 0; i--) {
      const tween = _tweens[i];
      if (tween.update) tween.update(dt);
      else              self._removeMathTween(tween);
    }
  }

  function findEase(name) {
    const eases = self.CubicEases;
    for (let i = eases.length - 1; i > -1; i--) {
      if (eases[i].name == name) return eases[i];
    }
    return false;
  }

  this.CubicEases = [];

  Render.start(updateTweens);

  this._addMathTween    = function (tween) { _tweens.push(tween); };
  this._removeMathTween = function (tween) { _tweens.remove(tween); };

  /*
   * Resolve an ease name to its underlying representation.
   *   values=true  → solver-friendly form (function for path eases,
   *                  numeric array for cubic-bezier eases).
   *   values=false → the raw curve string (for inspection).
   */
  this._getEase = function (name, values) {
    const ease = findEase(name);
    if (!ease) return false;
    if (values) return ease.path ? ease.path.solve : ease.values;
    return ease.curve;
  };

  this._inspectEase = function (name) { return findEase(name); };

  /*
   * Build a MathTween. Supports the (object, props, time, ease, complete)
   * shorthand by detecting that `delay` isn't a number and shifting
   * arguments down. If `complete` is a Promise, return that Promise so
   * the caller can `await` the tween directly.
   */
  this.tween = function (object, props, time, ease, delay, complete, isManual, scaledTime) {
    if ('number' != typeof delay) {
      // shift: tween(obj, props, time, ease, complete)
      // The original code reuses an outer `update` binding; preserve the
      // same shape so callers relying on it keep working.
      // eslint-disable-next-line no-undef
      update   = complete;
      complete = delay;
      delay    = 0;
    }
    const tween = new MathTween(object, props, time, ease, delay, complete, isManual, scaledTime);
    let usePromise = null;
    if (complete && complete instanceof Promise) {
      usePromise = complete;
      complete   = complete.resolve;
    }
    return usePromise || tween;
  };

  // Stop any tweens attached to `object`. Handles both the single-slot
  // and multi-slot (multiTween) cases.
  this.clearTween = function (object) {
    if (object._mathTween && object._mathTween.stop) object._mathTween.stop();
    if (object._mathTweens) {
      const tweens = object._mathTweens;
      for (let i = 0; i < tweens.length; i++) {
        const tw = tweens[i];
        if (tw && tw.stop) tw.stop();
      }
      object._mathTweens = null;
    }
  };

  /*
   * Register a named ease. Curve string starting with `m` is SVG-path
   * notation and requires the EasingPath module (built once, pre-baked
   * into an O(1) sampler). `cubic-bezier(x1,y1,x2,y2)` is parsed to a
   * numeric array consumed later by `Interpolation.solve`.
   */
  this.addCustomEase = function (ease) {
    let add = true;
    if ('object' != typeof ease || !ease.name || !ease.curve) {
      throw 'TweenManager :: addCustomEase requires {name, curve}';
    }
    for (let i = self.CubicEases.length - 1; i > -1; i--) {
      if (ease.name == self.CubicEases[i].name) add = false;
    }
    if (!add) return ease;

    if ('m' == ease.curve.charAt(0).toLowerCase()) {
      if (!window.EasingPath) throw 'Using custom eases requires easingpath module';
      ease.path = new EasingPath(ease.curve);
    } else {
      ease.values = (function stringToValues(str) {
        const values = str.split('(')[1].slice(0, -1).split(',');
        for (let i = 0; i < values.length; i++) values[i] = parseFloat(values[i]);
        return values;
      })(ease.curve);
    }
    self.CubicEases.push(ease);
    return ease;
  };

  /*
   * Sample an ease without constructing a tween. `Math.mix` linearly
   * interpolates start→end by the eased alpha. For function eases we
   * call directly; for cubic-bezier value arrays we route through the
   * Interpolation solver.
   */
  Math.interpolate = function (start, end, alpha, ease) {
    const fn = self.Interpolation.convertEase(ease);
    return Math.mix(
      start,
      end,
      'function' == typeof fn ? fn(alpha) : self.Interpolation.solve(fn, alpha),
    );
  };

  window.tween      = this.tween;
  window.clearTween = this.clearTween;
}, 'Static');

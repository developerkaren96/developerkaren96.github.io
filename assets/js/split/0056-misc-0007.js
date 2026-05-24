/*
 * TweenManager.Interpolation — ease library and cubic-bezier solver,
 * registered under the TweenManager namespace so callers go through
 * `TweenManager.Interpolation.Cubic.Out(t)` etc.
 *
 * Two ease representations live side by side:
 *   1. Functional eases (everything below `Linear`/`Quad`/`Cubic`/…/`Bounce`):
 *      direct `(t) => v` closures. Match the canonical Penner/Robert
 *      Penner ease set. Used by `convertEase` when a known name like
 *      `easeOutQuad` is requested.
 *   2. Custom (cubic-bezier) eases: registered via
 *      `TweenManager.addCustomEase({name, curve})`. The curve is parsed
 *      to a 4-tuple `[x1, y1, x2, y2]` and consumed by `solve(values, t)`,
 *      which inverts the bezier via Newton iteration to find the t
 *      matching the requested x, then evaluates the bezier in y.
 *
 * `convertEase(name)` dispatch:
 *   • Known string → return the matching functional ease.
 *   • Unknown string → check the custom ease registry via
 *     `TweenManager._getEase(name, true)` (returns the values array or
 *     a path solver). If nothing matches, fall back to `Cubic.Out` so
 *     callers always get a usable function.
 *
 * `solve(values, t)` — cubic-bezier sampling:
 *   1. `getTForX(x, x1, x2)` Newton-solves the bezier parameter t whose
 *      x equals the requested progress (4 iterations, slope-divided
 *      correction). Bezier basis: B(t) = ((A·t + B)·t + C)·t with
 *      A=1-3p2+3p1, B=3p2-6p1, C=3p1.
 *   2. `calculateBezier(t, y1, y2)` evaluates the y component at that t.
 *   3. Short-circuit when x1==y1 and x2==y2 (linear-ish) — t passes
 *      straight through.
 *
 * The non-bezier eases are standard-issue. Notable parameterizations:
 *   • Elastic.{In|Out|InOut}(k, a=1, p=0.4)  — `a` amplitude, `p` period;
 *     MathTween's spring/damping plumbing passes these in as a/p so
 *     authors can tune the wobble without writing a custom ease.
 *   • Back.InOut uses overshoot s=2.5949095 (the usual InOut variant of
 *     the s=1.70158 In/Out constants pre-multiplied for symmetry).
 *   • Bounce.In is defined as the mirror of Bounce.Out; InOut switches
 *     between them at the midpoint.
 */
TweenManager.Class(function Interpolation() {
  const self = this;

  // Cubic-bezier basis helpers.
  function A(aA1, aA2) { return 1 - 3 * aA2 + 3 * aA1; }
  function B(aA1, aA2) { return 3 * aA2 - 6 * aA1; }
  function C(aA1)      { return 3 * aA1; }

  function calculateBezier(aT, aA1, aA2) {
    return ((A(aA1, aA2) * aT + B(aA1, aA2)) * aT + C(aA1)) * aT;
  }

  /*
   * Map a string ease name to its functional form. Falls back to the
   * custom ease registry, then ultimately to Cubic.Out — so callers
   * never get an undefined back.
   */
  this.convertEase = function (ease) {
    let fn = (function () {
      switch (ease) {
        case 'easeInQuad':       return TweenManager.Interpolation.Quad.In;
        case 'easeInCubic':      return TweenManager.Interpolation.Cubic.In;
        case 'easeInQuart':      return TweenManager.Interpolation.Quart.In;
        case 'easeInQuint':      return TweenManager.Interpolation.Quint.In;
        case 'easeInSine':       return TweenManager.Interpolation.Sine.In;
        case 'easeInExpo':       return TweenManager.Interpolation.Expo.In;
        case 'easeInCirc':       return TweenManager.Interpolation.Circ.In;
        case 'easeInElastic':    return TweenManager.Interpolation.Elastic.In;
        case 'easeInBack':       return TweenManager.Interpolation.Back.In;
        case 'easeInBounce':     return TweenManager.Interpolation.Bounce.In;
        case 'easeOutQuad':      return TweenManager.Interpolation.Quad.Out;
        case 'easeOutCubic':     return TweenManager.Interpolation.Cubic.Out;
        case 'easeOutQuart':     return TweenManager.Interpolation.Quart.Out;
        case 'easeOutQuint':     return TweenManager.Interpolation.Quint.Out;
        case 'easeOutSine':      return TweenManager.Interpolation.Sine.Out;
        case 'easeOutExpo':      return TweenManager.Interpolation.Expo.Out;
        case 'easeOutCirc':      return TweenManager.Interpolation.Circ.Out;
        case 'easeOutElastic':   return TweenManager.Interpolation.Elastic.Out;
        case 'easeOutBack':      return TweenManager.Interpolation.Back.Out;
        case 'easeOutBounce':    return TweenManager.Interpolation.Bounce.Out;
        case 'easeInOutQuad':    return TweenManager.Interpolation.Quad.InOut;
        case 'easeInOutCubic':   return TweenManager.Interpolation.Cubic.InOut;
        case 'easeInOutQuart':   return TweenManager.Interpolation.Quart.InOut;
        case 'easeInOutQuint':   return TweenManager.Interpolation.Quint.InOut;
        case 'easeInOutSine':    return TweenManager.Interpolation.Sine.InOut;
        case 'easeInOutExpo':    return TweenManager.Interpolation.Expo.InOut;
        case 'easeInOutCirc':    return TweenManager.Interpolation.Circ.InOut;
        case 'easeInOutElastic': return TweenManager.Interpolation.Elastic.InOut;
        case 'easeInOutBack':    return TweenManager.Interpolation.Back.InOut;
        case 'easeInOutBounce':  return TweenManager.Interpolation.Bounce.InOut;
        case 'linear':           return TweenManager.Interpolation.Linear.None;
      }
    })();
    if (!fn) {
      const curve = TweenManager._getEase(ease, true);
      fn = curve || TweenManager.Interpolation.Cubic.Out;
    }
    return fn;
  };

  /*
   * Sample a cubic-bezier ease at progress `elapsed`. Newton-iterate
   * (4 rounds — sufficient for visual fidelity at typical frame rates)
   * to invert x→t, then evaluate y at that t.
   */
  this.solve = function (values, elapsed) {
    if (values[0] == values[1] && values[2] == values[3]) return elapsed;
    return calculateBezier(
      (function getTForX(aX, mX1, mX2) {
        let aGuessT = aX;
        for (let i = 0; i < 4; i++) {
          const aT  = aGuessT;
          const aA1 = mX1;
          const aA2 = mX2;
          const currentSlope = 3 * A(aA1, aA2) * aT * aT + 2 * B(aA1, aA2) * aT + C(aA1);
          if (0 == currentSlope) return aGuessT;
          aGuessT -= (calculateBezier(aGuessT, mX1, mX2) - aX) / currentSlope;
        }
        return aGuessT;
      })(elapsed, values[0], values[2]),
      values[1],
      values[3],
    );
  };

  // ── Functional ease library ────────────────────────────────────────

  this.Linear = {
    None: function (k) { return k; },
  };

  this.Quad = {
    In:    function (k) { return k * k; },
    Out:   function (k) { return k * (2 - k); },
    InOut: function (k) { return (k *= 2) < 1 ? 0.5 * k * k : -0.5 * (--k * (k - 2) - 1); },
  };

  this.Cubic = {
    In:    function (k) { return k * k * k; },
    Out:   function (k) { return --k * k * k + 1; },
    InOut: function (k) { return (k *= 2) < 1 ? 0.5 * k * k * k : 0.5 * ((k -= 2) * k * k + 2); },
  };

  this.Quart = {
    In:    function (k) { return k * k * k * k; },
    Out:   function (k) { return 1 - --k * k * k * k; },
    InOut: function (k) { return (k *= 2) < 1 ? 0.5 * k * k * k * k : -0.5 * ((k -= 2) * k * k * k - 2); },
  };

  this.Quint = {
    In:    function (k) { return k * k * k * k * k; },
    Out:   function (k) { return --k * k * k * k * k + 1; },
    InOut: function (k) { return (k *= 2) < 1 ? 0.5 * k * k * k * k * k : 0.5 * ((k -= 2) * k * k * k * k + 2); },
  };

  this.Sine = {
    In:    function (k) { return 1 - Math.cos((k * Math.PI) / 2); },
    Out:   function (k) { return Math.sin((k * Math.PI) / 2); },
    InOut: function (k) { return 0.5 * (1 - Math.cos(Math.PI * k)); },
  };

  this.Expo = {
    In:    function (k) { return 0 === k ? 0 : Math.pow(1024, k - 1); },
    Out:   function (k) { return 1 === k ? 1 : 1 - Math.pow(2, -10 * k); },
    InOut: function (k) {
      return 0 === k
        ? 0
        : 1 === k
          ? 1
          : (k *= 2) < 1
            ? 0.5 * Math.pow(1024, k - 1)
            : 0.5 * (2 - Math.pow(2, -10 * (k - 1)));
    },
  };

  this.Circ = {
    In:    function (k) { return 1 - Math.sqrt(1 - k * k); },
    Out:   function (k) { return Math.sqrt(1 - --k * k); },
    InOut: function (k) {
      return (k *= 2) < 1
        ? -0.5 * (Math.sqrt(1 - k * k) - 1)
        :  0.5 * (Math.sqrt(1 - (k -= 2) * k) + 1);
    },
  };

  /*
   * Elastic — `a` amplitude, `p` period. MathTween threads its spring/
   * damping settings in as a/p so users can call
   *   tween(obj, {x:1, spring:1.2, damping:0.35}, 1, 'easeOutElastic')
   * and get a tuned wobble without authoring a custom curve.
   */
  this.Elastic = {
    In: function (k, a = 1, p = 0.4) {
      let s;
      if (0 === k) return 0;
      if (1 === k) return 1;
      if (!a || a < 1) { a = 1; s = p / 4; }
      else { s = (p * Math.asin(1 / a)) / (2 * Math.PI); }
      return -a * Math.pow(2, 10 * (k -= 1)) * Math.sin(((k - s) * (2 * Math.PI)) / p);
    },
    Out: function (k, a = 1, p = 0.4) {
      let s;
      if (0 === k) return 0;
      if (1 === k) return 1;
      if (!a || a < 1) { a = 1; s = p / 4; }
      else { s = (p * Math.asin(1 / a)) / (2 * Math.PI); }
      return a * Math.pow(2, -10 * k) * Math.sin(((k - s) * (2 * Math.PI)) / p) + 1;
    },
    InOut: function (k, a = 1, p = 0.4) {
      let s;
      if (0 === k) return 0;
      if (1 === k) return 1;
      if (!a || a < 1) { a = 1; s = p / 4; }
      else { s = (p * Math.asin(1 / a)) / (2 * Math.PI); }
      return (k *= 2) < 1
        ? a * Math.pow(2,  10 * (k -= 1)) * Math.sin(((k - s) * (2 * Math.PI)) / p) * -0.5
        : a * Math.pow(2, -10 * (k -= 1)) * Math.sin(((k - s) * (2 * Math.PI)) / p) *  0.5 + 1;
    },
  };

  /*
   * Back — overshoots and settles. The s constant controls overshoot;
   * 2.5949095 in InOut is the pre-scaled value matching the symmetric
   * variant of the s=1.70158 In/Out forms.
   */
  this.Back = {
    In:    function (k) { const s = 1.70158;   return k * k * ((s + 1) * k - s); },
    Out:   function (k) { const s = 1.70158;   return --k * k * ((s + 1) * k + s) + 1; },
    InOut: function (k) {
      const s = 2.5949095;
      return (k *= 2) < 1
        ? k * k * ((s + 1) * k - s) * 0.5
        : 0.5 * ((k -= 2) * k * ((s + 1) * k + s) + 2);
    },
  };

  /*
   * Bounce — piecewise polynomial. In is defined via Out so the two
   * stay in lockstep; InOut routes the first half through In and the
   * second half through Out.
   */
  this.Bounce = {
    In:  function (k) { return 1 - self.Bounce.Out(1 - k); },
    Out: function (k) {
      return k < 1 / 2.75
        ? 7.5625 * k * k
        : k < 2 / 2.75
          ? 7.5625 * (k -= 1.5 / 2.75) * k + 0.75
          : k < 2.5 / 2.75
            ? 7.5625 * (k -= 2.25 / 2.75) * k + 0.9375
            : 7.5625 * (k -= 2.625 / 2.75) * k + 0.984375;
    },
    InOut: function (k) {
      return k < 0.5 ? 0.5 * self.Bounce.In(2 * k) : 0.5 * self.Bounce.Out(2 * k - 1) + 0.5;
    },
  };
}, 'Static');

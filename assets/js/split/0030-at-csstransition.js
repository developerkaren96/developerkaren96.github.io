/*
 * CSSTransition — animate properties on a DOM-backed HydraObject using the
 * browser's *native* CSS transition engine (rather than per-frame tweening).
 *
 *   new CSSTransition(obj, { x: 100, opacity: 0.5 }, time, ease, delay, cb)
 *
 * Workflow:
 *   1. Partition the requested props into transform-style ones (x, y, scale,
 *      rotation, …) and plain CSS ones (numeric / string / color-bearing).
 *      Together with `HydraCSS.transformProperty` they form the list of
 *      properties that need a `transition: ...` rule.
 *   2. After a 3-frame settle (so any earlier transition can wash out), the
 *      built `transition` string is written to the element, and one frame
 *      later the new property values are applied. Browsers (and especially
 *      old Safari) require this stagger to actually animate rather than snap.
 *   3. When `time + delay` elapses we run `_callback` and resolve the
 *      `completePromise` (if anyone asked for one via `.promise()`).
 *
 * The hosting object remembers the currently active CSS tween at
 * `_object._cssTween` and the previous one is `kill`-marked on overlap.
 *
 * `willChange(props)` toggles the CSS `will-change` hint for the duration of
 * the animation and is cleared on completion / kill.
 */
Class(function CSSTransition(_object, _props, _time, _ease, _delay, _callback) {
  const self = this;
  let _transformProps, _transitionProps;

  // Bail if the host object has been torn down underneath us.
  function killed() {
    return !self || self.kill || !_object || !_object.div;
  }

  function clearCSSTween() {
    if (killed()) return;
    self.playing = false;
    _object._cssTween = null;
    _object.willChange(null);
    _object = _props = null;
    Utils.nullObject(self);
  }

  this.playing = true;

  (function () {
    if ('number' != typeof _time) throw 'CSSTween Requires object, props, time, ease';

    // Split `_props` into transforms (collected via TweenManager helpers)
    // vs everything else (CSS properties). Stroke-dashoffset is special-cased
    // because the JS name and the CSS name differ.
    (function initProperties() {
      const transform = TweenManager._getAllTransforms(_object);
      const properties = [];
      for (const key in _props) {
        if (TweenManager._isTransform(key)) {
          transform.use = true;
          transform[key] = _props[key];
          delete _props[key];
        } else if ('number' == typeof _props[key] || key.includes(['-', 'color'])) {
          properties.push(key);
        }
      }
      if (transform.use) {
        properties.push(HydraCSS.transformProperty);
        delete transform.use;
      }
      properties.forEach((prop, index) => {
        if ('strokeDashoffset' == prop) properties[index] = 'stroke-dashoffset';
      });
      _transformProps  = transform;
      _transitionProps = properties;
    })();

    (async function initCSSTween(values) {
      if (killed()) return;
      // Kill any previous transition on this object.
      if (_object._cssTween) _object._cssTween.kill = true;
      _object._cssTween         = self;
      _object.div._transition   = true;

      // Build "prop1 200ms easeOutCubic 0ms, prop2 200ms ..." strings.
      const strings = (function buildStrings(time, ease, delay) {
        let props = '', str = '';
        for (let i = 0, len = _transitionProps.length; i < len; i++) {
          const p = _transitionProps[i];
          props += (props.length ? ', ' : '') + p;
          str   += (str.length ? ', ' : '') +
                   `${p} ${time}ms ${TweenManager._getEase(ease)} ${delay}ms`;
        }
        return { props, transition: str };
      })(_time, _ease, _delay);

      _object.willChange(strings.props);

      // The `values` arg only ever fires if a subclass restages the tween.
      const time           = values ? values.time      : _time;
      const delay          = values ? values.delay     : _delay;
      const props          = values ? values.props     : _props;
      const transformProps = values ? values.transform : _transformProps;
      const singleFrame    = 1e3 / Render.REFRESH_RATE;

      self.time  = _time;
      self.delay = _delay;

      // 3-frame settle so an in-flight transition fully reaches its target
      // before we install a new one.
      await Timer.delayedCall(3 * singleFrame);
      if (killed()) return;

      _object.div.style[HydraCSS.styles.vendorTransition] = strings.transition;
      self.playing = true;

      // Old Safari needs one more frame between transition-write and value-
      // write or it merges them and animates nothing.
      if ('safari' == Device.system.browser) {
        if (Device.system.browserVersion < 11) await Timer.delayedCall(singleFrame);
        if (killed()) return;
        _object.css(props);
        _object.transform(transformProps);
      } else {
        _object.css(props);
        _object.transform(transformProps);
      }

      // Fixed-time completion fires `_callback` and resolves the promise.
      Timer.create(function () {
        if (killed()) return;
        clearCSSTween();
        if (_callback) _callback();
        if (self.completePromise) self.completePromise.resolve();
      }, time + delay);
    })();
  })();

  this.stop = function () {
    if (!this.playing) return;
    this.kill          = true;
    this.playing       = false;
    _object.div.style[HydraCSS.styles.vendorTransition] = '';
    _object.div._transition = false;
    _object.willChange(null);
    _object._cssTween  = null;
    Utils.nullObject(this);
  };

  this.onComplete = function (callback) { _callback = callback; return this; };
  this.promise    = function () {
    if (!self.completePromise) self.completePromise = Promise.create();
    return self.completePromise;
  };
});

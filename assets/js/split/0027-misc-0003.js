(function () {
  const cursorLockIdProp = 'function' == typeof Symbol ? Symbol('cursorLockId') : '_cursorLockId';
  $.fn.text = function (text) {
    return undefined !== text
      ? (this.__cacheText != text && (this.div.textContent = text), (this.__cacheText = text), this)
      : this.div.textContent;
  };
  $.fn.html = function (text, force) {
    return !text || text.includes('<') || force
      ? undefined !== text
        ? ((this.div.innerHTML = text), this)
        : this.div.innerHTML
      : this.text(text);
  };
  $.fn.hide = function () {
    return ((this.div.style.display = 'none'), this);
  };
  $.fn.show = function () {
    return ((this.div.style.display = ''), this);
  };
  $.fn.visible = function () {
    return ((this.div.style.visibility = 'visible'), this);
  };
  $.fn.invisible = function () {
    return ((this.div.style.visibility = 'hidden'), this);
  };
  $.fn.setZ = function (z) {
    return ((this.div.style.zIndex = z), this);
  };
  $.fn.clearAlpha = function () {
    return ((this.div.style.opacity = ''), this);
  };
  $.fn.size = function (w, h, noScale) {
    return (
      'string' == typeof w
        ? (undefined === h ? (h = '100%') : 'string' != typeof h && (h += 'px'),
          (this.div.style.width = w),
          (this.div.style.height = h))
        : ((this.div.style.width = w + 'px'),
          (this.div.style.height = h + 'px'),
          noScale || (this.div.style.backgroundSize = w + 'px ' + h + 'px')),
      (this.width = w),
      (this.height = h),
      this
    );
  };
  $.fn.mouseEnabled = function (bool) {
    return ((this.div.style.pointerEvents = bool ? 'auto' : 'none'), this);
  };
  $.fn.fontStyle = function (family, size, color, style) {
    var font = {};
    return (
      family && (font.fontFamily = family),
      size && (font.fontSize = size),
      color && (font.color = color),
      style && (font.fontStyle = style),
      this.css(font),
      this
    );
  };
  $.fn.font = function (font) {
    return (this.css('font', font), this);
  };
  $.fn.bg = function (src, x, y, repeat) {
    return src
      ? (src.includes('.') && (src = Assets.getPath(src)),
        src.includes('.')
          ? (this.div.style.backgroundImage = 'url(' + src + ')')
          : (this.div.style.backgroundColor = src),
        undefined !== x &&
          ((x = 'number' == typeof x ? x + 'px' : x),
          (y = 'number' == typeof y ? y + 'px' : y),
          (this.div.style.backgroundPosition = x + ' ' + y)),
        repeat &&
          ((this.div.style.backgroundSize = ''), (this.div.style.backgroundRepeat = repeat)),
        ('cover' != x && 'contain' != x) ||
          ((this.div.style.backgroundSize = x),
          (this.div.style.backgroundPosition = undefined !== y ? y + ' ' + repeat : 'center')),
        this)
      : this;
  };
  $.fn.svgMask = function (src) {
    return src
      ? (src.includes('.') && (src = Assets.getPath(src)),
        (this.div.style.maskImage = `url(${src})`),
        (this.div.style.webkitMaskImage = `url(${src})`),
        this)
      : this;
  };
  $.fn.center = function (x, y, noPos) {
    var css = {};
    return (
      undefined === x
        ? ((css.left = '50%'),
          (css.top = '50%'),
          (css.marginLeft = -this.width / 2),
          (css.marginTop = -this.height / 2))
        : (x && ((css.left = '50%'), (css.marginLeft = -this.width / 2)),
          y && ((css.top = '50%'), (css.marginTop = -this.height / 2))),
      noPos && (delete css.left, delete css.top),
      this.css(css),
      this
    );
  };
  $.fn.max = function (width, height) {
    let w, h;
    return (
      undefined !== width &&
        ((w = 'number' == typeof width ? width + 'px' : width), (this.div.style.maxWidth = w)),
      undefined !== height
        ? ((h = 'number' == typeof height ? height + 'px' : height), (this.div.style.maxHeight = h))
        : ((h = w), (this.div.style.maxHeight = h)),
      this
    );
  };
  $.fn.min = function (width, height) {
    let w, h;
    return (
      undefined !== width &&
        ((w = 'number' == typeof width ? width + 'px' : width), (this.div.style.minWidth = w)),
      undefined !== height
        ? ((h = 'number' == typeof height ? height + 'px' : height), (this.div.style.minHeight = h))
        : ((h = w), (this.div.style.minHeight = h)),
      this
    );
  };
  $.fn.flex = function (inline) {
    return (
      (this.div.style.display = inline ? 'inline-flex' : 'flex'),
      (this.div.style.justifyContent = 'center'),
      (this.div.style.alignItems = 'center'),
      this.div.classList.add('relative-children'),
      this
    );
  };
  $.fn.order = function (opts = {}) {
    let s = this.div.style;
    return (
      'none' === opts.flexWrap && (opts.flexWrap = 'nowrap'),
      opts.direction && (s.flexDirection = opts.direction),
      opts.wrap && (s.flexWrap = opts.wrap),
      opts.order && (s.order = opts.order),
      this
    );
  };
  $.fn.align = function (opts = {}) {
    let s = this.div.style;
    function flex(str, contentMode = false) {
      return 'start' === str
        ? 'flex-start'
        : 'end' === str
          ? 'flex-end'
          : 'between' === str
            ? contentMode
              ? 'space-between'
              : 'flex-between'
            : 'around' === str
              ? contentMode
                ? 'space-around'
                : 'flex-around'
              : 'none' === str
                ? 'nowrap'
                : str;
    }
    return (
      opts.justify && (s.justifyContent = flex(opts.justify)),
      opts.items && (s.alignItems = flex(opts.items)),
      opts.self && (s.alignSelf = flex(opts.self)),
      opts.content && (s.alignContent = flex(opts.content, true)),
      this
    );
  };
  $.fn.flexibility = function (opts = {}) {
    let s = this.div.style;
    return (
      'undefined' !== opts.grow && (s.flexGrow = opts.grow),
      'undefined' !== opts.shrink && (s.flexGrow = opts.shrink),
      undefined !== opts.basis &&
        (s.flexBasis = 'number' == typeof opts.basis ? opts.basis + 'px' : opts.basis),
      this
    );
  };
  $.fn.mask = function (arg) {
    let maskPrefix = 'Moz' === HydraCSS.styles.vendor ? 'mask' : HydraCSS.prefix('Mask');
    return (
      (this.div.style[maskPrefix] = (arg.includes('.') ? 'url(' + arg + ')' : arg) + ' no-repeat'),
      (this.div.style[maskPrefix + 'Size'] = 'contain'),
      this
    );
  };
  $.fn.blendMode = function (mode, bg) {
    return (
      bg
        ? (this.div.style['background-blend-mode'] = mode)
        : (this.div.style['mix-blend-mode'] = mode),
      this
    );
  };
  const DEFAULT_UNITS = {
    animationDelay: 'ms',
    animationDuration: 'ms',
    transitionDelay: 'ms',
    transitionDuration: 'ms',
    perspectiveOriginX: '%',
    perspectiveOriginY: '%',
    transformOrigin: '%',
    transformOriginX: '%',
    transformOriginY: '%',
    transformOriginZ: '%',
    rotate: 'deg',
    animationIterationCount: false,
    borderImageSlice: false,
    borderImageWidth: false,
    columnCount: false,
    counterIncrement: false,
    counterReset: false,
    flex: false,
    flexGrow: false,
    flexShrink: false,
    fontSizeAdjust: false,
    fontWeight: false,
    lineHeight: false,
    navIndex: false,
    opacity: false,
    order: false,
    orphans: false,
    tabSize: false,
    widows: false,
    zIndex: false,
    scale: false,
  };
  function clsxToVal(mix) {
    var k,
      y,
      str = '';
    if ('string' == typeof mix || 'number' == typeof mix) str += mix;
    else if ('object' == typeof mix)
      if (Array.isArray(mix)) {
        var len = mix.length;
        for (k = 0; k < len; k++)
          mix[k] && (y = toVal(mix[k])) && (str && (str += ' '), (str += y));
      } else for (y in mix) mix[y] && (str && (str += ' '), (str += y));
    return str;
  }
  $.fn.css = function (obj, value) {
    if (('boolean' == typeof value && (value = null), 'object' != typeof obj)) {
      if (value) return ((this.div.style[obj] = value), this);
      var style = this.div.style[obj];
      if ('number' != typeof style) {
        if (!style) return false;
        style.includes('px') && (style = Number(style.slice(0, -2)));
        'opacity' == obj &&
          (style = isNaN(Number(this.div.style.opacity)) ? 1 : Number(this.div.style.opacity));
      }
      return (style || (style = 0), style);
    }
    TweenManager._clearCSSTween(this);
    for (let type in obj) {
      let val = obj[type];
      if ('string' == typeof val || 'number' == typeof val) {
        if ('number' == typeof val) {
          let unit = DEFAULT_UNITS[type];
          false !== unit && (val += unit || 'px');
        }
        'position' == type &&
          'sticky' == val &&
          'safari' == Device.system.browser &&
          (val = '-webkit-sticky');
        this.div.style[type] = val;
      }
    }
    return this;
  };
  $.fn.transform = function (props) {
    if (
      (Hydra.LOCAL &&
        props &&
        !this.__warningShown &&
        !props._mathTween &&
        (this.__lastTransform &&
          performance.now() - this.__lastTransform < 20 &&
          ((this.__warningCount = ++this.__warningCount || 1),
          (props.__warningCount2 = ++props.__warningCount2 || 1),
          this.__warningCount > 10 &&
            props.__warningCount2 !== this.__warningCount &&
            (console.warn(
              'Are you using .transform() in a loop? Avoid creating a new object {} every frame. Ex. assign .x = 1; and .transform();',
            ),
            console.log(this),
            (this.__warningShown = true))),
        (this.__lastTransform = performance.now())),
      TweenManager._clearCSSTween(this),
      Device.tween.css2d)
    ) {
      if (props)
        for (var key in props)
          ('number' != typeof props[key] && 'string' != typeof props[key]) ||
            (this[key] = props[key]);
      else props = this;
      var transformString = TweenManager._parseTransform(props);
      this.__transformCache != transformString &&
        ((this.div.style[HydraCSS.styles.vendorTransform] = transformString),
        (this.__transformCache = transformString));
    }
    return this;
  };
  $.fn.willChange = function (props) {
    if ('boolean' == typeof props) this._willChangeLock = true === props;
    else if (this._willChangeLock) return;
    var string = 'string' == typeof props;
    (this._willChange && !string) || 'null' == typeof props
      ? ((this._willChange = false), (this.div.style['will-change'] = ''))
      : ((this._willChange = true),
        (this.div.style['will-change'] = string
          ? props
          : HydraCSS.transformProperty + ', opacity'));
  };
  $.fn.backfaceVisibility = function (visible) {
    this.div.style[HydraCSS.prefix('BackfaceVisibility')] = visible ? 'visible' : 'hidden';
  };
  $.fn.enable3D = function (perspective, x, y) {
    return Device.tween.css3d
      ? ((this.div.style[HydraCSS.prefix('TransformStyle')] = 'preserve-3d'),
        perspective && (this.div.style[HydraCSS.prefix('Perspective')] = perspective + 'px'),
        undefined !== x &&
          ((x = 'number' == typeof x ? x + 'px' : x),
          (y = 'number' == typeof y ? y + 'px' : y),
          (this.div.style[HydraCSS.prefix('PerspectiveOrigin')] = x + ' ' + y)),
        this)
      : this;
  };
  $.fn.disable3D = function () {
    return (
      (this.div.style[HydraCSS.prefix('TransformStyle')] = ''),
      (this.div.style[HydraCSS.prefix('Perspective')] = ''),
      this
    );
  };
  $.fn.transformPoint = function (x, y, z) {
    var origin = '';
    return (
      undefined !== x && (origin += 'number' == typeof x ? x + 'px ' : x + ' '),
      undefined !== y && (origin += 'number' == typeof y ? y + 'px ' : y + ' '),
      undefined !== z && (origin += 'number' == typeof z ? z + 'px' : z),
      (this.div.style[HydraCSS.prefix('TransformOrigin')] = origin),
      this
    );
  };
  $.fn.tween = function (props, time, ease, delay, callback, manual) {
    'boolean' == typeof delay
      ? ((manual = delay), (delay = 0), (callback = null))
      : 'function' == typeof delay && ((callback = delay), (delay = 0));
    'boolean' == typeof callback && ((manual = callback), (callback = null));
    delay || (delay = 0);
    var usePromise = null;
    callback &&
      callback instanceof Promise &&
      ((usePromise = callback), (callback = callback.resolve));
    var tween = TweenManager._detectTween(this, props, time, ease, delay, callback, manual);
    return usePromise || tween;
  };
  $.fn.clearTransform = function () {
    return (
      'number' == typeof this.x && (this.x = 0),
      'number' == typeof this.y && (this.y = 0),
      'number' == typeof this.z && (this.z = 0),
      'number' == typeof this.scale && (this.scale = 1),
      'number' == typeof this.scaleX && (this.scaleX = 1),
      'number' == typeof this.scaleY && (this.scaleY = 1),
      'number' == typeof this.rotation && (this.rotation = 0),
      'number' == typeof this.rotationX && (this.rotationX = 0),
      'number' == typeof this.rotationY && (this.rotationY = 0),
      'number' == typeof this.rotationZ && (this.rotationZ = 0),
      'number' == typeof this.skewX && (this.skewX = 0),
      'number' == typeof this.skewY && (this.skewY = 0),
      (this.div.style[HydraCSS.styles.vendorTransform] = ''),
      (this.__transformCache = ''),
      this
    );
  };
  $.fn.clearTween = function () {
    return (
      this._cssTween && this._cssTween.stop(),
      this._mathTween && this._mathTween.stop(),
      this
    );
  };
  $.fn.stopTween = function () {
    return (console.warn('.stopTween deprecated. use .clearTween instead'), this.clearTween());
  };
  $.fn.keypress = function (callback) {
    this.div.onkeypress = function (e) {
      (e = e || window.event).code = e.keyCode ? e.keyCode : e.charCode;
      callback && callback(e);
    };
  };
  $.fn.keydown = function (callback) {
    this.div.onkeydown = function (e) {
      (e = e || window.event).code = e.keyCode;
      callback && callback(e);
    };
  };
  $.fn.keyup = function (callback) {
    this.div.onkeyup = function (e) {
      (e = e || window.event).code = e.keyCode;
      callback && callback(e);
    };
  };
  $.fn.attr = function (attr, value) {
    return 'string' != typeof attr
      ? this
      : undefined === value
        ? this.div.getAttribute(attr)
        : (false === value || null === value
            ? this.div.removeAttribute(attr)
            : this.div.setAttribute(attr, value),
          this);
  };
  $.fn.val = function (value) {
    return undefined === value ? this.div.value : ((this.div.value = value), this);
  };
  $.fn.change = $.fn.onChange = function (callback) {
    var self = this;
    this.div.onchange = this.div.onblur = function () {
      callback({
        object: self,
        value: self.div.value || '',
      });
    };
  };
  $.fn.svgSymbol = function (id, width, height) {
    var config = SVG.getSymbolConfig(id),
      svgHTML =
        '<svg viewBox="0 0 ' +
        config.width +
        ' ' +
        config.height +
        '" width="' +
        width +
        '" height="' +
        height +
        '"><use xlink:href="#' +
        config.id +
        '" x="0" y="0" /></svg>';
    this.html(svgHTML, true);
  };
  $.fn.svg = async function (url) {
    let promise = Promise.create();
    return (
      fetch(url).then(async (res) => {
        let svgHTML = await res.text();
        this.html(svgHTML, true);
        promise.resolve();
      }),
      promise
    );
  };
  $.fn.overflowScroll = function (dir) {
    var x = !!dir.x,
      y = !!dir.y,
      overflow = {};
    return (
      ((!x && !y) || (x && y)) && (overflow.overflow = 'auto'),
      !x && y && ((overflow.overflowY = 'auto'), (overflow.overflowX = 'hidden')),
      x && !y && ((overflow.overflowX = 'auto'), (overflow.overflowY = 'hidden')),
      Device.mobile &&
        ((overflow['-webkit-overflow-scrolling'] = 'touch'), Mobile._addOverflowScroll(this)),
      this.css(overflow)
    );
  };
  $.fn.removeOverflowScroll = function () {
    return (
      this.css({
        overflow: 'hidden',
        overflowX: '',
        overflowY: '',
        '-webkit-overflow-scrolling': '',
      }),
      Device.mobile && Mobile._removeOverflowScroll(this),
      this
    );
  };
  $.fn.accessible = function (type = 'label', tabIndex = -1) {
    switch ((tabIndex > -1 && this.attr('tabindex', tabIndex), type)) {
      case 'label':
        this.attr('aria-label', this.div.textContent);
        break;
      case 'hidden':
        this.attr('aria-hidden', true);
    }
    return this;
  };
  $.fn.tabIndex = function (tabIndex) {
    return (this.attr('tabindex', tabIndex), this);
  };
  $.fn.createObserver = function (callback, { isViewport = false, ...options } = {}) {
    isViewport && (options.root = this.div);
    const observer = (this._observer = new IntersectionObserver((array) => {
      array.forEach((entry) => {
        entry.object = entry.target.hydraObject;
      });
      callback(array);
    }, options));
    return (
      this._bindOnDestroy(() => {
        observer.disconnect();
      }),
      this
    );
  };
  $.fn.observe = function (obj = this) {
    return (this._observer?.observe(obj.div), this);
  };
  $.fn.unobserve = function (obj = this) {
    return (this._observer?.unobserve(obj.div), this);
  };
  $.fn.cursor = function (cursor, lock) {
    if (!Device.mobile) {
      if (lock) {
        lock[cursorLockIdProp] || (lock[cursorLockIdProp] = {});
        let id = lock[cursorLockIdProp];
        this.cursorLock || (this.cursorLock = new Map());
        'auto' == cursor ? this.cursorLock.delete(id) : this.cursorLock.set(id, cursor);
      }
      return (
        this.cursorLock &&
          'auto' == cursor &&
          this.cursorLock.forEach((v) => {
            cursor = v;
          }),
        this.css('cursor', cursor),
        this
      );
    }
  };
  $.fn.classList = function () {
    return this.div.classList;
  };
  $.fn.clsx = function (...args) {
    for (var tmp, x, i = 0, str = '', len = args.length; i < len; i++)
      (tmp = args[i]) && (x = clsxToVal(tmp)) && (str && (str += ' '), (str += x));
    return (this.div.classList.add(...str.split(' ')), this);
  };
  $.fn.goob = function (styles) {
    let _styles;
    return (
      (_styles = 'string' == typeof styles ? goober.css`${styles}` : goober.css(styles)),
      (this.goobClass = _styles),
      this.div.classList.add(_styles),
      this
    );
  };
  $.fn.glob = function (styles) {
    let key = styles.replace('\n', '').slice(0, 100);
    goober.globbed || (goober.globbed = {});
    goober.globbed[key] || (goober.glob(styles), (goober.globbed[key] = 1));
  };
  $.fn.href = function (str) {
    return (this.attr('href', str), this);
  };
  $.fn.target = function (str) {
    return (this.attr('target', str), this);
  };
  $.fn.ariaLabel = function (str) {
    return (this.attr('aria-label', str), this);
  };
  $.fn.alt = function (str) {
    return (this.attr('alt', str), this);
  };
  $.fn.src = function (str) {
    return (this.attr('src', str), this);
  };
  $.fn.display = function (bool) {
    bool ? $this.show() : $this.hide();
  };
  $.fn.type = function (str) {
    return (this.attr('type', str), this);
  };
  $.fn.id = function (str) {
    return (this.attr('id', str), this);
  };
  $.fn.htmlFor = function (str) {
    return (this.attr('for', str), this);
  };
  $.fn.ariaLabelledBy = function (str) {
    return (this.attr('aria-labelledby', str), this);
  };
  $.fn.checked = function (bool) {
    return (this.attr('checked', bool), this);
  };
  $.fn.min = function (num) {
    return (this.attr('min', num), this);
  };
  $.fn.max = function (num) {
    return (this.attr('max', num), this);
  };
  $.fn.step = function (num) {
    return (this.attr('step', num), this);
  };
  $.fn.value = function (any) {
    return (this.attr('value', any), this);
  };
  $.fn.title = function (str) {
    return (this.attr('title', str), this);
  };
  $.fn.minlength = function (num) {
    return (this.attr('minlength', num), this);
  };
  $.fn.maxlength = function (num) {
    return (this.attr('maxlength', num), this);
  };
  $.fn.rows = function (num) {
    return (this.attr('rows', num), this);
  };
  $.fn.readonly = function (bool) {
    return (this.attr('readonly', bool), this);
  };
})();
(function () {
  var windowsPointer = !!window.MSGesture,
    translateEvent = function (evt) {
      if (windowsPointer)
        switch (evt) {
          case 'touchstart':
            return 'pointerdown';
          case 'touchmove':
            return 'MSGestureChange';
          case 'touchend':
            return 'pointerup';
        }
      return evt;
    },
    convertTouchEvent = function (e) {
      var touchEvent = {
        x: 0,
        y: 0,
      };
      if (e.windowsPointer) return e;
      if (!e) return touchEvent;
      if (
        (e.touches || e.changedTouches
          ? e.touches.length
            ? ((touchEvent.x = e.touches[0].clientX), (touchEvent.y = e.touches[0].clientY))
            : ((touchEvent.x = e.changedTouches[0].clientX),
              (touchEvent.y = e.changedTouches[0].clientY))
          : ((touchEvent.x = e.clientX), (touchEvent.y = e.clientY)),
        Mobile.ScreenLock &&
          Mobile.ScreenLock.isActive &&
          Mobile.orientationSet &&
          Mobile.orientation !== Mobile.orientationSet)
      ) {
        if (90 == window.orientation || 0 === window.orientation) {
          var x = touchEvent.y;
          touchEvent.y = touchEvent.x;
          touchEvent.x = Stage.width - x;
        }
        if (-90 == window.orientation || 180 === window.orientation) {
          var y = touchEvent.x;
          touchEvent.x = touchEvent.y;
          touchEvent.y = Stage.height - y;
        }
      }
      return touchEvent;
    };
  function addSharedEventListener(self, unique, evt, callback, fn, options) {
    self._events = self._events || {};
    let key = `${unique}_${evt}`;
    self._events[key] = self._events[key] || {
      options: options,
      destroy: addTrackedEventListener(self, evt, fn, options),
      callbacks: [],
    };
    self._events[key].callbacks.push({
      callback: callback,
      target: self.div,
    });
  }
  function callSharedEventListenerCallbacks(self, unique, evt, e) {
    let { callbacks: callbacks } = self._events[`${unique}_${evt}`];
    for (let i = 0; i < callbacks.length; i++) {
      let { callback: callback, target: target } = callbacks[i];
      callback && target == e.currentTarget && callback(e);
    }
  }
  function addTrackedEventListener(self, evt, callback, options) {
    evt = translateEvent(evt);
    self._cleanups = self._cleanups || new Set();
    let cleanup = () => {
      self.div.removeEventListener(evt, callback, options);
      self._cleanups.delete(cleanup);
    };
    return (
      self._cleanups.add(cleanup),
      self.div.addEventListener(evt, callback, options),
      cleanup
    );
  }
  $.fn.click = function (callback) {
    var self = this;
    return (
      addSharedEventListener(
        self,
        'click',
        'click',
        callback,
        function click(e) {
          return (
            !!self.div &&
            !Mouse._preventClicks &&
            ((e.object = 'hit' == self.div.className ? self.parent() : self),
            (e.action = 'click'),
            callSharedEventListenerCallbacks(self, 'click', 'click', e),
            void (Mouse.autoPreventClicks && Mouse.preventClicks()))
          );
        },
        true,
      ),
      (this.div.style.cursor = 'pointer'),
      this
    );
  };
  $.fn.hover = function (callback) {
    var _time,
      self = this,
      _over = false;
    function hover(e) {
      if (!self.div) return false;
      var time = performance.now(),
        original = e.toElement || e.relatedTarget;
      if (_time && time - _time < 5) return ((_time = time), false);
      switch (
        ((_time = time), (e.object = 'hit' == self.div.className ? self.parent() : self), e.type)
      ) {
        case 'mouseout':
        case 'mouseleave':
          e.action = 'out';
          break;
        default:
          e.action = 'over';
      }
      if (_over) {
        if (Mouse._preventClicks) return false;
        if ('over' == e.action) return false;
        if ('out' == e.action && isAChild(self.div, original)) return false;
        _over = false;
      } else {
        if ('out' == e.action) return false;
        _over = true;
      }
      callSharedEventListenerCallbacks(self, 'hover', 'mouseover', e);
    }
    function isAChild(div, object) {
      for (var len = div.children.length - 1, i = len; i > -1; i--)
        if (object == div.children[i]) return true;
      for (i = len; i > -1; i--) if (isAChild(div.children[i], object)) return true;
    }
    return (
      addSharedEventListener(self, 'hover', 'mouseover', callback, hover, true),
      addSharedEventListener(self, 'hover', 'mouseout', callback, hover, true),
      this
    );
  };
  $.fn.press = function (callback) {
    var self = this;
    function press(action, e) {
      if (!self.div) return false;
      e.object = 'hit' == self.div.className ? self.parent() : self;
      e.action = action;
      callback && callback(e);
    }
    return (
      this.bind('touchstart', (e) => press('down', e), true),
      this.bind('touchend', (e) => press('up', e), true),
      this
    );
  };
  $.fn.bind = function (evt, callback) {
    var self = this;
    if (windowsPointer && this == __window) return Stage.bind(evt, callback);
    'touchstart' == evt
      ? Device.mobile ||
        (Device.touchCapable ? this.bind('mousedown', callback) : (evt = 'mousedown'))
      : 'touchmove' == evt
        ? (Device.mobile ||
            (Device.touchCapable ? this.bind('mousemove', callback) : (evt = 'mousemove')),
          windowsPointer &&
            !this.div.msGesture &&
            ((this.div.msGesture = new MSGesture()), (this.div.msGesture.target = this.div)))
        : 'touchend' == evt &&
          (Device.mobile ||
            (Device.touchCapable ? this.bind('mouseup', callback) : (evt = 'mouseup')));
    var target = this.div;
    return (
      addSharedEventListener(
        self,
        'bind',
        evt,
        callback,
        function touchEvent(e) {
          windowsPointer &&
            target.msGesture &&
            'touchstart' == evt &&
            target.msGesture.addPointer(e.pointerId);
          Device.mobile || 'touchstart' != evt || e.preventDefault();
          var touch = convertTouchEvent(e);
          if (windowsPointer) {
            var windowsEvt = e;
            (e = {}).preventDefault = () => windowsEvt.preventDefault();
            e.stopPropagation = () => windowsEvt.stopPropagation();
            e.x = Number(windowsEvt.clientX);
            e.y = Number(windowsEvt.clientY);
            e.target = windowsEvt.target;
            e.currentTarget = windowsEvt.currentTarget;
            e.path = [];
            for (var node = e.target; node; ) {
              e.path.push(node);
              node = node.parentElement || null;
            }
            e.windowsPointer = true;
          } else {
            e.x = touch.x;
            e.y = touch.y;
          }
          callSharedEventListenerCallbacks(self, 'bind', evt, e);
        },
        {
          capture: true,
          passive: false,
        },
      ),
      this
    );
  };
  $.fn.unbind = function (evt, callback) {
    return windowsPointer && this == __window
      ? Stage.unbind(evt, callback)
      : ('touchstart' == evt
          ? Device.mobile ||
            (Device.touchCapable ? this.unbind('mousedown', callback) : (evt = 'mousedown'))
          : 'touchmove' == evt
            ? Device.mobile ||
              (Device.touchCapable ? this.unbind('mousemove', callback) : (evt = 'mousemove'))
            : 'touchend' == evt &&
              (Device.mobile ||
                (Device.touchCapable ? this.unbind('mouseup', callback) : (evt = 'mouseup'))),
        (function removeSharedEventListener(self, unique, evt, callback) {
          if (!self._events) return;
          let key = `${unique}_${evt}`,
            binding = self._events[key];
          if (binding) {
            let { callbacks: callbacks } = binding;
            for (let i = 0; i < callbacks.length; i++)
              if (callbacks[i].callback === callback) {
                callbacks.splice(i, 1);
                break;
              }
            callbacks.length || (binding.destroy(), (self._events[key] = null));
          }
        })(this, 'bind', evt, callback),
        this);
  };
  $.fn.interact = function (overCallback, clickCallback, seoLink, seoText, zIndex, options) {
    const position = getComputedStyle(this.div).position;
    if (
      ((position && 'static' !== position) ||
        this.css({
          position: 'relative',
        }),
      !this.hit)
    ) {
      'object' == typeof arguments[arguments.length - 1] &&
        ((options = arguments[arguments.length - 1]),
        ([overCallback, clickCallback, seoLink, seoText, zIndex] = Array.prototype.slice.call(
          arguments,
          0,
          -1,
        )),
        options.overCallback && (overCallback = options.overCallback),
        options.clickCallback && (clickCallback = options.clickCallback),
        options.seoLink && (seoLink = options.seoLink),
        options.seoText && (seoText = options.seoText),
        options.zIndex && (zIndex = options.zIndex));
      options || (options = {});
      this.hit = $('.hit', seoLink ? 'a' : undefined);
      this.hit.css({
        width: '100%',
        height: '100%',
        zIndex: zIndex || 99999,
        top: 0,
        left: 0,
        position: 'absolute',
      });
      this.add(this.hit);
      var self = this;
      seoLink &&
        (this.hit.attr(
          'href',
          '#' === seoLink || seoLink.includes('mailto:') ? seoLink : Hydra.absolutePath(seoLink),
        ),
        this.hit.text(seoText || this.div.textContent),
        this.hit.css({
          fontSize: 0,
        }),
        this.hit.accessible(),
        'function' == typeof overCallback &&
          ((this.hit.div.onfocus = (_) =>
            overCallback({
              action: 'over',
              object: this,
            })),
          (this.hit.div.onblur = (_) =>
            overCallback({
              action: 'out',
              object: this,
            }))),
        (this.hit.div.onclick = (e) => {
          e.preventDefault();
          e.object = self;
          e.action = 'click';
          clicked(e);
        }));
      options.role &&
        (this.hit.attr('role', options.role),
        'button' === options.role &&
          (this.hit.div.onkeydown = (e) => {
            switch (e.key) {
              case ' ':
              case 'Spacebar':
                e.preventDefault();
                e.stopPropagation();
                e.object = self;
                e.action = 'click';
                clicked(e);
            }
          }));
    }
    let time = Render.TIME;
    function clicked(e) {
      clickCallback && Render.TIME - time > 250 && clickCallback(e);
      time = Render.TIME;
    }
    Device.mobile
      ? this.hit.touchClick(overCallback, clicked)
      : this.hit.hover(overCallback).click(clicked);
  };
  $.fn.clearInteract = function () {
    this.hit && (this.hit = this.hit.destroy());
  };
  $.fn.disableInteract = function () {
    this.hit &&
      this.hit.css({
        pointerEvents: 'none',
      });
  };
  $.fn.enableInteract = function () {
    this.hit &&
      this.hit.css({
        pointerEvents: 'auto',
      });
  };
  $.fn.clearBind = function () {
    this._cleanups &&
      (this._cleanups.forEach((cleanup) => cleanup()),
      (this._cleanups = null),
      (this._events = null));
  };
  $.fn.touchSwipe = function (callback, distance) {
    if (!window.addEventListener) return this;
    var _startX,
      _startY,
      _removeTouchMove,
      self = this,
      _distance = distance || 75,
      _moving = false,
      _move = {};
    function touchMove(e) {
      if (!self.div) return false;
      if (_moving) {
        var touch = convertTouchEvent(e),
          dx = _startX - touch.x,
          dy = _startY - touch.y;
        _move.direction = null;
        _move.moving = null;
        _move.x = null;
        _move.y = null;
        _move.evt = e;
        Math.abs(dx) >= _distance
          ? (touchEnd(), (_move.direction = dx > 0 ? 'left' : 'right'))
          : Math.abs(dy) >= _distance
            ? (touchEnd(), (_move.direction = dy > 0 ? 'up' : 'down'))
            : ((_move.moving = true), (_move.x = dx), (_move.y = dy));
        callback && callback(_move, e);
      }
    }
    function touchEnd(e) {
      if (!self.div) return false;
      _startX = _startY = _moving = false;
      _removeTouchMove && (_removeTouchMove(), (_removeTouchMove = null));
    }
    return (
      Device.mobile &&
        (addTrackedEventListener(
          self,
          'touchstart',
          function touchStart(e) {
            var touch = convertTouchEvent(e);
            if (!self.div) return false;
            1 == e.touches.length &&
              ((_startX = touch.x),
              (_startY = touch.y),
              (_moving = true),
              (_removeTouchMove = addTrackedEventListener(self, 'touchmove', touchMove, {
                passive: true,
              })));
          },
          {
            passive: true,
          },
        ),
        addTrackedEventListener(self, 'touchend', touchEnd, {
          passive: true,
        }),
        addTrackedEventListener(self, 'touchcancel', touchEnd, {
          passive: true,
        })),
      this
    );
  };
  $.fn.touchClick = function (hover, click) {
    if (!window.addEventListener) return this;
    var _time,
      _move,
      self = this,
      _start = {},
      _touch = {};
    function setTouch(e) {
      var touch = convertTouchEvent(e);
      e.touchX = touch.x;
      e.touchY = touch.y;
      _start.x = e.touchX;
      _start.y = e.touchY;
    }
    return (
      Device.mobile &&
        (addTrackedEventListener(
          self,
          'touchstart',
          function touchStart(e) {
            if (!self.div) return false;
            _time = performance.now();
            e.action = 'over';
            e.object = 'hit' == self.div.className ? self.parent() : self;
            setTouch(e);
            hover && !_move && hover(e);
          },
          {
            passive: true,
          },
        ),
        addTrackedEventListener(
          self,
          'touchend',
          function touchEnd(e) {
            if (!self.div) return false;
            var time = performance.now();
            if (
              ((_touch = convertTouchEvent(e)),
              (_move =
                (function findDistance(p1, p2) {
                  var dx = p2.x - p1.x,
                    dy = p2.y - p1.y;
                  return Math.sqrt(dx * dx + dy * dy);
                })(_start, _touch) > 25),
              (e.object = 'hit' == self.div.className ? self.parent() : self),
              setTouch(e),
              _time && time - _time < 750)
            ) {
              if (Mouse._preventClicks) return false;
              click &&
                !_move &&
                (true,
                (e.action = 'click'),
                click && !_move && click(e),
                Mouse.autoPreventClicks && Mouse.preventClicks());
            }
            hover && ((e.action = 'out'), Mouse._preventFire || hover(e));
            _move = false;
          },
          {
            passive: true,
          },
        )),
      this
    );
  };
})();

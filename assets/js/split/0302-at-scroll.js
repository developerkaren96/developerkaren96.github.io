/*
 * Scroll — custom (non-native) scrolling controller. Listens for
 * wheel / touch / drag input and produces inertia-smoothed
 * `x` / `y` deltas the consumer applies to its own content
 * (typical of WebGL-backed UIs where the page itself doesn't
 * scroll). Used widely in the framework's HUD/UIL.
 *
 * State:
 *   - `x`, `y`           — current scroll position.
 *   - `max.{x,y}`        — clamp bounds (set by consumer).
 *   - `delta.{x,y}`      — per-tick delta (raw input frame-to-frame).
 *   - `_scrollTarget`    — target position (input writes here).
 *   - `_scrollInertia`   — running inertia (velocity carried across
 *     frames so the scroll glides past input end).
 *   - `enabled`          — gate.
 *   - `bounds`           — optional content-rect; consumers can also
 *     wire this to a layout box.
 *   - `_axes = ['x','y']` — driven axes; can be narrowed (e.g.
 *     `['y']` for vertical-only).
 *
 * Prohibition list:
 *   - `PROHIBITED_ELEMENTS = ['prevent_interactionScroll']` —
 *     `checkIfProhibited(el)` walks up the DOM and returns true if
 *     any ancestor carries the class. Lets a sub-region opt out of
 *     the custom scroll (so e.g. a native `<textarea>` keeps its own
 *     scroll behaviour).
 *
 * `loop()` (continued below) — runs every frame, eases the actual
 * position toward `_scrollTarget` while bleeding off
 * `_scrollInertia`, clamps to `[0, max]`, updates `delta`, and
 * fires the change event.
 */
Class(
  function Scroll(_object, _params) {
    Inherit(this, Component);
    const self = this,
      PROHIBITED_ELEMENTS = ['prevent_interactionScroll'];
    this.x = 0;
    this.y = 0;
    this.max = {
      x: 0,
      y: 0,
    };
    this.delta = {
      x: 0,
      y: 0,
    };
    this.enabled = true;
    self.bounds = null;
    const _scrollTarget = {
        x: 0,
        y: 0,
      },
      _scrollInertia = {
        x: 0,
        y: 0,
      };
    let _axes = ['x', 'y'];
    var _lastDelta,
      _deltaChange = 0;
    function checkIfProhibited(element) {
      let el = element;
      for (; el; ) {
        if (el.classList)
          for (let i = 0; i < PROHIBITED_ELEMENTS.length; i++)
            if (el.classList.contains(PROHIBITED_ELEMENTS[i])) return true;
        el = el.parentNode;
      }
      return false;
    }
    function loop() {
      self.object &&
        ((Math.round(self.object.div.scrollLeft) === Math.round(self.x) &&
          Math.round(self.object.div.scrollTop) === Math.round(self.y)) ||
          ((self.x = _scrollTarget.x = self.object.div.scrollLeft),
          (self.y = _scrollTarget.y = self.object.div.scrollTop),
          stopInertia()));
      _axes.forEach((axis) => {
        self.isInertia &&
          ((_scrollInertia[axis] *= 0.9), (_scrollTarget[axis] += _scrollInertia[axis]));
        let scale = self.scale;
        Device.mobile && (scale = self.touchScale);
        self.limit && (_scrollTarget[axis] = Math.max(_scrollTarget[axis], 0));
        self.limit && (_scrollTarget[axis] = Math.min(_scrollTarget[axis], self.max[axis] / scale));
        self.delta[axis] = self.flag('block')
          ? 0
          : 0.5 * (_scrollTarget[axis] * scale - self[axis]);
        self[axis] += self.delta[axis];
        Math.abs(self.delta[axis]) < 0.01 && (self.delta[axis] = 0);
        Math.abs(self[axis]) < 0.001 && (self[axis] = 0);
        self.flag('block') && ((_scrollTarget[axis] = 0), (self.delta[axis] = 0), (self[axis] = 0));
        self.object &&
          ('x' == axis && (self.object.div.scrollLeft = Math.round(self.x)),
          'y' == axis && (self.object.div.scrollTop = Math.round(self.y)));
      });
    }
    function stopInertia() {
      self.isInertia = false;
      clearTween(_scrollTarget);
    }
    function edgeScroll(e) {
      let element = document.elementFromPoint(
        Math.clamp(Mouse.x, 0, Stage.width),
        Math.clamp(Mouse.y, 0, Stage.height),
      );
      (element && checkIfProhibited(element)) ||
        (_params.lockMouseX && Mouse.x > Stage.width) ||
        ('touch' === e.pointerType &&
          self.enabled &&
          (e.preventDefault && e.preventDefault(),
          _axes.forEach((axis) => {
            let dir = axis.toUpperCase(),
              delta = `offset${dir}`,
              diff = (self[`ieDelta${dir}`] || e[delta]) - e[delta];
            _scrollTarget[axis] += diff;
            _scrollInertia[axis] = diff;
            self.isInertia = true;
            self[`ieDelta${dir}`] = e[delta];
          }),
          self.onUpdate && self.onUpdate(),
          self.events.fire(Events.UPDATE, _scrollInertia)));
    }
    function edgeScrollEnd() {
      self.ieDeltaX = false;
      self.ieDeltaY = false;
    }
    function scroll(e) {
      let element = document.elementFromPoint(
        Math.clamp(Mouse.x, 0, Stage.width),
        Math.clamp(Mouse.y, 0, Stage.height),
      );
      if (element && checkIfProhibited(element)) return;
      if (_params.lockMouseX && Mouse.x > Stage.width) return;
      if (!self.enabled) return;
      if (!checkBounds(e)) return;
      if ((self.object && self.limit && e.preventDefault && e.preventDefault(), !self.mouseWheel))
        return;
      stopInertia();
      let newDelta = 0;
      _axes.forEach((axis) => {
        let delta = 'delta' + axis.toUpperCase();
        if ('mac' == Device.system.os) {
          if ('firefox' == Device.system.browser)
            return 1 === e.deltaMode
              ? ((_scrollTarget[axis] += 4 * e[delta]),
                (_scrollInertia[axis] = 4 * e[delta]),
                (self.isInertia = true),
                void (newDelta = _scrollInertia[axis]))
              : void (_scrollTarget[axis] += e[delta]);
          if (Device.system.browser.includes(['chrome', 'safari']))
            return (
              (_scrollTarget[axis] += 0.33 * e[delta]),
              (_scrollInertia[axis] = 0.33 * e[delta]),
              (self.isInertia = true),
              void (newDelta = _scrollInertia[axis])
            );
        }
        if ('windows' == Device.system.os) {
          if ('firefox' == Device.system.browser && 1 === e.deltaMode)
            return (
              (_scrollTarget[axis] += 10 * e[delta]),
              (_scrollInertia[axis] = 10 * e[delta]),
              (self.isInertia = true),
              void (newDelta = _scrollInertia[axis])
            );
          if (Device.system.browser.includes(['chrome'])) {
            let s = 0.25;
            return (
              (_scrollTarget[axis] += e[delta] * s),
              (_scrollInertia[axis] = e[delta] * s),
              (self.isInertia = true),
              void (newDelta = _scrollInertia[axis])
            );
          }
          if ('ie' == Device.system.browser)
            return (
              (_scrollTarget[axis] += e[delta]),
              (_scrollInertia[axis] = e[delta]),
              (self.isInertia = true),
              void (newDelta = _scrollInertia[axis])
            );
        }
        _scrollTarget[axis] += e[delta];
        newDelta = _scrollInertia[axis];
      });
      newDelta = Math.abs(newDelta);
      newDelta != _lastDelta && _deltaChange++;
      self.flag('hardBlock') ||
        (_deltaChange > 3
          ? newDelta > _lastDelta && self.flag('block', false)
          : newDelta >= _lastDelta && self.flag('block', false));
      _lastDelta = newDelta;
      self.onUpdate && self.onUpdate();
      self.events.fire(Events.UPDATE, _scrollInertia);
      self.events.fire(Scroll.EVENT, e);
    }
    function down(e) {
      if (!self.enabled) return;
      if (!checkBounds(e)) return;
      let element = document.elementFromPoint(
        Math.clamp(e.x || 0, 0, Stage.width),
        Math.clamp(e.y || 0, 0, Stage.height),
      );
      (element && checkIfProhibited(element)) || (stopInertia(), (self.isDragging = true));
    }
    function drag(e) {
      if (!self.enabled) return;
      if (!checkBounds(e)) return;
      let element = document.elementFromPoint(
        Math.clamp(e.x || 0, 0, Stage.width),
        Math.clamp(e.y || 0, 0, Stage.height),
      );
      (element && checkIfProhibited(element)) ||
        (_axes.forEach((axis) => {
          let newDelta = Math.abs(Mouse.delta[axis]);
          self.flag('hardBlock') || (newDelta > _lastDelta && self.flag('block', false));
          _lastDelta = newDelta;
          _scrollTarget[axis] -= Mouse.delta[axis];
        }),
        self.events.fire(Events.UPDATE));
    }
    function up(e) {
      if (!self.enabled || self.preventInertia) return;
      if (!checkBounds(e)) return;
      let element = document.elementFromPoint(
        Math.clamp(e.x || 0, 0, Stage.width),
        Math.clamp(e.y || 0, 0, Stage.height),
      );
      if (element && checkIfProhibited(element)) return;
      const m = 'android' == Device.system.os ? 35 : 25,
        obj = {};
      _axes.forEach((axis) => {
        obj[axis] = _scrollTarget[axis] - Mouse.delta[axis] * m;
      });
      tween(_scrollTarget, obj, 2500, 'easeOutQuint');
      self.isDragging = false;
    }
    function onKeyDown({ key: key, shiftKey: shiftKey }) {
      let dst = null;
      switch (key) {
        case 'Up':
        case 'ArrowUp':
          dst = _scrollTarget.y - 150;
          break;
        case 'Down':
        case 'ArrowDown':
          dst = _scrollTarget.y + 150;
          break;
        case 'Home':
          dst = 0;
          break;
        case 'End':
          dst = self.max.y;
          break;
        case 'PageUp':
          dst = _scrollTarget.y - Stage.height;
          break;
        case 'PageDown':
          dst = _scrollTarget.y + Stage.height;
          break;
        case ' ':
        case 'Spacebar':
          onKeyDown(
            shiftKey
              ? {
                  key: 'PageUp',
                }
              : {
                  key: 'PageDown',
                },
          );
      }
      null !== dst && self.scrollTo(dst, 'y', 400, 'easeOutCubic');
    }
    function resize() {
      if (!self.enabled) return;
      if ((stopInertia(), !self.object)) return;
      const p = {};
      Device.mobile &&
        _axes.forEach(
          (axis) => (p[axis] = self.max[axis] ? _scrollTarget[axis] / self.max[axis] : 0),
        );
      undefined === _params.height &&
        (self.max.y = self.object.div.scrollHeight - self.object.div.clientHeight);
      undefined === _params.width &&
        (self.max.x = self.object.div.scrollWidth - self.object.div.clientWidth);
      Device.mobile &&
        _axes.forEach((axis) => (self[axis] = _scrollTarget[axis] = p[axis] * self.max[axis]));
    }
    function checkBounds(e) {
      return (
        !self.bounds ||
        !(
          e.x / Stage.width > self.bounds.x.y ||
          e.x / Stage.width < self.bounds.x.x ||
          e.y / Stage.height > self.bounds.y.y ||
          e.y / Stage.height < self.bounds.y.x
        )
      );
    }
    !(function initParams() {
      (_object && _object.div) || ((_params = _object), (_object = null));
      _params || (_params = {});
      self.object = _object;
      self.hitObject = _params.hitObject || self.object;
      self.max.y = _params.height || 0;
      self.max.x = _params.width || 0;
      self.scale = _params.scale || 1;
      self.touchScale = _params.touchScale || 1;
      self.isDragging = false;
      self.drag = undefined !== _params.drag ? _params.drag : !!Device.mobile;
      self.mouseWheel = false !== _params.mouseWheel;
      self.limit = 'boolean' == typeof _params.limit && _params.limit;
      self.bounds = _params.bounds || null;
      self.keyboard = _params.keyboard || false;
      Array.isArray(_params.axes) && (_axes = _params.axes);
    })();
    self.object &&
      (function style() {
        self.object.css({
          overflow: 'auto',
        });
      })();
    (function addHandlers() {
      if (
        (Device.mobile ||
          ('ie' === Device.system.browser &&
            Device.system.browserVersion >= 17 &&
            (document.body.addEventListener('pointermove', edgeScroll, true),
            document.body.addEventListener('pointerup', edgeScrollEnd, true)),
          'ie' == Device.system.browser
            ? document.body.addEventListener('wheel', scroll, true)
            : __window.bind('wheel', scroll),
          self.keyboard && self.events.sub(Keyboard.DOWN, onKeyDown)),
        self.drag)
      ) {
        self.hitObject &&
          self.hitObject.bind('touchstart', (e) => {
            let element = document.elementFromPoint(
              Math.clamp(e.x || 0, 0, Stage.width),
              Math.clamp(e.y || 0, 0, Stage.height),
            );
            (element && checkIfProhibited(element)) || e.preventDefault();
          });
        let input = self.hitObject ? self.initClass(Interaction, self.hitObject) : Mouse.input;
        self.events.sub(input, Interaction.START, down);
        self.events.sub(input, Interaction.DRAG, drag);
        self.events.sub(input, Interaction.END, up);
      }
      self.events.sub(Events.RESIZE, resize);
    })();
    resize();
    self.startRender(loop);
    this.reset = function () {
      return (
        self.object &&
          self.object.div &&
          ((self.object.div.scrollLeft = self.x = 0), (self.object.div.scrollTop = self.y = 0)),
        (_scrollTarget.x = _scrollTarget.y = 0),
        (_scrollInertia.x = _scrollInertia.y = 0),
        stopInertia(),
        this
      );
    };
    this.onDestroy = function () {
      __window.unbind('wheel', scroll);
      self.events.unsub(Keyboard.DOWN, onKeyDown);
    };
    this.resize = resize;
    this.scrollTo = function (value, axis = 'y', time = 800, ease = 'easeInOutCubic') {
      let values = {};
      values[axis] = value;
      tween(_scrollTarget, values, time, ease);
    };
    this.setTarget = function (value, axis = 'y') {
      _scrollTarget[axis] = value;
    };
    this.blockUntilNewScroll = function () {
      return (self.reset(), self.flag('block', true), self.flag('hardBlock', true, 200), this);
    };
    this.stopInertia = stopInertia;
  },
  (_) => {
    var _scroll;
    Scroll.EVENT = 'scroll_event';
    Scroll.createUnlimited = Scroll.getUnlimited = function (options) {
      return (
        _scroll ||
          (_scroll = new Scroll({
            limit: false,
            drag: Device.mobile,
          })),
        _scroll
      );
    };
  },
);

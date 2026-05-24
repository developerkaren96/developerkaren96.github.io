/*
 * Interaction — unified touch/mouse pointer-input tracker for a HydraObject.
 *
 *   const input = new Interaction(myObj);
 *   input.events.sub(Interaction.CLICK, onClick);
 *   input.events.sub(Interaction.DRAG, onDrag);
 *
 * Tracks (x, y), hold-anchor, last position, frame delta, total move since
 * start, and a rolling-average velocity over the last 5 movement samples.
 * Bridges the platform event-set:
 *   touchstart → down → fires Interaction.START
 *   touchmove  → move → fires Interaction.MOVE (always) + Interaction.DRAG (if down)
 *   touchend   → up   → fires Interaction.END   (+ CLICK if short + nearby)
 *   leave (mouseleave/out) → up({ isLeaveEvent: true })
 *
 * Touch ID tracking:
 *   When a touch sequence starts, `_touchId` stores the identifier so we
 *   only follow that one finger through move/end (unless `multiTouch=true`).
 *   Other touches on the same element are ignored.
 *
 * Click detection:
 *   - total distance accumulated through move < 20 px
 *   - elapsed time from down to up < 1000 ms
 *   - up event is not a synthetic mouseleave
 *
 * Velocity smoothing:
 *   Each move sample computes |dx|/dt, |dy|/dt for the current frame, pushes
 *   it onto a 5-deep rolling buffer, and exposes the mean. The Vec2 instances
 *   are recycled through an ObjectPool (10-slot) — this is hot-path code
 *   (every frame during a drag), so the pool avoids GC churn.
 *
 * Stale-velocity reset:
 *   `loop()` is on Render.start; if no move event fires for >10 frames it
 *   zeroes velocity + delta so a momentum-driven consumer (e.g., flick
 *   inertia) doesn't keep coasting on the last reading.
 *
 * `hitReturn` opt-out:
 *   When true (default), clicks on a separate `.hit` element belonging to a
 *   different hydraObject are ignored (lets a fully-stacked hit layer pass
 *   events through to one specific receiver).
 *
 * `Interaction.hitIsBound(target, owner)`:
 *   Walks an element's hydra ancestor chain to detect whether a *different*
 *   bound Interaction receiver sits between us and the event target — used
 *   to short-circuit before firing duplicate events into multiple owners.
 *
 * Static event hub:
 *   The static side maintains a single set of touchstart/move/end/leave
 *   listeners on `__window`, dispatching them to the per-instance callbacks
 *   registered by Interaction.bind. This means N Interaction instances do
 *   not produce N DOM listeners — important for performance.
 */
Class(
  function Interaction(_object) {
    Inherit(this, Events);
    const self = this;
    let _touchId;
    let _velocity = [];
    let _moved    = 0;
    let _time     = performance.now();

    // Tiny pooled vec2 used as the velocity sample type.
    function Vec2() {
      this.x = 0;
      this.y = 0;
      this.length = function () { return Math.sqrt(this.x * this.x + this.y * this.y); };
    }
    const _vec2Pool = new ObjectPool(Vec2, 10);
    let _distance, _timeDown, _timeMove;

    // Reset velocity if there's been no movement for >10 frames.
    function loop() {
      if (_moved++ > 10) {
        self.velocity.x = self.velocity.y = 0;
        self.delta.x    = self.delta.y    = 0;
      }
    }

    function down(e) {
      // Guard: hit-layer shadowing on a different hydraObject.
      const hitCondition = !!self.hitReturn &&
                           'hit' == e.target.className &&
                           e.target.hydraObject != _object;

      // Already tracking a finger and this event doesn't include it → ignore.
      if (self.isTouching && !self.multiTouch && null !== _touchId && e.touches) {
        for (let i = 0; i < e.touches.length; ++i) {
          if (e.touches[i].identifier === _touchId) return;
        }
        _touchId        = null;
        self.isTouching = false;
      }
      if ((self.isTouching && !self.multiTouch) ||
          hitCondition ||
          Interaction.hitIsBound(e.target, _object)) return;

      self.isTouching = true;
      let x = e.x, y = e.y;
      // Lock onto the first touch's identifier for this gesture.
      if (e.changedTouches && !_touchId) {
        x = e.changedTouches[0].clientX;
        y = e.changedTouches[0].clientY;
        _touchId = e.changedTouches[0].identifier;
      }
      // Forward 3D-Touch pressure if available.
      if (e.touches && 'number' == typeof e.touches[0].force) e.force = e.touches[0].force;
      e.x = self.x = x;
      e.y = self.y = y;
      self.hold.x = self.last.x = x;
      self.hold.y = self.last.y = y;
      self.delta.x = self.move.x = self.velocity.x = 0;
      self.delta.y = self.move.y = self.velocity.y = 0;
      _distance = 0;
      self.events.fire(Interaction.START, e, true);
      _timeDown = _timeMove = Render.TIME;
    }

    function move(e) {
      if (!self.isTouching && !self.unlocked) return;
      // Coalesce moves down to ~60 Hz — multiple touchmove events can fire
      // within a single frame.
      const now = performance.now();
      if (now - _time < 16) return;
      _time = now;

      let x = e.x, y = e.y;
      // Pull the right touch out by identifier.
      if (e.touches) {
        for (let i = 0; i < e.touches.length; i++) {
          const touch = e.touches[i];
          if (touch.identifier == _touchId) { x = touch.clientX; y = touch.clientY; }
        }
      }
      if (self.isTouching) {
        self.move.x = x - self.hold.x;
        self.move.y = y - self.hold.y;
      }
      if (e.touches && 'number' == typeof e.touches[0].force) e.force = e.touches[0].force;
      e.x = self.x = x;
      e.y = self.y = y;
      self.delta.x = x - self.last.x;
      self.delta.y = y - self.last.y;
      self.last.x  = x;
      self.last.y  = y;
      _moved       = 0;
      _distance   += self.delta.length();

      // Velocity sample: 5-frame rolling average. Old samples returned to
      // the pool.
      const delta = Render.TIME - (_timeMove || Render.TIME);
      _timeMove = Render.TIME;
      if (delta > 0.01) {
        const velocity = _vec2Pool.get();
        velocity.x = Math.abs(self.delta.x) / delta;
        velocity.y = Math.abs(self.delta.y) / delta;
        _velocity.push(velocity);
        if (_velocity.length > 5) _vec2Pool.put(_velocity.shift());
      }
      self.velocity.x = self.velocity.y = 0;
      for (let i = 0; i < _velocity.length; i++) {
        self.velocity.x += _velocity[i].x;
        self.velocity.y += _velocity[i].y;
      }
      self.velocity.x /= _velocity.length;
      self.velocity.y /= _velocity.length;
      self.velocity.x = self.velocity.x || 0;
      self.velocity.y = self.velocity.y || 0;

      self.events.fire(Interaction.MOVE, e, true);
      if (self.isTouching) self.events.fire(Interaction.DRAG, e, true);
    }

    function up(e) {
      // Multi-touch end: only fire if the lifted touch is *ours*.
      if (e && e.changedTouches && e.touches.length) {
        let someTouchIdentified = false;
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === _touchId) someTouchIdentified = true;
        }
        if (!someTouchIdentified) return;
      }
      if (!self.isTouching && !self.unlocked) return;
      self.isTouching = false;
      self.move.x = 0;
      self.move.y = 0;
      // If the last move event is stale (>40ms), zero the delta so flick
      // inertia doesn't fire on noise.
      if (Math.max(0.001, Render.TIME - (_timeMove || Render.TIME)) >= 40) {
        self.delta.x = 0;
        self.delta.y = 0;
      }
      // Short, near-stationary up = synthesized click.
      if (_distance < 20 && Render.TIME - _timeDown < 1e3 && !e.isLeaveEvent) {
        self.events.fire(Interaction.CLICK, e, true);
      }
      self.events.fire(Interaction.END, e, true);
      _touchId = null;
      if (Device.mobile) self.velocity.x = self.velocity.y = 0;
    }

    // Mouse leaves the window — treat as end so we don't strand state.
    function leave() {
      if (self.ignoreLeave) return;
      self.delta.x = 0;
      self.delta.y = 0;
      up({ isLeaveEvent: true });
    }

    this.x = 0;
    this.y = 0;
    this.hold     = new Vec2();
    this.last     = new Vec2();
    this.delta    = new Vec2();
    this.move     = new Vec2();
    this.velocity = new Vec2();
    this.hitReturn = true;

    (function () {
      if ((!_object) instanceof HydraObject) throw 'Interaction.Input requires a HydraObject';
      (function addHandlers() {
        // Stage / window-level inputs use the static event hub directly;
        // arbitrary objects bind their own touchstart and register with the
        // hit-detection list so other Interactions can short-circuit.
        if (_object == Stage || _object == __window) {
          Interaction.bind('touchstart', down);
        } else {
          _object.bind('touchstart', down);
          Interaction.bindObject(_object);
        }
        Interaction.bind('touchmove', move);
        Interaction.bind('touchend',  up);
        Interaction.bind('leave',     leave);
      })();
      Render.start(loop);
    })();

    this.onDestroy = function () {
      Interaction.unbind('touchstart', down);
      Interaction.unbind('touchmove',  move);
      Interaction.unbind('touchend',   up);
      Render.stop(loop);
      Interaction.unbindObject(_object);
      if (_object && _object.unbind) _object.unbind('touchstart', down);
    };
  },
  () => {
    Namespace(Interaction);
    Interaction.CLICK = 'interaction_click';
    Interaction.START = 'interaction_start';
    Interaction.MOVE  = 'interaction_move';
    Interaction.DRAG  = 'interaction_drag';
    Interaction.END   = 'interaction_end';

    // Bound-object registry for the hit-test walker.
    const _objects = [];
    // One callback list per event type. The window-level listener dispatches
    // synchronously through these so we install only one real listener per
    // event, regardless of instance count.
    const _events  = { touchstart: [], touchmove: [], touchend: [], leave: [] };

    function touchMove (e) { _events.touchmove .forEach((c) => c(e)); }
    function touchStart(e) { _events.touchstart.forEach((c) => c(e)); }
    function touchEnd  (e) { _events.touchend  .forEach((c) => c(e)); }
    function leave     (e) { e.leave = true; _events.leave.forEach((c) => c(e)); }

    Hydra.ready(async () => {
      await defer();
      __window.bind('touchstart',  touchStart);
      __window.bind('touchmove',   touchMove);
      __window.bind('touchend',    touchEnd);
      __window.bind('touchcancel', touchEnd);
      __window.bind('contextmenu', touchEnd);
      __window.bind('mouseleave',  leave);
      __window.bind('mouseout',    leave);
    });

    Interaction.bind   = function (evt, callback) { _events[evt].push  (callback); };
    Interaction.unbind = function (evt, callback) { _events[evt].remove(callback); };

    Interaction.bindObject   = function (obj) { _objects.push  (obj); };
    Interaction.unbindObject = function (obj) { _objects.remove(obj); };

    // Walks the hydra parent chain of `element` (the actual DOM event target).
    // Returns true if any ancestor *other than* `boundObj` is in `_objects` —
    // signalling that a more-specific Interaction owns this hit.
    Interaction.hitIsBound = function (element, boundObj) {
      let obj = element.hydraObject;
      if (!obj) return false;
      while (obj) {
        if (obj != boundObj && _objects.includes(obj)) return true;
        obj = obj._parent;
      }
      return false;
    };
  },
);

/*
 * Component — base class mixin for every Hydra-managed object.
 *
 * Mixed into a child via `Inherit(this, Component)` in the child's
 * constructor. Gives the child:
 *   - Lifecycle: `initClass`, `destroy`, `onDestroy`, `_bindOnDestroy`
 *   - Timers/loops: `delayedCall`, `clearTimers`, `startRender`, `stopRender`
 *   - Event bus (via Inherit Events): `events.sub/fire/unsub`
 *   - Reactive setters/getters: `set(prop, fn)`, `get(prop, fn)` →
 *     installs a real `Object.defineProperty` accessor.
 *   - Resize hook: `onResize(cb, callInitial=true)`
 *   - Wait-for-condition: `wait(target, key, callback)`
 *   - AppState binding: `bindState(appState, key, ...)`
 *   - Boolean flags with optional auto-flip: `flag(name, value, time)`
 *   - Visibility tracking: when any ancestor's `.visible === false` or
 *     `.group.visible === false`, this component fires `onInvisible()`;
 *     when visible again, `onVisible()`. Skips its rAF callbacks while
 *     invisible.
 *
 * Children are tracked in `this.classes` (id → child). The full subtree
 * is torn down by `destroy()` in proper depth-first order.
 *
 * Dev convenience: in `Hydra.LOCAL`, every child registers itself in
 * `Component.HMR` so a hot-reload can find and recreate live instances
 * of a given class.
 */
Class(
  function Component() {
    // Idempotency guard — `Inherit(this, Component)` may run more than once
    // (e.g. when a class chain inherits via multiple paths). After the first
    // call, `initClass` is defined, so subsequent calls bail out.
    if (this.initClass) return;

    Inherit(this, Events);

    const self = this;
    const setters = {};       // prop → { s: setter fn, g: getter fn }
    const flags = {};         // boolean / arbitrary flag storage (see `flag`)
    const timers = [];        // active Timer handles owned by this component
    const renderLoops = [];   // entries: { callback, loop, obj }
    let onDestroyCallbacks;   // lazy — only allocated when used
    let appStateBindings;     // lazy — only allocated when used

    /**
     * Install a property accessor on `target` that routes through the
     * `setters[prop]` slot. The setter receives the assigned value; the
     * getter is invoked with no args. Both default to no-op.
     *
     * Used by `.set(prop, fn)` / `.get(prop, fn)` so a child can declare
     *
     *   this.set('value', (v) => { ... });
     *   this.get('value', () => computed);
     *
     * and have `instance.value = x` / `instance.value` flow through.
     */
    function defineSetter(target, prop) {
      setters[prop] = {};
      Object.defineProperty(target, prop, {
        set: function (v) {
          if (setters[prop] && setters[prop].s) setters[prop].s.call(self, v);
          v = null;
        },
        get: function () {
          if (setters[prop] && setters[prop].g) return setters[prop].g.apply(self);
        },
      });
    }

    this.classes = {};

    /** Walk up `.parent` chain looking for an ancestor whose class name === `type`. */
    this.findParent = function (type) {
      let parent = self.parent;
      while (parent) {
        if (!parent._cachedName) parent._cachedName = Utils.getConstructorName(parent);
        if (parent._cachedName === type) return parent;
        parent = parent.parent;
      }
    };

    this.set = function (prop, callback) {
      if (!setters[prop]) defineSetter(this, prop);
      setters[prop].s = callback;
    };

    this.get = function (prop, callback) {
      if (!setters[prop]) defineSetter(this, prop);
      setters[prop].g = callback;
    };

    /**
     * Playground check — true when the AURA editor is targeting this
     * component (or any component, when called with a boolean).
     */
    this.isPlayground = function (name) {
      if (typeof name === 'boolean' && Global.PLAYGROUND) return true;
      if (!Global.PLAYGROUND) return false;
      return Global.PLAYGROUND === (name || Utils.getConstructorName(self));
    };

    /**
     * Instantiate a child component as a member of this one.
     *
     *   const sub = this.initClass(SomeClass, arg1, arg2);
     *
     * If `SomeClass.instance` exists (singleton form), returns it.
     * Otherwise creates a new instance via `Object.create + apply`, so the
     * child sees `this.parent === self` *during* its own constructor.
     *
     * Auto-handles:
     *   - registering the child in `this.classes` so `destroy()` cascades.
     *   - parenting `child.element` / `child.group` into this component's
     *     equivalents (so DOM/3D scene-graph wiring is automatic).
     *   - HMR registry in dev.
     *   - draining `__afterInitClass` callbacks queued by `Inherit`.
     */
    this.initClass = function (cls) {
      if (!cls) { console.trace(); throw 'unable to locate class'; }
      if (cls.instance) return cls.instance();

      const args = [].slice.call(arguments, 1);
      const child = Object.create(cls.prototype);
      child.parent = this;
      child.__afterInitClass = [];
      cls.apply(child, args);

      if (child.destroy) {
        const id = Utils.timestamp();
        this.classes[id] = child;
        this.classes[id].__id = id;
      }

      // If the child has a DOM/UI element, auto-add it to whichever container
      // is most appropriate. Convention: pass `[parentEl]` as the last arg
      // to override; pass `null` as the last arg to suppress auto-add.
      if (child.element) {
        const lastArg = arguments[arguments.length - 1];
        if (Array.isArray(lastArg) && lastArg.length === 1 && lastArg[0] instanceof child.element.constructor) {
          lastArg[0].add(child.element);
        } else if (this.element && this.element.add && lastArg !== null) {
          this.element.add(child.element);
        }
      }

      // Same convention for 3D groups.
      if (child.group) {
        const lastArg = arguments[arguments.length - 1];
        if (this.group && lastArg !== null) this.group.add(child.group);
      }

      // HMR registry: a map of class-name → instances, for hot-reload.
      if (typeof Hydra !== 'undefined' && Hydra.LOCAL) {
        const key = Utils.getConstructorName(child);
        if (key) {
          if (!Component.HMR.has(key)) Component.HMR.set(key, []);
          Component.HMR.get(key).push({ ref: child, args });
        }
      }

      // Drain the `__afterInitClass` queue set up by Inherit.
      child.__afterInitClass.forEach((cb) => cb());
      delete child.__afterInitClass;
      return child;
    };

    /**
     * Schedule a callback after `time` ms. Auto-cancelled on destroy.
     * Keeps the timer list bounded at 50 entries to avoid leaks.
     */
    this.delayedCall = function (callback, time, scaledTime) {
      const timer = Timer.create(
        () => {
          // Race guard: bail if destroyed before the timer fired.
          if (self && self.destroy && callback) callback();
        },
        time,
        scaledTime,
      );
      timers.push(timer);
      if (timers.length > 50) timers.shift();
      return timer;
    };

    this.clearTimers = function () {
      for (let i = timers.length - 1; i >= 0; i--) clearTimeout(timers[i]);
      timers.length = 0;
    };

    /**
     * Register a per-frame callback.
     *
     *   startRender(cb)               — every frame
     *   startRender(cb, 30)           — capped at 30 FPS
     *   startRender(cb, schedulerObj) — scheduled by `RenderManager`
     *   startRender(cb, schedulerObj=RenderManager.NATIVE_FRAMERATE)
     *                                  — registered as a "native" callback
     *
     * The wrapped `loop` adds visibility-cascade logic: if any ancestor is
     * `.visible === false` (or its `.group.visible === false`), skip the
     * callback and fire `onInvisible()` once. Restoring visibility fires
     * `onVisible()` once.
     *
     * Errors thrown by `callback` go through `Render.RENDER_CALLBACK_ERROR`
     * and (unless prevented) cause the callback to be unregistered.
     */
    this.startRender = function (callback, fps, obj) {
      // `startRender(cb, schedulerObj)` form (no fps).
      if (typeof fps !== 'number') { obj = fps; fps = undefined; }

      // Idempotent — same callback registered twice is a no-op.
      for (let i = 0; i < renderLoops.length; i++) {
        if (renderLoops[i].callback === callback) return;
      }

      const flagInvisible = () => {
        if (!self._invisible) {
          self._invisible = true;
          if (self.onInvisible) self.onInvisible();
        }
      };

      const loop = (a, b, c, d) => {
        if (!self.startRender) return false; // destroyed mid-frame
        // Visibility check up the parent chain.
        let parent = self;
        while (parent) {
          if (parent.visible === false) return flagInvisible();
          if (parent.group && parent.group.visible === false) return flagInvisible();
          parent = parent.parent;
        }
        if (self._invisible !== false) {
          self._invisible = false;
          if (self.onVisible) self.onVisible();
        }
        try {
          callback(a, b, c, d);
        } catch (error) {
          const event = { callback, error, component: self, preventStopRender: false };
          Events.emitter._fireEvent(Render.RENDER_CALLBACK_ERROR, event);
          if (!event.preventStopRender) self.stopRender(callback, obj);
        }
        return true;
      };

      renderLoops.push({ callback, loop, obj });

      if (obj) {
        if (obj === RenderManager.NATIVE_FRAMERATE) Render.start(loop, null, true);
        else RenderManager.schedule(loop, obj);
      } else {
        Render.start(loop, fps);
      }
    };

    /** Listen for global RESIZE; optionally fire the callback once immediately. */
    this.onResize = function (callback, callInitial = true) {
      if (callInitial) callback();
      this.events.sub(Events.RESIZE, callback);
    };

    this.stopRender = function (callback, obj) {
      for (let i = 0; i < renderLoops.length; i++) {
        if (renderLoops[i].callback === callback) {
          const loop = renderLoops[i].loop;
          if (obj) RenderManager.unschedule(loop, obj);
          Render.stop(loop);
          renderLoops.splice(i, 1);
        }
      }
    };

    this.clearRenders = function () {
      for (let i = 0; i < renderLoops.length; i++) {
        const { loop, obj } = renderLoops[i];
        if (obj) RenderManager.unschedule(loop, obj);
        else Render.stop(loop);
      }
      renderLoops.length = 0;
    };

    /**
     * Await a condition. Many call forms:
     *
     *   wait(ms)                          → resolves after delay
     *   wait(object, 'prop')              → resolves when object.prop is truthy
     *   wait('appState/key')              → resolves when AppState.get('appState/key')
     *   wait(appStateInstance, 'key')     → resolves when appState.get('key')
     *   wait(() => cond)                  → resolves when condition() truthy
     *   wait(object, 'prop', callback)    → callback when truthy (also resolves promise)
     *   wait(object, '!prop')             → wait for *falsy*
     *
     * When checked against a flag, also tries `object.flag(key)` as a fallback.
     */
    this.wait = function (object, key, callback) {
      const promise = Promise.create();
      let condition;
      let appState;

      // wait('key', cb) — `object` is actually the key, target is `self`.
      if (typeof object === 'string') {
        callback = key;
        key = object;
        object = self;
      }

      if (key?.includes?.('/')) appState = AppState;
      if (object.isAppState) appState = object;

      // wait(ms)
      if (typeof object === 'number' && arguments.length === 1) {
        self.delayedCall(promise.resolve, object);
        return promise;
      }

      // wait(() => cond)
      if (typeof object === 'function' && arguments.length === 1) {
        condition = object;
        object = self;
      }

      // wait(callback, target, key) — swap argument order.
      if (typeof object === 'function' && typeof callback === 'string') {
        const origCallback = object;
        object = key;
        key = callback;
        callback = origCallback;
      }

      callback = callback || promise.resolve;

      if (!condition) {
        if (appState) {
          condition = () => !!appState.get(key);
        } else if (key?.charAt?.(0) === '!') {
          // Negated form: wait('!prop') resolves when prop becomes falsy.
          key = key.slice(1);
          condition = () => !(object[key] || (typeof object.flag === 'function' && object.flag(key)));
        } else {
          condition = () => !!object[key] || (typeof object.flag === 'function' && !!object.flag(key));
        }
      }

      if (condition()) {
        callback();
      } else {
        // Poll on every frame until the condition becomes true.
        Render.start(function test() {
          if (!object || !self.flag || object.destroy === null) return Render.stop(test);
          if (condition()) { callback(); Render.stop(test); }
        });
      }
      return promise;
    };

    /**
     * Bind a reactive AppState key. Returns the binding (auto-disposed on
     * destroy). If `appState` is a Promise (lazy state), awaits it first.
     * If it's a plain object literal, wraps it via `AppState.createLocal`.
     */
    this.bindState = function (appState, key, ...rest) {
      if (appState.then) return (async () => self.bindState(await appState, key, ...rest))();
      if (typeof appState === 'object' && appState.constructor === Object && !appState.isAppState) {
        appState = AppState.createLocal(appState);
      }
      if (!appStateBindings) appStateBindings = [];
      const binding = (appState._bind || appState.bind).bind(appState)(key, ...rest);
      appStateBindings.push(binding);
      binding._bindOnDestroy(() => { appStateBindings.remove(binding); });
      return binding;
    };

    /**
     * Get/set a named flag.
     *   flag('name')           → current value
     *   flag('name', value)    → set
     *   flag('name', v, time)  → set, then auto-toggle to `!v` after `time` ms
     */
    this.flag = function (name, value, time) {
      if (value === undefined) return flags[name];
      flags[name] = value;
      if (!time) return;
      // Replace any in-flight auto-toggle timer.
      clearTimeout(flags[name + '_timer']);
      flags[name + '_timer'] = this.delayedCall(() => {
        flags[name] = !flags[name];
      }, time);
    };

    /**
     * Tear-down. Order is intentional:
     *   1. let subclasses do app-specific cleanup (`removeDispatch`, `onDestroy`, `fxDestroy`)
     *   2. fire bound-on-destroy callbacks
     *   3. destroy children
     *   4. drop HMR registry entry
     *   5. clear renders + timers
     *   6. tear down GLUI element if present
     *   7. tear down event subscriptions
     *   8. unregister from parent
     *   9. tear down AppState bindings
     *  10. null out every own property
     */
    this.destroy = function () {
      if (this.removeDispatch) this.removeDispatch();
      if (this.onDestroy) this.onDestroy();
      if (this.fxDestroy) this.fxDestroy();

      if (onDestroyCallbacks) {
        onDestroyCallbacks.forEach((cb) => cb());
        onDestroyCallbacks = null;
      }

      for (const id in this.classes) {
        const cls = this.classes[id];
        if (cls && cls.destroy) cls.destroy();
      }
      this.classes = null;

      if (Hydra.LOCAL) {
        const key = Utils.getConstructorName(this);
        const array = Component.HMR.get(key);
        if (array) array.remove(this);
      }

      if (this.clearRenders) this.clearRenders();
      if (this.clearTimers) this.clearTimers();
      if (this.element && window.GLUI && this.element instanceof GLUIObject) this.element.remove();
      if (this.events) this.events = this.events.destroy();
      if (this.parent && this.parent.__destroyChild) this.parent.__destroyChild(this.__id);

      if (appStateBindings) {
        while (appStateBindings.length > 0) {
          appStateBindings[appStateBindings.length - 1].destroy?.();
        }
      }

      return Utils.nullObject(this);
    };

    this._bindOnDestroy = function (cb) {
      if (!onDestroyCallbacks) onDestroyCallbacks = [];
      onDestroyCallbacks.push(cb);
    };

    /** Called by a child during its own destroy to unregister itself. */
    this.__destroyChild = function (id) {
      delete this.classes[id];
    };

    /** Bubble a navigation request up the parent chain. */
    this.navigate = function (route) {
      let parent = self.parent;
      while (parent) {
        if (parent.navigate) parent.navigate(route);
        parent = parent.parent;
      }
    };
  },

  // ─── Static init ────────────────────────────────────────────────────────
  () => {
    // Class-name → array of live instances. Used by `initClass`/`destroy`
    // and the editor's hot-reload to enumerate components by name.
    Component.HMR = new Map();
    Component.HMR_INSTANCE_RELOADED = 'Component.HMR_INSTANCE_RELOADED';
  },
);

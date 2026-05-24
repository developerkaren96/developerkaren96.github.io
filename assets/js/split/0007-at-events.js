/*
 * Events — per-instance pub/sub mixin + global `Events.emitter`.
 *
 * Two layers:
 *
 *   1. The `Events` class is *mixed* into other objects (via `Inherit`),
 *      giving them `.events.sub/unsub/fire/wait/bubble/destroy`. Each
 *      instance lazily creates its own local Emitter so multiple objects
 *      can use the same event names without collision.
 *
 *   2. `Events.emitter` is a single global Emitter for app-wide events
 *      (RESIZE, VISIBILITY, CONNECTIVITY, etc.). All the `Events.X = '...'`
 *      string constants are convenience tags for that global emitter.
 *
 * Static init also wires DOM-level handlers (visibilitychange, resize,
 * online/offline, beforeunload, focus/blur on iOS social browsers) and
 * synthesizes the `Stage.width/height` from `window.innerWidth/Height`.
 *
 * Subscriptions are "marked-for-deletion" rather than spliced immediately;
 * a `defer()` sweeps the queue. This avoids index-shifting while iterating.
 */
Class(
  function Events() {
    const self = this;
    this.events = {};
    const sharedEmptyEvent = {};
    const linkedEmitters = [];
    let ownEmitter;

    /**
     * Subscribe to events.
     *
     *   events.sub('eventName', cb)            — listen on the global emitter
     *   events.sub(targetObj, 'eventName', cb) — listen on a specific object's emitter
     *
     * Internal: if cb is a Promise-create object, listen on its `.resolve`.
     * Returns the callback so it can be unsubscribed later.
     */
    this.events.sub = function (obj, evt, callback) {
      // Shift args when obj wasn't supplied.
      if (typeof obj !== 'object') { callback = evt; evt = obj; obj = null; }

      const cb = callback.resolve ? callback.resolve : callback;

      if (!obj) {
        Events.emitter._addEvent(evt, cb, this);
        return callback;
      }

      const emitter = obj.events.emitter();
      emitter._addEvent(evt, cb, this);
      emitter._saveLink(this);
      linkedEmitters.push(emitter);
      return callback;
    };

    /** Await an event once. Auto-unsubscribes after the first fire. */
    this.events.wait = async function (obj, evt) {
      const promise = Promise.create();
      const args = [obj, evt, (e) => {
        self.events.unsub(...args);
        promise.resolve(e);
      }];
      // Shift args when obj wasn't supplied.
      if (typeof obj !== 'object') args.splice(1, 1);
      self.events.sub(...args);
      return promise;
    };

    this.events.unsub = function (obj, evt, callback) {
      if (typeof obj !== 'object') { callback = evt; evt = obj; obj = null; }
      const cb = callback.resolve ? callback.resolve : callback;
      if (!obj) return Events.emitter._removeEvent(evt, cb);
      obj.events.emitter()._removeEvent(evt, cb);
    };

    /**
     * Fire an event. By default it bubbles up to the global emitter too;
     * pass `isLocalOnly = true` to keep it on this instance's emitter.
     * `obj` becomes the event payload (with `obj.target = this`).
     */
    this.events.fire = function (evt, obj, isLocalOnly) {
      obj = obj || sharedEmptyEvent;
      obj.target = this;
      Events.emitter._check(evt);
      const firedLocally = ownEmitter && ownEmitter._fireEvent(evt, obj);
      if (!firedLocally && !isLocalOnly) Events.emitter._fireEvent(evt, obj);
    };

    /** Re-fire events from `obj` on this instance (forwarding). */
    this.events.bubble = function (obj, evt) {
      self.events.sub(obj, evt, (e) => self.events.fire(evt, e));
    };

    /** Tear down: remove all subscriptions this instance set up. */
    this.events.destroy = function () {
      Events.emitter._destroyEvents(this);
      if (linkedEmitters) linkedEmitters.forEach((emitter) => emitter._destroyEvents(this));
      if (ownEmitter && ownEmitter.links) {
        ownEmitter.links.forEach((obj) => obj.events && obj.events._unlink(ownEmitter));
      }
      return null;
    };

    /** Lazily get-or-create this instance's local emitter. */
    this.events.emitter = function () {
      if (!ownEmitter) ownEmitter = Events.emitter.createLocalEmitter();
      return ownEmitter;
    };

    /** Internal — called by destroy() on the other side of a sub. */
    this.events._unlink = function (emitter) { linkedEmitters.remove(emitter); };
  },

  // ─── Static init (runs after the Events class is registered) ──────────
  () => {
    /*
     * The global emitter is a single Emitter instance. `createLocalEmitter`
     * uses the same constructor — instances share methods via the prototype.
     */
    Events.emitter = new (function Emitter() {
      this.events = [];

      // Define methods once on the prototype (this guard makes the
      // double-`new Emitter()` from `createLocalEmitter` cheap).
      const proto = Emitter.prototype;
      if (proto._check !== undefined) return;

      proto._check = function (evt) {
        if (evt === undefined) throw 'Undefined event';
      };

      proto._addEvent = function (evt, callback, object) {
        this._check(evt);
        this.events.push({ evt, object, callback });
      };

      proto._removeEvent = function (evtName, callback) {
        this._check(evtName);
        for (let i = this.events.length - 1; i >= 0; i--) {
          if (this.events[i].evt === evtName && this.events[i].callback === callback) {
            this._markForDeletion(i);
          }
        }
      };

      proto._sweepEvents = function () {
        for (let i = 0; i < this.events.length; i++) {
          if (this.events[i].markedForDeletion) {
            delete this.events[i].markedForDeletion;
            this.events.splice(i, 1);
            i--;
          }
        }
      };

      // Mark instead of splice immediately — splicing while another
      // `_fireEvent` is iterating would shift indices under us.
      proto._markForDeletion = function (i) {
        this.events[i].markedForDeletion = true;
        if (this._sweepScheduled) return;
        this._sweepScheduled = true;
        defer(() => {
          this._sweepScheduled = false;
          this._sweepEvents();
        });
      };

      proto._fireEvent = function (evtName, obj) {
        if (this._check) this._check(evtName);
        obj = obj || sharedEmptyEvent;
        let called = false;
        for (let i = 0; i < this.events.length; i++) {
          const entry = this.events[i];
          if (entry.evt !== evtName || entry.markedForDeletion) continue;
          entry.callback(obj);
          called = true;
        }
        return called;
      };

      proto._destroyEvents = function (object) {
        for (let i = this.events.length - 1; i >= 0; i--) {
          if (this.events[i].object === object) this._markForDeletion(i);
        }
      };

      proto._saveLink = function (obj) {
        if (!this.links) this.links = [];
        if (!~this.links.indexOf(obj)) this.links.push(obj);
      };

      proto.createLocalEmitter = function () { return new Emitter(); };
    })();

    Events.broadcast = Events.emitter._fireEvent;

    // ─── Global event-name constants ──────────────────────────────────────
    Events.VISIBILITY         = 'hydra_visibility';
    Events.HASH_UPDATE        = 'hydra_hash_update';
    Events.COMPLETE           = 'hydra_complete';
    Events.PROGRESS           = 'hydra_progress';
    Events.CONNECTIVITY       = 'hydra_connectivity';
    Events.UPDATE             = 'hydra_update';
    Events.LOADED             = 'hydra_loaded';
    Events.END                = 'hydra_end';
    Events.FAIL               = 'hydra_fail';
    Events.SELECT             = 'hydra_select';
    Events.ERROR              = 'hydra_error';
    Events.READY              = 'hydra_ready';
    Events.RESIZE             = 'hydra_resize';
    Events.CLICK              = 'hydra_click';
    Events.HOVER              = 'hydra_hover';
    Events.MESSAGE            = 'hydra_message';
    Events.ORIENTATION        = 'orientation';
    Events.BACKGROUND         = 'background';
    Events.BACK               = 'hydra_back';
    Events.PREVIOUS           = 'hydra_previous';
    Events.NEXT               = 'hydra_next';
    Events.RELOAD             = 'hydra_reload';
    Events.UNLOAD             = 'hydra_unload';
    Events.FULLSCREEN         = 'hydra_fullscreen';
    Events.WEBGL_CONTEXT_LOSS = 'hydra_webgl_context_loss';

    const sharedEmptyEvent = {};

    // ─── DOM wiring (runs once Hydra is ready) ────────────────────────────
    Hydra.ready(() => {
      let probeBox;

      // Visibility tracking — fold tab visibility + window focus/blur into a
      // single VISIBILITY event with type='focus' or 'blur'. Uses whichever
      // vendor-prefixed Page Visibility API the browser supports.
      (function () {
        let lastState;
        let lastTime = performance.now();

        function onFocus() {
          Render.blurTime = -1;
          if (lastState !== 'focus') Events.emitter._fireEvent(Events.VISIBILITY, { type: 'focus' });
          lastState = 'focus';
        }
        function onBlur() {
          Render.blurTime = Date.now();
          if (lastState !== 'blur') Events.emitter._fireEvent(Events.VISIBILITY, { type: 'blur' });
          lastState = 'blur';
        }

        // Defer 250ms so Device is fully ready (it's loaded right after Events).
        Timer.create(function attachVisibility() {
          let hiddenProp, eventName;
          [
            ['msHidden',      'msvisibilitychange'],
            ['webkitHidden',  'webkitvisibilitychange'],
            ['hidden',        'visibilitychange'],
          ].forEach(([prop, name]) => {
            if (document[prop] !== undefined) { hiddenProp = prop; eventName = name; }
          });

          if (!eventName) {
            // No Page Visibility API — fall back to focus/blur. IE binds them
            // on `document`; everyone else on `window`.
            const root = Device.browser === 'ie' ? document : window;
            root.onfocus = onFocus;
            root.onblur = onBlur;
            return;
          }

          document.addEventListener(eventName, () => {
            const time = performance.now();
            // Coalesce rapid-fire toggles (>10ms apart only).
            if (time - lastTime > 10) {
              if (document[hiddenProp] === false) onFocus();
              else onBlur();
            }
            lastTime = time;
          });
        }, 250);

        window.addEventListener('online',  () => Events.emitter._fireEvent(Events.CONNECTIVITY, { online: true  }));
        window.addEventListener('offline', () => Events.emitter._fireEvent(Events.CONNECTIVITY, { online: false }));
        window.onbeforeunload = () => { Events.emitter._fireEvent(Events.UNLOAD); return null; };
      })();

      window.Stage = window.Stage || {};

      // iOS social-app embed (Facebook/Twitter in-app) reports the wrong
      // innerWidth/Height — fall back to a hidden fixed-position probe div.
      if (Device.system.browser === 'social' && Device.system.os === 'ios') {
        probeBox = document.createElement('div');
        probeBox.style.position = 'fixed';
        probeBox.style.top = probeBox.style.left = probeBox.style.right = probeBox.style.bottom = '0px';
        probeBox.style.zIndex = '-1';
        probeBox.style.opacity = '0';
        probeBox.style.pointerEvents = 'none';
        document.body.appendChild(probeBox);
      }

      updateStage();

      let resizeTimer;
      const iosResize = Device.system.os === 'ios';
      const htmlEl = iosResize && document.querySelector('html');
      const debounceDelay = iosResize ? 500 : 16; // iOS resize is slow; coalesce harder

      function updateStage() {
        if (probeBox) {
          const bbox = probeBox.getBoundingClientRect();
          Stage.width = bbox.width || window.innerWidth || document.body.clientWidth || document.documentElement.offsetWidth;
          Stage.height = bbox.height || window.innerHeight || document.body.clientHeight || document.documentElement.offsetHeight;
          // Reset scroll AND fix the body to the probed dimensions.
          document.body.parentElement.scrollTop = document.body.scrollTop = 0;
          document.documentElement.style.width  = document.body.style.width  = `${Stage.width}px`;
          document.documentElement.style.height = document.body.style.height = `${Stage.height}px`;
          Events.emitter._fireEvent(Events.RESIZE);
        } else {
          Stage.width  = window.innerWidth  || document.body.clientWidth  || document.documentElement.offsetWidth;
          Stage.height = (Stage.isNormalMobileScroll && Stage.div.offsetHeight)
            || window.innerHeight
            || document.body.clientHeight
            || document.documentElement.offsetHeight;
        }
      }

      window.addEventListener('resize', function handleResize() {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          updateStage();
          // iOS landscape-with-keyboard bug: nudge scroll to dismiss the address bar.
          if (htmlEl &&
              Math.min(window.screen.width, window.screen.height) !== Stage.height &&
              !Mobile.isAllowNativeScroll) {
            htmlEl.scrollTop = -1;
          }
          Events.emitter._fireEvent(Events.RESIZE);
        }, debounceDelay);
      });

      window.onorientationchange = window.onresize;

      // Social-iframe-in-iOS-app sometimes reports the wrong size on first
      // paint — re-probe after 1s.
      if (Device.system.browser === 'social' &&
          (Stage.height >= screen.height || Stage.width >= screen.width)) {
        setTimeout(updateStage, 1000);
      }

      defer(window.onresize);
    });
  },
);

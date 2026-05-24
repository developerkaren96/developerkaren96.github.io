/*
 * XComponent — base mixin applied by `Inherit(this, XComponent)` inside every
 * fragment-style component. It wires the component into the global AppState
 * tree under a key prefix derived from `self.fragName`, so authors can write
 *
 *   self.set('mykey', value);     // becomes AppState.set('frag/mykey', value)
 *   self.get('mykey');            // reads AppState 'frag/mykey'
 *   self.bind('mykey', cb);       // listens on AppState 'frag/mykey'
 *
 * Anything containing '/' is taken as an absolute key and not auto-prefixed.
 *
 *   `state`     lazy `AppState.createLocal()` per component; first access creates
 *               it and publishes the slot under `<fragName>/state`. Re-bind of the
 *               local `bind()` routes through `self.bindState` so subscriptions
 *               are auto-cleaned when the component is destroyed.
 *   `fire`      forced set (3rd arg `true`) — re-emits even if the value didn't
 *               change. With no value supplied, fires a fresh UUID so handlers
 *               see a unique trigger.
 *   `bind/listen` overloaded:
 *               - bind(key, cb)                — own-state subscribe
 *               - bind(key, cb, refObj)        — refObj.state / direct AppState
 *                                                / event subscription
 *               - bind('hydra_event', cb)      — global event bus (`hydra_*`)
 *               - bind(ref, key, cb)           — alternative arg order
 *   `get`       returns the current value if defined; otherwise returns a
 *               Promise that polls every other frame (Render.start(cb, 24))
 *               until the value appears. In LOCAL mode an extra 5s timeout
 *               warns if it never resolves.
 *   `createUIL` makes a UIL input + a paired local AppState; numeric values are
 *               auto-coerced. Last arg `UIL.cms` toggles CMS mode.
 *   `help`      prints the available `$` methods at runtime.
 *
 * Cleanup: on destroy, the local state is destroyed and every AppState key
 * under `<fragName>/` is cleared.
 */
Class(function XComponent() {
  const self = this;
  let _state;

  /*
   * Lazily create one AppState bag per component instance. We override
   * `_state.bind` so it routes through `self.bindState` (auto-unsubscribe on
   * destroy) but keep the raw underlying binder available as `_bind`.
   * The local state is also published in the global AppState at
   * `<fragName>/state` so siblings can find it.
   */
  function createState() {
    if (_state) return _state;
    _state = AppState.createLocal();
    _state._bind = _state.bind;
    _state.bind = function (key, callback) {
      self.bindState(_state, key, callback);
    };
    _state.fire = function (key, value) {
      _state.set(key, value, true);
    };
    AppState.set(self.fragName + '/state', _state);
    return _state;
  }

  self.fragName = 'overwritten in descendent';
  self.contexts = 'overwritten in descendent';

  // Console helper — list every public method on this component, in the
  // form `$methodName`, ignoring internals (underscored / a small skip set).
  self.help = function () {
    console.groupCollapsed(`Fragment ${self.fragName} Overview`);
    console.log(`Your context(s) are: ${self.contexts}`);
    console.log('You have access to the following $ methods:');
    const skip = ['flag', 'initClass', 'classes', 'events', 'parent', 'findParent', 'bindState'];
    for (const key in self) {
      if ('_' === key.charAt(0)) continue;
      if (!key.includes(skip)) console.log('$' + key);
    }
    console.groupEnd();
  };

  // Prefix bare keys with fragName/. Auto-UUID when no value passed so the
  // setter always emits a distinct change.
  self.set = function (key, value) {
    if (undefined === value) value = Utils.uuid();
    if (!key.includes('/')) key = self.fragName + '/' + key;
    AppState.set(key, value);
  };

  // `fn(key, fn)` registers a callback in state; `fn(key)` reads it back.
  self.fn = function (key, callback) {
    if (callback && 'function' != typeof callback) throw '$fn requires callback to be a function';
    if (!callback) return self.get(key);
    self.set(key, callback);
  };

  // Same as `set` but with `forceEmit=true`.
  self.fire = function (key, value) {
    if (undefined === value) value = Utils.uuid();
    if (!key.includes('/')) key = self.fragName + '/' + key;
    AppState.set(key, value, true);
  };

  /*
   * Multiplexed subscribe. The three useful overloads are:
   *   bind(key, cb)              — own-state, key auto-prefixed
   *   bind(key, cb, refObj)      — refObj is either an AppState, something
   *                                with `.state` (a component), or an event
   *                                emitter / event-bus identifier.
   *   bind('hydra_xxx', cb)      — global hydra_* event bus
   *
   * The (ref, key, cb) reorder is accepted for ergonomics — if the 3rd arg
   * is a function and the 2nd is a string, args are reshuffled.
   */
  self.bind = self.listen = function (key, callback, ref) {
    // Reorder: bind(ref, key, cb) → bind(key, cb, ref).
    if ('function' == typeof ref && 'string' == typeof callback) {
      const rref = key; key = callback; callback = ref; ref = rref;
    }
    if (ref) {
      // refObj.state — unwrap to its underlying AppState.
      if (ref.state && ref.state.isAppState) ref = ref.state;
      return ref.isAppState
        ? self.bindState(ref, key, callback)
        : self.events.sub(ref, key, callback);
    }
    if (key.startsWith('hydra_')) return self.events.sub(key, callback);
    if (!key.includes('/')) key = self.fragName + '/' + key;
    return self.bindState(AppState, key, callback);
  };

  /*
   * Read-now-or-wait. If the key is already populated, return immediately.
   * Otherwise install a frame-throttled (24Hz) poll that resolves the
   * promise when the value appears. `noPromise=true` short-circuits to the
   * sync read with `undefined` fallback. LOCAL builds emit a warn if the
   * promise hangs for 5 s.
   */
  self.get = function (key, noPromise) {
    if (!key.includes('/')) key = self.fragName + '/' + key;
    let value = AppState.get(key);
    if (undefined !== value || noPromise) return value;
    let timer;
    const promise = Promise.create();
    const cb = () => {
      value = AppState.get(key);
      if (undefined !== value) {
        clearTimeout(timer);
        promise.resolve(value);
        Render.stop(cb);
      }
    };
    Render.start(cb, 24);
    if (Hydra.LOCAL) {
      timer = self.delayedCall(() => {
        console.warn(`$get ${key} has timed out after 5 seconds`);
      }, 5e3);
    }
    return promise;
  };

  // Define `self.state` as a lazy getter that creates the state bag on demand.
  // The setter throws — descendant code mustn't replace it wholesale.
  if (!self.state) {
    Object.defineProperty(self, 'state', {
      set: function () { throw "Don't override state!"; },
      get: function () { return createState(); },
    });
  }

  /*
   * Build a UIL input + a paired local AppState that mirrors its values.
   * Numeric strings are coerced to Number. Returns `[input, appState]`. The
   * appState exposes `ready()` returning a promise that resolves on the first
   * input update (UIL can be slow to initialise CMS-backed values).
   */
  this.createUIL = function () {
    const input = InputUIL.create.apply(this, arguments);
    const appState = AppState.createLocal();
    if (arguments[arguments.length - 1] == UIL.cms) input.CMS = true;
    let promise = Promise.create();
    appState.ready = () => promise;
    input.onUpdate = (key) => {
      let val = input.get(key);
      if (!isNaN(val)) val = Number(val);
      appState.set(key, val);
      if (promise) {
        defer(() => { promise?.resolve(); promise = null; });
      }
    };
    return [input, appState];
  };

  this.requestData         = Data.makeRequest;
  this.fulfillDataRequest  = Data.request;

  // On destroy: tear down the local state, sweep our key namespace.
  this._bindOnDestroy(() => {
    _state?.destroy?.();
    AppState.clearKeysMatching(self.fragName + '/');
  });

  // Cached refs to the global WebGL drawing helpers ($gl / $glText).
  this.gl     = window.$gl;
  this.glText = window.$glText;

  this.createState    = createState;
  this.createFragment = this.initClass;

  // Some components depend on the parent's layout layers being ready.
  self.waitLayers = async () => {
    if (self.parent.layout?.getAllLayers) self.layers = await self.parent.layout.getAllLayers();
    if (self.parent?.getAllLayers)        self.layers = await self.parent.getAllLayers();
  };
});

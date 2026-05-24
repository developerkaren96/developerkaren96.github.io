/*
 * AppStore — Vuex-style facade over a local AppState bag. Provides the
 * `commit`/`dispatch`/`subscribe`/`subscribeAction` quartet plus the
 * `createAppStore({ state, mutations, actions })` initialiser.
 *
 * Layout:
 *   • `state` is a fresh local AppState. The `bind` / `map` / `bindings` /
 *     `watch` / `get` methods on the store delegate straight to it.
 *   • `_mutations[type]` and `_actions[type]` are arrays of handlers (a
 *     store can register multiple of either kind under the same key). Each
 *     handler is wrapped: mutations are called with `(state, payload)`,
 *     actions with `({ dispatch, commit, state, rootState }, payload)`.
 *
 * commit(type, payload):
 *   Synchronous. Runs every handler under that type, then fans out the
 *   `{ type, payload }` mutation record to every subscriber whose key
 *   filter matched. Missing type → LOCAL-only error log.
 *
 * dispatch(type, payload):
 *   Async, returns a Promise. Runs `before` hooks → fires the action
 *   handler(s) → runs `after`/`error` hooks. With multiple handlers under
 *   one type, results are joined via `Promise.all`. Non-promise return
 *   values are wrapped in `Promise.resolve` so the consumer always gets a
 *   thenable.
 *
 *   Hook execution is wrapped in try/catch — a subscriber throwing must
 *   not break the action; LOCAL builds surface the error to the console.
 *
 * subscribe / subscribeAction:
 *   Filter by `type` (the dispatched/committed key) and forward matching
 *   events to the user callback. `subscribeAction(key, { before, after })`
 *   lets a subscriber observe action lifecycle phases; the bare-function
 *   form is equivalent to `{ before }`.
 *
 * `options.prepend` puts the subscriber at the head of the list, useful
 * for code that must run *before* anything else (e.g. a logger).
 *
 * `genericSubscribe` returns an unsubscribe function so caller code can
 * tear down without keeping a separate handle on the subscription record.
 */
Class(function AppStore() {
  const self = this;
  this.state = AppState.createLocal();
  const _mutations = {};
  const _actions   = {};
  let _subscribers       = [];
  let _actionSubscribers = [];

  // Registers a mutation handler. The wrapped form receives (state, payload)
  // — the user handler signature.
  function registerMutation(type, handler) {
    (_mutations[type] || (_mutations[type] = [])).push(function wrappedMutationHandler(payload) {
      handler.call(self, self.state, payload);
    });
  }

  // Action handlers get the standard Vuex context object. Result is
  // promise-wrapped if the handler returned something non-thenable.
  function registerAction(type, handler) {
    (_actions[type] || (_actions[type] = [])).push(function wrappedActionHandler(payload) {
      let res = handler.call(
        self,
        { dispatch: self.dispatch, commit: self.commit, state: self.state, rootState: self.state },
        payload,
      );
      function isPromise(val) { return val && 'function' == typeof val.then; }
      if (!isPromise(res)) res = Promise.resolve(res);
      return res;
    });
  }

  // Subscribe / unsubscribe primitive. Idempotent — a function already
  // present isn't added again.
  function genericSubscribe(fn, subscribers, options) {
    if (subscribers.indexOf(fn) < 0) {
      if (options && options.prepend) subscribers.unshift(fn);
      else                            subscribers.push(fn);
    }
    return () => {
      const i = subscribers.indexOf(fn);
      if (i > -1) subscribers.splice(i, 1);
    };
  }

  // Initialise from a `{ state, mutations, actions }` description.
  this.createAppStore = function (_params) {
    (function setInitState({ state }) {
      for (const key in state) self.state.set(key, state[key]);
    })(_params);
    (function mapMutations({ mutations }) {
      for (const key in mutations) registerMutation(key, mutations[key]);
    })(_params);
    (function mapActions({ actions }) {
      for (const key in actions) registerAction(key, actions[key]);
    })(_params);
  };

  this.commit = function (type, payload) {
    const mutation = { type, payload };
    const entry = _mutations[type];
    if (!entry) {
      if (Hydra.LOCAL) console.error(`Error: no mutation for type ${type}`);
      return;
    }
    // Run handlers, then notify subscribers (slice to tolerate
    // sub-mutation during iteration).
    entry.forEach(function commitIterator(handler) { handler(payload); });
    _subscribers.slice().forEach((sub) => sub(mutation, this.state));
  };

  this.dispatch = function (type, payload) {
    const action = { type, payload };
    const entry  = _actions[type];
    if (!entry && Hydra.LOCAL) console.error(`Error: no action for type ${type}`);

    // before-hooks
    try {
      _actionSubscribers.slice().filter((sub) => sub.before).forEach((sub) => sub.before(action, self.state));
    } catch (e) {
      if (Hydra.LOCAL) { console.warn('Error in before action subscribers: '); console.error(e); }
    }

    // Single-handler vs fan-out.
    const result =
      entry.length > 1
        ? Promise.all(entry.map((handler) => handler(payload)))
        : entry[0](payload);

    // after / error subscribers run inside the promise chain.
    return new Promise((resolve, reject) => {
      result.then(
        (res) => {
          try {
            _actionSubscribers.filter((sub) => sub.after).forEach((sub) => sub.after(action, self.state));
          } catch (e) {
            if (Hydra.LOCAL) { console.warn('Error in after action subscribers: '); console.error(e); }
          }
          resolve(res);
        },
        (error) => {
          try {
            _actionSubscribers.filter((sub) => sub.error).forEach((sub) => sub.error(action, self.state, error));
          } catch (e) {
            if (Hydra.LOCAL) { console.warn('Error in error action subscribers: '); console.error(e); }
          }
          reject(error);
        },
      );
    });
  };

  /*
   * Action subscriber. `fn` may be a function (interpreted as before-hook)
   * or `{ before?, after?, error? }`. Wrappers in the public side filter
   * by `key`.
   */
  this.subscribeAction = function (key, fn, options) {
    const subs = {};
    if ('function' == typeof fn) {
      subs.before = function subscriberEmptyBeforeWrapper(action) {
        if (action.type === key) fn(action);
      };
    } else {
      if (fn.before) {
        subs.before = function subscriberBeforeWrapper(action) {
          if (action.type === key) fn.before(action);
        };
      }
      if (fn.after) {
        subs.after = function subscriberAfterWrapper(action) {
          if (action.type === key) fn.after(action);
        };
      }
    }
    return genericSubscribe(subs, _actionSubscribers, options);
  };

  this.subscribe = function (key, fn, options) {
    return genericSubscribe(
      function subscriberWrapper(mutation) {
        if (mutation.type === key) fn(mutation);
      },
      _subscribers,
      options,
    );
  };

  // Forwarded delegates to the underlying AppState.
  this.bind     = this.state.bind;
  this.map      = this.state.map;
  this.bindings = this.state.bindings;
  this.watch    = this.state.bind;
  this.get      = this.state.get;
});

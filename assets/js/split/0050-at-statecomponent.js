/*
 * StateComponent — mixin that gives a component a typed surface against an
 * AppStore (`commit` / `dispatch` / `subscribeMutation` / `subscribeAction`)
 * and tracks every subscription it has opened, so they can all be torn down
 * automatically when the host is destroyed.
 *
 * Internally:
 *   `_mutationsUnsubscribers` / `_actionsUnsubscribers` accumulate the
 *   unsubscribe closures returned by `AppStore.subscribe(...)`/
 *   `subscribeAction(...)`. On host destroy (`_bindOnDestroy` from Component),
 *   `unsubscribeAll` runs them all.
 *
 *   `watch(store, key, fn, callInitial)`:
 *     Convenience over `bindState` (or `store.watch` when `bindState` isn't
 *     present, e.g. on a non-Component host). The `callInitial=false` form
 *     swallows the very first invocation so the consumer only sees changes
 *     *after* binding.
 */
Class(function StateComponent() {
  const self = this;
  const _mutationsUnsubscribers = [];
  const _actionsUnsubscribers   = [];

  this.unsubscribeMutations = function () { _mutationsUnsubscribers.forEach((u) => u()); };
  this.unsubscribeActions   = function () { _actionsUnsubscribers  .forEach((u) => u()); };
  this.unsubscribeAll       = function () { self.unsubscribeMutations(); self.unsubscribeActions(); };

  this.subscribeMutation = function (store, type, fn) {
    _mutationsUnsubscribers.push(store.subscribe(type, fn));
  };
  this.subscribeAction = function (store, type, fn) {
    _actionsUnsubscribers.push(store.subscribeAction(type, fn));
  };

  this.commit   = function (store, type, payload) { store.commit(type, payload); };
  this.dispatch = async function (store, type, payload) { await store.dispatch(type, payload); };
  this.getState = function (store, key) { return store.get(key); };

  /*
   * Subscribe with an "ignore first emission" option. AppStates fire the
   * current value on bind; setting `callInitial=false` filters that
   * initial call out so the user only sees deltas.
   */
  this.watch = function (store, key, fn, callInitial = true) {
    let hasCalled = false;
    const callback = (params) => {
      if (hasCalled || callInitial) fn(params);
      else hasCalled = true;
    };
    return self.bindState ? self.bindState(store, key, callback) : store.watch(key, callback);
  };
  this.bind = this.watch;

  // Auto-cleanup at host destruction time (when the host is a Component).
  if ('function' == typeof this._bindOnDestroy) {
    this._bindOnDestroy(() => { self.unsubscribeAll(); });
  }
});

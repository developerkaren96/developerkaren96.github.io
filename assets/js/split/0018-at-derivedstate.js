/*
 * DerivedState — small AppState helper that aggregates several boolean-ish
 * state keys into a single derived "all conditions true" flag and pushes it
 * through `_cb`.
 *
 *   const ds = self.initClass(DerivedState);
 *   ds.bind((ok) => { /* every condition currently truthy when ok===true *\/ });
 *   ds.truthy('loaded');                 // own-fragment state, just !!val
 *   ds.truthy(otherState, 'ready');      // explicit AppState
 *   ds.truthy('flag', (v) => v > 3);     // custom validator
 *   ds.eq('mode', 'edit');               // strict equality
 *   ds.neq('mode', 'off');               // strict inequality
 *
 * Keys without '/' are auto-prefixed with `self.parent.fragName`. Internally
 * each registered predicate stores its current result in `_map[key]`; the
 * combined truth is `every(value)`. `_cb` is called whenever any input
 * changes — invoked with `true` only when every predicate is currently
 * truthy.
 */
Class(function DerivedState() {
  Inherit(this, Component);
  const self = this;
  let _cb;
  const _map = {};

  function update() {
    let truthy = true;
    for (const key in _map) if (!_map[key]) truthy = false;
    _cb(truthy);
  }

  // Receiver for the AND-of-all signal.
  this.bind = function (callback) { _cb = callback; };

  /*
   * Subscribe to a value and record `validator(value) || !!value` into the
   * `_map[key]` slot. Two-arg form: `(key, validator)`. Three-arg form:
   * `(state, key, validator)`.
   */
  this.truthy = function (state, key, validator) {
    if ('string' == typeof state) { validator = key; key = state; state = null; }
    if (!key.includes('/') && !state) key = self.parent.fragName + '/' + key;
    state = state || AppState;
    self.bindState(state, key, (bool) => {
      _map[key] = null != validator ? validator && !!bool : !!bool;
      update();
    });
  };

  // Predicate: value === statement.
  this.eq = function (state, key, statement) {
    if ('string' == typeof state) { statement = key; key = state; state = null; }
    if (!key.includes('/') && !state) key = self.parent.fragName + '/' + key;
    state = state || AppState;
    self.bindState(state, key, (val) => { _map[key] = statement == val; update(); });
  };

  // Predicate: value !== statement.
  this.neq = function (state, key, statement) {
    if ('string' == typeof state) { statement = key; key = state; state = null; }
    if (!key.includes('/') && !state) key = self.parent.fragName + '/' + key;
    state = state || AppState;
    self.bindState(state, key, (val) => { _map[key] = statement != val; update(); });
  };
});

/*
 * StateArray — an array-like reactive collection of AppState bags. Used by
 * ViewState (and consumers like list views) to back a stream of items where
 * each entry has its own observable state.
 *
 * Each pushed object is wrapped via `wrap()`:
 *   • bare objects get a `_uid` (uuid stamp) and are turned into a local
 *     AppState that mirrors them (`state.origin = obj`).
 *   • AppState-like objects (anything with `.createLocal`) pass through
 *     unmodified.
 *
 * Public surface:
 *   length, push, remove, update, insertAtIdx, refresh, sort, reflow,
 *   forEach, map, find, includes, indexOf, toJSON, getMap, setFilter.
 *
 * Indexed access: `arr[i]` is wired via `Object.defineProperty`. The getter
 * returns the underlying state; the setter merges its keys into the state
 * via `_data[i].set(...)` so consumers can do `arr[3] = { foo: 1 }` and have
 * subscribers fire correctly.
 *
 * Events:
 *   Events.UPDATE fires with `{ type: 'add' | 'remove' | 'modify', state[,
 *   index] }`. `refresh` first emits `StateArray.REFRESH` (consumers like
 *   ViewState use this to schedule a teardown pass) and then a sequence of
 *   `remove` events for each existing entry before re-pushing the new ones.
 *
 * Filter:
 *   `setFilter(fn, refresh=true)` installs a predicate that subsequent
 *   `push` operations test; when refresh is true, existing data is also
 *   re-pushed through the filter.
 *
 * update(obj):
 *   Looks up the entry by `_uid` (origin or wrapped state) and applies the
 *   incoming object's fields atomically via `setAll`. Fires `modify`. Async
 *   because `setAll` may yield.
 *
 * reflow():
 *   Re-emit add events for every entry by replaying refresh with the
 *   current `.origin` objects — used when filter logic depends on external
 *   state that just changed.
 */
Class(
  function StateArray(_src = [], _filterFn = null) {
    Inherit(this, Events);
    const self = this;
    const _data = [];

    // Bare objects → AppState. AppState-likes pass through.
    function wrap(obj) {
      if ('object' != typeof obj || Array.isArray(obj)) throw 'StateArray entries must be {objects}!';
      if (!obj._uid) obj._uid = Utils.uuid();
      if (obj.createLocal) return obj;
      const state = AppState.createLocal(obj);
      state.origin = obj;
      return state;
    }

    Object.defineProperty(self, 'length', { get: function () { return _data.length; } });

    this.setFilter = function (fn, refresh = true) {
      _filterFn = fn;
      if (refresh) this.refresh(_data.filter(fn));
    };

    this.push = function (obj) {
      if (_filterFn && !_filterFn(obj)) return;
      const state = wrap(obj);
      _data.push(state);
      // Define `self[index]` get/set the first time we reach that slot.
      (function setInterfaceAtIndex(index) {
        if (undefined !== self[index]) return;
        Object.defineProperty(self, index, {
          set: function (v) { for (const key in v) _data[index].set(key, v[key]); },
          get: function ()   { return _data[index]; },
        });
      })(_data.length - 1);
      self.events.fire(Events.UPDATE, { type: 'add', state });
      return state;
    };

    this.remove = function (obj) {
      for (let i = 0; i < _data.length; i++) {
        const state = _data[i];
        if (state.origin === obj || state === obj) {
          _data.splice(i, 1);
          self.events.fire(Events.UPDATE, { type: 'remove', state }, true);
        }
      }
    };

    // Update by _uid lookup, fires modify with the index.
    this.update = async function (obj) {
      let _found = false;
      for (let i = 0; i < _data.length; i++) {
        const state = _data[i];
        if (state.origin._uid === obj._uid || state._uid === obj._uid) {
          await state.setAll(obj);
          self.events.fire(Events.UPDATE, { type: 'modify', state, index: i });
          _found = true;
          return _found;
        }
      }
      return _found;
    };

    this.forEach = function (cb) { _data.forEach(function (...args) { return cb.apply(this, args); }); };
    this.find    = function (cb) { return _data.find(function (...args) { return cb.apply(this, args); }); };

    // Inserts `obj` at `idx`; idx must already point to an existing slot.
    // A full refresh follows so subscribers (e.g. ViewState) re-render
    // with the new ordering.
    this.insertAtIdx = function (idx, obj) {
      if (!obj._uid) obj = wrap(obj);
      if (!_data[Math.abs(idx)]) throw 'There is no item at index ' + idx + ' in this StateArray';
      _data.splice(idx, 0, obj);
      const newData = _data.filter(() => true);
      this.refresh(newData);
    };

    this.map = function (cb) {
      const array = [];
      _data.forEach(function (...args) { return array.push(cb.apply(this, args)); });
      return array;
    };

    this.toJSON  = function () { const a = []; _data.forEach((s) => a.push(s.toJSON()));  return a; };
    this.getMap  = function () { const a = []; _data.forEach((s) => a.push(s.getMap())); return a; };

    this.indexOf = function (obj) {
      for (let i = 0; i < _data.length; i++) {
        const state = _data[i];
        if (state.origin === obj || state === obj) return i;
      }
    };

    /*
     * Replace contents. First fire StateArray.REFRESH so consumers can
     * stage a teardown, then emit a `remove` for each entry (cleaning out
     * downstream subscribers), then push the new array.
     */
    this.refresh = function (array) {
      if (!(Array.isArray(array) || array instanceof StateArray)) array = [array];
      self.events.fire(StateArray.REFRESH, { type: 'refresh' }, true);
      let i = _data.length;
      while (i--) {
        const state = _data.pop();
        self.events.fire(Events.UPDATE, { type: 'remove', state }, true);
      }
      _data.length = 0;
      array.forEach(self.push);
    };

    this.sort = function (cb) {
      const array = [];
      _data.forEach((d) => array.push(d));
      array.sort(cb);
      self.refresh(array);
    };

    this.includes = function (obj) { return this.indexOf(obj) > -1; };

    // Re-emit the entire set (used when an external filter dependency
    // changes; consumers reapply their predicates).
    this.reflow = function () { this.refresh(_data.map((d) => d.origin)); };

    if (!Array.isArray(_src)) throw 'StateArray can only take an array as a parameter';
    _src.forEach(self.push);
  },
  (_) => {
    StateArray.REFRESH = 'state_array_refresh';
  },
);

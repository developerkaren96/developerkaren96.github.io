/*
 * Model — base class for data namespaces (e.g. UserModel, ContentModel).
 *
 * Each `Model` subclass is a Component-mixed object that also acts as its
 * own Namespace (so it can host nested classes via `MyModel.Class(...)`).
 *
 * Responsibilities:
 *   - Simple key/value store via `push`/`pull`.
 *   - "Data ready" gate: subsystems call `promiseData(N)` to declare they
 *     will deliver N pieces of data; when `resolveData()` has been called
 *     that many times, `dataReady` flips true.
 *   - JSON loader: `loadData(url)` fetches with a cache-buster and dispatches
 *     parts of the payload to the matching sub-model's `init()` method.
 *   - Pluggable request handlers via `handleRequest(type, fn)` →
 *     `makeRequest(type, data, mockData)`. Mock fallbacks allow design-time
 *     work without a backend (the mock object becomes a live AppState).
 */
Class(function Model() {
  Inherit(this, Component);
  Namespace(this);

  const self = this;
  const storage = {};      // bag for push/pull
  const requestHandlers = {};

  // Counter pair for the "data ready" barrier:
  //   `expected`  — total commitments via promiseData / waitForData
  //   `delivered` — number of resolveData / fulfillData calls so far
  let expected = 0;
  let delivered = 0;

  this.push = function (name, val) { storage[name] = val; };
  this.pull = function (name) { return storage[name]; };

  /** Commit to delivering `num` more pieces of data before `dataReady` flips. */
  this.waitForData = this.promiseData = function (num = 1) {
    expected += num;
  };

  /** Mark one delivery as done. Flips `dataReady` once all commitments are met. */
  this.fulfillData = this.resolveData = function () {
    delivered++;
    if (delivered === expected) self.dataReady = true;
  };

  /** Resolves once `dataReady` becomes true. */
  this.ready = function (callback) {
    const promise = Promise.create();
    if (callback) promise.then(callback);
    self.wait(self, 'dataReady').then(promise.resolve);
    return promise;
  };

  /**
   * Distribute a JSON payload into sub-model `init()` methods.
   *
   * For each key on `data`, find the sub-model whose name matches
   * (case-insensitive, dashes stripped) and call its `.init(value)`.
   * Sub-models without a corresponding key still get `.init()` with no args.
   * Finally the parent's own `.init(data)` (if any) is called.
   *
   * `STATIC_DATA` is left on the model for later raw access.
   */
  this.initWithData = function (data) {
    self.STATIC_DATA = data;
    for (const key in self) {
      const subModel = self[key];
      let initialized = false;
      for (const dataKey in data) {
        if (dataKey.toLowerCase().replace(/-/g, '') === key.toLowerCase()) {
          initialized = true;
          if (subModel.init) subModel.init(data[dataKey]);
        }
      }
      if (!initialized && subModel.init) subModel.init();
    }
    if (self.init) self.init(data);
  };

  /**
   * Fetch JSON from `url` (with timestamp cache-buster) and feed it through
   * `initWithData`. Resolves the returned promise with the raw data.
   */
  this.loadData = function (url, callback) {
    const promise = Promise.create();
    if (!callback) callback = promise.resolve;
    const scope = this;
    get(url + '?' + Utils.timestamp()).then((data) => {
      defer(() => {
        scope.initWithData(data);
        callback(data);
      });
    });
    return promise;
  };

  /** Register an async handler for `makeRequest(type, ...)`. */
  this.handleRequest = function (type, callback) {
    requestHandlers[type] = callback;
  };

  /**
   * Invoke a registered request handler, or fall back to `mockData`.
   *
   * Argument-shifting allows any of:
   *   makeRequest(type)
   *   makeRequest(type, data)
   *   makeRequest(type, mockFn)
   *   makeRequest(type, data, mockFn)
   *   makeRequest(mockFn)               // no type — pure mock
   *
   * If `mockData` itself has `.reflow` (i.e. it's already an AppState/StateArray),
   * it's returned as-is — useful for components that want to short-circuit
   * data flow with a pre-built state graph.
   *
   * Returns must be an AppState or StateArray; otherwise throws.
   */
  this.makeRequest = async function (type, data, mockData = {}) {
    // makeRequest(mockFn)
    if (typeof type === 'function') { mockData = type; data = null; type = null; }
    // makeRequest(type, mockFn)
    if (typeof data === 'function') { mockData = data; data = null; }
    if (typeof mockData === 'function') mockData = await mockData();
    if (mockData?.reflow) return mockData;

    if (!requestHandlers[type]) {
      console.warn(`Missing data handler for ${type} with mockData`, mockData);
      if (typeof mockData === 'function') mockData = mockData();
      return Array.isArray(mockData) ? new StateArray(mockData) : AppState.createLocal(mockData);
    }

    const result = await requestHandlers[type](data, mockData);
    if (!(result instanceof StateArray || result.createLocal)) {
      throw `makeRequest ${type} must return either an AppState or StateArray`;
    }
    return result;
  };

  /**
   * Like `makeRequest`, but auto-wraps non-state return values:
   *   Array      → new StateArray(result)
   *   object     → AppState.createLocal(result)
   * Used in places where the handler may return raw JSON.
   */
  this.request = async function (type, data, mockData) {
    if (typeof type === 'function') { mockData = type; data = null; type = null; }
    if (typeof data === 'function') { mockData = data; data = null; }
    if (typeof mockData === 'function') mockData = await mockData();
    if (mockData?.reflow) return mockData;

    if (!requestHandlers[type]) {
      return Array.isArray(mockData) ? new StateArray(mockData) : AppState.createLocal(mockData);
    }

    let result = await requestHandlers[type](data, mockData);
    if (Array.isArray(result)) result = new StateArray(result);
    else if (typeof result === 'object') result = AppState.createLocal(result);

    if (!(result instanceof StateArray || result.createLocal)) {
      throw `makeRequest ${type} must return either an AppState or StateArray`;
    }
    return result;
  };
});

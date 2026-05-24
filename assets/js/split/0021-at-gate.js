/*
 * Gate — async barrier (named or anonymous).
 *
 *   Gate.create('cms');
 *   await Gate.wait('cms');     // pending until…
 *   Gate.open('cms');           // …this opens it.
 *
 * Anonymous form (no name) — `create` queues a promise, `open` resolves
 * the *oldest* one. Useful as a one-shot back-pressure mechanism.
 *
 * `wait(name)` semantics:
 *   - Named gate already created: returns its promise (resolves on `open`).
 *   - Named gate not yet created: lazily creates one and returns its promise.
 *   - Anonymous: returns the most recent anonymous promise, or already-
 *     resolved when none exist.
 */
Class(function Gate() {
  const anonymousQueue = [];
  const namedGates = {};

  /** Open a slot. Named gates are awaitable until `open(name)` is called. */
  this.create = function (name) {
    const promise = Promise.create();
    if (name) namedGates[name] = promise;
    else anonymousQueue.push(promise);
  };

  this.open = function (name) {
    if (name) {
      // Lazily create then resolve — `open` before `create` is valid.
      if (!namedGates[name]) namedGates[name] = Promise.create();
      namedGates[name].resolve();
    }
    const next = anonymousQueue.shift();
    if (next) next.resolve();
  };

  /**
   * Await a gate. Resolves immediately if no anonymous gates and no name.
   * Named gates auto-create if missing (so `wait` before `create` works).
   */
  this.wait = function (name) {
    if (!anonymousQueue.length && !name) return Promise.resolve();
    if (name) {
      if (!namedGates[name]) namedGates[name] = Promise.create();
      return namedGates[name];
    }
    return anonymousQueue[anonymousQueue.length - 1] || Promise.resolve();
  };
}, 'static');

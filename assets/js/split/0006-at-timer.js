/*
 * Timer — frame-loop-driven setTimeout / defer / deferNextTick.
 *
 * Static singleton. Three scheduling primitives, all driven off `Render`:
 *
 *   - `Timer.create(cb, ms[, useScaledDelta])`
 *       Like setTimeout but using either real DT or scaled DELTA.
 *       Returns a handle that `clearTimeout` (patched in 0002) recognizes.
 *
 *   - `defer(cb)`         — run on the *next* render frame.
 *   - `deferNextTick(cb)` — run on the next macrotask via a `postMessage`
 *                           round-trip (faster than rAF if not animating).
 *
 * Internal double-buffering: while one defer queue is being drained, new
 * `defer()` calls go to the *other* queue. This prevents a defer-callback
 * that calls `defer()` again from re-entering and looping forever.
 */
Class(function Timer() {
  const self = this;

  const scheduled = [];      // active Timer.create entries
  const discard = [];        // entries scheduled for removal after this frame

  // Double-buffered defer queues. `activeDefer` is the *draining* one; new
  // calls go to the other.
  const deferA = [];
  const deferB = [];
  let activeDefer = deferA;

  // FIFO for deferNextTick — delivered by the `message` event below.
  const nextTickQueue = [];

  /** Per-frame: tick all scheduled timers, drain the active defer queue. */
  function loop(_time, delta) {
    // Clean up entries flagged last frame.
    for (let i = discard.length - 1; i >= 0; i--) {
      const obj = discard[i];
      obj.callback = null;
      scheduled.remove(obj);
    }
    if (discard.length) discard.length = 0;

    // Advance each timer.
    for (let i = scheduled.length - 1; i >= 0; i--) {
      const obj = scheduled[i];
      if (!obj) { scheduled.remove(obj); continue; }
      obj.current += obj.scaledTime ? delta : Render.DT;
      if (obj.current >= obj.time) {
        if (obj.callback) obj.callback();
        discard.push(obj);
      }
    }

    // Drain the active defer queue (back-to-front). Swap buffers so any
    // `defer()` calls made *during* drain land in the other buffer.
    for (let i = activeDefer.length - 1; i > -1; i--) activeDefer[i]();
    activeDefer.length = 0;
    activeDefer = activeDefer === deferA ? deferB : deferA;
  }

  /**
   * `postMessage` trampoline: posting a message to self goes through the
   * macrotask queue and re-enters via this listener. Faster than rAF and
   * doesn't block on animation cadence.
   */
  function handleDeferNextTick(event) {
    if (event == null) return;
    if (event.source !== window) return;
    if (event.data !== '_hydraDeferNextTick') return;
    event.stopPropagation();
    if (nextTickQueue.length > 0) nextTickQueue.shift()();
  }

  Render.start(loop);
  window.addEventListener('message', handleDeferNextTick, true);

  /**
   * Cancel a timer by its handle. Internal — `window.clearTimeout` (patched
   * in 0002) calls into this before falling back to native clearTimeout.
   */
  this.__clearTimeout = function (ref) {
    let obj;
    for (let i = scheduled.length - 1; i > -1; i--) {
      if (scheduled[i].ref === ref) { obj = scheduled[i]; break; }
    }
    if (!obj) return false;
    obj.callback = null;
    scheduled.remove(obj);
    return true;
  };

  /**
   * Schedule a callback after `time` ms. When `scaledTime` is truthy, the
   * countdown uses `Render.DELTA` (affected by `setTimeScale`) instead of
   * real-time `Render.DT`. Returns a handle.
   *
   * In Node SSR, falls through to native setTimeout (no Render loop).
   */
  this.create = function (callback, time, scaledTime) {
    if (window._NODE_) return setTimeout(callback, time);
    const entry = {
      time: Math.max(1, time || 1),
      current: 0,
      ref: Utils.timestamp(),
      callback,
      scaledTime,
    };
    scheduled.unshift(entry);
    return entry.ref;
  };

  /** Promise-flavored Timer.create — resolves after `time` ms. */
  this.delayedCall = function (time) {
    const promise = Promise.create();
    self.create(promise.resolve, time);
    return promise;
  };

  /**
   * Run on the next render frame (synchronously with the per-frame loop).
   * If called without a callback, returns a Promise that resolves on the
   * next frame.
   *
   * Goes into the *non-active* buffer to avoid re-entering the current drain.
   */
  window.defer = this.defer = function (callback) {
    let promise;
    if (!callback) { promise = Promise.create(); callback = promise.resolve; }
    (activeDefer === deferA ? deferB : deferA).unshift(callback);
    return promise;
  };

  /**
   * Run on the next macrotask. Uses postMessage round-trip — typically
   * faster than rAF when no painting is needed.
   */
  window.deferNextTick = this.deferNextTick = function (callback) {
    let promise;
    if (!callback) { promise = Promise.create(); callback = promise.resolve; }
    nextTickQueue.push(callback);
    callback.time = performance.now();
    window.postMessage('_hydraDeferNextTick', '*');
    return promise;
  };
}, 'static');

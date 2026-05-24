/*
 * Render — frame loop, refresh-rate detection, time-scale, FPS cap.
 *
 * Single rAF-driven loop. Two callback lanes:
 *   - `_render`  — gameplay/scene callbacks; receive (TIME, DELTA*timeScale).
 *   - `_native`  — low-overhead callbacks; receive (refreshMultiplier).
 *                  Useful for things that should run at native rAF speed
 *                  regardless of `capFPS`.
 *   - `_drawFrame` — tail-of-frame callbacks; run *after* all `_render` cbs.
 *
 * Special behaviours:
 *   - Refresh-rate sampling: collects 30 DT samples, picks the median,
 *     snaps to the nearest standard rate (REFRESH_TABLE).
 *   - FPS cap: when `capFPS` is set, skips rAF callbacks until budget allows.
 *   - Time multipliers: `timeScaleUniform.value` is the product of all
 *     `createTimeMultiplier()` slots, so multiple systems (slow-mo, etc.)
 *     can compose.
 *   - Screen-move detection: every 5s checks `window.screen` hash; if the
 *     window moved to a different monitor, re-samples refresh rate.
 *
 * Iteration uses module-scope cursors (`_renderIndex`, `_nativeIndex`) so
 * `start`/`stop` calls *during* a frame can fix up the index in-place.
 */
Class(function Render() {
  const self = this;

  const renderCallbacks = [];
  const nativeCallbacks = [];
  const drawFrameCallbacks = [];
  const timeMultipliers = [];

  // Module-scope iteration cursors (null when no iteration in progress).
  // Allow `start`/`stop` mid-frame to correct the index in-place.
  let renderIndex = null;
  let nativeIndex = null;

  let lastTimestamp = performance.now();
  let localTSL = 0;
  let capElapsed = 0;
  let capLastTimestamp = 0;
  let capPrewarm = 0;            // frames before FPS capping kicks in
  let refreshScale = 1;
  let savedRefreshRate = 60;

  // Refresh-rate sampling state. `null` once locked in.
  let refreshRateSamples = [];
  let hasFirstSample = false;

  let rAF = requestAnimationFrame;

  let screenHash = getScreenHash();

  function render(tsl) {
    // Bail early if rAF fires more than once per frame (paranoia).
    if (lastTimestamp >= tsl) {
      if (!THREAD && !self.isPaused) rAF(render);
      return;
    }

    // ─── Native lane (high-priority, decoupled from FPS cap) ──────────────
    if (nativeCallbacks.length) {
      const multiplier = 60 / savedRefreshRate;
      for (nativeIndex = nativeCallbacks.length - 1; nativeIndex > -1; nativeIndex--) {
        const callback = nativeCallbacks[nativeIndex];
        try { callback(multiplier); }
        catch (error) { handleRenderCallbackError(callback, error); }
      }
      nativeIndex = null;
    }

    // ─── FPS cap (only after a 32-frame prewarm so we have stable DT) ─────
    if (self.capFPS > 0 && ++capPrewarm > 31) {
      const delta = tsl - capLastTimestamp;
      capLastTimestamp = tsl;
      capElapsed += delta;
      if (capElapsed < 1000 / self.capFPS) {
        if (!THREAD && !self.isPaused) rAF(render);
        return;
      }
      self.REFRESH_RATE = self.capFPS;
      self.HZ_MULTIPLIER = (60 / self.REFRESH_RATE) * refreshScale;
      capElapsed = 0;
    }

    // ─── Compute time scale (product of all multipliers) ──────────────────
    self.timeScaleUniform.value = 1;
    for (let i = 0; i < timeMultipliers.length; i++) {
      self.timeScaleUniform.value *= timeMultipliers[i].value;
    }

    // ─── DT / DELTA ───────────────────────────────────────────────────────
    self.DT = tsl - lastTimestamp;
    lastTimestamp = tsl;
    let delta = self.DT * self.timeScaleUniform.value;
    delta = Math.min(200, delta); // clamp to 200ms so a hidden tab doesn't explode

    // ─── Refresh-rate sampling ────────────────────────────────────────────
    if (refreshRateSamples && !self.capFPS) {
      const instantFps = 1000 / self.DT;
      refreshRateSamples.push(instantFps);
      if (refreshRateSamples.length > 30) {
        refreshRateSamples.sort((a, b) => a - b);
        let median = refreshRateSamples[Math.round(refreshRateSamples.length / 2)];
        // Snap to the closest standard refresh rate.
        median = self.REFRESH_TABLE.reduce((prev, curr) =>
          Math.abs(curr - median) < Math.abs(prev - median) ? curr : prev,
        );
        // First lock-in takes the higher of prior and sampled (avoid downgrade).
        self.REFRESH_RATE = savedRefreshRate = hasFirstSample
          ? Math.max(self.REFRESH_RATE, median)
          : median;
        self.HZ_MULTIPLIER = (60 / self.REFRESH_RATE) * refreshScale;
        refreshRateSamples = null;
        hasFirstSample = true;
      }
    }

    // ─── Main render lane ─────────────────────────────────────────────────
    self.TIME = tsl;
    self.DELTA = delta;
    if (self.startFrame) self.startFrame(tsl, delta);
    localTSL += delta;

    for (renderIndex = renderCallbacks.length - 1; renderIndex >= 0; renderIndex--) {
      const callback = renderCallbacks[renderIndex];
      if (!callback) {
        // Slot was nulled out by `stop()`; remove now.
        renderCallbacks.splice(renderIndex, 1);
        continue;
      }
      try {
        if (callback.fps) {
          // Per-callback FPS cap.
          if (tsl - callback.last < 1000 / callback.fps) continue;
          callback(++callback.frame);
          callback.last = tsl;
        } else {
          callback(tsl, delta);
        }
      } catch (error) {
        handleRenderCallbackError(callback, error);
      }
    }
    renderIndex = null;

    // ─── Tail-of-frame callbacks ──────────────────────────────────────────
    for (let i = drawFrameCallbacks.length - 1; i > -1; i--) {
      drawFrameCallbacks[i](tsl, delta);
    }
    if (self.drawFrame) self.drawFrame(tsl, delta);
    if (self.endFrame) self.endFrame(tsl, delta);

    if (!THREAD && !self.isPaused) rAF(render);
  }

  function handleRenderCallbackError(callback, error) {
    // In dev, surface the error so the stack is visible.
    if (Hydra.LOCAL) throw error;
    // In production, give listeners a chance to inspect and decide whether
    // to keep this callback alive; default is to remove it from the loop.
    const event = { callback, error, preventStopRender: false };
    Events.emitter._fireEvent(self.RENDER_CALLBACK_ERROR, event);
    if (!event.preventStopRender) self.stop(callback);
  }

  function getScreenHash() {
    if (typeof window === 'undefined' || !window.screen) return 'none';
    return `${window.screen.width}x${window.screen.height}.${window.screen.pixelDepth}`;
  }

  /** If the window moved to a different monitor, reset refresh sampling. */
  function checkScreenMove() {
    const newHash = getScreenHash();
    if (screenHash === newHash) return;
    screenHash = newHash;
    refreshRateSamples = null;
    hasFirstSample = false;
  }

  // ─── Public state ───────────────────────────────────────────────────────
  this.timeScaleUniform = { value: 1, type: 'f', ignoreUIL: true };
  this.REFRESH_TABLE = [30, 60, 72, 90, 100, 120, 144, 240];
  this.REFRESH_RATE = 60;
  this.HZ_MULTIPLIER = 1;
  this.RENDER_CALLBACK_ERROR = 'render_callback_error';
  this.capFPS = null;

  // Worker threads don't get a rAF — `tick()` is called externally.
  if (!THREAD) {
    rAF(render);
    // Periodically reset sampling — catches rate changes from external causes.
    setInterval(() => { refreshRateSamples = []; }, 3000);
    setInterval(checkScreenMove, 5000);
  }

  // ─── Public API ─────────────────────────────────────────────────────────

  /** Time since module init, scaled by timeScale. */
  this.now = function () { return localTSL; };

  /** Multiply the global refresh-rate scale (1 = normal). */
  this.setRefreshScale = function (scale) {
    refreshScale = scale;
    refreshRateSamples = [];
  };

  /**
   * Register a per-frame callback.
   *   fps     — optional per-callback FPS cap.
   *   native  — register in the native (low-overhead) lane instead.
   */
  this.start = function (callback, fps, native) {
    if (fps) {
      callback.fps = fps;
      callback.last = -Infinity;
      callback.frame = -1;
    }
    if (native) {
      if (~nativeCallbacks.indexOf(callback)) return;
      nativeCallbacks.unshift(callback);
      if (nativeIndex !== null) nativeIndex += 1; // shift cursor to compensate
    } else {
      if (~renderCallbacks.indexOf(callback)) return;
      renderCallbacks.unshift(callback);
      if (renderIndex !== null) renderIndex += 1;
    }
  };

  /** Unregister a previously-started callback from either lane. */
  this.stop = function (callback) {
    let i = renderCallbacks.indexOf(callback);
    if (i >= 0) {
      renderCallbacks.splice(i, 1);
      if (renderIndex !== null && i < renderIndex) renderIndex -= 1;
    }
    i = nativeCallbacks.indexOf(callback);
    if (i >= 0) {
      nativeCallbacks.splice(i, 1);
      if (nativeIndex !== null && i < nativeIndex) nativeIndex -= 1;
    }
  };

  /** Worker-thread entry — main thread uses rAF directly. */
  this.tick = function () {
    if (THREAD) {
      this.TIME = performance.now();
      render(this.TIME);
    }
  };

  /** Synchronously run one frame at a given timestamp (used by tests). */
  this.forceRender = function (time) {
    this.TIME = time;
    render(this.TIME);
  };

  /**
   * Render.Worker(callback, budget=4ms)
   *
   *   Per-frame callback that runs `callback` repeatedly until `budget` ms
   *   are spent. A primitive cooperative-scheduling helper for streaming
   *   asset processing without blocking the frame budget.
   */
  this.Worker = function (callback, budget = 4) {
    Inherit(this, Component);
    const scope = this;
    let consumed = 0;

    function loop() {
      if (scope.dead) return;
      while (consumed < budget) {
        if (scope.dead || scope.paused) return;
        const start = performance.now();
        if (callback) callback();
        consumed += performance.now() - start;
      }
      consumed = 0;
    }

    this.startRender(loop);

    this.stop = function () { this.dead = true; this.stopRender(loop); };
    this.pause = function () { this.paused = true; this.stopRender(loop); };
    this.resume = function () { this.paused = false; this.startRender(loop); };
    this.setCallback = function (cb) { callback = cb; };
  };

  this.pause = function () { self.isPaused = true; };

  this.resume = function () {
    if (!self.isPaused) return;
    self.isPaused = false;
    rAF(render);
  };

  /** Swap out the rAF implementation (used by XR sessions). */
  this.useRAF = function (raf) {
    hasFirstSample = null;
    lastTimestamp = performance.now();
    rAF = raf;
    rAF(render);
  };

  this.onDrawFrame = function (cb) { drawFrameCallbacks.push(cb); };

  this.setTimeScale = function (v) { self.timeScaleUniform.value = v; };
  this.getTimeScale = function () { return self.timeScaleUniform.value; };

  /** Get a stackable time-scale slot (e.g. for slow-mo on top of a base scale). */
  this.createTimeMultiplier = function () {
    const slot = { value: 1 };
    timeMultipliers.push(slot);
    return slot;
  };
  this.destroyTimeMultiplier = function (slot) { timeMultipliers.remove(slot); };

  this.tweenTimeScale = function (value, time, ease, delay) {
    return tween(self.timeScaleUniform, { value }, time, ease, delay, null, null, true);
  };

  /**
   * Live multiplier derived from instantaneous frame DT (1 == 60fps). Used
   * by `Math.framerateNormalizeLerpAlpha` so lerps feel consistent at any
   * refresh rate.
   */
  Object.defineProperty(self, 'FRAME_HZ_MULTIPLIER', {
    get: () => (60 / (1000 / self.DELTA)) * refreshScale,
    enumerable: true,
  });
}, 'Static');

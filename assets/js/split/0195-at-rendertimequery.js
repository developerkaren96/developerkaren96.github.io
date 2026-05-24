/*
 * RenderTimeQuery — wraps an `EXT_disjoint_timer_query` query object
 * around a single shader's draw call to measure its GPU time.
 *
 * Lifecycle on the GL extension:
 *   1. `beginTest()` — `_gl.createQuery()`, then `_gl.beginQuery(
 *      TIME_ELAPSED_EXT, q)`. Subsequent draws are timed by the GPU.
 *   2. `endTest()` — `_gl.endQuery(TIME_ELAPSED_EXT)` to close the
 *      timing region. The result is *not* immediately available —
 *      GPU pipelines mean the value is read later.
 *   3. `checkQueryResults()` — polls `QUERY_RESULT_AVAILABLE` and
 *      `GPU_DISJOINT_EXT`. When available and the GPU wasn't
 *      "disjoint" (a state where the timing isn't reliable), the
 *      result (nanoseconds) is converted to milliseconds and stashed
 *      on `shader.renderDuration`; the supplied callback fires so a
 *      consumer like RenderMonitor can aggregate it.
 *   4. `deleteQueries()` — frees the GL query object.
 *
 * Force-end:
 *   `endTest(true)` short-circuits and abandons the in-flight query
 *   (e.g. when the shader is being destroyed mid-frame).
 *
 * Spector integration:
 *   The Spector debugger (if loaded) gets log entries marking the
 *   start and end of each timing region so the GPU times line up
 *   with its frame capture.
 *
 * Logs an error to the console if the extension isn't available on
 * the current GL context (older mobile GPUs, restricted browsers).
 */
Class(function RenderTimeQuery(_gl, shader, resultavailableCB = () => {}) {
  Inherit(this, Component);
  const self = this;
  self.durationQuery = null;
  self.testInProgress = false;
  self.resultsAvailable = false;
  self.queryEnded = true;
  self.timeElapsed = 0;
  self.prevTimeElapsed = 0;
  self.inactive = false;
  self.inactivityAttempts = 100;
  const ext = Renderer.extensions.disjointTimerQuery;

  function endDurationQuery() {
    if (self.queryEnded) return;
    self.queryEnded = true;
    _gl.endQuery(ext.TIME_ELAPSED_EXT);
  }

  function checkQueryResults() {
    const available = _gl.getQueryParameter(self.durationQuery, _gl.QUERY_RESULT_AVAILABLE);
    const disjoint = _gl.getParameter(ext.GPU_DISJOINT_EXT);
    self.prevTimeElapsed = self.timeElapsed;
    if (available && !disjoint) {
      const elapsedTime = _gl.getQueryParameter(self.durationQuery, _gl.QUERY_RESULT);
      // ns → ms.
      self.timeElapsed = Math.round(elapsedTime / 1e6, 2);
      shader.renderDuration = self.timeElapsed;
      self.resultsAvailable = true;
    }
    if (available || disjoint) {
      deleteQueries();
      resultavailableCB(self);
    }
  }

  function deleteQueries() {
    _gl.deleteQuery(self.durationQuery);
    self.durationQuery = null;
  }

  (async function () {
    await Hydra.ready();
    if (!ext) {
      console.error('extension not available');
      return;
    }
    self.queryObject = shader;
    self.id = shader.mesh?.id || shader.parent?.__id;
    shader.renderTimeQuery = self;
  })();

  this.beginTest = function () {
    if (typeof spector !== 'undefined' && spector) {
      const v = Object.values(RenderMonitor.results).find((i) => i.obj === shader);
      const name = v?.obj?.__renderstatsname;
      spector.log(`RenderMonitor:START = ${name}`);
    }
    if (!self.queryObject || self.testInProgress) return;
    self.testInProgress = true;
    self.queryEnded = false;
    self.resultsAvailable = false;
    self.resultsReady = Promise.create();
    _gl.getParameter(ext.GPU_DISJOINT_EXT);
    if (!self.durationQuery) {
      self.durationQuery = _gl.createQuery();
      _gl.beginQuery(ext.TIME_ELAPSED_EXT, self.durationQuery);
    }
  };

  this.endTest = function (force = false) {
    if (typeof spector !== 'undefined' && spector) {
      const v = Object.values(RenderMonitor.results).find((i) => i.obj === shader);
      const name = v?.obj?.__renderstatsname;
      const duration = v?.duration / v?.resultCount;
      spector.log(`RenderMonitor:END = ${name}; duration = ${duration}ms`);
    }
    if (force) {
      self.testInProgress = false;
      endDurationQuery();
      deleteQueries();
      _gl.getParameter(ext.GPU_DISJOINT_EXT);
      return;
    }
    if (self.durationQuery && self.testInProgress) {
      endDurationQuery();
      checkQueryResults();
    }
  };

  this.deleteQueries = deleteQueries;
});

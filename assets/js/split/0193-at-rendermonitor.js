/*
 * RenderMonitor — heavyweight per-pass GPU-time HUD that uses the
 * `EXT_disjoint_timer_query` extension to measure how long each
 * render-pass takes on the GPU, then displays results in a sortable
 * on-screen list.
 *
 * Activation: `?renderMonitor` or `?rendermonitor`.
 *
 * Per-frame loop:
 *   - When a shader is rendered with a `renderTimeQuery` attached
 *     (see RenderTimeQuery, 0195), the GPU duration becomes available
 *     a few frames later, fires `updateResults`, which aggregates by
 *     `id + fsName` into `_results`. Aggregation sums the duration
 *     and bumps `resultCount` so the displayed value is the average
 *     duration per pass invocation in that one-second window.
 *   - Every `FRAME_INTERVAL` (= REFRESH_RATE) frames, the panel is
 *     wiped and rebuilt, sorted descending by total duration.
 *   - The total-frame badge sums per-pass averages.
 *
 * HUD controls:
 *   - `pause` / `resume` toggle: freezes the displayed snapshot but
 *     keeps collecting in the background.
 *   - `capture results`: marks the next frame's results to also be
 *     emitted to the JS console for later analysis. While paused,
 *     dumps the previous snapshot immediately.
 *   - Click any per-pass row to console.log the mesh + duration.
 *
 * `BlitPass` is annotated with "(MSAA?)" because it's commonly the
 * MSAA resolve cost.
 *
 * Spector integration: if a Spector debugger session is attached, the
 * begin/end of each query is also logged into the Spector capture so
 * the GPU timings appear in the Spector frame trace.
 *
 * `createQuery(gl, obj)` is the factory consumed by the renderer to
 * attach a query to a Shader/RenderTarget pair.
 */
Class(function RenderMonitor() {
  Inherit(this, Component);
  const self = this;
  let $container,
    $frameDuration,
    $buttonContainer,
    $queryStats,
    $activeToggle,
    $logButton,
    _paused = false,
    $queries = [],
    _frameDuration = 0,
    _queries = [],
    _results = {},
    _ticker = 0,
    _prevResults = {},
    _capturingResult = false;
  const FRAME_INTERVAL = Render.REFRESH_RATE || 60;
  function getToggleLabel() {
    return _paused ? 'resume' : 'pause';
  }
  function getQueryName(q) {
    return q?.obj?.mesh?.uilName
      ? q?.obj?.fsName + ' - ' + q?.obj?.mesh?.uilName || 'fs name missing'
      : q?.obj?.fsName || 'fs name missing';
  }
  function createQueryResult(q) {
    const queryEl = $queryStats.create('query-result');
    queryEl.css({
      position: 'relative',
      width: '100%',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'ceter',
    });
    let name = getQueryName(q);
    'BlitPass' === name && (name = 'BlitPass (MSAA?)');
    q.obj.__renderstatsname = name;
    queryEl.name = queryEl.create('shader-name').text(name);
    queryEl.name.css({
      position: 'relative',
      color: '#ffffff',
      fontSize: '14px',
      opacity: 0.85,
    });
    queryEl.duration = queryEl.create('render-duration');
    queryEl.duration.text(`${Math.round(q?.duration / q?.resultCount, 2).toFixed(2)} ms`);
    queryEl.duration.css({
      position: 'relative',
      color: '#ffffff',
      fontSize: '14px',
      fontVariant: 'tabular-nums',
    });
    queryEl.duration = q?.duration;
    queryEl.queryRef = q?.obj;
    queryEl.interact(
      (e) => {
        queryEl.name.css({
          opacity: 'over' === e.action ? 1 : 0.85,
        });
      },
      (_) => logResult(name, q),
    );
    _capturingResult && logResult(name, q);
    $queries.push(queryEl);
  }
  function captureResults() {
    if (_paused)
      for (let key in _prevResults) {
        const q = _prevResults[key];
        logResult(getQueryName(q), q);
      }
    _capturingResult = true;
  }
  function logResult(name, q) {
    console.group(name);
    console.log(q.obj.mesh || q.obj);
    console.log(`render duration: ${Math.round(q?.duration / q?.resultCount, 2)}`);
    console.groupEnd();
  }
  function updateResults(query) {
    const key = '' + (query.id + ' ' + query.queryObject.fsName);
    _results.hasOwnProperty(key)
      ? ((_results[key].duration += query.timeElapsed), _results[key].resultCount++)
      : (_results[key] = {
          obj: query.queryObject,
          duration: query.timeElapsed,
          resultCount: 1,
        });
    query.queryObject.renderTimeQuery = null;
    query.destroy();
  }
  function updateStats() {
    self.active &&
      (_paused ||
        (_ticker % FRAME_INTERVAL == 0 &&
          (function displayResults() {
            $queries.forEach(($q) => $q.destroy());
            $queries.length = 0;
            for (let key in _results) _results[key].duration;
            const resultsAsArray = Object.entries(_results);
            resultsAsArray.sort((a, b) => b[1].duration - a[1].duration);
            _results = Object.fromEntries(resultsAsArray);
            for (let key in _results) {
              _frameDuration += _results[key].duration / _results[key].resultCount;
              createQueryResult(_results[key]);
            }
            $frameDuration?.duration.text(`${Math.round(_frameDuration, 2).toFixed(2)} ms`);
            _frameDuration = 0;
            _capturingResult = false;
            _prevResults = Object.assign({}, _results);
            _results = {};
            _queries = [];
          })(),
        _ticker++));
  }
  !(async function () {
    await Hydra.ready();
    self.active = Utils.query('renderMonitor') || Utils.query('rendermonitor');
    self.active &&
      (function initUIL() {
        $container = Stage.create('RenderMonitor');
        const w = Device.mobile ? 375 : 500;
        $container
          .css({
            position: 'fixed',
            width: `${w}px`,
            height: 'auto',
            maxHeight: '300px',
            minHeight: 'min-content',
            padding: 15,
            bottom: 0,
            left: 0,
            whiteSpace: 'no-wrap',
            fontFamily: 'Arial',
          })
          .bg('#111')
          .setZ(99999);
        $buttonContainer = $container.create('render-monitor-button-container');
        $buttonContainer.css({
          position: 'relative',
          width: 'min-content',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        });
        $activeToggle = $buttonContainer.create('render-monitor-active-toggle', 'button');
        $activeToggle.text(getToggleLabel());
        $activeToggle.css({
          position: 'relative',
          marginBottom: '15px',
          marginRight: '5px',
          cursor: 'pointer',
        });
        $activeToggle.div.onclick = () => {
          _paused = !_paused;
          $activeToggle.text(getToggleLabel());
        };
        $logButton = $buttonContainer.create('render-monitor-log', 'button');
        $logButton.text('capture results');
        $logButton.css({
          position: 'relative',
          width: 'max-content',
          marginBottom: '15px',
          whiteSpace: 'no-wrap',
          cursor: 'pointer',
        });
        $logButton.div.onclick = () => {
          captureResults();
        };
        $frameDuration = $container.create('frame-duration');
        $frameDuration.css({
          position: 'relative',
          width: '100%',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
        });
        $frameDuration.label = $frameDuration.create('frame-duration-label').text('Total frame');
        $frameDuration.label.css({
          position: 'relative',
          color: '#ffffff',
          fontSize: '14px',
          paddingRight: '14px',
        });
        $frameDuration.duration = $frameDuration
          .create('frame-duration-label')
          .text(_frameDuration);
        $frameDuration.duration.css({
          position: 'relative',
          color: '#ffffff',
          fontSize: '14px',
        });
        $queryStats = $container.create('query-stats');
        $queryStats.css({
          position: 'relative',
          maxHeight: '200px',
          overflowY: 'scroll',
          paddingBottom: '20px',
        });
      })();
    self.active && (Render.endFrame = updateStats);
  })();
  this.get('results', (_) => _results);
  this.get('queries', (_) => _queries);
  this.get('frameDuration', (_) => _frameDuration);
  this.captureResults = captureResults;
  this.createQuery = function createQuery(gl, obj) {
    return new RenderTimeQuery(gl, obj, updateResults);
  };
  this.updateResults = updateResults;
}, 'static');

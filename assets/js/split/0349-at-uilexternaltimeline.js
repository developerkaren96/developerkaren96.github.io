/*
 * UILExternalTimeline — pops out a separate browser window
 * (`localhost/hydra/editor/timeline/index.html`) hosting the
 * full Theatre.js timeline editor for a TweenUIL tween (0341).
 *
 * Bidirectional channel via postMessage on the popup window:
 *   - From popup → host (this class's `message` listener):
 *       - `e.data.bundle`        → `onMessage(bundle)` (state sync).
 *       - `e.data.save`          → `onSave()` + write
 *         `timeline-${title}.json?compress` under either
 *         `UIL_STATIC_PATH`'s directory or `assets/data` via
 *         `Dev.writeFile`. The `?compress` suffix tells the
 *         writer to deflate before flushing.
 *       - `e.data.visualizePath` → `onVisualizePath(path)`
 *         (path-visualisation overlay request).
 *       - `e.data.position`      → `onPositionChange(position)`
 *         (live scrub of the play head).
 *   - From host → popup: `sendUpdate(layerName, value, key)`
 *     forwards a live edit from the main editor (e.g. tweaking
 *     a property via the inline sidebar should reflect into the
 *     timeline view).
 *
 * Lifecycle:
 *   - Closes the popup on `Events.UNLOAD`.
 *   - Polls `_window.closed` at ~10Hz; once true, `self.destroy()`
 *     so the corresponding TweenUIL editor model gets torn down.
 *
 * `saved(code)` mirrors UILExternalEditor's save semantics —
 * invokes `onSave` and flushes UILStorage on the next microtask.
 */
Class(function UILExternalTimeline(_title, _height = 500, _width = 700, _config) {
  Inherit(this, Component);
  const self = this;
  var _window;
  _window = window.open(
    location.protocol + '//localhost/hydra/editor/timeline/index.html',
    '_blank',
    `width=${_width},height=${_height},left=200,top=100`,
  );
  self.events.sub(Events.UNLOAD, (_) => _window.close());
  _window.window.onload = (_) => {
    _window.window.initEditor(_title, _config);
  };
  _window.window.addEventListener('message', (e) => {
    if ((e.data.bundle && self.onMessage && self.onMessage(e.data.bundle), e.data.save)) {
      let path;
      self.onSave && self.onSave();
      window.UIL_STATIC_PATH
        ? ((path = window.UIL_STATIC_PATH), (path = path.substring(0, path.lastIndexOf('/'))))
        : (path = 'assets/data');
      Dev.writeFile(`${path}/timeline-${_title}.json?compress`, e.data.save);
    }
    e.data.visualizePath && self.onVisualizePath?.(e.data.visualizePath);
    undefined !== e.data.position &&
      self.onPositionChange &&
      self.onPositionChange(e.data.position);
  });
  self.startRender((_) => {
    _window.closed && self.destroy();
  }, 10);
  this.saved = async function (code) {
    self.onSave && self.onSave(code);
    await defer();
    UILStorage.write();
  };
  this.sendUpdate = function (layerName, value, key) {
    _window.window.sendUpdate(layerName, value, key);
  };
});

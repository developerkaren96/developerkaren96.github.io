/*
 * RenderCount — dev overlay panel that tracks named integer counters
 * for engine objects (textures, geometries, render-targets, etc.).
 *
 * Activation:
 *   - `?uil` or `?renderCount` query enables collection.
 *   - `?renderCount` alone (with no `?uil`) also creates a small
 *     scrollable HUD on screen so the counts are visible.
 *   - `?log` (when active) makes every `add()` also `console.trace()`
 *     the call site — useful for "who's creating all these
 *     textures?" investigations.
 *
 * The store is just `_map[name] = integer`. `add(name, detail, amt)`
 * bumps the counter and re-renders the on-screen line; `remove`
 * decrements. `detail` is an optional object that gets logged with
 * the trace when `?log` is set.
 *
 * Marked `'static'` so a single instance owns the page-wide store.
 * `this.map` exposes the underlying object for external consumers.
 */
Class(function RenderCount() {
  const self = this;
  let $container;
  let LOG;
  const _map = {};
  const _display = {};
  this.map = _map;

  (async function () {
    await Hydra.ready();
    self.active = Utils.query('uil') || Utils.query('renderCount');
    LOG = self.active && Utils.query('log');
    if (Utils.query('renderCount')) {
      await Hydra.ready();
      $container = Stage.create('RenderCount');
      $container
        .css({
          width: 175,
          height: 'auto',
          paddingBottom: 5,
          bottom: 0,
          maxHeight: 400,
          overflowY: 'scroll',
          position: 'absolute',
        })
        .bg('#111')
        .setZ(9999999);
    }
  })();

  this.add = function (name, detail, amt = 1) {
    if (!self.active) return;
    if (_map[name] === undefined) {
      _map[name] = 0;
      if ($container) {
        const $wrapper = $container.create('wrapper');
        $wrapper.css({ position: 'relative', width: '100%', height: 20 });
        $wrapper.label = $wrapper.create('label');
        $wrapper.label.fontStyle('Arial', 12, '#fff').text(name).css({ left: 10, position: 'absolute' });
        $wrapper.value = $wrapper.create('value');
        $wrapper.value.fontStyle('Arial', 12, '#fff').text(0).css({ right: 10, position: 'absolute' });
        _display[name] = $wrapper;
      }
    }
    if (LOG) {
      console.groupCollapsed(name);
      if (detail) console.log(detail);
      console.trace();
      console.groupEnd();
    }
    _map[name] += amt;
    _display[name]?.value?.text?.(_map[name] || '0');
  };

  this.remove = function (name, amt = 1) {
    if (!self.active || !_map[name]) return;
    _map[name] -= amt;
    _display[name]?.value?.text?.(_map[name] || '0');
  };
}, 'static');

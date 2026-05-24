/*
 * RenderStats — second dev HUD, complementary to RenderCount: tracks
 * per-frame *event counts* (draw calls, shader uploads, texture
 * binds, etc.) that get reset every frame on `Render.drawFrame`,
 * rather than the persistent counters that RenderCount maintains.
 *
 * Activation:
 *   - `?renderStats` enables both collection and the on-screen HUD.
 *   - When `?uil` is also set, the HUD anchors at bottom-left and
 *     offsets right by 150px if RenderCount's HUD is also visible.
 *
 * Always-on FPS counter:
 *   `Render.start(...)` callback counts frames per second and pushes
 *   the value through `self.update('FPS', fps)` so FPS appears in the
 *   same panel.
 *
 * `update(name, amt, detail, detail2)`:
 *   - Adds `amt` to the running counter for this frame.
 *   - Auto-creates the on-screen row on first sight of `name`.
 *   - If `trace(name)` has been called previously, every matching
 *     `update` also `console.trace()`s with the optional details —
 *     useful for "what's causing 600 draw calls this frame?"
 *     drill-down. `filter` narrows the trace by constructor name.
 *
 * Marked `'static'` and gated on `Hydra.LOCAL` so the trace machinery
 * doesn't run in production.
 */
Class(function RenderStats() {
  const self = this;
  let _trace;
  let _filter;
  let $container;
  const _map = {};
  const _display = {};

  function flush() {
    for (const key in _map) {
      self.stats[key] = _map[key];
      if (_display[key]) _display[key].value.text(_map[key] || '0');
      _map[key] = 0;
    }
    _trace = null;
  }

  self.stats = {};

  (async function () {
    await Hydra.ready();
    self.active = Utils.query('renderStats');
    if (Utils.query('renderStats')) {
      await Hydra.ready();
      $container = Stage.create('RenderStats');
      $container
        .css({ position: 'fixed', width: 150, height: 'auto', paddingTop: 5 })
        .bg('#111')
        .setZ(99999);
      if (Utils.query('uil')) {
        const left = RenderCount.active ? 150 : 0;
        $container.css({ bottom: 0, left: left });
      }
    }
    Render.drawFrame = flush;

    let frames = 0;
    let prevTime = 0;
    let fps = Render.REFRESH_RATE;
    Render.start(() => {
      frames += 1;
      if (Render.TIME >= prevTime + 1e3) {
        fps = (1e3 * frames) / (Render.TIME - prevTime);
        fps = Math.round(fps, fps >= 1 ? 0 : 2);
        prevTime = Render.TIME;
        frames = 0;
      }
      self.update('FPS', fps);
    });
  })();

  this.update = function (name, amt = 1, detail, detail2) {
    if (!Hydra.LOCAL) return;
    if (_trace == name) {
      if (_filter && detail) {
        const detailStr = typeof detail === 'string' ? detail : Utils.getConstructorName(detail);
        if (!detailStr.toLowerCase().includes(_filter.toLowerCase())) return;
      }
      console.groupCollapsed(name);
      if (detail) console.log(typeof detail === 'string' ? detail : Utils.getConstructorName(detail));
      if (detail2) console.log(detail2);
      console.trace();
      console.groupEnd();
    }
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
    _map[name] += amt;
  };

  this.trace = function (name, filter = null) {
    _trace = name;
    _filter = filter;
  };

  this.log = function () {
    for (const key in self.stats) console.log(key, self.stats[key]);
    console.log('----');
  };
}, 'static');

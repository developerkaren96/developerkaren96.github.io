/*
 * RenderTimer — simple `performance.now()` wall-clock timer with an
 * on-screen HUD. Independent of the GPU timer-query plumbing
 * (RenderTimeQuery) — this measures *CPU* durations.
 *
 * Activation: `?renderTimer`.
 *
 * Usage:
 *   RenderTimer.start('parseGLTF');
 *   …
 *   RenderTimer.stop('parseGLTF');
 *
 * Each `stop(name)` re-renders the HUD line for that name with the
 * latest elapsed time in milliseconds (3 decimal places). Repeated
 * `start`/`stop` cycles overwrite the previous reading.
 *
 * Marked `'static'` — single panel, single timers dictionary per
 * page.
 */
Class(function RenderTimer() {
  const self = this;
  let $container;
  const _display = {};
  const _times = {};

  (async function () {
    await Hydra.ready();
    self.active = Utils.query('renderTimer');
    if (!self.active) return;
    $container = Stage.create('RenderTimer');
    $container
      .css({
        position: 'absolute',
        width: 150,
        height: 'auto',
        paddingBottom: 5,
        bottom: 0,
        right: 0,
      })
      .bg('#111')
      .setZ(9999999);
  })();

  this.start = function (name) {
    _times[name] = performance.now();
  };

  this.stop = function (name) {
    if (!_display[name] && $container) {
      const $wrapper = $container.create('wrapper');
      $wrapper.css({ position: 'relative', width: '100%', height: 20 });
      $wrapper.label = $wrapper.create('label');
      $wrapper.label.fontStyle('Arial', 12, '#fff').text(name).css({ left: 10 });
      $wrapper.value = $wrapper.create('value');
      $wrapper.value.fontStyle('Arial', 12, '#fff').text(0).css({ right: 10 });
      _display[name] = $wrapper;
    }
    if (_display[name]) {
      _display[name].value.text((performance.now() - _times[name]).toFixed(3) || '0');
    }
  };
}, 'static');

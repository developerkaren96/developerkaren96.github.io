/*
 * PerformanceAnalyzer — dev-only watchdog that flags the page when
 * the renderer can't sustain its target framerate.
 *
 * After a 10-second warmup (to avoid penalising slow first-paint and
 * initial asset uploads), starts a per-frame loop comparing
 * `Render.DELTA` (real frame time, ms) against the target
 * `1000 / Render.REFRESH_RATE`. If the delta exceeds the target by
 * more than 2 ms for two consecutive seconds' worth of frames
 * (`2 * REFRESH_RATE` frames), it reports to `Dev.postPerfLog`.
 *
 * Only active when `Hydra.LOCAL` is truthy — i.e. in the local dev
 * harness, never in shipped builds. Marked `'static'` so a single
 * page-level instance watches the whole app.
 */
Class(function PerformanceAnalyzer() {
  Inherit(this, Component);
  const self = this;
  let _lowFrame = 0;

  function startRender() {
    self.startRender(loop);
  }

  function loop() {
    const targetDelta = 1e3 / Render.REFRESH_RATE;
    const realDelta = Render.DELTA;
    if (Math.abs(targetDelta - realDelta) > 2 && ++_lowFrame > 2 * Render.REFRESH_RATE) {
      self.stopRender(loop);
      Dev.postPerfLog({ message: 'Unable to meet target framerate' });
    }
  }

  if (Hydra.LOCAL) {
    self.delayedCall(startRender, 1e4);
  }
}, 'static');

/*
 * SnapshotFramePingPong — companion to SnapshotFrame (0309).
 * Wraps an existing FXScene and ping-pongs two RTs so the scene
 * never reads from the same texture it's writing to.
 *
 * Mechanics:
 *   - On bootstrap, `self.rt = _fxScene.rt`, and a clone of that RT
 *     is held in `_rtClone`. The two RTs share dimensions but each
 *     own their own GPU memory.
 *   - Every frame, `loop()` swaps them: `[_rtClone, self.rt] =
 *     [self.rt, _rtClone]`, then `_fxScene.useRT(self.rt)` redirects
 *     the wrapped scene's next render into the freshly-swapped
 *     target. The previous frame's result is now `_rtClone`, which
 *     downstream consumers can sample without aliasing the live
 *     write target.
 *   - The size guard `setSize(rt.width, rt.height)` keeps the clone
 *     in lockstep with the source RT if it ever resizes (e.g. on
 *     viewport / DPR changes).
 *
 * Lazy-init: `self.rt` and `_rtClone` are also seeded inside the
 * loop in case `_fxScene.rt` isn't ready at construction time —
 * the loop becomes a no-op until both exist.
 */
Class(function SnapshotFramePingPong(_fxScene) {
  Inherit(this, Component);
  const self = this;
  let _rtClone;
  function loop() {
    self.rt || (self.rt = _fxScene.rt);
    self.rt && !_rtClone && (_rtClone = self.rt.clone());
    self.rt &&
      _rtClone &&
      ((self.rt.width === _rtClone.width && self.rt.height === _rtClone.height) ||
        _rtClone.setSize(self.rt.width, self.rt.height),
      ([_rtClone, self.rt] = [self.rt, _rtClone]),
      _fxScene.useRT(self.rt));
  }
  self.rt = _fxScene.rt;
  self.rt && (_rtClone = self.rt.clone());
  self.startRender(loop, _fxScene.nuke);
});

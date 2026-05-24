/*
 * HierarchyLayout — thin wrapper that uses HierarchyAnimation
 * (0247) in "layout mode" (`_isLayout = true`). The intent is to
 * use a single-frame or static keyframe set as a pose definition:
 * default transforms are skipped (only authored channels are
 * written), and `loop = true` keeps the pose live without ever
 * actually advancing time.
 *
 * The IIFE constructs the inner `HierarchyAnimation`, copies its
 * `group` onto `self` so this component is interchangeable with the
 * animation in scene graphs, waits for `ready()` (JSON + object
 * creation), and then calls `update()` once to apply the pose.
 *
 * `set('scale', s)` proxies into the inner animation's scale (which
 * multiplies position arrays at update time — used to rescale
 * exported layouts without re-exporting the geometry).
 */
Class(function HierarchyLayout(_data, createObjects) {
  Inherit(this, Component);
  const self = this;
  var _animation;
  !(async function () {
    _animation = new HierarchyAnimation(_data, createObjects, true);
    self.group = _animation.group;
    _animation.loop = true;
    await _animation.ready();
    _animation.update();
  })();
  this.ready = function () {
    return _animation.ready();
  };
  this.set('scale', (s) => (_animation.scale = s));
});

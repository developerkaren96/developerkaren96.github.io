/*
 * RTPool — singleton pool of render-targets of a single shape.
 *
 * Many effects (blur, bloom, copy-to-this-frame, etc.) need a
 * transient screen-sized RT for a single frame. Allocating and
 * destroying RTs every frame is slow; reusing them is fast but
 * requires bookkeeping. RTPool is that bookkeeping:
 *
 *   - `_pool` (ObjectPool) holds the available RTs.
 *   - `_array` keeps a ref to *all* RTs ever created so resize
 *     events can fan out the new size to every one.
 *   - `_indexed` is a side-channel for callers that need a stable RT
 *     keyed by a numeric `index` (`getRT(index)`). These don't go
 *     through the pool — they're per-caller persistent.
 *
 * Lifecycle:
 *   - Constructor: pre-creates `_size` RTs at current screen size.
 *   - `getRT(index?)`: returns either the indexed RT for that key,
 *     a pooled RT, or a freshly-created one if the pool is empty.
 *   - `putRT(rt)`: returns the RT to the pool (clearing any per-frame
 *     `scissor`). The shared `nullRT` is never pooled — it's a
 *     literal 2×2 sink for "render nothing".
 *   - On resize, every RT (pooled or out-of-pool) is resized in step
 *     — unless `disableResize()` has been called, in which case the
 *     RTs hold their explicit `setSize(width, height)` value.
 *
 * `nullRT`: a 2×2 RT with a no-op `setSize` so it survives resize
 * fan-outs unchanged. Used by callers that need to return *some* RT
 * from a "don't render" branch.
 *
 * `clone(...)`: builds a sibling pool of the same shape (optionally
 * overriding any of the size / type / format / multisample / sample
 * count). Each `clone` is a separate singleton-bypassing instance —
 * this works because `Class('singleton')` only protects the default
 * `new RTPool()` invocation; explicit `new RTPool(type, …)` calls
 * with different arguments produce distinct instances.
 *
 * Marked `'singleton'` so the engine-wide default pool is a process-
 * wide single instance.
 */
Class(function RTPool(_type, _size = 3, _format, _multisample = false, _samplesAmount = 4) {
  Inherit(this, Component);
  const self = this;
  let _pool;
  const _indexed = {};
  const _array = [];
  let _resizeDisabled = false;

  this.nullRT = Utils3D.createRT(2, 2);
  this.nullRT.setSize = () => {};

  function createRT() {
    const rt = Utils3D.createRT(
      Stage.width * World.DPR,
      Stage.height * World.DPR,
      _type,
      _format,
      _multisample,
      _samplesAmount,
    );
    rt.index = _pool.length();
    return rt;
  }

  function resizeHandler() {
    _array.forEach((rt) => {
      rt.setSize(Stage.width * World.DPR, Stage.height * World.DPR);
    });
  }

  function addListeners() {
    if (!_resizeDisabled) self.events.sub(Events.RESIZE, resizeHandler);
  }

  (function initPool() {
    _pool = new ObjectPool();
    for (let i = 0; i < _size; i++) {
      const rt = createRT();
      _pool.put(rt);
      _array.push(rt);
    }
  })();

  defer(addListeners);

  this.get('array', () => _array);

  this.getRT = function (index) {
    if (index) {
      if (!_indexed[index]) _indexed[index] = createRT();
      return _indexed[index];
    }
    return _pool.get() || createRT();
  };

  this.putRT = function (rt) {
    if (rt.scissor) delete rt.scissor;
    if (rt !== self.nullRT) _pool.put(rt);
  };

  this.setSize = function (width, height) {
    self.disableResize();
    _array.forEach((rt) => {
      rt.setSize(width, height);
    });
  };

  this.onDestroy = function () {
    let p = _pool.get();
    while (p) {
      p.dispose();
      p = _pool.get();
    }
  };

  this.clone = function (
    type = _type,
    size = _size,
    format = _format,
    multisample = _multisample,
    samplesAmount = _samplesAmount,
  ) {
    return new RTPool(type, size, format, multisample, samplesAmount);
  };

  this.disableResize = function () {
    _resizeDisabled = true;
    self.events.unsub(Events.RESIZE, resizeHandler);
  };
}, 'singleton');

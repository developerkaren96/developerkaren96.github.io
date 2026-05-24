/*
 * AntimatterUtil — worker-pooled buffer builder for Antimatter particle
 * systems. The heavy work (building position/vertex/random Float32Arrays
 * for textures up to 1024² = ~4MB each) runs off the main thread via
 * Thread.shared() so the page doesn't hitch on particle-system init.
 *
 * Worker-side functions (uploaded via Thread.upload):
 *
 *   `createBufferArrayAntimatter({size, num, dimensions, pointData}, id)`
 *     Builds three Float32Arrays that together define a particle group:
 *
 *     `position` (N²×3) — texel UV + linear index per particle. The UV
 *        is used as the position-texture lookup; the third component is
 *        the integer particle index so shaders can address attribs by ID.
 *        NativeUtils.fillBufferUV path is the C++ fast path on platforms
 *        that ship it; falls back to a JS loop with half-texel offset.
 *
 *     `vertices` (N²×4) — initial XYZ position + 1.0 (homogeneous w).
 *        Three distribution modes:
 *          • `pointData.positions` provided → copy verbatim (mesh-bound
 *            particles, e.g. one per mesh vertex).
 *          • `grid` (all w/h ranges zero) → 2D grid via Math.range so
 *            particles tile the unit square (visualization mode).
 *          • box random (the default) → uniform random within the
 *            dimensions.w/h/d ranges.
 *
 *     `attribs` (N²×4) — per-particle random vector. Used by shaders
 *        to seed noise / variations. `pointData.random` lets callers
 *        pre-seed (deterministic replays); otherwise pure random.
 *
 *     `usedDepth = num / (size * size)` reports the fraction of the
 *     texture actually backing live particles. Used by grid mode to
 *     compress the Y range so the tail of the texture isn't blank.
 *
 *     `resolve(...)` (engine-provided in worker context) posts the
 *     payload back with a transferable list — the three ArrayBuffers
 *     move zero-copy across the boundary.
 *
 *   `createFloatArrayAntimatter({size}, id)`
 *     Allocate-only — a fresh zeroed Float32Array of the requested
 *     length. The worker is in charge so allocation hitches don't land
 *     on the main thread.
 *
 * Main-side wrappers:
 *
 *   `createBufferArray(size, num, config, pointData)`
 *     1. Lazily upload both worker functions (`initThread` runs once).
 *     2. Cache results keyed by JSON(config)/size/num so identical
 *        configurations share buffers (typical case: multiple instances
 *        of the same particle preset). `cache=false` disables sharing.
 *     3. Add `pointData.positions.buffer` to the transfer list if
 *        provided — moves the pre-computed positions zero-copy into
 *        the worker.
 *     4. On worker reply: wrap `attribs` and `vertices` as
 *        AntimatterAttribute (DataTexture wrappers), package `position`
 *        as a Geometry with both attributes attached so it can be
 *        passed to Three's Points mesh.
 *     5. Resolve the cached promise so all duplicate callers get the
 *        same data.
 *
 *   `createFloatArray(size, freshCopy)`
 *     `freshCopy=true` or cache=false always allocates fresh. Otherwise
 *     promises are shared by size — useful when many particle systems
 *     need identically-sized scratch buffers.
 */
Class(function AntimatterUtil() {
  Inherit(this, Component);
  const self = this;
  let _thread;
  const _promises = {};

  /*
   * Worker function: build position/vertices/attribs for a particle
   * group. NativeUtils is the C++ acceleration shim (when present);
   * pure-JS fallbacks below match its output exactly.
   */
  function createBufferArrayAntimatter(e, id) {
    const size = e.size;
    const num  = e.num;
    const position = new Float32Array(size * size * 3);

    // Texel UV + integer index per particle.
    if (window.NativeUtils) {
      NativeUtils.fillBufferUV(position, num, size);
    } else {
      const h = 0.5 / size;
      for (let i = 0; i < num; i++) {
        position[3 * i + 0] = h + (i % size) / size;
        position[3 * i + 1] = h + Math.floor(i / size) / size;
        position[3 * i + 2] = i;
      }
    }

    const { w, h, d } = e.dimensions;
    const usedDepth = num / (size * size);
    const grid = 0 == w[0] && 0 == w[1] && 0 == h[0] && 0 == h[1];

    // Initial positions (vertices).
    const vertices = new Float32Array(size * size * 4);
    if (window.NativeUtils) {
      if (grid) NativeUtils.fillBufferGrid(vertices, num, size, usedDepth);
      else      NativeUtils.fillBufferRange(vertices, num, w[0], w[1], h[0], h[1], d[0], d[1]);
    } else {
      for (let i = 0; i < num; i++) {
        if (null != e.pointData) {
          vertices[4 * i + 0] = e.pointData.positions[3 * i + 0];
          vertices[4 * i + 1] = e.pointData.positions[3 * i + 1];
          vertices[4 * i + 2] = e.pointData.positions[3 * i + 2];
        } else if (grid) {
          // 2D grid: x∈[-1,1] across columns, y∈[-1,1] across the
          // populated rows; tail rows beyond usedDepth are skipped.
          vertices[4 * i + 0] = Math.range(i % size, 0, size, -1, 1);
          vertices[4 * i + 1] = Math.range(i / size, size * usedDepth * usedDepth, 0, -1, 1);
        } else {
          // Box random: uniform within configured ranges.
          vertices[4 * i + 0] = Math.random(w[0], w[1], 10);
          vertices[4 * i + 1] = Math.random(h[0], h[1], 10);
          vertices[4 * i + 2] = Math.random(d[0], d[1], 10);
        }
        vertices[4 * i + 3] = 1;
      }
    }

    // Per-particle random RGBA — seeds noise & variation in shaders.
    const attribs = new Float32Array(size * size * 4);
    if (null != e.pointData && e.pointData.random) {
      for (let i = 0; i < num; i++) {
        attribs[4 * i + 0] = e.pointData.random[4 * i + 0];
        attribs[4 * i + 1] = e.pointData.random[4 * i + 1];
        attribs[4 * i + 2] = e.pointData.random[4 * i + 2];
        attribs[4 * i + 3] = e.pointData.random[4 * i + 3];
      }
    } else if (window.NativeUtils) {
      NativeUtils.fillBufferRandom(attribs, attribs.length);
    } else {
      for (let i = 0; i < num; i++) {
        attribs[4 * i + 0] = Math.random(0, 1, 10);
        attribs[4 * i + 1] = Math.random(0, 1, 10);
        attribs[4 * i + 2] = Math.random(0, 1, 10);
        attribs[4 * i + 3] = Math.random(0, 1, 10);
      }
    }

    // Reply with transferable buffers (zero-copy).
    resolve(
      { geometry: position, vertices, attribs, usedDepth },
      id,
      [position.buffer, vertices.buffer, attribs.buffer],
    );
  }

  // Worker function: zeroed Float32Array. Off-main-thread so big
  // allocations don't stall the renderer.
  function createFloatArrayAntimatter({ size }, id) {
    const array = new Float32Array(size);
    resolve({ array }, id, [array.buffer]);
  }

  this.cache = true;

  /*
   * Main-side API: request a particle-system buffer set. Caches by
   * (config, size, num) so multiple particle groups with identical
   * params share buffers.
   */
  this.createBufferArray = function (size, num, config = {}, _pointData = null) {
    if (!_thread) {
      (function initThread() {
        _thread = true;
        Thread.upload(createBufferArrayAntimatter);
        Thread.upload(createFloatArrayAntimatter);
      })();
    }

    let key;
    if (self.cache) {
      key = `buffer_${JSON.stringify(config)}_${size}_${num}`;
      if (_promises[key]) return _promises[key];
    }

    const promise = Promise.create();
    if (key) _promises[key] = promise;

    // Transfer pre-computed positions zero-copy if provided.
    const buffers = [];
    if (_pointData?.positions.buffer) buffers.push(_pointData?.positions.buffer);

    Thread.shared()
      .createBufferArrayAntimatter(
        { size, num, dimensions: config, pointData: _pointData },
        buffers,
      )
      .then((data) => {
        // Wrap raw buffers as DataTextures and a Geometry the renderer
        // can ingest directly.
        data.attribs  = new AntimatterAttribute(data.attribs,  4);
        data.vertices = new AntimatterAttribute(data.vertices, 4);

        const geometry = data.geometry;
        data.geometry = new Geometry();
        data.geometry.addAttribute('position', new GeometryAttribute(geometry, 3));
        data.geometry.addAttribute('random',   new GeometryAttribute(data.attribs.buffer, 4));

        promise.resolve(data);
      });

    return promise;
  };

  /*
   * Off-main-thread Float32Array allocation. freshCopy bypasses the
   * cache; otherwise multiple callers for the same size share a single
   * promise → single buffer.
   */
  this.createFloatArray = function (size, freshCopy) {
    if (freshCopy || !self.cache) {
      return Thread.shared().createFloatArrayAntimatter({ size });
    }
    const key = `float_size${size}`;
    if (_promises[key]) return _promises[key];
    return (_promises[key] = Thread.shared().createFloatArrayAntimatter({ size }));
  };
}, 'static');

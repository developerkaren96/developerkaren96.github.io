/*
 * MatrixWasm — WebAssembly-accelerated 4×4 matrix multiply / inverse.
 *
 * Matrix4 is in the hot path for every world-transform, scene-graph
 * update, and camera evaluation. Doing those multiplies in JS adds up
 * fast (function-call overhead per element, no SIMD, no fused-multiply-
 * add). This module loads a tiny WASM blob that provides:
 *
 *   - allocate_matrix()           → ptr (16 floats of zeroed memory)
 *   - free_matrix(ptr)            → release the slot
 *   - multiply_matrices(a, b, c)  → c = a * b   (column-major, 4×4)
 *   - getInverse(out, m)          → out = m⁻¹
 *
 * The WASM module is shipped inline as a base64 blob so there's no
 * second network request and it works under file:// / from a worker.
 *
 * Memory model:
 *   Each Matrix4 that opts into WASM acceleration is "allocated" — its
 *   `elements` is replaced with a Float32Array view that aliases a slot
 *   inside the WASM heap. The slot's pointer is stashed on
 *   `elements.ptr` so multiply/getInverse can hand the pointer triple
 *   to the WASM function without copying.
 *
 *   `FinalizationRegistry` (where available) auto-frees the slot when
 *   the wrapping object is GC'd. Without FR the slot leaks — acceptable
 *   because Matrix4s are typically pool-allocated and live for the
 *   process lifetime.
 *
 * Async load + fallback:
 *   `self.ready()` returns a promise that resolves once the WASM has
 *   instantiated (or failed). If the load throws (old browser, no WASM,
 *   memory cap), `wasmExports` stays undefined and `self.allocate`
 *   degrades to a plain `_identity.slice()` so the rest of the engine
 *   keeps working with pure-JS matrix math.
 *
 * Heap growth:
 *   `emscripten_resize_heap` is implemented in JS — when the WASM asks
 *   for more pages we `memory.grow()` and update the cached buffer.
 *   Growing invalidates every existing Float32Array view, so callers
 *   that hold long-lived views may need to re-alias after growth.
 *
 * Public API:
 *   self.allocate(matrix4)        — opt the matrix into WASM acceleration.
 *   self.multiply(a, b, c)        — c = a * b. Auto-allocates each arg.
 *   self.getInverse(out, m)       — out = m⁻¹. Auto-allocates each arg.
 *   self.ready()                  — promise that fulfils once WASM is ready.
 */
Class(function MatrixWasm() {
  const self = this;
  let registry;
  let wasmExports;

  // Auto-free WASM heap slots when their owning matrix object is GC'd.
  // FinalizationRegistry isn't universal — without it, slots leak.
  if (window.FinalizationRegistry) {
    registry = new FinalizationRegistry((heldValue) => {
      wasmExports.free_matrix(heldValue.ptr);
    });
  }

  // Anything calling self.multiply / self.getInverse before WASM is
  // live should await `self.ready()` first.
  const readyPromise = Promise.create();

  (async function loadWasm() {
    try {
      // Inlined WASM module (base64). Exports: allocate_matrix,
      // free_matrix, multiply_matrices, getInverse + emscripten runtime.
      const bytes = Uint8Array.from(
        atob(
          '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',
        ),
        (c) => c.charCodeAt(0),
      );

      const module = await WebAssembly.compile(bytes);
      // 5 × 64 KiB = 320 KiB initial heap. Grows on demand via
      // emscripten_resize_heap below.
      const memory = new WebAssembly.Memory({ initial: 5 });

      const moduleImports = {
        env: {
          memory,
          // Emscripten's runtime calls this when the WASM heap needs to
          // grow. Returns true on success, false on cap/failure (the
          // WASM falls back to reporting OOM cleanly).
          emscripten_resize_heap(newSize) {
            const currentPages = memory.buffer.byteLength / 65536;
            const requiredPages = Math.ceil(newSize / 65536);
            if (requiredPages <= currentPages) return false;
            const pagesToGrow = requiredPages - currentPages;
            try {
              memory.grow(pagesToGrow);
              // Growing invalidates the old ArrayBuffer reference; cache the
              // new one so future Float32Array views read from the right place.
              console.log('Memory grew!');
              currentBuffer = memory.buffer;
              return true;
            } catch (error) {
              console.error('Failed to resize heap:', error);
              return false;
            }
          },
        },
      };

      const instance = await WebAssembly.instantiate(module, moduleImports);
      // eslint-disable-next-line no-unused-vars
      let currentBuffer = memory.buffer;
      return instance.exports;
    } catch (e) {
      // Swallow — load failure leaves wasmExports undefined and
      // self.allocate degrades to JS-side identity matrices.
    }
  })().then((exports) => {
    readyPromise.resolve();
    if (!exports) return;
    wasmExports = exports;

    // c = a * b. Auto-allocates each matrix into the WASM heap on first use.
    self.multiply = function (a, b, c) {
      if (!a.elements.ptr) self.allocate(a);
      if (!b.elements.ptr) self.allocate(b);
      if (!c.elements.ptr) self.allocate(c);
      wasmExports.multiply_matrices(a.elements.ptr, b.elements.ptr, c.elements.ptr);
    };

    // out = m⁻¹.
    self.getInverse = function (out, m) {
      if (!out.elements.ptr) self.allocate(out);
      if (!m.elements.ptr) self.allocate(m);
      wasmExports.getInverse(out.elements.ptr, m.elements.ptr);
    };
  });

  // Default contents for a freshly allocated slot: column-major identity.
  const _identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

  /*
   * Promote `ref.elements` to a WASM-backed Float32Array view.
   *
   *   - Already allocated → no-op.
   *   - WASM unavailable  → fall back to a plain identity matrix
   *                          (or leave existing elements intact).
   *   - Otherwise         → allocate a 16-float slot, copy current
   *                          contents in, register for auto-free.
   */
  self.allocate = function (ref) {
    if (ref.elements?.ptr) return;
    if (!wasmExports) {
      if (!ref.elements) ref.elements = _identity.slice();
      return;
    }
    const ptr = wasmExports.allocate_matrix();
    const elements = new Float32Array(wasmExports.memory.buffer, ptr, 16);
    elements.set(ref.elements || _identity, 0);
    elements.ptr = ptr;
    ref.elements = elements;
    // Register for GC-triggered free_matrix. `ref.elements` is the held
    // value — `.ptr` is what the finaliser actually needs.
    registry?.register(ref, ref.elements);
  };

  // Resolves once the WASM module has compiled + instantiated (or failed).
  self.ready = function () {
    return readyPromise;
  };
}, 'static');

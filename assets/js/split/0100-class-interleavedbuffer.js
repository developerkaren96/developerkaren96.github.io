/*
 * InterleavedBuffer — a single TypedArray holding multiple interleaved
 * vertex streams (e.g. [pos.xyz, uv.xy, normal.xyz, pos.xyz, …]).
 *
 * Rather than allocating one VBO per attribute, attributes can share a
 * buffer and stride into it. `stride` is the count of array elements
 * between successive vertices (e.g. 8 for the example above —
 * 3 + 2 + 3). The GPU side reads the same buffer with per-attribute
 * `offset` + `stride`, set up by InterleavedGeometryAttribute.
 *
 * `count = array.length / stride` — the number of vertices represented.
 *
 * `dynamic` flips the buffer-usage hint from STATIC_DRAW to DYNAMIC_DRAW
 * when first uploaded. `needsUpdate` + `updateRange` let the renderer
 * push a partial bufferSubData on subsequent frames (used by particle
 * systems that mutate only a tail-window of the buffer per frame).
 * `count: -1` means "the whole buffer".
 */
class InterleavedBuffer {
  constructor(array, stride) {
    this.array  = array;
    this.stride = stride;
    this.count  = array ? array.length / stride : 0;

    this.isInterleaved = true;
    this.needsUpdate   = false;
    this.dynamic       = false;
    this.updateRange   = { offset: 0, count: -1 };
  }
}

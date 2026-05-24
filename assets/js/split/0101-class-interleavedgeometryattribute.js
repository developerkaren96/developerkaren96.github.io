/*
 * InterleavedGeometryAttribute — a per-attribute view onto a shared
 * InterleavedBuffer.
 *
 *   - `data`     the InterleavedBuffer holding the bytes.
 *   - `itemSize` how many array elements make up one attribute value
 *                (2 for vec2 uv, 3 for vec3 pos, …).
 *   - `offset`   element index of the first component within each
 *                stride window (e.g. 3 for uv that follows xyz).
 *
 * The renderer maps these into `gl.vertexAttribPointer(loc, itemSize,
 * type, normalized, data.stride * BYTES_PER_ELEMENT, offset *
 * BYTES_PER_ELEMENT)` so multiple attributes can share one VBO.
 */
class InterleavedGeometryAttribute {
  constructor(interleavedBuffer, itemSize, offset) {
    this.data     = interleavedBuffer;
    this.itemSize = itemSize;
    this.offset   = offset;

    this.isInterleaved = true;
  }
}

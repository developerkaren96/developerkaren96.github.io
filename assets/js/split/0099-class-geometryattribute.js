/*
 * GeometryAttribute — one named vertex stream (positions, uvs, normals, …).
 * Wraps a flat TypedArray + the stride (`itemSize`) used to chunk it into
 * per-vertex items.
 *
 *   new GeometryAttribute(new Float32Array([x,y,z, x,y,z, …]), 3)
 *
 *   - `count`            — number of items (array.length / itemSize)
 *   - `dynamic`          — hint to use GL_DYNAMIC_DRAW when uploading
 *   - `updateRange`      — sub-range hint for partial buffer updates
 *                          (`offset` in items, `count = -1` means "all")
 *   - `meshPerAttribute` — instancing divisor (1 = one value per instance)
 *
 * Three flags drive uploads on the renderer side:
 *   - `needsUpdate`     — reupload the array
 *   - `needsNewBuffer`  — reallocate the GL buffer (size changed)
 */
class GeometryAttribute {
  constructor(_array, _itemSize, _meshPerAttribute, _dynamic = false) {
    this.array            = _array;
    this.itemSize         = _itemSize;
    this.count            = undefined !== _array ? _array.length / _itemSize : 0;
    this.dynamic          = _dynamic;
    this.updateRange      = { offset: 0, count: -1 };
    this.meshPerAttribute = _meshPerAttribute;
  }

  /**
   * Replace the underlying TypedArray. If the item count changed, force a
   * new GL buffer allocation (size mismatch); otherwise an in-place sub-data
   * update will do.
   */
  setArray(array) {
    const newCount = undefined !== array ? array.length / this.itemSize : 0;
    if (newCount != this.count) this.needsNewBuffer = true;
    this.array       = array;
    this.count       = newCount;
    this.needsUpdate = true;
  }

  /**
   * `noCopy=true` returns *this* (alias); otherwise produces a fresh
   * GeometryAttribute wrapping a copied Float32Array. Instancing divisor
   * is preserved; `dynamic`/`updateRange` are reset to defaults.
   */
  clone(noCopy) {
    return noCopy
      ? this
      : new GeometryAttribute(new Float32Array(this.array), this.itemSize, this.meshPerAttribute);
  }

  // ── Component accessors (X/Y/Z/W = offsets 0/1/2/3 within an item) ─────
  getX(index)         { return this.array[index * this.itemSize]; }
  setX(index, x)      { this.array[index * this.itemSize]     = x; return this; }
  getY(index)         { return this.array[index * this.itemSize + 1]; }
  setY(index, y)      { this.array[index * this.itemSize + 1] = y; return this; }
  getZ(index)         { return this.array[index * this.itemSize + 2]; }
  setZ(index, z)      { this.array[index * this.itemSize + 2] = z; return this; }
  getW(index)         { return this.array[index * this.itemSize + 3]; }
  setW(index, w)      { this.array[index * this.itemSize + 3] = w; return this; }

  setXY(index, x, y) {
    index *= this.itemSize;
    this.array[index + 0] = x;
    this.array[index + 1] = y;
    return this;
  }
  setXYZ(index, x, y, z) {
    index *= this.itemSize;
    this.array[index + 0] = x;
    this.array[index + 1] = y;
    this.array[index + 2] = z;
    return this;
  }
  setXYZW(index, x, y, z, w) {
    index *= this.itemSize;
    this.array[index + 0] = x;
    this.array[index + 1] = y;
    this.array[index + 2] = z;
    this.array[index + 3] = w;
    return this;
  }
}

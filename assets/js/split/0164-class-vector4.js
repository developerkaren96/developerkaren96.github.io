/*
 * Vector4 — 4-component vector, mostly used for:
 *   - Viewport / scissor rectangles, where (x, y, width, height) is encoded
 *     as (x, y, z=width, w=height). The `width`/`height` accessors alias
 *     z/w to make rect code read naturally.
 *   - Shader uniforms typed as `vec4` (colours w/ alpha, plane equations …).
 *
 * Smaller API than Vector2/3 — only what's needed by call sites.
 */
class Vector4 {
  constructor(x = 0, y = 0, z = 0, w = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
  }

  set(x, y, z, w) {
    this.x = x; this.y = y; this.z = z; this.w = w;
    return this;
  }
  copy(v) {
    this.x = v.x; this.y = v.y; this.z = v.z; this.w = v.w;
    return this;
  }
  clone() { return new Vector4(this.x, this.y, this.z, this.w); }

  multiplyScalar(s) {
    this.x *= s; this.y *= s; this.z *= s; this.w *= s;
    return this;
  }

  dot(v)     { return this.x * v.x + this.y * v.y + this.z * v.z + this.w * v.w; }
  lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w; }
  length()   { return Math.sqrt(this.lengthSq()); }

  equals(v) {
    return v.x === this.x && v.y === this.y && v.z === this.z && v.w === this.w;
  }

  /** Frame-rate-independent lerp (see Math.lerp polyfill for `hz`). */
  lerp(v, alpha, hz) {
    this.x = Math.lerp(v.x, this.x, alpha, hz);
    this.y = Math.lerp(v.y, this.y, alpha, hz);
    this.z = Math.lerp(v.z, this.z, alpha, hz);
    this.w = Math.lerp(v.w, this.w, alpha, hz);
    return this;
  }

  /**
   * Full Matrix4 × vec4 — treats w as homogeneous (no perspective divide,
   * unlike Vector3.applyMatrix4). Useful for transforming planes & uniforms.
   */
  applyMatrix4(m) {
    const x = this.x, y = this.y, z = this.z, w = this.w, e = m.elements;
    this.x = e[0] * x + e[4] * y + e[8]  * z + e[12] * w;
    this.y = e[1] * x + e[5] * y + e[9]  * z + e[13] * w;
    this.z = e[2] * x + e[6] * y + e[10] * z + e[14] * w;
    this.w = e[3] * x + e[7] * y + e[11] * z + e[15] * w;
    return this;
  }

  toArray(array, offset) {
    if (array === undefined) array = [];
    if (offset === undefined) offset = 0;
    array[offset]     = this.x;
    array[offset + 1] = this.y;
    array[offset + 2] = this.z;
    array[offset + 3] = this.w;
    return array;
  }
  fromArray(array, offset) {
    if (offset === undefined) offset = 0;
    this.x = Number(array[offset]);
    this.y = Number(array[offset + 1]);
    this.z = Number(array[offset + 2]);
    this.w = Number(array[offset + 3]);
    return this;
  }

  // Rectangle aliases: (x, y, width=z, height=w).
  get width()  { return this.z; }
  get height() { return this.w; }
  set width(v)  { this.z = v; }
  set height(v) { this.w = v; }
}

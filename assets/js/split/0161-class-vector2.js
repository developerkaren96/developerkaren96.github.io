/*
 * Vector2 — 2D vector with a Three.js-style mutating API.
 *
 * Convention: every method either returns `this` (chaining) or a scalar.
 * Methods that read another vector (e.g. `add(v)`) never mutate it.
 *
 *   new Vector2(2, 3).multiplyScalar(2).add(new Vector2(1, 0)) // (5, 6)
 *
 * Names mirror Three.js so call sites and shader translation stay familiar:
 * `add/sub/multiply` are component-wise, `dot/length/normalize` are the
 * usual euclidean ops, `lerp` accepts a refresh-rate-aware `hz` argument
 * (see the `Math.lerp` polyfill — frame-rate-independent smoothing).
 *
 * `width` / `height` are read-only aliases for x/y, so size-like Vec2s read
 * nicely (`size.width`).
 */
class Vector2 {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  set(x, y) {
    this.x = x;
    this.y = y;
    return this;
  }

  // Size-vector aliases.
  get width()  { return this.x; }
  get height() { return this.y; }

  setScalar(scalar) {
    this.x = this.y = scalar;
    return this;
  }

  clone() {
    return new Vector2(this.x, this.y);
  }

  copy(v) {
    this.x = v.x;
    this.y = v.y;
    return this;
  }

  // ─── Component-wise arithmetic ───────────────────────────────────────────
  add(v)               { this.x += v.x; this.y += v.y; return this; }
  addScalar(s)         { this.x += s;   this.y += s;   return this; }
  addVectors(a, b)     { this.x = a.x + b.x; this.y = a.y + b.y; return this; }
  addScaledVector(v, s){ this.x += v.x * s; this.y += v.y * s; return this; }
  sub(v)               { this.x -= v.x; this.y -= v.y; return this; }
  subScalar(s)         { this.x -= s;   this.y -= s;   return this; }
  subVectors(a, b)     { this.x = a.x - b.x; this.y = a.y - b.y; return this; }
  multiply(v)          { this.x *= v.x; this.y *= v.y; return this; }
  multiplyScalar(s)    { this.x *= s;   this.y *= s;   return this; }
  divide(v)            { this.x /= v.x; this.y /= v.y; return this; }
  divideScalar(s)      { return this.multiplyScalar(1 / s); }

  /**
   * Apply the upper-left 2×2 of a 3×3 matrix (plus the translation column).
   * The Matrix3 layout follows Three.js: column-major, indices below.
   *   [0 3 6]   x   [x']
   *   [1 4 7] · y = [y']
   *   [2 5 8]   1
   */
  applyMatrix3(m) {
    const x = this.x, y = this.y, e = m.elements;
    this.x = e[0] * x + e[3] * y + e[6];
    this.y = e[1] * x + e[4] * y + e[7];
    return this;
  }

  // ─── Bounds & rounding ───────────────────────────────────────────────────
  min(v) {
    this.x = Math.min(this.x, v.x);
    this.y = Math.min(this.y, v.y);
    return this;
  }
  max(v) {
    this.x = Math.max(this.x, v.x);
    this.y = Math.max(this.y, v.y);
    return this;
  }
  clamp(min, max) {
    this.x = Math.max(min.x, Math.min(max.x, this.x));
    this.y = Math.max(min.y, Math.min(max.y, this.y));
    return this;
  }
  clampScalar(minVal, maxVal) {
    // Convenience — same scalar bounds applied to both axes.
    const min = new Vector2(), max = new Vector2();
    min.set(minVal, minVal);
    max.set(maxVal, maxVal);
    return this.clamp(min, max);
  }
  clampLength(min, max) {
    const length = this.length();
    return this.divideScalar(length || 1).multiplyScalar(Math.max(min, Math.min(max, length)));
  }
  floor() { this.x = Math.floor(this.x); this.y = Math.floor(this.y); return this; }
  ceil()  { this.x = Math.ceil(this.x);  this.y = Math.ceil(this.y);  return this; }
  round() { this.x = Math.round(this.x); this.y = Math.round(this.y); return this; }
  /** Round towards zero — i.e. truncate. */
  roundToZero() {
    this.x = this.x < 0 ? Math.ceil(this.x) : Math.floor(this.x);
    this.y = this.y < 0 ? Math.ceil(this.y) : Math.floor(this.y);
    return this;
  }
  negate() { this.x = -this.x; this.y = -this.y; return this; }

  // ─── Length, dot, distance ───────────────────────────────────────────────
  dot(v)             { return this.x * v.x + this.y * v.y; }
  lengthSq()         { return this.x * this.x + this.y * this.y; }
  length()           { return Math.sqrt(this.lengthSq()); }
  manhattanLength()  { return Math.abs(this.x) + Math.abs(this.y); }
  normalize()        { return this.divideScalar(this.length() || 1); }

  /** Angle in [0, 2π) of this vector from the +x axis. */
  angle() {
    let angle = Math.atan2(this.y, this.x);
    if (angle < 0) angle += 2 * Math.PI;
    return angle;
  }
  /**
   * Angle (radians) of the segment from `b` (default: this) to `a`.
   * Note: signature is `(a, b)` — historical, matches existing call sites.
   */
  angleTo(a, b) {
    if (!b) b = this;
    return Math.atan2(a.y - b.y, a.x - b.x);
  }

  distanceTo(v)        { return Math.sqrt(this.distanceToSquared(v)); }
  distanceToSquared(v) {
    const dx = this.x - v.x, dy = this.y - v.y;
    return dx * dx + dy * dy;
  }
  manhattanDistanceTo(v) { return Math.abs(this.x - v.x) + Math.abs(this.y - v.y); }

  setLength(length) { return this.normalize().multiplyScalar(length); }

  /**
   * Frame-rate-independent lerp. `hz` (optional) hands smoothing math to the
   * `Math.lerp` polyfill, which factors in the actual delta time at the
   * caller's site.
   */
  lerp(v, alpha, hz) {
    this.x = Math.lerp(v.x, this.x, alpha, hz);
    this.y = Math.lerp(v.y, this.y, alpha, hz);
    return this;
  }
  lerpVectors(v1, v2, alpha) {
    return this.subVectors(v2, v1).multiplyScalar(alpha).add(v1);
  }

  equals(v) { return v.x === this.x && v.y === this.y; }

  // ─── Polar helpers (handy for circles / orbits) ──────────────────────────
  setAngleRadius(a, r) { this.x  = Math.cos(a) * r; this.y  = Math.sin(a) * r; return this; }
  addAngleRadius(a, r) { this.x += Math.cos(a) * r; this.y += Math.sin(a) * r; return this; }

  // ─── Array I/O ───────────────────────────────────────────────────────────
  fromArray(array, offset) {
    if (offset === undefined) offset = 0;
    this.x = Number(array[offset]);
    this.y = Number(array[offset + 1]);
    return this;
  }
  toArray(array, offset) {
    if (array === undefined) array = [];
    if (offset === undefined) offset = 0;
    array[offset] = this.x;
    array[offset + 1] = this.y;
    return array;
  }

  /** Rotate around an arbitrary 2D center by `angle` radians. */
  rotateAround(center, angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    const x = this.x - center.x, y = this.y - center.y;
    this.x = x * c - y * s + center.x;
    this.y = x * s + y * c + center.y;
    return this;
  }

  /** Pull from an interleaved Float32Array-style buffer at logical index. */
  fromBufferAttribute(attribute, index) {
    this.x = attribute.array[2 * index + 0];
    this.y = attribute.array[2 * index + 1];
  }
}

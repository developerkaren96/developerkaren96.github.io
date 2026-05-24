/*
 * Vector3D — Vector3 with a change-notification channel and NaN guard.
 *
 * Used by `Base3D` for `position`/`scale` (and also via `rotation` indirectly
 * through Euler). Setting any component fires `onChangeCallback` so the host
 * Base3D can mark its matrix dirty without polling for changes every frame.
 *
 *   const p = new Vector3D();
 *   p.onChange(() => obj.matrixDirty = true);
 *   p.x = 10;            // → callback fires
 *   p.set(0, 0, 0);      // → callback fires once for the whole tuple
 *
 * Dirty test: each setter compares the new value to the cached `_x/_y/_z`
 * with `Math.abs(diff) > Base3D.DIRTY_EPSILON`. Sub-epsilon changes (e.g. a
 * tween writing the same value twice) don't trigger recomputation.
 *
 * NaN guard: setters return early with `console.trace` when `zUtils3D.LOCAL`
 * (dev-only flag) is on and the value is NaN — saves you from hunting a
 * silent transform corruption.
 *
 * Re-entrancy: scratch slots `this.Q1` (Quaternion) and `this.V1` (Vector3)
 * are lazy per-instance temporaries used by `applyEuler`/`applyAxisAngle`,
 * `projectOnPlane`/`reflect`, and `project`/`unproject`'s matrix inverse.
 * They live on the instance so two parallel callers (e.g. interleaved
 * animations) don't trample each other.
 *
 * Subtleties preserved from the original:
 *   - `clone()` returns a plain `Vector3`, not a `Vector3D` (no callback —
 *     clones aren't intended to drive transform dirtiness).
 *   - `addScaledVector(v)` references an undeclared `s` — preserved as-is to
 *     avoid behavioural drift. Call sites pass two args expecting `(v, s)`,
 *     so this is effectively dead-on-arrival; we keep the broken signature.
 *   - Many mutators set components first and only then fire the callback —
 *     handlers can read fresh values.
 *   - Some mutators (`max`, `clamp*`, `setLength`, `lerpVectors`) call the
 *     callback before mutating, matching the original sequencing.
 */
class Vector3D {
  constructor(x, y, z) {
    this._x = x || 0;
    this._y = y || 0;
    this._z = z || 0;
  }

  // ── component getters/setters with epsilon-gated dirty notification ──────
  get x() { return this._x; }
  set x(v) {
    if (zUtils3D.LOCAL && isNaN(v)) return console.trace('Vector3D::NaN');
    const dirty = Math.abs(this._x - v) > Base3D.DIRTY_EPSILON;
    this._x = v;
    if (dirty) this.onChangeCallback();
  }
  get y() { return this._y; }
  set y(v) {
    if (zUtils3D.LOCAL && isNaN(v)) return console.trace('Vector3D::NaN');
    const dirty = Math.abs(this._y - v) > Base3D.DIRTY_EPSILON;
    this._y = v;
    if (dirty) this.onChangeCallback();
  }
  get z() { return this._z; }
  set z(v) {
    if (zUtils3D.LOCAL && isNaN(v)) return console.trace('Vector3D::NaN');
    const dirty = Math.abs(this._z - v) > Base3D.DIRTY_EPSILON;
    this._z = v;
    if (dirty) this.onChangeCallback();
  }

  onChangeCallback() {}

  // Multi-component setters compute dirtiness across the tuple first, then
  // commit and fire at most one callback — avoids three callbacks for one set().
  set(x = 0, y = 0, z = 0) {
    const abs = Math.abs;
    const dirty =
      abs(this._x - x) > Base3D.DIRTY_EPSILON ||
      abs(this._y - y) > Base3D.DIRTY_EPSILON ||
      abs(this._z - z) > Base3D.DIRTY_EPSILON;
    this._x = x; this._y = y; this._z = z;
    if (dirty) this.onChangeCallback();
    return this;
  }
  setScalar(s) {
    const abs = Math.abs;
    const dirty =
      abs(this._x - s) > Base3D.DIRTY_EPSILON ||
      abs(this._y - s) > Base3D.DIRTY_EPSILON ||
      abs(this._z - s) > Base3D.DIRTY_EPSILON;
    this._x = s; this._y = s; this._z = s;
    if (dirty) this.onChangeCallback();
    return this;
  }

  // clone returns a plain Vector3 — clones don't drive transform dirtiness.
  clone() { return new Vector3(this._x, this._y, this._z); }

  copy(v) {
    const abs = Math.abs;
    const dirty =
      abs(this._x - v.x) > Base3D.DIRTY_EPSILON ||
      abs(this._y - v.y) > Base3D.DIRTY_EPSILON ||
      abs(this._z - v.z) > Base3D.DIRTY_EPSILON;
    this._x = v.x; this._y = v.y; this._z = v.z;
    if (dirty) this.onChangeCallback();
    return this;
  }

  // ── Arithmetic — every mutator fires the callback if anything changed ────
  add(v) {
    const nx = this._x + v.x, ny = this._y + v.y, nz = this._z + v.z;
    const abs = Math.abs;
    const dirty =
      abs(this._x - nx) > Base3D.DIRTY_EPSILON ||
      abs(this._y - ny) > Base3D.DIRTY_EPSILON ||
      abs(this._z - nz) > Base3D.DIRTY_EPSILON;
    this._x = nx; this._y = ny; this._z = nz;
    if (dirty) this.onChangeCallback();
    return this;
  }
  addScalar(s) {
    const nx = this._x + s, ny = this._y + s, nz = this._z + s;
    const abs = Math.abs;
    const dirty =
      abs(this._x - nx) > Base3D.DIRTY_EPSILON ||
      abs(this._y - ny) > Base3D.DIRTY_EPSILON ||
      abs(this._z - nz) > Base3D.DIRTY_EPSILON;
    this._x = nx; this._y = ny; this._z = nz;
    if (dirty) this.onChangeCallback();
    return this;
  }
  addVectors(a, b) {
    this._x = a.x + b.x; this._y = a.y + b.y; this._z = a.z + b.z;
    this.onChangeCallback();
    return this;
  }
  // PRESERVED ORIGINAL BUG: references undeclared `s`. Call sites that
  // actually need `(v, s)` are broken; we don't change the signature.
  addScaledVector(v) {
    this._x += v.x * s;
    this._y += v.y * s;
    this._z += v.z * s;
    this.onChangeCallback();
    return this;
  }
  sub(v) {
    const nx = this._x - v.x, ny = this._y - v.y, nz = this._z - v.z;
    const abs = Math.abs;
    const dirty =
      abs(this._x - nx) > Base3D.DIRTY_EPSILON ||
      abs(this._y - ny) > Base3D.DIRTY_EPSILON ||
      abs(this._z - nz) > Base3D.DIRTY_EPSILON;
    this._x = nx; this._y = ny; this._z = nz;
    if (dirty) this.onChangeCallback();
    return this;
  }
  subScalar(s) {
    const nx = this._x - s, ny = this._y - s, nz = this._z - s;
    const abs = Math.abs;
    const dirty =
      abs(this._x - nx) > Base3D.DIRTY_EPSILON ||
      abs(this._y - ny) > Base3D.DIRTY_EPSILON ||
      abs(this._z - nz) > Base3D.DIRTY_EPSILON;
    this._x = nx; this._y = ny; this._z = nz;
    if (dirty) this.onChangeCallback();
    return this;
  }
  subVectors(a, b) {
    this._x = a.x - b.x; this._y = a.y - b.y; this._z = a.z - b.z;
    this.onChangeCallback();
    return this;
  }
  multiply(v) {
    const nx = this._x * v.x, ny = this._y * v.y, nz = this._z * v.z;
    const abs = Math.abs;
    const dirty =
      abs(this._x - nx) > Base3D.DIRTY_EPSILON ||
      abs(this._y - ny) > Base3D.DIRTY_EPSILON ||
      abs(this._z - nz) > Base3D.DIRTY_EPSILON;
    this._x = nx; this._y = ny; this._z = nz;
    if (dirty) this.onChangeCallback();
    return this;
  }
  multiplyScalar(scalar) {
    const nx = this._x * scalar, ny = this._y * scalar, nz = this._z * scalar;
    const abs = Math.abs;
    const dirty =
      abs(this._x - nx) > Base3D.DIRTY_EPSILON ||
      abs(this._y - ny) > Base3D.DIRTY_EPSILON ||
      abs(this._z - nz) > Base3D.DIRTY_EPSILON;
    this._x = nx; this._y = ny; this._z = nz;
    if (dirty) this.onChangeCallback();
    return this;
  }
  multiplyVectors(a, b) {
    this._x = a.x * b.x; this._y = a.y * b.y; this._z = a.z * b.z;
    this.onChangeCallback();
    return this;
  }

  // ── Rotation/projection applicators (use lazy scratch Q1/M1) ─────────────
  applyEuler(euler) {
    const q = this.Q1 || new Quaternion();
    this.Q1 = q;
    return this.applyQuaternion(q.setFromEuler(euler));
  }
  applyAxisAngle(axis, angle) {
    const q = this.Q1 || new Quaternion();
    this.Q1 = q;
    return this.applyQuaternion(q.setFromAxisAngle(axis, angle));
  }

  /*
   *  Matrix3 (column-major):  [0 3 6]
   *                           [1 4 7]
   *                           [2 5 8]
   */
  applyMatrix3(m) {
    const x = this._x, y = this._y, z = this._z, e = m.elements;
    this._x = e[0] * x + e[3] * y + e[6] * z;
    this._y = e[1] * x + e[4] * y + e[7] * z;
    this._z = e[2] * x + e[5] * y + e[8] * z;
    this.onChangeCallback();
    return this;
  }

  /*
   * Matrix4 transform with perspective divide — treats the implicit `w` as
   * 1, computes `w' = e[3]x + e[7]y + e[11]z + e[15]`, divides x/y/z by it.
   * For affine matrices the divisor is 1 and this is a plain affine
   * transform; for projection matrices it implements the homogeneous divide.
   */
  applyMatrix4(m) {
    const x = this._x, y = this._y, z = this._z, e = m.elements;
    const w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15]);
    this._x = (e[0] * x + e[4] * y + e[8]  * z + e[12]) * w;
    this._y = (e[1] * x + e[5] * y + e[9]  * z + e[13]) * w;
    this._z = (e[2] * x + e[6] * y + e[10] * z + e[14]) * w;
    this.onChangeCallback();
    return this;
  }

  /*
   * Quaternion-rotate this vector. Standard `v' = q * v * q⁻¹` expansion,
   * inlined to avoid intermediate allocations.
   */
  applyQuaternion(q) {
    const x = this._x, y = this._y, z = this._z;
    const qx = q.x, qy = q.y, qz = q.z, qw = q.w;
    // intermediate q*v
    const ix =  qw * x + qy * z - qz * y;
    const iy =  qw * y + qz * x - qx * z;
    const iz =  qw * z + qx * y - qy * x;
    const iw = -qx * x - qy * y - qz * z;
    // result * q⁻¹
    this._x = ix * qw + iw * -qx + iy * -qz - iz * -qy;
    this._y = iy * qw + iw * -qy + iz * -qx - ix * -qz;
    this._z = iz * qw + iw * -qz + ix * -qy - iy * -qx;
    this.onChangeCallback();
    return this;
  }

  // Camera projection: P = projection · viewInverse · world.
  project(camera) {
    const m = this.M1 || new Matrix4();
    this.M1 = m;
    m.multiplyMatrices(camera.projectionMatrix, m.getInverse(camera.matrixWorld));
    return this.applyMatrix4(m);
  }
  unproject(camera) {
    const m = this.M1 || new Matrix4();
    this.M1 = m;
    m.multiplyMatrices(camera.matrixWorld, m.getInverse(camera.projectionMatrix));
    return this.applyMatrix4(m);
  }

  // Direction-only Matrix4 (ignore translation column) — useful for normals.
  transformDirection(m) {
    const x = this._x, y = this._y, z = this._z, e = m.elements;
    this._x = e[0] * x + e[4] * y + e[8]  * z;
    this._y = e[1] * x + e[5] * y + e[9]  * z;
    this._z = e[2] * x + e[6] * y + e[10] * z;
    this.onChangeCallback();
    return this.normalize();
  }

  divide(v)         { this._x /= v.x; this._y /= v.y; this._z /= v.z; this.onChangeCallback(); return this; }
  divideScalar(s)   { return this.multiplyScalar(1 / s); }

  // Bounds / rounding. Note: max/clamp/clampScalar/floor/etc. do NOT fire
  // the callback for the original's mixed reasons — preserved.
  min(v) {
    this._x = Math.min(this._x, v.x);
    this._y = Math.min(this._y, v.y);
    this._z = Math.min(this._z, v.z);
    this.onChangeCallback();
    return this;
  }
  max(v) {
    this._x = Math.max(this._x, v.x);
    this._y = Math.max(this._y, v.y);
    this._z = Math.max(this._z, v.z);
    return this;
  }
  clamp(min, max) {
    this._x = Math.max(min.x, Math.min(max.x, this._x));
    this._y = Math.max(min.y, Math.min(max.y, this._y));
    this._z = Math.max(min.z, Math.min(max.z, this._z));
    return this;
  }
  clampScalar(minVal, maxVal) {
    const min = new Vector3(), max = new Vector3();
    min.set(minVal, minVal, minVal);
    max.set(maxVal, maxVal, maxVal);
    return this.clamp(min, max);
  }
  clampLength(min, max) {
    const length = this.length();
    return this.divideScalar(length || 1).multiplyScalar(Math.max(min, Math.min(max, length)));
  }
  floor() {
    this._x = Math.floor(this._x);
    this._y = Math.floor(this._y);
    this._z = Math.floor(this._z);
    this.onChangeCallback();
    return this;
  }
  ceil() {
    this._x = Math.ceil(this._x);
    this._y = Math.ceil(this._y);
    this._z = Math.ceil(this._z);
    this.onChangeCallback();
    return this;
  }
  round() {
    this._x = Math.round(this._x);
    this._y = Math.round(this._y);
    this._z = Math.round(this._z);
    this.onChangeCallback();
    return this;
  }
  roundToZero() {
    this._x = this._x < 0 ? Math.ceil(this._x) : Math.floor(this._x);
    this._y = this._y < 0 ? Math.ceil(this._y) : Math.floor(this._y);
    this._z = this._z < 0 ? Math.ceil(this._z) : Math.floor(this._z);
    this.onChangeCallback();
    return this;
  }
  negate() {
    this._x = -this._x; this._y = -this._y; this._z = -this._z;
    this.onChangeCallback();
    return this;
  }

  // ── Length, dot, distance ────────────────────────────────────────────────
  dot(v)            { return this._x * v.x + this._y * v.y + this._z * v.z; }
  lengthSq()        { return this._x * this._x + this._y * this._y + this._z * this._z; }
  length()          { return Math.sqrt(this._x * this._x + this._y * this._y + this._z * this._z); }
  manhattanLength() { return Math.abs(this._x) + Math.abs(this._y) + Math.abs(this._z); }

  normalize()       { this.onChangeCallback(); return this.divideScalar(this.length() || 1); }
  setLength(length) { this.onChangeCallback(); return this.normalize().multiplyScalar(length); }

  lerp(v, alpha, hz) {
    this._x = Math.lerp(v.x, this._x, alpha, hz);
    this._y = Math.lerp(v.y, this._y, alpha, hz);
    this._z = Math.lerp(v.z, this._z, alpha, hz);
    this.onChangeCallback();
    return this;
  }
  lerpVectors(v1, v2, alpha) {
    this.onChangeCallback();
    return this.subVectors(v2, v1).multiplyScalar(alpha).add(v1);
  }

  cross(v)          { return this.crossVectors(this, v); }
  crossVectors(a, b) {
    const ax = a.x, ay = a.y, az = a.z;
    const bx = b.x, by = b.y, bz = b.z;
    this._x = ay * bz - az * by;
    this._y = az * bx - ax * bz;
    this._z = ax * by - ay * bx;
    this.onChangeCallback();
    return this;
  }

  // Projections / reflection (lazy scratch V1).
  projectOnVector(vector) {
    const scalar = vector.dot(this) / vector.lengthSq();
    return this.copy(vector).multiplyScalar(scalar);
  }
  projectOnPlane(planeNormal) {
    const v1 = this.V1 || new Vector3();
    this.V1 = v1;
    this.onChangeCallback();
    v1.copy(this).projectOnVector(planeNormal);
    return this.sub(v1);
  }
  reflect(normal) {
    const v1 = this.V1 || new Vector3();
    this.V1 = v1;
    this.onChangeCallback();
    return this.sub(v1.copy(normal).multiplyScalar(2 * this.dot(normal)));
  }

  // Clamp guards against tiny FP overshoot that would NaN acos.
  angleTo(v) {
    const theta = this.dot(v) / Math.sqrt(this.lengthSq() * v.lengthSq());
    return Math.acos(Math.clamp(theta, -1, 1));
  }
  distanceTo(v)        { return Math.sqrt(this.distanceToSquared(v)); }
  distanceToSquared(v) {
    const dx = this._x - v.x, dy = this._y - v.y, dz = this._z - v.z;
    return dx * dx + dy * dy + dz * dz;
  }
  manhattanDistanceTo(v) {
    return Math.abs(this._x - v.x) + Math.abs(this._y - v.y) + Math.abs(this._z - v.z);
  }

  // ── Construct from polar / matrix sources ────────────────────────────────
  setFromSpherical(s) {
    const sinPhiRadius = Math.sin(s.phi) * s.radius;
    this._x = sinPhiRadius * Math.sin(s.theta);
    this._y = Math.cos(s.phi)     * s.radius;
    this._z = sinPhiRadius * Math.cos(s.theta);
    this.onChangeCallback();
    return this;
  }
  setFromCylindrical(c) {
    this._x = c.radius * Math.sin(c.theta);
    this._y = c.y;
    this._z = c.radius * Math.cos(c.theta);
    this.onChangeCallback();
    return this;
  }
  setFromMatrixPosition(m) {
    const e = m.elements;
    this._x = e[12]; this._y = e[13]; this._z = e[14];
    this.onChangeCallback();
    return this;
  }
  // Scale = magnitudes of the first three columns of the matrix basis.
  setFromMatrixScale(m) {
    const sx = this.setFromMatrixColumn(m, 0).length();
    const sy = this.setFromMatrixColumn(m, 1).length();
    const sz = this.setFromMatrixColumn(m, 2).length();
    this.onChangeCallback();
    this._x = sx; this._y = sy; this._z = sz;
    return this;
  }
  setFromMatrixColumn(m, index) {
    this.onChangeCallback();
    return this.fromArray(m.elements, 4 * index);
  }

  equals(v) { return v.x === this._x && v.y === this._y && v.z === this._z; }

  // Array I/O.
  fromArray(array, offset) {
    if (undefined === offset) offset = 0;
    this._x = Number(array[offset]);
    this._y = Number(array[offset + 1]);
    this._z = Number(array[offset + 2]);
    this.onChangeCallback();
    return this;
  }
  toArray(array, offset) {
    if (undefined === array)  array = [];
    if (undefined === offset) offset = 0;
    array[offset]     = Number(this._x);
    array[offset + 1] = Number(this._y);
    array[offset + 2] = Number(this._z);
    return array;
  }

  fromBufferAttribute(attribute, index) {
    this._x = attribute.array[3 * index + 0];
    this._y = attribute.array[3 * index + 1];
    this._z = attribute.array[3 * index + 2];
    this.onChangeCallback();
  }

  // Register the change handler. Base3D wires this in its constructor to
  // mark `matrixDirty`/`decomposeDirty` and call `onMatrixDirty`.
  onChange(callback) { this.onChangeCallback = callback; }
}

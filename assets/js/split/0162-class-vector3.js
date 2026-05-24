/*
 * Vector3 — 3D vector with Three.js-style mutating API.
 *
 * Convention: methods return `this` for chaining; reads (`length`, `dot`)
 * return scalars. Operands are never mutated.
 *
 * Internal scratch slots:
 *   - `this.V1`, `this.M1`, `this.Q1` are lazy per-instance temporaries used
 *     by `projectOnPlane`, `project`/`unproject`, `applyEuler/AxisAngle`.
 *     They live on the instance (not as static singletons) so methods are
 *     re-entrant from interleaved frame code.
 *
 * Matrix layout (column-major, Three.js):
 *   Matrix4:               Matrix3:
 *     [ 0  4  8 12]          [0 3 6]
 *     [ 1  5  9 13]          [1 4 7]
 *     [ 2  6 10 14]          [2 5 8]
 *     [ 3  7 11 15]
 */
class Vector3 {
  constructor(_x, y, z) {
    this.x = _x || 0;
    this.y = y || 0;
    this.z = z || 0;
  }

  set(x, y, z) {
    this.x = x || 0;
    this.y = y || 0;
    this.z = z || 0;
    return this;
  }
  setScalar(scalar) {
    this.x = scalar;
    this.y = scalar;
    this.z = scalar;
    return this;
  }
  clone() { return new Vector3(this.x, this.y, this.z); }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }

  // ─── Component-wise arithmetic ───────────────────────────────────────────
  add(v)                { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  addScalar(s)          { this.x += s;   this.y += s;   this.z += s;   return this; }
  addVectors(a, b)      { this.x = a.x + b.x; this.y = a.y + b.y; this.z = a.z + b.z; return this; }
  addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
  sub(v)                { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  subScalar(s)          { this.x -= s;   this.y -= s;   this.z -= s;   return this; }
  subVectors(a, b)      { this.x = a.x - b.x; this.y = a.y - b.y; this.z = a.z - b.z; return this; }
  multiply(v)           { this.x *= v.x; this.y *= v.y; this.z *= v.z; return this; }
  multiplyScalar(s)     { this.x *= s;   this.y *= s;   this.z *= s;   return this; }
  multiplyVectors(a, b) { this.x = a.x * b.x; this.y = a.y * b.y; this.z = a.z * b.z; return this; }
  divide(v)             { this.x /= v.x; this.y /= v.y; this.z /= v.z; return this; }
  divideScalar(s)       { return this.multiplyScalar(1 / s); }

  // ─── Rotations ───────────────────────────────────────────────────────────
  /** Rotate by an Euler — internally converts to Quaternion for stability. */
  applyEuler(euler) {
    const q = this.Q1 || new Quaternion();
    this.Q1 = q;
    return this.applyQuaternion(q.setFromEuler(euler));
  }
  /** Rotate around `axis` by `angle` radians. */
  applyAxisAngle(axis, angle) {
    const q = this.Q1 || new Quaternion();
    this.Q1 = q;
    return this.applyQuaternion(q.setFromAxisAngle(axis, angle));
  }

  /** Multiply by the upper-left 3×3 of a Matrix3. */
  applyMatrix3(m) {
    const x = this.x, y = this.y, z = this.z, e = m.elements;
    this.x = e[0] * x + e[3] * y + e[6] * z;
    this.y = e[1] * x + e[4] * y + e[7] * z;
    this.z = e[2] * x + e[5] * y + e[8] * z;
    return this;
  }

  /**
   * Apply a Matrix4 as a *position* — divides through the perspective `w`,
   * so this handles projection matrices correctly.
   */
  applyMatrix4(m) {
    const x = this.x, y = this.y, z = this.z, e = m.elements;
    const w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15]);
    this.x = (e[0] * x + e[4] * y + e[8]  * z + e[12]) * w;
    this.y = (e[1] * x + e[5] * y + e[9]  * z + e[13]) * w;
    this.z = (e[2] * x + e[6] * y + e[10] * z + e[14]) * w;
    return this;
  }

  /**
   * Rotate by a quaternion. Algorithm: `v' = q · (0, v) · q⁻¹`, expanded
   * with `qw² + qx² + qy² + qz² = 1` so the inverse equals the conjugate.
   * Early-out for identity quaternion is a measurable win in hot paths.
   */
  applyQuaternion(q) {
    const x = this.x, y = this.y, z = this.z;
    const qx = q.x, qy = q.y, qz = q.z, qw = q.w;
    if (qx === 0 && qy === 0 && qz === 0 && qw === 1) return this;

    // i = q · (0, v) — quaternion-vector product, the (i*,iy*,iz*,iw*) parts.
    const ix =  qw * x + qy * z - qz * y;
    const iy =  qw * y + qz * x - qx * z;
    const iz =  qw * z + qx * y - qy * x;
    const iw = -qx * x - qy * y - qz * z;

    // (i · q*) — multiply by the conjugate to land back in the vector subspace.
    this.x = ix * qw + iw * -qx + iy * -qz - iz * -qy;
    this.y = iy * qw + iw * -qy + iz * -qx - ix * -qz;
    this.z = iz * qw + iw * -qz + ix * -qy - iy * -qx;
    return this;
  }

  // ─── Camera projection round-trips ───────────────────────────────────────
  /** World-space → NDC (-1..1). */
  project(camera) {
    const m = this.M1 || new Matrix4();
    this.M1 = m;
    m.multiplyMatrices(camera.projectionMatrix, m.getInverse(camera.matrixWorld));
    return this.applyMatrix4(m);
  }
  /** NDC → world-space. */
  unproject(camera) {
    const m = this.M1 || new Matrix4();
    this.M1 = m;
    m.multiplyMatrices(camera.matrixWorld, m.getInverse(camera.projectionMatrix));
    return this.applyMatrix4(m);
  }

  /**
   * Apply only the rotation portion of a Matrix4 — i.e. transform a
   * direction (no translation, then renormalize to recover unit length).
   */
  transformDirection(m) {
    const x = this.x, y = this.y, z = this.z, e = m.elements;
    this.x = e[0] * x + e[4] * y + e[8]  * z;
    this.y = e[1] * x + e[5] * y + e[9]  * z;
    this.z = e[2] * x + e[6] * y + e[10] * z;
    return this.normalize();
  }

  // ─── Bounds & rounding ───────────────────────────────────────────────────
  min(v) {
    this.x = Math.min(this.x, v.x);
    this.y = Math.min(this.y, v.y);
    this.z = Math.min(this.z, v.z);
    return this;
  }
  max(v) {
    this.x = Math.max(this.x, v.x);
    this.y = Math.max(this.y, v.y);
    this.z = Math.max(this.z, v.z);
    return this;
  }
  clamp(min, max) {
    this.x = Math.max(min.x, Math.min(max.x, this.x));
    this.y = Math.max(min.y, Math.min(max.y, this.y));
    this.z = Math.max(min.z, Math.min(max.z, this.z));
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
  floor() { this.x = Math.floor(this.x); this.y = Math.floor(this.y); this.z = Math.floor(this.z); return this; }
  ceil()  { this.x = Math.ceil(this.x);  this.y = Math.ceil(this.y);  this.z = Math.ceil(this.z);  return this; }
  round() { this.x = Math.round(this.x); this.y = Math.round(this.y); this.z = Math.round(this.z); return this; }
  roundToZero() {
    this.x = this.x < 0 ? Math.ceil(this.x) : Math.floor(this.x);
    this.y = this.y < 0 ? Math.ceil(this.y) : Math.floor(this.y);
    this.z = this.z < 0 ? Math.ceil(this.z) : Math.floor(this.z);
    return this;
  }
  negate() { this.x = -this.x; this.y = -this.y; this.z = -this.z; return this; }

  // ─── Length, dot, distance ───────────────────────────────────────────────
  dot(v)             { return this.x * v.x + this.y * v.y + this.z * v.z; }
  lengthSq()         { return this.x * this.x + this.y * this.y + this.z * this.z; }
  length()           { return Math.sqrt(this.lengthSq()); }
  manhattanLength()  { return Math.abs(this.x) + Math.abs(this.y) + Math.abs(this.z); }
  normalize()        { return this.divideScalar(this.length() || 1); }
  setLength(length)  { return this.normalize().multiplyScalar(length); }

  /** Frame-rate-independent lerp (see Math.lerp polyfill for `hz`). */
  lerp(v, alpha, hz) {
    this.x = Math.lerp(v.x, this.x, alpha, hz);
    this.y = Math.lerp(v.y, this.y, alpha, hz);
    this.z = Math.lerp(v.z, this.z, alpha, hz);
    return this;
  }
  lerpVectors(v1, v2, alpha) {
    return this.subVectors(v2, v1).multiplyScalar(alpha).add(v1);
  }

  cross(v) { return this.crossVectors(this, v); }
  crossVectors(a, b) {
    const ax = a.x, ay = a.y, az = a.z;
    const bx = b.x, by = b.y, bz = b.z;
    this.x = ay * bz - az * by;
    this.y = az * bx - ax * bz;
    this.z = ax * by - ay * bx;
    return this;
  }

  /** Project this onto `vector` — `this = vector · ((vector·this)/|vector|²)`. */
  projectOnVector(vector) {
    const scalar = vector.dot(this) / vector.lengthSq();
    return this.copy(vector).multiplyScalar(scalar);
  }
  /** Remove the component along `planeNormal` (keep the in-plane part). */
  projectOnPlane(planeNormal) {
    const v1 = this.V1 || new Vector3();
    this.V1 = v1;
    v1.copy(this).projectOnVector(planeNormal);
    return this.sub(v1);
  }
  /** Reflect across a surface normal (`r = v - 2·(v·n)·n`). */
  reflect(normal) {
    const v1 = this.V1 || new Vector3();
    this.V1 = v1;
    return this.sub(v1.copy(normal).multiplyScalar(2 * this.dot(normal)));
  }

  /** Angle (radians, [0, π]) between this and `v`. */
  angleTo(v) {
    // Clamp to handle floating-point overshoot — acos hates inputs outside [-1, 1].
    const theta = this.dot(v) / Math.sqrt(this.lengthSq() * v.lengthSq());
    return Math.acos(Math.clamp(theta, -1, 1));
  }

  distanceTo(v) { return Math.sqrt(this.distanceToSquared(v)); }
  distanceToSquared(v) {
    const dx = this.x - v.x, dy = this.y - v.y, dz = this.z - v.z;
    return dx * dx + dy * dy + dz * dz;
  }
  manhattanDistanceTo(v) {
    return Math.abs(this.x - v.x) + Math.abs(this.y - v.y) + Math.abs(this.z - v.z);
  }

  // ─── Coordinate-system constructors ──────────────────────────────────────
  /** From cylindrical (radius, y, theta). */
  setFromCylindrical(c) {
    this.x = c.radius * Math.sin(c.theta);
    this.y = c.y;
    this.z = c.radius * Math.cos(c.theta);
    return this;
  }

  /** Pull the translation column (m[12..14]) of a Matrix4. */
  setFromMatrixPosition(m) {
    const e = m.elements;
    this.x = e[12]; this.y = e[13]; this.z = e[14];
    return this;
  }
  /** Pull each column's length — gives back the matrix's scale vector. */
  setFromMatrixScale(m) {
    const sx = this.setFromMatrixColumn(m, 0).length();
    const sy = this.setFromMatrixColumn(m, 1).length();
    const sz = this.setFromMatrixColumn(m, 2).length();
    this.x = sx; this.y = sy; this.z = sz;
    return this;
  }
  setFromMatrixColumn(m, index) {
    return this.fromArray(m.elements, 4 * index);
  }

  // ─── Polar helpers (2-of-3 axes via `dir`) ───────────────────────────────
  /**
   * Place x/y on a circle of radius `r` at angle `a`. `dir` picks which
   * two axes (default 'xy'; 'xz' for horizontal circles in 3D scenes).
   */
  setAngleRadius(a, r, dir = 'xy') {
    this[dir[0]]  = Math.cos(a) * r;
    this[dir[1]]  = Math.sin(a) * r;
    return this;
  }
  addAngleRadius(a, r, dir = 'xy') {
    this[dir[0]] += Math.cos(a) * r;
    this[dir[1]] += Math.sin(a) * r;
    return this;
  }

  equals(v) { return v.x === this.x && v.y === this.y && v.z === this.z; }

  // ─── Array I/O ───────────────────────────────────────────────────────────
  fromArray(array, offset) {
    if (offset === undefined) offset = 0;
    this.x = Number(array[offset]);
    this.y = Number(array[offset + 1]);
    this.z = Number(array[offset + 2]);
    return this;
  }
  setFromSpherical(s) { this.setFromSphericalCoords(s.radius, s.phi, s.theta); }
  /**
   * From spherical (radius, polar angle `phi`, azimuthal angle `theta`).
   * `phi` is measured from +y, so the equator is at phi=π/2.
   */
  setFromSphericalCoords(radius, phi, theta) {
    const sinPhiRadius = Math.sin(phi) * radius;
    this.x = sinPhiRadius * Math.sin(theta);
    this.y = Math.cos(phi) * radius;
    this.z = sinPhiRadius * Math.cos(theta);
    return this;
  }
  toArray(array, offset) {
    if (array === undefined) array = [];
    if (offset === undefined) offset = 0;
    array[offset]     = this.x;
    array[offset + 1] = this.y;
    array[offset + 2] = this.z;
    return array;
  }
  fromBufferAttribute(attribute, index) {
    this.x = attribute.array[3 * index + 0];
    this.y = attribute.array[3 * index + 1];
    this.z = attribute.array[3 * index + 2];
    return this;
  }
}

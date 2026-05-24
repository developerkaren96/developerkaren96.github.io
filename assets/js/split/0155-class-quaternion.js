/*
 * Quaternion — unit quaternion (x, y, z, w) for representing 3D rotations.
 *
 *   q = (sin(θ/2)·axis, cos(θ/2))   for a rotation by θ around `axis`.
 *
 * Storage:
 *   - Internal fields are `_x/_y/_z/_w` (the leading underscore is meaningful:
 *     setters fire `onChangeCallback`, so consumers like Object3D can mark
 *     their `matrixWorld` dirty automatically).
 *   - The dirty flag uses `Base3D.DIRTY_EPSILON` so sub-epsilon noise on
 *     animated values doesn't churn downstream caches.
 *
 * Conventions match Three.js:
 *   - `inverse()` is an alias for `conjugate()` — valid because unit
 *     quaternions satisfy q⁻¹ = q*.
 *   - Euler conversion supports all six axis orders.
 *   - `slerp` is frame-rate-aware by default (`hz=true`) — pass `false` if
 *     you've already pre-normalized the alpha.
 */
class Quaternion {
  constructor(_x, y, z, w) {
    this._x = _x || 0;
    this._y = y  || 0;
    this._z = z  || 0;
    this._w = (w !== undefined) ? w : 1;
    this.isQuaternion = true;
  }

  // ─── Component setters fire `onChangeCallback` when value moves > epsilon ─
  // (zUtils3D.LOCAL is the dev-only fast-path; in dev we trace NaN writes.)
  get x() { return this._x; }
  set x(v) {
    if (zUtils3D.LOCAL && isNaN(v)) return console.trace('Quaternion::NaN');
    const dirty = Math.abs(this._x - v) > Base3D.DIRTY_EPSILON;
    this._x = v;
    if (dirty) this.onChangeCallback();
  }
  get y() { return this._y; }
  set y(v) {
    if (zUtils3D.LOCAL && isNaN(v)) return console.trace('Quaternion::NaN');
    const dirty = Math.abs(this._y - v) > Base3D.DIRTY_EPSILON;
    this._y = v;
    if (dirty) this.onChangeCallback();
  }
  get z() { return this._z; }
  set z(v) {
    if (zUtils3D.LOCAL && isNaN(v)) return console.trace('Quaternion::NaN');
    const dirty = Math.abs(this._z - v) > Base3D.DIRTY_EPSILON;
    this._z = v;
    if (dirty) this.onChangeCallback();
  }
  get w() { return this._w; }
  set w(v) {
    if (zUtils3D.LOCAL && isNaN(v)) return console.trace('Quaternion::NaN');
    const dirty = Math.abs(this._w - v) > Base3D.DIRTY_EPSILON;
    this._w = v;
    if (dirty) this.onChangeCallback();
  }

  clone() { return new Quaternion(this._x, this._y, this._z, this._w); }

  /** Copy components, fire change cb only if anything moved past epsilon. */
  copy(q) {
    const abs = Math.abs;
    const dirty =
      abs(this._x - q.x) > Base3D.DIRTY_EPSILON ||
      abs(this._y - q.y) > Base3D.DIRTY_EPSILON ||
      abs(this._z - q.z) > Base3D.DIRTY_EPSILON ||
      abs(this._w - q.w) > Base3D.DIRTY_EPSILON;
    this._x = q.x; this._y = q.y; this._z = q.z; this._w = q.w;
    if (dirty) this.onChangeCallback();
    return this;
  }

  /** Set all four components at once with the same dirty-check. */
  set(x, y, z, w) {
    const abs = Math.abs;
    const dirty =
      abs(this._x - x) > Base3D.DIRTY_EPSILON ||
      abs(this._y - y) > Base3D.DIRTY_EPSILON ||
      abs(this._z - z) > Base3D.DIRTY_EPSILON ||
      abs(this._w - w) > Base3D.DIRTY_EPSILON;
    this._x = x; this._y = y; this._z = z; this._w = w;
    if (dirty) this.onChangeCallback();
  }

  /**
   * From Euler (`x`,`y`,`z` radians + axis `order`). Each closed-form below
   * is `q_axis1 · q_axis2 · q_axis3` expanded symbolically.
   * `update=false` suppresses the change cb (used when caller will fire later).
   */
  setFromEuler(euler, update) {
    const x = euler._x, y = euler._y, z = euler._z, order = euler.order;
    const cos = Math.cos, sin = Math.sin;
    const c1 = cos(x / 2), c2 = cos(y / 2), c3 = cos(z / 2);
    const s1 = sin(x / 2), s2 = sin(y / 2), s3 = sin(z / 2);

    if (order === 'XYZ') {
      this._x = s1 * c2 * c3 + c1 * s2 * s3;
      this._y = c1 * s2 * c3 - s1 * c2 * s3;
      this._z = c1 * c2 * s3 + s1 * s2 * c3;
      this._w = c1 * c2 * c3 - s1 * s2 * s3;
    } else if (order === 'YXZ') {
      this._x = s1 * c2 * c3 + c1 * s2 * s3;
      this._y = c1 * s2 * c3 - s1 * c2 * s3;
      this._z = c1 * c2 * s3 - s1 * s2 * c3;
      this._w = c1 * c2 * c3 + s1 * s2 * s3;
    } else if (order === 'ZXY') {
      this._x = s1 * c2 * c3 - c1 * s2 * s3;
      this._y = c1 * s2 * c3 + s1 * c2 * s3;
      this._z = c1 * c2 * s3 + s1 * s2 * c3;
      this._w = c1 * c2 * c3 - s1 * s2 * s3;
    } else if (order === 'ZYX') {
      this._x = s1 * c2 * c3 - c1 * s2 * s3;
      this._y = c1 * s2 * c3 + s1 * c2 * s3;
      this._z = c1 * c2 * s3 - s1 * s2 * c3;
      this._w = c1 * c2 * c3 + s1 * s2 * s3;
    } else if (order === 'YZX') {
      this._x = s1 * c2 * c3 + c1 * s2 * s3;
      this._y = c1 * s2 * c3 + s1 * c2 * s3;
      this._z = c1 * c2 * s3 - s1 * s2 * c3;
      this._w = c1 * c2 * c3 - s1 * s2 * s3;
    } else if (order === 'XZY') {
      this._x = s1 * c2 * c3 - c1 * s2 * s3;
      this._y = c1 * s2 * c3 - s1 * c2 * s3;
      this._z = c1 * c2 * s3 + s1 * s2 * c3;
      this._w = c1 * c2 * c3 + s1 * s2 * s3;
    }

    if (update !== false) this.onChangeCallback();
    return this;
  }

  /** From an axis-angle pair (`axis` must be unit-length). */
  setFromAxisAngle(axis, angle) {
    const halfAngle = angle / 2;
    const s = Math.sin(halfAngle);
    this._x = axis.x * s;
    this._y = axis.y * s;
    this._z = axis.z * s;
    this._w = Math.cos(halfAngle);
    this.onChangeCallback();
    return this;
  }

  /**
   * From a rotation matrix — Shepperd's method (pick the largest diagonal
   * element's branch to avoid catastrophic cancellation when one part of
   * the quaternion is small).
   */
  setFromRotationMatrix(m) {
    let s;
    const te = m.elements;
    const m11 = te[0], m12 = te[4], m13 = te[8];
    const m21 = te[1], m22 = te[5], m23 = te[9];
    const m31 = te[2], m32 = te[6], m33 = te[10];
    const trace = m11 + m22 + m33;

    if (trace > 0) {
      s = 0.5 / Math.sqrt(trace + 1);
      this._w = 0.25 / s;
      this._x = (m32 - m23) * s;
      this._y = (m13 - m31) * s;
      this._z = (m21 - m12) * s;
    } else if (m11 > m22 && m11 > m33) {
      s = 2 * Math.sqrt(1 + m11 - m22 - m33);
      this._w = (m32 - m23) / s;
      this._x = 0.25 * s;
      this._y = (m12 + m21) / s;
      this._z = (m13 + m31) / s;
    } else if (m22 > m33) {
      s = 2 * Math.sqrt(1 + m22 - m11 - m33);
      this._w = (m13 - m31) / s;
      this._x = (m12 + m21) / s;
      this._y = 0.25 * s;
      this._z = (m23 + m32) / s;
    } else {
      s = 2 * Math.sqrt(1 + m33 - m11 - m22);
      this._w = (m21 - m12) / s;
      this._x = (m13 + m31) / s;
      this._y = (m23 + m32) / s;
      this._z = 0.25 * s;
    }
    this.onChangeCallback();
    return this;
  }

  /**
   * Shortest-arc rotation from one unit vector to another. The `r < 1e-6`
   * branch handles the antiparallel case (any orthogonal axis will do —
   * pick one robustly based on which component of `vFrom` is smallest).
   */
  setFromUnitVectors(vFrom, vTo) {
    const v1 = this.V1 || new Vector3();
    this.V1 = v1;
    let r = vFrom.dot(vTo) + 1;

    if (r < 1e-6) {
      // 180° flip — choose an orthogonal axis.
      r = 0;
      if (Math.abs(vFrom.x) > Math.abs(vFrom.z)) v1.set(-vFrom.y, vFrom.x, 0);
      else                                       v1.set(0, -vFrom.z, vFrom.y);
    } else {
      v1.crossVectors(vFrom, vTo);
    }

    this._x = v1.x; this._y = v1.y; this._z = v1.z; this._w = r;
    return this.normalize();
  }

  /** For unit quaternions, inverse == conjugate. */
  inverse() { return this.conjugate(); }
  conjugate() {
    this._x *= -1; this._y *= -1; this._z *= -1;
    this.onChangeCallback();
    return this;
  }

  dot(q) {
    const w = (q._w === undefined) ? 1 : q._w;
    return this._x * q._x + this._y * q._y + this._z * q._z + this._w * w;
  }
  lengthSq() { return this._x*this._x + this._y*this._y + this._z*this._z + this._w*this._w; }
  length()   { return Math.sqrt(this.lengthSq()); }

  /** Normalize to unit length; collapses to identity on zero-length. */
  normalize() {
    let l = this.length();
    if (l === 0) {
      this._x = 0; this._y = 0; this._z = 0; this._w = 1;
    } else {
      l = 1 / l;
      this._x *= l; this._y *= l; this._z *= l; this._w *= l;
    }
    this.onChangeCallback();
    return this;
  }

  multiply(q)    { return this.multiplyQuaternions(this, q); }
  premultiply(q) { return this.multiplyQuaternions(q, this); }

  /** Hamilton product: this = a · b. */
  multiplyQuaternions(a, b) {
    const qax = a._x, qay = a._y, qaz = a._z, qaw = a._w;
    const qbx = b._x, qby = b._y, qbz = b._z, qbw = b._w;
    this._x = qax * qbw + qaw * qbx + qay * qbz - qaz * qby;
    this._y = qay * qbw + qaw * qby + qaz * qbx - qax * qbz;
    this._z = qaz * qbw + qaw * qbz + qax * qby - qay * qbx;
    this._w = qaw * qbw - qax * qbx - qay * qby - qaz * qbz;
    this.onChangeCallback();
    return this;
  }

  /**
   * Spherical lerp toward `qb` by fraction `alpha`. `hz=true` runs alpha
   * through the framerate-normalizer so smoothing speed is consistent
   * regardless of FPS. Pass `hz=false` if you already pre-clamped alpha.
   *
   * Algorithm:
   *   - Negate qb if needed so we go the short way around.
   *   - When endpoints nearly coincide, fall back to component lerp
   *     (prevents division by ~0 in sin(halfTheta)).
   */
  slerp(qb, alpha, hz = true) {
    alpha = hz ? Math.framerateNormalizeLerpAlpha(alpha) : Math.clamp(alpha);
    if (alpha === 0) return this;
    if (alpha === 1) return this.copy(qb);

    const x = this._x, y = this._y, z = this._z, w = this._w;
    let cosHalfTheta = w * qb._w + x * qb._x + y * qb._y + z * qb._z;

    if (cosHalfTheta < 0) {
      // Go the short way — invert qb.
      this._w = -qb._w; this._x = -qb._x; this._y = -qb._y; this._z = -qb._z;
      cosHalfTheta = -cosHalfTheta;
    } else {
      this.copy(qb);
    }

    if (cosHalfTheta >= 1) {
      // Endpoints coincide — restore original.
      this._w = w; this._x = x; this._y = y; this._z = z;
      return this;
    }

    const sinHalfTheta = Math.sqrt(1 - cosHalfTheta * cosHalfTheta);
    if (Math.abs(sinHalfTheta) < 0.001) {
      // Near-zero denominator — degenerate to linear midpoint.
      this._w = 0.5 * (w + this._w);
      this._x = 0.5 * (x + this._x);
      this._y = 0.5 * (y + this._y);
      this._z = 0.5 * (z + this._z);
      return this;
    }

    const halfTheta = Math.atan2(sinHalfTheta, cosHalfTheta);
    const ratioA = Math.sin((1 - alpha) * halfTheta) / sinHalfTheta;
    const ratioB = Math.sin(alpha * halfTheta) / sinHalfTheta;
    this._w = w * ratioA + this._w * ratioB;
    this._x = x * ratioA + this._x * ratioB;
    this._y = y * ratioA + this._y * ratioB;
    this._z = z * ratioA + this._z * ratioB;
    this.onChangeCallback();
    return this;
  }

  equals(q) {
    return q._x === this._x && q._y === this._y && q._z === this._z && q._w === this._w;
  }

  fromArray(array, offset) {
    if (offset === undefined) offset = 0;
    this._x = array[offset];
    this._y = array[offset + 1];
    this._z = array[offset + 2];
    this._w = array[offset + 3];
    this.onChangeCallback();
    return this;
  }
  toArray(array, offset) {
    if (array === undefined) array = [];
    if (offset === undefined) offset = 0;
    array[offset]     = this._x;
    array[offset + 1] = this._y;
    array[offset + 2] = this._z;
    array[offset + 3] = this._w;
    return array;
  }

  /** Owner hook (e.g. Object3D) registers a "mark dirty" callback here. */
  onChange(callback) { this.onChangeCallback = callback; }
  onChangeCallback() {}
}

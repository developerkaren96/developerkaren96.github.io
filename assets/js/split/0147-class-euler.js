/*
 * Euler — Tait–Bryan angles (x, y, z radians) + rotation axis order.
 *
 *   new Euler(0, Math.PI / 2, 0, 'XYZ')
 *
 * Order strings (`XYZ`, `YXZ`, `ZXY`, `ZYX`, `YZX`, `XZY`) describe the
 * rotation sequence — `'XYZ'` means "apply x, then y, then z" when going
 * from local frame to world.
 *
 * Like Quaternion, this class uses underscore-prefixed internal storage
 * (`_x`, `_y`, `_z`, `_order`) so the public setters can fire
 * `onChangeCallback` when values move past `Base3D.DIRTY_EPSILON`. Object3D
 * registers a callback to mark its world matrix dirty.
 *
 * Gimbal lock note:
 *   `setFromRotationMatrix` checks `|sin angle| < 1 - DIRTY_EPSILON` for
 *   every order. When the matrix is near a singular configuration it pins
 *   one axis to 0 and recovers the remaining two via atan2 on the other
 *   plane — standard textbook handling.
 */
class Euler {
  constructor(_x, y, z, order) {
    this._x = _x || 0;
    this._y = y  || 0;
    this._z = z  || 0;
    this._order = order || 'XYZ';
    this.isEuler = true;
  }

  // ─── Setters fire `onChangeCallback` on epsilon-meaningful change ─────────
  get x() { return this._x; }
  set x(v) {
    if (zUtils3D.LOCAL && isNaN(v)) return console.trace('Euler::NaN');
    const dirty = Math.abs(this._x - v) > Base3D.DIRTY_EPSILON;
    this._x = v;
    if (dirty) this.onChangeCallback();
  }
  get y() { return this._y; }
  set y(v) {
    if (zUtils3D.LOCAL && isNaN(v)) return console.trace('Euler::NaN');
    const dirty = Math.abs(this._y - v) > Base3D.DIRTY_EPSILON;
    this._y = v;
    if (dirty) this.onChangeCallback();
  }
  get z() { return this._z; }
  set z(v) {
    if (zUtils3D.LOCAL && isNaN(v)) return console.trace('Euler::NaN');
    const dirty = Math.abs(this._z - v) > Base3D.DIRTY_EPSILON;
    this._z = v;
    if (dirty) this.onChangeCallback();
  }

  get order()  { return this._order; }
  set order(value) {
    this._order = value;
    this.onChangeCallback();
  }

  set(x, y, z, order) {
    this._x = x; this._y = y; this._z = z;
    this._order = order || this._order;
    this.onChangeCallback();
    return this;
  }

  clone() { return new Euler(this._x, this._y, this._z, this._order); }

  copy(e) {
    this._x = e.x; this._y = e.y; this._z = e.z;
    if (e._order) this._order = e._order;
    this.onChangeCallback();
    return this;
  }

  /**
   * Extract Euler angles from a (rotation-only) Matrix4. `m11..m33` reference
   * the upper-left 3×3 in column-major storage.
   *
   * For each axis order:
   *   - asin/clamp picks the middle axis from one matrix element.
   *   - When sin(angle) is near ±1 (gimbal lock), the third axis becomes
   *     ambiguous — we pin it to 0 and recover the first axis from a
   *     different plane.
   */
  setFromRotationMatrix(m, order, update) {
    const clamp = Math.clamp;
    const te = m.elements;
    const m11 = te[0], m12 = te[4], m13 = te[8];
    const m21 = te[1], m22 = te[5], m23 = te[9];
    const m31 = te[2], m32 = te[6], m33 = te[10];
    order = order || this._order;

    if (order === 'XYZ') {
      this._y = Math.asin(clamp(m13, -1, 1));
      if (Math.abs(m13) < 1 - Base3D.DIRTY_EPSILON) {
        this._x = Math.atan2(-m23, m33);
        this._z = Math.atan2(-m12, m11);
      } else {
        this._x = Math.atan2(m32, m22);
        this._z = 0;
      }
    } else if (order === 'YXZ') {
      this._x = Math.asin(-clamp(m23, -1, 1));
      if (Math.abs(m23) < 1 - Base3D.DIRTY_EPSILON) {
        this._y = Math.atan2(m13, m33);
        this._z = Math.atan2(m21, m22);
      } else {
        this._y = Math.atan2(-m31, m11);
        this._z = 0;
      }
    } else if (order === 'ZXY') {
      this._x = Math.asin(clamp(m32, -1, 1));
      if (Math.abs(m32) < 1 - Base3D.DIRTY_EPSILON) {
        this._y = Math.atan2(-m31, m33);
        this._z = Math.atan2(-m12, m22);
      } else {
        this._y = 0;
        this._z = Math.atan2(m21, m11);
      }
    } else if (order === 'ZYX') {
      this._y = Math.asin(-clamp(m31, -1, 1));
      if (Math.abs(m31) < 1 - Base3D.DIRTY_EPSILON) {
        this._x = Math.atan2(m32, m33);
        this._z = Math.atan2(m21, m11);
      } else {
        this._x = 0;
        this._z = Math.atan2(-m12, m22);
      }
    } else if (order === 'YZX') {
      this._z = Math.asin(clamp(m21, -1, 1));
      if (Math.abs(m21) < 1 - Base3D.DIRTY_EPSILON) {
        this._x = Math.atan2(-m23, m22);
        this._y = Math.atan2(-m31, m11);
      } else {
        this._x = 0;
        this._y = Math.atan2(m13, m33);
      }
    } else if (order === 'XZY') {
      this._z = Math.asin(-clamp(m12, -1, 1));
      if (Math.abs(m12) < 1 - Base3D.DIRTY_EPSILON) {
        this._x = Math.atan2(m32, m22);
        this._y = Math.atan2(m13, m11);
      } else {
        this._x = Math.atan2(-m23, m33);
        this._y = 0;
      }
    }

    this._order = order;
    if (update !== false) this.onChangeCallback();
    return this;
  }

  /** From a Quaternion — go through a temporary Matrix4. */
  setFromQuaternion(q, order, update) {
    const matrix = this.M1 || new Matrix4();
    this.M1 = matrix;
    matrix.makeRotationFromQuaternion(q);
    return this.setFromRotationMatrix(matrix, order, update);
  }

  setFromVector3(v, order) {
    return this.set(v.x, v.y, v.z, order || this._order);
  }

  /**
   * Re-express the same rotation under a different axis order. Goes through
   * a Quaternion to avoid the gimbal-lock ambiguity at the boundary.
   */
  reorder(newOrder) {
    const q = this.Q1 || new Quaternion();
    this.Q1 = q;
    q.setFromEuler(this);
    return this.setFromQuaternion(q, newOrder);
  }

  /**
   * Component-wise lerp. NOTE: this lerps in Euler space, which is *not*
   * the same as slerping the underlying rotation — fine for small deltas
   * (UI, dampening), wrong for large arcs (use Quaternion.slerp instead).
   */
  lerp(euler, alpha) {
    this._x += (euler._x - this._x) * alpha;
    this._y += (euler._y - this._y) * alpha;
    this._z += (euler._z - this._z) * alpha;
    this.onChangeCallback();
  }

  equals(euler) {
    return (
      euler._x === this._x &&
      euler._y === this._y &&
      euler._z === this._z &&
      euler._order === this._order
    );
  }

  fromArray(array) {
    this._x = array[0];
    this._y = array[1];
    this._z = array[2];
    if (array[3] !== undefined) this._order = array[3];
    this.onChangeCallback();
    return this;
  }
  toArray(array, offset) {
    if (array === undefined) array = [];
    if (offset === undefined) offset = 0;
    array[offset]     = this._x;
    array[offset + 1] = this._y;
    array[offset + 2] = this._z;
    array[offset + 3] = this._order;
    return array;
  }

  toVector3(optionalResult) {
    return optionalResult
      ? optionalResult.set(this._x, this._y, this._z)
      : new Vector3(this._x, this._y, this._z);
  }

  /** Owner hook (Object3D) registers its `markDirty` here. */
  onChange(callback) { this.onChangeCallback = callback; }
  onChangeCallback() {}
}

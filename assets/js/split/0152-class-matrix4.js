/*
 * Matrix4 — column-major 4×4 matrix backed by a Float32Array.
 *
 * Storage (Three.js convention, column-major):
 *   elements layout:
 *     [ 0  4  8 12]
 *     [ 1  5  9 13]
 *     [ 2  6 10 14]
 *     [ 3  7 11 15]
 *
 * `set(...)` takes its arguments in row-major order (the way you'd write
 * them on paper); the body of `set` shuffles them into column-major.
 *
 * Acceleration:
 *   - If `Matrix4.allocate` is provided (set by MatrixWasm), it owns the
 *     `.elements` buffer (typically a slice of WASM memory).
 *   - If `MatrixWasm.multiply` / `MatrixWasm.getInverse` exist, those hot
 *     methods delegate to them. Both have JS fallbacks for non-WASM.
 *
 * Internal scratch slots: `V1..V3`, `M1` — re-entrant per-instance temps
 * used by `lookAt`, `extractRotation`, `project`-style methods.
 */
class Matrix4 {
  constructor() {
    if (Matrix4.allocate) {
      // WASM-backed buffer; allocator sets `this.elements`.
      Matrix4.allocate(this);
    } else {
      this.elements = new Float32Array([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1,
      ]);
    }
  }

  /** Row-major arguments → column-major storage. */
  set(n11, n12, n13, n14, n21, n22, n23, n24,
      n31, n32, n33, n34, n41, n42, n43, n44) {
    const te = this.elements;
    te[0] = n11; te[4] = n12; te[8]  = n13; te[12] = n14;
    te[1] = n21; te[5] = n22; te[9]  = n23; te[13] = n24;
    te[2] = n31; te[6] = n32; te[10] = n33; te[14] = n34;
    te[3] = n41; te[7] = n42; te[11] = n43; te[15] = n44;
    return this;
  }

  identity() {
    return this.set(
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    );
  }

  clone() { return new Matrix4().fromArray(this.elements); }

  copy(m) {
    const te = this.elements, me = m.elements;
    for (let i = 0; i < 16; i++) te[i] = me[i];
    return this;
  }

  /** Overwrite only the translation column from `m`. */
  copyPosition(m) {
    const te = this.elements, me = m.elements;
    te[12] = me[12]; te[13] = me[13]; te[14] = me[14];
    return this;
  }

  /** Read each rotation/scale column into a Vector3. */
  extractBasis(xAxis, yAxis, zAxis) {
    xAxis.setFromMatrixColumn(this, 0);
    yAxis.setFromMatrixColumn(this, 1);
    zAxis.setFromMatrixColumn(this, 2);
    return this;
  }

  /** Build a basis matrix from three column vectors. */
  makeBasis(xAxis, yAxis, zAxis) {
    return this.set(
      xAxis.x, yAxis.x, zAxis.x, 0,
      xAxis.y, yAxis.y, zAxis.y, 0,
      xAxis.z, yAxis.z, zAxis.z, 0,
      0,       0,       0,       1,
    );
  }

  /**
   * Extract pure rotation from `m` — strip the per-column scale, leaving
   * the unit-length basis vectors. Translation/perspective rows are NOT
   * cleared (Three.js leaves them untouched; that's intentional).
   */
  extractRotation(m) {
    const v1 = this.V1 || new Vector3();
    this.V1 = v1;
    const te = this.elements, me = m.elements;
    const scaleX = 1 / v1.setFromMatrixColumn(m, 0).length();
    const scaleY = 1 / v1.setFromMatrixColumn(m, 1).length();
    const scaleZ = 1 / v1.setFromMatrixColumn(m, 2).length();

    te[0]  = me[0]  * scaleX; te[1]  = me[1]  * scaleX; te[2]  = me[2]  * scaleX;
    te[4]  = me[4]  * scaleY; te[5]  = me[5]  * scaleY; te[6]  = me[6]  * scaleY;
    te[8]  = me[8]  * scaleZ; te[9]  = me[9]  * scaleZ; te[10] = me[10] * scaleZ;
    return this;
  }

  /**
   * Build a rotation matrix from an Euler. All six rotation orders are
   * supported and follow the standard product-of-axis-rotations expansion
   * (e.g. XYZ → R = Rx · Ry · Rz). The closed-form expressions below are
   * the result of carrying out those matrix products symbolically.
   */
  makeRotationFromEuler(euler) {
    const te = this.elements;
    const x = euler.x, y = euler.y, z = euler.z;
    const a = Math.cos(x), b = Math.sin(x);
    const c = Math.cos(y), d = Math.sin(y);
    const e = Math.cos(z), f = Math.sin(z);

    if (euler.order === 'XYZ') {
      const ae = a * e, af = a * f, be = b * e, bf = b * f;
      te[0] = c * e;     te[4] = -c * f;    te[8]  = d;
      te[1] = af + be*d; te[5] = ae - bf*d; te[9]  = -b * c;
      te[2] = bf - ae*d; te[6] = be + af*d; te[10] =  a * c;
    } else if (euler.order === 'YXZ') {
      const ce = c * e, cf = c * f, de = d * e, df = d * f;
      te[0] = ce + df*b; te[4] = de*b - cf; te[8]  = a * d;
      te[1] = a * f;     te[5] = a * e;     te[9]  = -b;
      te[2] = cf*b - de; te[6] = df + ce*b; te[10] = a * c;
    } else if (euler.order === 'ZXY') {
      const ce = c * e, cf = c * f, de = d * e, df = d * f;
      te[0] = ce - df*b; te[4] = -a * f;    te[8]  = de + cf*b;
      te[1] = cf + de*b; te[5] = a * e;     te[9]  = df - ce*b;
      te[2] = -a * d;    te[6] = b;         te[10] = a * c;
    } else if (euler.order === 'ZYX') {
      const ae = a * e, af = a * f, be = b * e, bf = b * f;
      te[0] = c * e;     te[4] = be*d - af; te[8]  = ae*d + bf;
      te[1] = c * f;     te[5] = bf*d + ae; te[9]  = af*d - be;
      te[2] = -d;        te[6] = b * c;     te[10] = a * c;
    } else if (euler.order === 'YZX') {
      const ac = a * c, ad = a * d, bc = b * c, bd = b * d;
      te[0] = c * e;     te[4] = bd - ac*f; te[8]  = bc*f + ad;
      te[1] = f;         te[5] = a * e;     te[9]  = -b * e;
      te[2] = -d * e;    te[6] = ad*f + bc; te[10] = ac - bd*f;
    } else if (euler.order === 'XZY') {
      const ac = a * c, ad = a * d, bc = b * c, bd = b * d;
      te[0] = c * e;     te[4] = -f;        te[8]  = d * e;
      te[1] = ac*f + bd; te[5] = a * e;     te[9]  = ad*f - bc;
      te[2] = bc*f - ad; te[6] = b * e;     te[10] = bd*f + ac;
    }

    // Zero translation/perspective.
    te[3] = 0; te[7] = 0; te[11] = 0;
    te[12] = 0; te[13] = 0; te[14] = 0; te[15] = 1;
    return this;
  }

  /**
   * Build a rotation matrix from a quaternion. Standard expansion using
   * `2*qi*qj` cross-terms to avoid extra multiplies.
   */
  makeRotationFromQuaternion(q) {
    const te = this.elements;
    const x = q._x, y = q._y, z = q._z, w = q._w;
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2;
    const yy = y * y2, yz = y * z2, zz = z * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2;

    te[0] = 1 - (yy + zz); te[4] = xy - wz;       te[8]  = xz + wy;
    te[1] = xy + wz;       te[5] = 1 - (xx + zz); te[9]  = yz - wx;
    te[2] = xz - wy;       te[6] = yz + wx;       te[10] = 1 - (xx + yy);

    te[3] = 0; te[7] = 0; te[11] = 0;
    te[12] = 0; te[13] = 0; te[14] = 0; te[15] = 1;
    return this;
  }

  /**
   * Build a view-style basis: look from `eye` toward `target` with `up` as
   * the world's up reference. Degenerate cases (eye=target, or up parallel
   * to view direction) get a tiny nudge to keep the cross-product valid.
   */
  lookAt(eye, target, up) {
    const x = this.V1 || new Vector3();
    const y = this.V2 || new Vector3();
    const z = this.V3 || new Vector3();
    this.V1 = x; this.V2 = y; this.V3 = z;
    const te = this.elements;

    z.subVectors(eye, target);
    if (z.lengthSq() === 0) z.z = 1;            // eye === target
    z.normalize();

    x.crossVectors(up, z);
    if (x.lengthSq() === 0) {
      // up is parallel to z — nudge along whichever axis won't hit the same case.
      if (Math.abs(up.z) === 1) z.x += 1e-4;
      else                       z.z += 1e-4;
      z.normalize();
      x.crossVectors(up, z);
    }
    x.normalize();
    y.crossVectors(z, x);

    te[0] = x.x; te[4] = y.x; te[8]  = z.x;
    te[1] = x.y; te[5] = y.y; te[9]  = z.y;
    te[2] = x.z; te[6] = y.z; te[10] = z.z;
    return this;
  }

  multiply(m)    { return this.multiplyMatrices(this, m); }
  premultiply(m) { return this.multiplyMatrices(m, this); }

  /**
   * `this = ae · be`. Delegates to WASM when available, otherwise computes
   * column-by-column in the JS fallback below.
   */
  multiplyMatrices(ae, be) {
    if (MatrixWasm.multiply) {
      MatrixWasm.multiply(ae, be, this);
      return this;
    }
    const a = ae.elements, b = be.elements, out = this.elements;

    // Pull every entry of `a` up front — `out` may alias `a`.
    const a00 = a[0],  a01 = a[1],  a02 = a[2],  a03 = a[3];
    const a10 = a[4],  a11 = a[5],  a12 = a[6],  a13 = a[7];
    const a20 = a[8],  a21 = a[9],  a22 = a[10], a23 = a[11];
    const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

    // Column 0
    let b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3];
    out[0] = b0*a00 + b1*a10 + b2*a20 + b3*a30;
    out[1] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
    out[2] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
    out[3] = b0*a03 + b1*a13 + b2*a23 + b3*a33;
    // Column 1
    b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7];
    out[4] = b0*a00 + b1*a10 + b2*a20 + b3*a30;
    out[5] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
    out[6] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
    out[7] = b0*a03 + b1*a13 + b2*a23 + b3*a33;
    // Column 2
    b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11];
    out[8]  = b0*a00 + b1*a10 + b2*a20 + b3*a30;
    out[9]  = b0*a01 + b1*a11 + b2*a21 + b3*a31;
    out[10] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
    out[11] = b0*a03 + b1*a13 + b2*a23 + b3*a33;
    // Column 3
    b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15];
    out[12] = b0*a00 + b1*a10 + b2*a20 + b3*a30;
    out[13] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
    out[14] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
    out[15] = b0*a03 + b1*a13 + b2*a23 + b3*a33;
    return this;
  }

  multiplyScalar(s) {
    const te = this.elements;
    for (let i = 0; i < 16; i++) te[i] *= s;
    return this;
  }

  /**
   * 4×4 determinant via cofactor expansion along the last row (te[3], te[7],
   * te[11], te[15]). Mostly used to detect mirrored matrices in `decompose`.
   */
  determinant() {
    const te = this.elements;
    const n11 = te[0],  n12 = te[4], n13 = te[8],  n14 = te[12];
    const n21 = te[1],  n22 = te[5], n23 = te[9],  n24 = te[13];
    const n31 = te[2],  n32 = te[6], n33 = te[10], n34 = te[14];
    return (
      te[3] * (
        +n14 * n23 * n32 - n13 * n24 * n32 - n14 * n22 * n33
        + n12 * n24 * n33 + n13 * n22 * n34 - n12 * n23 * n34
      ) +
      te[7] * (
        +n11 * n23 * n34 - n11 * n24 * n33 + n14 * n21 * n33
        - n13 * n21 * n34 + n13 * n24 * n31 - n14 * n23 * n31
      ) +
      te[11] * (
        +n11 * n24 * n32 - n11 * n22 * n34 - n14 * n21 * n32
        + n12 * n21 * n34 + n14 * n22 * n31 - n12 * n24 * n31
      ) +
      te[15] * (
        -n13 * n22 * n31 - n11 * n23 * n32 + n11 * n22 * n33
        + n13 * n21 * n32 - n12 * n21 * n33 + n12 * n23 * n31
      )
    );
  }

  transpose() {
    const te = this.elements;
    let tmp;
    tmp = te[1];  te[1]  = te[4];  te[4]  = tmp;
    tmp = te[2];  te[2]  = te[8];  te[8]  = tmp;
    tmp = te[6];  te[6]  = te[9];  te[9]  = tmp;
    tmp = te[3];  te[3]  = te[12]; te[12] = tmp;
    tmp = te[7];  te[7]  = te[13]; te[13] = tmp;
    tmp = te[11]; te[11] = te[14]; te[14] = tmp;
    return this;
  }

  /** Overwrite translation column from a Vector3. */
  setPosition(v) {
    const te = this.elements;
    te[12] = v.x; te[13] = v.y; te[14] = v.z;
    return this;
  }

  /**
   * Write `inverse(m)` into `this`. Degenerate (det=0) → identity (Three.js
   * legacy behavior); pass `throwOnDegenerate=true` if you'd rather know.
   * Algorithm: adjugate / determinant, full closed form.
   * Delegates to WASM when available.
   */
  getInverse(m, throwOnDegenerate) {
    if (MatrixWasm.getInverse) {
      MatrixWasm.getInverse(this, m);
      return this;
    }
    const te = this.elements, me = m.elements;
    const n11 = me[0],  n21 = me[1],  n31 = me[2],  n41 = me[3];
    const n12 = me[4],  n22 = me[5],  n32 = me[6],  n42 = me[7];
    const n13 = me[8],  n23 = me[9],  n33 = me[10], n43 = me[11];
    const n14 = me[12], n24 = me[13], n34 = me[14], n44 = me[15];

    const t11 = n23*n34*n42 - n24*n33*n42 + n24*n32*n43 - n22*n34*n43 - n23*n32*n44 + n22*n33*n44;
    const t12 = n14*n33*n42 - n13*n34*n42 - n14*n32*n43 + n12*n34*n43 + n13*n32*n44 - n12*n33*n44;
    const t13 = n13*n24*n42 - n14*n23*n42 + n14*n22*n43 - n12*n24*n43 - n13*n22*n44 + n12*n23*n44;
    const t14 = n14*n23*n32 - n13*n24*n32 - n14*n22*n33 + n12*n24*n33 + n13*n22*n34 - n12*n23*n34;
    const det = n11 * t11 + n21 * t12 + n31 * t13 + n41 * t14;

    if (det === 0) {
      // Legacy behavior: zero out and place ones on the diagonal.
      te[0] = te[5] = te[10] = te[15] = 1;
      te[1] = te[2] = te[3] = te[4] = te[6] = te[7] =
      te[8] = te[9] = te[11] = te[12] = te[13] = te[14] = 0;
      return this;
    }
    const detInv = 1 / det;

    te[0]  = t11 * detInv;
    te[1]  = (n24*n33*n41 - n23*n34*n41 - n24*n31*n43 + n21*n34*n43 + n23*n31*n44 - n21*n33*n44) * detInv;
    te[2]  = (n22*n34*n41 - n24*n32*n41 + n24*n31*n42 - n21*n34*n42 - n22*n31*n44 + n21*n32*n44) * detInv;
    te[3]  = (n23*n32*n41 - n22*n33*n41 - n23*n31*n42 + n21*n33*n42 + n22*n31*n43 - n21*n32*n43) * detInv;

    te[4]  = t12 * detInv;
    te[5]  = (n13*n34*n41 - n14*n33*n41 + n14*n31*n43 - n11*n34*n43 - n13*n31*n44 + n11*n33*n44) * detInv;
    te[6]  = (n14*n32*n41 - n12*n34*n41 - n14*n31*n42 + n11*n34*n42 + n12*n31*n44 - n11*n32*n44) * detInv;
    te[7]  = (n12*n33*n41 - n13*n32*n41 + n13*n31*n42 - n11*n33*n42 - n12*n31*n43 + n11*n32*n43) * detInv;

    te[8]  = t13 * detInv;
    te[9]  = (n14*n23*n41 - n13*n24*n41 - n14*n21*n43 + n11*n24*n43 + n13*n21*n44 - n11*n23*n44) * detInv;
    te[10] = (n12*n24*n41 - n14*n22*n41 + n14*n21*n42 - n11*n24*n42 - n12*n21*n44 + n11*n22*n44) * detInv;
    te[11] = (n13*n22*n41 - n12*n23*n41 - n13*n21*n42 + n11*n23*n42 + n12*n21*n43 - n11*n22*n43) * detInv;

    te[12] = t14 * detInv;
    te[13] = (n13*n24*n31 - n14*n23*n31 + n14*n21*n33 - n11*n24*n33 - n13*n21*n34 + n11*n23*n34) * detInv;
    te[14] = (n14*n22*n31 - n12*n24*n31 - n14*n21*n32 + n11*n24*n32 + n12*n21*n34 - n11*n22*n34) * detInv;
    te[15] = (n12*n23*n31 - n13*n22*n31 + n13*n21*n32 - n11*n23*n32 - n12*n21*n33 + n11*n22*n33) * detInv;
    return this;
  }

  /**
   * In-place invert (the newer Three.js API). On degenerate input the
   * matrix is zeroed (different from `getInverse`'s identity fallback —
   * keep the historical difference).
   */
  invert() {
    const te = this.elements;
    const n11 = te[0],  n21 = te[1],  n31 = te[2],  n41 = te[3];
    const n12 = te[4],  n22 = te[5],  n32 = te[6],  n42 = te[7];
    const n13 = te[8],  n23 = te[9],  n33 = te[10], n43 = te[11];
    const n14 = te[12], n24 = te[13], n34 = te[14], n44 = te[15];

    const t11 = n23*n34*n42 - n24*n33*n42 + n24*n32*n43 - n22*n34*n43 - n23*n32*n44 + n22*n33*n44;
    const t12 = n14*n33*n42 - n13*n34*n42 - n14*n32*n43 + n12*n34*n43 + n13*n32*n44 - n12*n33*n44;
    const t13 = n13*n24*n42 - n14*n23*n42 + n14*n22*n43 - n12*n24*n43 - n13*n22*n44 + n12*n23*n44;
    const t14 = n14*n23*n32 - n13*n24*n32 - n14*n22*n33 + n12*n24*n33 + n13*n22*n34 - n12*n23*n34;
    const det = n11 * t11 + n21 * t12 + n31 * t13 + n41 * t14;

    if (det === 0) {
      return this.set(0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0);
    }
    const detInv = 1 / det;

    te[0]  = t11 * detInv;
    te[1]  = (n24*n33*n41 - n23*n34*n41 - n24*n31*n43 + n21*n34*n43 + n23*n31*n44 - n21*n33*n44) * detInv;
    te[2]  = (n22*n34*n41 - n24*n32*n41 + n24*n31*n42 - n21*n34*n42 - n22*n31*n44 + n21*n32*n44) * detInv;
    te[3]  = (n23*n32*n41 - n22*n33*n41 - n23*n31*n42 + n21*n33*n42 + n22*n31*n43 - n21*n32*n43) * detInv;

    te[4]  = t12 * detInv;
    te[5]  = (n13*n34*n41 - n14*n33*n41 + n14*n31*n43 - n11*n34*n43 - n13*n31*n44 + n11*n33*n44) * detInv;
    te[6]  = (n14*n32*n41 - n12*n34*n41 - n14*n31*n42 + n11*n34*n42 + n12*n31*n44 - n11*n32*n44) * detInv;
    te[7]  = (n12*n33*n41 - n13*n32*n41 + n13*n31*n42 - n11*n33*n42 - n12*n31*n43 + n11*n32*n43) * detInv;

    te[8]  = t13 * detInv;
    te[9]  = (n14*n23*n41 - n13*n24*n41 - n14*n21*n43 + n11*n24*n43 + n13*n21*n44 - n11*n23*n44) * detInv;
    te[10] = (n12*n24*n41 - n14*n22*n41 + n14*n21*n42 - n11*n24*n42 - n12*n21*n44 + n11*n22*n44) * detInv;
    te[11] = (n13*n22*n41 - n12*n23*n41 - n13*n21*n42 + n11*n23*n42 + n12*n21*n43 - n11*n22*n43) * detInv;

    te[12] = t14 * detInv;
    te[13] = (n13*n24*n31 - n14*n23*n31 + n14*n21*n33 - n11*n24*n33 - n13*n21*n34 + n11*n23*n34) * detInv;
    te[14] = (n14*n22*n31 - n12*n24*n31 - n14*n21*n32 + n11*n24*n32 + n12*n21*n34 - n11*n22*n34) * detInv;
    te[15] = (n12*n23*n31 - n13*n22*n31 + n13*n21*n32 - n11*n23*n32 - n12*n21*n33 + n11*n22*n33) * detInv;
    return this;
  }

  /** Scale each basis column by `v.{x,y,z}` (does not touch translation). */
  scale(v) {
    const te = this.elements;
    const x = v.x, y = v.y, z = v.z;
    te[0] *= x; te[4] *= y; te[8]  *= z;
    te[1] *= x; te[5] *= y; te[9]  *= z;
    te[2] *= x; te[6] *= y; te[10] *= z;
    te[3] *= x; te[7] *= y; te[11] *= z;
    return this;
  }

  /** Largest column-length — useful for picking culling/LOD radii. */
  getMaxScaleOnAxis() {
    const te = this.elements;
    const scaleXSq = te[0]*te[0] + te[1]*te[1] + te[2]*te[2];
    const scaleYSq = te[4]*te[4] + te[5]*te[5] + te[6]*te[6];
    const scaleZSq = te[8]*te[8] + te[9]*te[9] + te[10]*te[10];
    return Math.sqrt(Math.max(scaleXSq, scaleYSq, scaleZSq));
  }

  // ─── Pure constructors (every entry overwritten) ─────────────────────────
  makeTranslation(x, y, z) {
    return this.set(
      1, 0, 0, x,
      0, 1, 0, y,
      0, 0, 1, z,
      0, 0, 0, 1,
    );
  }
  makeRotationX(theta) {
    const c = Math.cos(theta), s = Math.sin(theta);
    return this.set(
      1, 0,  0, 0,
      0, c, -s, 0,
      0, s,  c, 0,
      0, 0,  0, 1,
    );
  }
  makeRotationY(theta) {
    const c = Math.cos(theta), s = Math.sin(theta);
    return this.set(
       c, 0, s, 0,
       0, 1, 0, 0,
      -s, 0, c, 0,
       0, 0, 0, 1,
    );
  }
  makeRotationZ(theta) {
    const c = Math.cos(theta), s = Math.sin(theta);
    return this.set(
      c, -s, 0, 0,
      s,  c, 0, 0,
      0,  0, 1, 0,
      0,  0, 0, 1,
    );
  }
  /** Rotation around an arbitrary unit-length axis (Rodrigues' formula). */
  makeRotationAxis(axis, angle) {
    const c = Math.cos(angle), s = Math.sin(angle), t = 1 - c;
    const x = axis.x, y = axis.y, z = axis.z;
    const tx = t * x, ty = t * y;
    return this.set(
      tx * x + c,     tx * y - s * z, tx * z + s * y, 0,
      tx * y + s * z, ty * y + c,     ty * z - s * x, 0,
      tx * z - s * y, ty * z + s * x, t * z * z + c,  0,
      0,              0,              0,              1,
    );
  }
  makeScale(x, y, z) {
    return this.set(
      x, 0, 0, 0,
      0, y, 0, 0,
      0, 0, z, 0,
      0, 0, 0, 1,
    );
  }
  /** Build a shear matrix. Off-diagonal entries are filled in row-major. */
  makeShear(x, y, z) {
    return this.set(
      1, y, z, 0,
      x, 1, z, 0,
      x, y, 1, 0,
      0, 0, 0, 1,
    );
  }

  /** Build T · R · S in one call. */
  compose(position, quaternion, scale) {
    this.makeRotationFromQuaternion(quaternion);
    this.scale(scale);
    this.setPosition(position);
    return this;
  }

  /**
   * Extract position, rotation (as Quaternion), and scale from this matrix.
   * If the matrix is mirrored (negative determinant), the sign goes onto
   * scaleX so the recovered rotation stays a proper rotation.
   */
  decompose(position, quaternion, scale) {
    const vector = this.V1 || new Vector3();
    this.V1 = vector;
    const matrix = this.M1 || new Matrix4();
    this.M1 = matrix;
    const te = this.elements;

    let sx = vector.set(te[0], te[1], te[2]).length();
    const sy = vector.set(te[4], te[5], te[6]).length();
    const sz = vector.set(te[8], te[9], te[10]).length();
    // Mirror detection — fold the sign into sx so the rotation matrix stays right-handed.
    if (this.determinant() < 0) sx = -sx;

    position.x = te[12];
    position.y = te[13];
    position.z = te[14];

    matrix.copy(this);
    const invSX = 1 / sx, invSY = 1 / sy, invSZ = 1 / sz;
    matrix.elements[0]  *= invSX; matrix.elements[1]  *= invSX; matrix.elements[2]  *= invSX;
    matrix.elements[4]  *= invSY; matrix.elements[5]  *= invSY; matrix.elements[6]  *= invSY;
    matrix.elements[8]  *= invSZ; matrix.elements[9]  *= invSZ; matrix.elements[10] *= invSZ;
    quaternion.setFromRotationMatrix(matrix);

    scale.x = sx; scale.y = sy; scale.z = sz;
    return this;
  }

  /** Off-center perspective frustum (looking down -Z). */
  makePerspective(left, right, top, bottom, near, far) {
    const te = this.elements;
    const x = (2 * near) / (right - left);
    const y = (2 * near) / (top - bottom);
    const a = (right + left) / (right - left);
    const b = (top + bottom) / (top - bottom);
    const c = -(far + near) / (far - near);
    const d = (-2 * far * near) / (far - near);

    te[0] = x; te[4] = 0; te[8]  = a;  te[12] = 0;
    te[1] = 0; te[5] = y; te[9]  = b;  te[13] = 0;
    te[2] = 0; te[6] = 0; te[10] = c;  te[14] = d;
    te[3] = 0; te[7] = 0; te[11] = -1; te[15] = 0;
    return this;
  }

  /** Off-center orthographic projection. */
  makeOrthographic(left, right, top, bottom, near, far) {
    const te = this.elements;
    const w = 1 / (right - left);
    const h = 1 / (top - bottom);
    const p = 1 / (far - near);
    const x = (right + left) * w;
    const y = (top + bottom) * h;
    const z = (far + near) * p;

    te[0] = 2*w; te[4] = 0;   te[8]  = 0;    te[12] = -x;
    te[1] = 0;   te[5] = 2*h; te[9]  = 0;    te[13] = -y;
    te[2] = 0;   te[6] = 0;   te[10] = -2*p; te[14] = -z;
    te[3] = 0;   te[7] = 0;   te[11] = 0;    te[15] = 1;
    return this;
  }

  equals(matrix) {
    const te = this.elements, me = matrix.elements;
    for (let i = 0; i < 16; i++) if (te[i] !== me[i]) return false;
    return true;
  }

  fromArray(array, offset = 0) {
    const te = this.elements;
    for (let i = 0; i < 16; i++) te[i] = array[i + offset];
    return this;
  }

  toArray(array, offset) {
    if (array === undefined) array = [];
    if (offset === undefined) offset = 0;
    const te = this.elements;
    for (let i = 0; i < 16; i++) array[offset + i] = te[i];
    return array;
  }

  /** In-place apply this matrix to every vec3 in a stride-3 buffer. */
  applyToBufferAttribute(attribute) {
    const v1 = this.V1 || new Vector3();
    this.V1 = v1;
    for (let i = 0, l = attribute.count; i < l; i++) {
      v1.x = attribute.array[3 * i + 0];
      v1.y = attribute.array[3 * i + 1];
      v1.z = attribute.array[3 * i + 2];
      v1.applyMatrix4(this);
      attribute.array[3 * i + 0] = v1.x;
      attribute.array[3 * i + 1] = v1.y;
      attribute.array[3 * i + 2] = v1.z;
    }
    return attribute;
  }

  isIdentity() {
    const te = this.elements;
    return (
      te[0]  === 1 && te[1]  === 0 && te[2]  === 0 && te[3]  === 0 &&
      te[4]  === 0 && te[5]  === 1 && te[6]  === 0 && te[7]  === 0 &&
      te[8]  === 0 && te[9]  === 0 && te[10] === 1 && te[11] === 0 &&
      te[12] === 0 && te[13] === 0 && te[14] === 0 && te[15] === 1
    );
  }
}

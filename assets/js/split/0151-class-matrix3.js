/*
 * Matrix3 — column-major 3×3 matrix backed by a Float32Array.
 *
 * Storage layout (Three.js convention):
 *   elements[i] is column-major:
 *     [0 3 6]
 *     [1 4 7]
 *     [2 5 8]
 *
 * The `set(...)` API takes its arguments *row-major* (matching how you
 * write a matrix on paper) but stores them column-major — note how the
 * assignments in `set()` shuffle the indices.
 *
 * Primary uses: 2D UV transforms, normal matrices (the upper 3×3 of a
 * model-view matrix, inverse-transpose, used to transform normals).
 */
class Matrix3 {
  constructor() {
    // Identity, column-major.
    this.elements = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  }

  /** Set entries in *row-major* order (the natural one). */
  set(n11, n12, n13, n21, n22, n23, n31, n32, n33) {
    const te = this.elements;
    te[0] = n11; te[1] = n21; te[2] = n31;
    te[3] = n12; te[4] = n22; te[5] = n32;
    te[6] = n13; te[7] = n23; te[8] = n33;
    return this;
  }

  identity() {
    this.set(1, 0, 0, 0, 1, 0, 0, 0, 1);
    return this;
  }

  clone() { return new Matrix3().fromArray(this.elements); }

  copy(m) {
    const te = this.elements, me = m.elements;
    te[0] = me[0]; te[1] = me[1]; te[2] = me[2];
    te[3] = me[3]; te[4] = me[4]; te[5] = me[5];
    te[6] = me[6]; te[7] = me[7]; te[8] = me[8];
    return this;
  }

  /** Take the upper-left 3×3 of a Matrix4 (drops translation/perspective). */
  setFromMatrix4(m) {
    const me = m.elements;
    this.set(
      me[0], me[4], me[8],
      me[1], me[5], me[9],
      me[2], me[6], me[10],
    );
    return this;
  }

  multiply(m)    { return this.multiplyMatrices(this, m); }
  premultiply(m) { return this.multiplyMatrices(m, this); }

  multiplyMatrices(a, b) {
    const ae = a.elements, be = b.elements, te = this.elements;
    // Pull all entries up front — `te` may alias `ae` or `be`.
    const a11 = ae[0], a12 = ae[3], a13 = ae[6];
    const a21 = ae[1], a22 = ae[4], a23 = ae[7];
    const a31 = ae[2], a32 = ae[5], a33 = ae[8];
    const b11 = be[0], b12 = be[3], b13 = be[6];
    const b21 = be[1], b22 = be[4], b23 = be[7];
    const b31 = be[2], b32 = be[5], b33 = be[8];

    te[0] = a11 * b11 + a12 * b21 + a13 * b31;
    te[3] = a11 * b12 + a12 * b22 + a13 * b32;
    te[6] = a11 * b13 + a12 * b23 + a13 * b33;
    te[1] = a21 * b11 + a22 * b21 + a23 * b31;
    te[4] = a21 * b12 + a22 * b22 + a23 * b32;
    te[7] = a21 * b13 + a22 * b23 + a23 * b33;
    te[2] = a31 * b11 + a32 * b21 + a33 * b31;
    te[5] = a31 * b12 + a32 * b22 + a33 * b32;
    te[8] = a31 * b13 + a32 * b23 + a33 * b33;
    return this;
  }

  multiplyScalar(s) {
    const te = this.elements;
    te[0] *= s; te[3] *= s; te[6] *= s;
    te[1] *= s; te[4] *= s; te[7] *= s;
    te[2] *= s; te[5] *= s; te[8] *= s;
    return this;
  }

  /** 3×3 determinant via cofactor expansion along the first row. */
  determinant() {
    const te = this.elements;
    const a = te[0], b = te[1], c = te[2];
    const d = te[3], e = te[4], f = te[5];
    const g = te[6], h = te[7], i = te[8];
    return a * e * i - a * f * h - b * d * i + b * f * g + c * d * h - c * e * g;
  }

  /**
   * Inverse via adjugate / determinant. Degenerate (det=0) input:
   *   - `throwOnDegenerate=true`  → throw.
   *   - else                       → reset to identity (Three.js convention).
   */
  getInverse(matrix, throwOnDegenerate) {
    const me = matrix.elements, te = this.elements;
    const n11 = me[0], n21 = me[1], n31 = me[2];
    const n12 = me[3], n22 = me[4], n32 = me[5];
    const n13 = me[6], n23 = me[7], n33 = me[8];

    // First-column cofactors → also gives us the determinant.
    const t11 = n33 * n22 - n32 * n23;
    const t12 = n32 * n13 - n33 * n12;
    const t13 = n23 * n12 - n22 * n13;
    const det = n11 * t11 + n21 * t12 + n31 * t13;

    if (det === 0) {
      if (throwOnDegenerate === true) {
        throw new Error(".getInverse() can't invert matrix, determinant is 0");
      }
      return this.identity();
    }
    const detInv = 1 / det;

    te[0] = t11 * detInv;
    te[1] = (n31 * n23 - n33 * n21) * detInv;
    te[2] = (n32 * n21 - n31 * n22) * detInv;
    te[3] = t12 * detInv;
    te[4] = (n33 * n11 - n31 * n13) * detInv;
    te[5] = (n31 * n12 - n32 * n11) * detInv;
    te[6] = t13 * detInv;
    te[7] = (n21 * n13 - n23 * n11) * detInv;
    te[8] = (n22 * n11 - n21 * n12) * detInv;
    return this;
  }

  transpose() {
    const m = this.elements;
    let tmp;
    tmp = m[1]; m[1] = m[3]; m[3] = tmp;
    tmp = m[2]; m[2] = m[6]; m[6] = tmp;
    tmp = m[5]; m[5] = m[7]; m[7] = tmp;
    return this;
  }

  /**
   * Build the normal matrix for `matrix4` — `inverse-transpose` of its upper
   * 3×3. Required for transforming normals under non-uniform scaling.
   */
  getNormalMatrix(matrix4) {
    return this.setFromMatrix4(matrix4).getInverse(this).transpose();
  }

  /**
   * Compose a UV-space transform: scale → rotate around (cx,cy) → translate.
   * Used to drive `<repeat>`/`<offset>` on textures.
   */
  setUvTransform(tx, ty, sx, sy, rotation, cx, cy) {
    const c = Math.cos(rotation), s = Math.sin(rotation);
    this.set(
       sx * c,  sx * s, -sx * ( c * cx + s * cy) + cx + tx,
      -sy * s,  sy * c, -sy * (-s * cx + c * cy) + cy + ty,
       0,       0,       1,
    );
  }

  /** Right-multiply by a 2D scale matrix (scales just columns 0/1). */
  scale(sx, sy) {
    const te = this.elements;
    te[0] *= sx; te[3] *= sx; te[6] *= sx;
    te[1] *= sy; te[4] *= sy; te[7] *= sy;
    return this;
  }

  /** Right-multiply by a 2D rotation by `theta` radians. */
  rotate(theta) {
    const c = Math.cos(theta), s = Math.sin(theta), te = this.elements;
    const a11 = te[0], a12 = te[3], a13 = te[6];
    const a21 = te[1], a22 = te[4], a23 = te[7];
    te[0] =  c * a11 + s * a21;
    te[3] =  c * a12 + s * a22;
    te[6] =  c * a13 + s * a23;
    te[1] = -s * a11 + c * a21;
    te[4] = -s * a12 + c * a22;
    te[7] = -s * a13 + c * a23;
    return this;
  }

  /** Right-multiply by a 2D translation. */
  translate(tx, ty) {
    const te = this.elements;
    te[0] += tx * te[2]; te[3] += tx * te[5]; te[6] += tx * te[8];
    te[1] += ty * te[2]; te[4] += ty * te[5]; te[7] += ty * te[8];
    return this;
  }

  equals(matrix) {
    const te = this.elements, me = matrix.elements;
    for (let i = 0; i < 9; i++) if (te[i] !== me[i]) return false;
    return true;
  }

  fromArray(array, offset) {
    if (offset === undefined) offset = 0;
    for (let i = 0; i < 9; i++) this.elements[i] = array[i + offset];
    return this;
  }

  toArray(array, offset) {
    if (array === undefined) array = [];
    if (offset === undefined) offset = 0;
    const te = this.elements;
    array[offset]     = te[0]; array[offset + 1] = te[1]; array[offset + 2] = te[2];
    array[offset + 3] = te[3]; array[offset + 4] = te[4]; array[offset + 5] = te[5];
    array[offset + 6] = te[6]; array[offset + 7] = te[7]; array[offset + 8] = te[8];
    return array;
  }

  /**
   * In-place apply this matrix to every vec3 inside a flat buffer attribute
   * (e.g. a typed-array of stride 3). Lazy `V1` scratch — see Vector3 docs.
   */
  applyToBufferAttribute(attribute) {
    const v1 = this.V1 || new Vector3();
    this.V1 = v1;
    for (let i = 0, l = attribute.count; i < l; i++) {
      v1.x = attribute.array[3 * i + 0];
      v1.y = attribute.array[3 * i + 1];
      v1.z = attribute.array[3 * i + 2];
      v1.applyMatrix3(this);
      attribute.array[3 * i + 0] = v1.x;
      attribute.array[3 * i + 1] = v1.y;
      attribute.array[3 * i + 2] = v1.z;
    }
    return attribute;
  }
}

/*
 * Plane — infinite plane in 3D, stored in Hessian normal form:
 *
 *   normal · X + constant = 0
 *
 * with `normal` unit-length (after `normalize()`). The signed distance
 * from a point to the plane is `normal · point + constant`; positive
 * is on the normal's side.
 *
 * Defaults to the +X plane through the origin if no arguments. Lazy
 * scratch fields `V1`/`V2`/`M1` avoid per-call allocations.
 *
 * Geometry-test methods:
 *   - distanceToPoint / distanceToSphere
 *   - projectPoint (drop a point onto the plane)
 *   - intersectLine / intersectsLine (segment-plane intersection)
 *   - intersectsBox / intersectsSphere (delegate to Box3 / Sphere)
 *
 * `applyMatrix4(m)` transforms the plane by an arbitrary affine matrix.
 * Care: the *normal* must be transformed by the inverse-transpose
 * (`getNormalMatrix`) — the homogeneous matrix would otherwise skew
 * non-perpendicular normals. The constant is then re-derived from
 * the transformed coplanar point.
 */
class Plane {
  constructor(normal, constant) {
    this.normal   = undefined !== normal   ? normal   : new Vector3(1, 0, 0);
    this.constant = undefined !== constant ? constant : 0;
  }

  set(normal, constant) { this.normal.copy(normal); this.constant = constant; return this; }
  setComponents(x, y, z, w) { this.normal.set(x, y, z); this.constant = w; return this; }
  setFromNormalAndCoplanarPoint(normal, point) {
    this.normal.copy(normal);
    this.constant = -point.dot(this.normal);
    return this;
  }
  setFromCoplanarPoints(a, b, c) {
    const v1 = this.V1 || new Vector3();
    const v2 = this.V2 || new Vector3();
    this.V1 = v1; this.V2 = v2;
    const normal = v1.subVectors(c, b).cross(v2.subVectors(a, b)).normalize();
    this.setFromNormalAndCoplanarPoint(normal, a);
    return this;
  }
  clone()      { return new Plane().copy(this); }
  copy(plane)  { this.normal.copy(plane.normal); this.constant = plane.constant; return this; }

  // Ensure ||normal|| == 1 and rescale constant to match.
  normalize() {
    const inverseNormalLength = 1 / this.normal.length();
    this.normal.multiplyScalar(inverseNormalLength);
    this.constant *= inverseNormalLength;
    return this;
  }
  negate() { this.constant *= -1; this.normal.negate(); return this; }

  // Signed distances.
  distanceToPoint(point)   { return this.normal.dot(point) + this.constant; }
  distanceToSphere(sphere) { return this.distanceToPoint(sphere.center) - sphere.radius; }

  // Drop `point` perpendicularly onto the plane.
  projectPoint(point, target) {
    return target.copy(this.normal).multiplyScalar(-this.distanceToPoint(point)).add(point);
  }

  /*
   * Line/segment vs plane. Returns undefined if the line is parallel
   * to the plane and not coplanar; if coplanar, returns the start.
   * Otherwise returns the intersection iff it lies inside the segment
   * (t ∈ [0, 1]); otherwise undefined.
   */
  intersectLine(line, target) {
    const v1 = this.V1 || new Vector3();
    this.V1 = v1;
    const direction   = line.delta(v1);
    const denominator = this.normal.dot(direction);
    if (0 === denominator) {
      return 0 === this.distanceToPoint(line.start) ? target.copy(line.start) : undefined;
    }
    const t = -(line.start.dot(this.normal) + this.constant) / denominator;
    if (t < 0 || t > 1) return undefined;
    return target.copy(direction).multiplyScalar(t).add(line.start);
  }

  // Cheaper test — just check whether the two endpoints are on
  // opposite sides of the plane.
  intersectsLine(line) {
    const startSign = this.distanceToPoint(line.start);
    const endSign   = this.distanceToPoint(line.end);
    return (startSign < 0 && endSign > 0) || (endSign < 0 && startSign > 0);
  }

  intersectsBox(box)       { return box.intersectsPlane(this); }
  intersectsSphere(sphere) { return sphere.intersectsPlane(this); }

  // A point known to lie on the plane: foot of the perpendicular
  // from the origin.
  coplanarPoint(target) { return target.copy(this.normal).multiplyScalar(-this.constant); }

  /*
   * Transform plane by a 4×4 matrix. The normal needs the inverse-
   * transpose (handled by Matrix3.getNormalMatrix); the constant is
   * re-derived from the transformed coplanar point.
   */
  applyMatrix4(matrix, optionalNormalMatrix) {
    const v1 = this.V1 || new Vector3();
    const m1 = this.M1 || new Matrix3();
    this.V1 = v1; this.M1 = m1;
    const normalMatrix   = optionalNormalMatrix || m1.getNormalMatrix(matrix);
    const referencePoint = this.coplanarPoint(v1).applyMatrix4(matrix);
    const normal         = this.normal.applyMatrix3(normalMatrix).normalize();
    this.constant = -referencePoint.dot(normal);
    return this;
  }

  translate(offset) { this.constant -= offset.dot(this.normal); return this; }
  equals(plane)     { return plane.normal.equals(this.normal) && plane.constant === this.constant; }
}

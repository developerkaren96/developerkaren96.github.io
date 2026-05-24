/*
 * Sphere — bounding-sphere (centre + radius). The most common
 * coarse-bound used in frustum culling and raycasting.
 *
 * `setFromPoints(points, optionalCenter)` derives a bounding sphere
 * from a point cloud. If `optionalCenter` is supplied, the centre is
 * fixed; otherwise we use the centre of the points' AABB (cheaper
 * than computing the true minimum-enclosing centre, but always a
 * superset).
 *
 * `applyMatrix4` propagates an affine transform — the centre moves
 * through the matrix, the radius scales by the matrix's maximum
 * axis-scale (`getMaxScaleOnAxis`). For non-uniform scaling this
 * over-estimates the bound, which is the safe direction for culling.
 *
 * `intersects*` defer to the cheaper formulation: Box3 implements
 * sphere-box; Plane already has sphere-plane logic.
 */
class Sphere {
  constructor(center = new Vector3(), radius = 0) {
    this.center = center;
    this.radius = radius;
  }

  set(center, radius) { this.center.copy(center); this.radius = radius; return this; }

  /*
   * Build a sphere that contains every point in `points`. The centre
   * defaults to the AABB midpoint (a cheap superset of the true
   * minimum-enclosing centre — used by Geometry.computeBoundingSphere).
   * Radius is the max distance from the centre, ensuring containment.
   */
  setFromPoints(points, optionalCenter) {
    const box = this.V1 || new Box3();
    this.V1 = box;
    const center = this.center;
    if (undefined !== optionalCenter) center.copy(optionalCenter);
    else                              box.setFromPoints(points).getCenter(center);

    let maxRadiusSq = 0;
    for (let i = 0, il = points.length; i < il; i++) {
      maxRadiusSq = Math.max(maxRadiusSq, center.distanceToSquared(points[i]));
    }
    this.radius = Math.sqrt(maxRadiusSq);
    return this;
  }

  clone()       { return new this.constructor().copy(this); }
  copy(sphere)  { this.center.copy(sphere.center); this.radius = sphere.radius; return this; }
  empty()       { return this.radius <= 0; }

  containsPoint(point)     { return point.distanceToSquared(this.center) <= this.radius * this.radius; }
  distanceToPoint(point)   { return point.distanceTo(this.center) - this.radius; }

  intersectsSphere(sphere) {
    const radiusSum = this.radius + sphere.radius;
    return sphere.center.distanceToSquared(this.center) <= radiusSum * radiusSum;
  }
  intersectsBox(box)       { return box.intersectsSphere(this); }
  intersectsPlane(plane)   { return Math.abs(plane.distanceToPoint(this.center)) <= this.radius; }

  /*
   * Project `point` onto the closed ball — if it's already inside,
   * return it unchanged; otherwise pull it back to the surface along
   * the centre→point ray.
   */
  clampPoint(point, target = new Vector3()) {
    const deltaLengthSq = this.center.distanceToSquared(point);
    target.copy(point);
    if (deltaLengthSq > this.radius * this.radius) {
      target.sub(this.center).normalize();
      target.multiplyScalar(this.radius).add(this.center);
    }
    return target;
  }

  // Smallest axis-aligned box that contains the sphere.
  getBoundingBox(target = new Box3()) {
    target.set(this.center, this.center);
    target.expandByScalar(this.radius);
    return target;
  }

  // Move the centre, scale the radius. Non-uniform scale uses the
  // max axis-scale — always an upper bound on the true transformed
  // sphere, which is safe for culling.
  applyMatrix4(matrix) {
    this.center.applyMatrix4(matrix);
    this.radius = this.radius * matrix.getMaxScaleOnAxis();
    return this;
  }
  translate(offset) { this.center.add(offset); return this; }
  equals(sphere)    { return sphere.center.equals(this.center) && sphere.radius === this.radius; }
}

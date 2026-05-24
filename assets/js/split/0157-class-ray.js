/*
 * Ray — a half-line: a point `origin` plus a (unit) `direction`.
 * Used everywhere intersection / pick queries are needed: mouse
 * picking via RayManager, shadow-ray queries, AABB walks, etc.
 *
 * Convention: `direction` is expected to be normalised on the way in.
 * Most distance / intersect methods assume this.
 *
 * Methods break down into:
 *
 *   sampling: `at(t)`, `recast(t)`
 *   point queries: `closestPointToPoint`, `distanceToPoint`,
 *                  `distanceSqToPoint`, `distanceSqToSegment`
 *   shape intersects:
 *     `intersectSphere`/`intersectsSphere`,
 *     `intersectPlane` / `intersectsPlane` / `distanceToPlane`,
 *     `intersectBox`   / `intersectsBox`,
 *     `intersectsTriangle` (Möller–Trumbore).
 *   transforms: `applyMatrix4` (transforms origin by full matrix,
 *               direction by the matrix's rotation part).
 *
 * `V1`..`V4` are lazily-allocated scratch Vector3 slots reused across
 * calls so hot-path queries never trigger an allocation.
 */
class Ray {
  constructor(origin = new Vector3(), direction = new Vector3()) {
    this.origin    = origin;
    this.direction = direction;
  }

  set(origin, direction) { this.origin.copy(origin); this.direction.copy(direction); return this; }
  clone()      { return new Ray().copy(this); }
  copy(ray)    { this.origin.copy(ray.origin); this.direction.copy(ray.direction); return this; }

  // Sample the ray at parameter `t`: target = origin + t·direction.
  at(t, target = new Vector3()) {
    return target.copy(this.direction).multiplyScalar(t).add(this.origin);
  }

  // Re-orient the direction to point at `v`.
  lookAt(v) { this.direction.copy(v).sub(this.origin).normalize(); return this; }

  // Slide the origin forward along the direction by `t`.
  recast(t) {
    const v1 = this.V1 || new Vector3();
    this.V1 = v1;
    this.origin.copy(this.at(t, v1));
  }

  /*
   * Closest point on the ray to `point`. If `point` is behind the
   * ray's origin the foot of the perpendicular is "before" t=0, so we
   * return the origin instead (rays are half-infinite).
   */
  closestPointToPoint(point, target = new Vector3()) {
    target.subVectors(point, this.origin);
    const directionDistance = target.dot(this.direction);
    if (directionDistance < 0) return target.copy(this.origin);
    return target.copy(this.direction).multiplyScalar(directionDistance).add(this.origin);
  }

  distanceToPoint(point) { return Math.sqrt(this.distanceSqToPoint(point)); }

  // Squared distance — same logic as `closestPointToPoint` plus a
  // square at the end. Skip the sqrt when only doing comparisons.
  distanceSqToPoint(point) {
    const v1 = this.V1 || new Vector3();
    this.V1 = v1;
    const directionDistance = v1.subVectors(point, this.origin).dot(this.direction);
    if (directionDistance < 0) return this.origin.distanceToSquared(point);
    v1.copy(this.direction).multiplyScalar(directionDistance).add(this.origin);
    return v1.distanceToSquared(point);
  }

  /*
   * Distance² from the ray to the line *segment* (v0, v1). The math
   * follows Eberly's "Distance Between Two Rays/Segments" approach —
   * we parameterise both, solve the closed-form quadratic, then clamp
   * the segment parameter into [-segExtent, +segExtent] and the ray
   * parameter into [0, ∞).
   *
   * Optional `optionalPointOnRay` / `optionalPointOnSegment` outputs
   * receive the closest-point pair.
   */
  distanceSqToSegment(v0, v1, optionalPointOnRay, optionalPointOnSegment) {
    const segCenter = this.V1 || new Vector3();
    const segDir    = this.V2 || new Vector3();
    const diff      = this.V3 || new Vector3();
    this.V1 = segCenter; this.V2 = segDir; this.V3 = diff;

    segCenter.copy(v0).add(v1).multiplyScalar(0.5);
    segDir.copy(v1).sub(v0).normalize();
    diff.copy(this.origin).sub(segCenter);

    const segExtent = 0.5 * v0.distanceTo(v1);
    const a01 = -this.direction.dot(segDir);
    const b0  =  diff.dot(this.direction);
    const b1  = -diff.dot(segDir);
    const c   =  diff.lengthSq();
    const det = Math.abs(1 - a01 * a01);

    let s0, s1, sqrDist, extDet;
    if (det > 0) {
      s0     = a01 * b1 - b0;
      s1     = a01 * b0 - b1;
      extDet = segExtent * det;
      if (s0 >= 0) {
        if (s1 >= -extDet) {
          if (s1 <= extDet) {
            // Interior — both parameters lie within bounds.
            const invDet = 1 / det;
            s0 *= invDet;
            s1 *= invDet;
            sqrDist = s0 * (s0 + a01 * s1 + 2 * b0) + s1 * (a01 * s0 + s1 + 2 * b1) + c;
          } else {
            // Segment parameter clamped to +extent.
            s1 = segExtent;
            s0 = Math.max(0, -(a01 * s1 + b0));
            sqrDist = -s0 * s0 + s1 * (s1 + 2 * b1) + c;
          }
        } else {
          // Segment parameter clamped to -extent.
          s1 = -segExtent;
          s0 = Math.max(0, -(a01 * s1 + b0));
          sqrDist = -s0 * s0 + s1 * (s1 + 2 * b1) + c;
        }
      } else if (s1 <= -extDet) {
        s0 = Math.max(0, -(-a01 * segExtent + b0));
        s1 = s0 > 0 ? -segExtent : Math.min(Math.max(-segExtent, -b1), segExtent);
        sqrDist = -s0 * s0 + s1 * (s1 + 2 * b1) + c;
      } else if (s1 <= extDet) {
        s0 = 0;
        s1 = Math.min(Math.max(-segExtent, -b1), segExtent);
        sqrDist = s1 * (s1 + 2 * b1) + c;
      } else {
        s0 = Math.max(0, -(a01 * segExtent + b0));
        s1 = s0 > 0 ? segExtent : Math.min(Math.max(-segExtent, -b1), segExtent);
        sqrDist = -s0 * s0 + s1 * (s1 + 2 * b1) + c;
      }
    } else {
      // Parallel ray and segment — degenerate quadratic.
      s1 = a01 > 0 ? -segExtent : segExtent;
      s0 = Math.max(0, -(a01 * s1 + b0));
      sqrDist = -s0 * s0 + s1 * (s1 + 2 * b1) + c;
    }

    if (optionalPointOnRay)     optionalPointOnRay    .copy(this.direction).multiplyScalar(s0).add(this.origin);
    if (optionalPointOnSegment) optionalPointOnSegment.copy(segDir)        .multiplyScalar(s1).add(segCenter);
    return sqrDist;
  }

  /*
   * Ray-sphere intersection. Standard quadratic — project the
   * centre→origin offset onto the ray, compute the perpendicular
   * miss-distance², discard if larger than radius²; otherwise return
   * the nearer of the two roots (or the far root if the near one is
   * behind the origin).
   */
  intersectSphere(sphere, target) {
    const v1 = this.V1 || new Vector3();
    this.V1 = v1;
    v1.subVectors(sphere.center, this.origin);
    const tca     = v1.dot(this.direction);
    const d2      = v1.dot(v1) - tca * tca;
    const radius2 = sphere.radius * sphere.radius;
    if (d2 > radius2) return null;
    const thc = Math.sqrt(radius2 - d2);
    const t0  = tca - thc;
    const t1  = tca + thc;
    if (t0 < 0 && t1 < 0) return null;
    if (t0 < 0)           return this.at(t1, target);
    return this.at(t0, target);
  }
  intersectsSphere(sphere) {
    return this.distanceSqToPoint(sphere.center) <= sphere.radius * sphere.radius;
  }

  // Plane intersect: t-distance along ray, or null on miss /
  // wrong-direction.
  distanceToPlane(plane) {
    const denominator = plane.normal.dot(this.direction);
    if (0 === denominator) return 0 === plane.distanceToPoint(this.origin) ? 0 : null;
    const t = -(this.origin.dot(plane.normal) + plane.constant) / denominator;
    return t >= 0 ? t : null;
  }
  intersectPlane(plane, target) {
    const t = this.distanceToPlane(plane);
    return null === t ? null : this.at(t, target);
  }
  intersectsPlane(plane) {
    const distToPoint = plane.distanceToPoint(this.origin);
    return 0 === distToPoint || plane.normal.dot(this.direction) * distToPoint < 0;
  }

  /*
   * Slab-based AABB intersect. For each axis we compute tmin / tmax
   * with reversed sign-handling depending on the ray direction's
   * sign. NaN handling (`tmin != tmin`) covers the case where a
   * direction component is zero, in which case the slab degenerates
   * and we let the other slabs decide.
   */
  intersectBox(box, target) {
    const invdirx = 1 / this.direction.x;
    const invdiry = 1 / this.direction.y;
    const invdirz = 1 / this.direction.z;
    const origin  = this.origin;
    let tmin, tmax, tymin, tymax, tzmin, tzmax;

    if (invdirx >= 0) { tmin = (box.min.x - origin.x) * invdirx; tmax = (box.max.x - origin.x) * invdirx; }
    else              { tmin = (box.max.x - origin.x) * invdirx; tmax = (box.min.x - origin.x) * invdirx; }
    if (invdiry >= 0) { tymin = (box.min.y - origin.y) * invdiry; tymax = (box.max.y - origin.y) * invdiry; }
    else              { tymin = (box.max.y - origin.y) * invdiry; tymax = (box.min.y - origin.y) * invdiry; }

    if (tmin > tymax || tymin > tmax) return null;
    if (tymin > tmin || tmin != tmin) tmin = tymin;
    if (tymax < tmax || tmax != tmax) tmax = tymax;

    if (invdirz >= 0) { tzmin = (box.min.z - origin.z) * invdirz; tzmax = (box.max.z - origin.z) * invdirz; }
    else              { tzmin = (box.max.z - origin.z) * invdirz; tzmax = (box.min.z - origin.z) * invdirz; }

    if (tmin > tzmax || tzmin > tmax) return null;
    if (tzmin > tmin || tmin != tmin) tmin = tzmin;
    if (tzmax < tmax || tmax != tmax) tmax = tzmax;
    if (tmax < 0) return null;
    return this.at(tmin >= 0 ? tmin : tmax, target);
  }
  intersectsBox(box) {
    const v = this.V1 || new Vector3();
    this.V1 = v;
    return null !== this.intersectBox(box, v);
  }

  /*
   * Möller–Trumbore triangle intersect. `backfaceCulling=true` makes
   * back-facing triangles miss (used by mouse-picking against opaque
   * meshes). Returns the hit point or null.
   */
  intersectsTriangle(a, b, c, backfaceCulling, target) {
    const diff   = this.V1 || new Vector3();
    const edge1  = this.V2 || new Vector3();
    const edge2  = this.V3 || new Vector3();
    const normal = this.V4 || new Vector3();
    this.V1 = diff; this.V2 = edge1; this.V3 = edge2; this.V4 = normal;

    edge1.subVectors(b, a);
    edge2.subVectors(c, a);
    normal.crossVectors(edge1, edge2);

    let sign;
    let DdN = this.direction.dot(normal);
    if (DdN > 0) {
      if (backfaceCulling) return null;
      sign = 1;
    } else if (DdN < 0) {
      sign = -1;
      DdN  = -DdN;
    } else {
      return null;
    }

    diff.subVectors(this.origin, a);
    const DdQxE2 = sign * this.direction.dot(edge2.crossVectors(diff, edge2));
    if (DdQxE2 < 0) return null;
    const DdE1xQ = sign * this.direction.dot(edge1.cross(diff));
    if (DdE1xQ < 0) return null;
    if (DdQxE2 + DdE1xQ > DdN) return null;
    const QdN = -sign * diff.dot(normal);
    if (QdN < 0) return null;
    return this.at(QdN / DdN, target);
  }

  /*
   * Transform the ray by an affine matrix. The origin needs the full
   * 4×4 transform; the direction only needs the rotation/scale part
   * (`transformDirection` handles this without renormalising scale).
   */
  applyMatrix4(matrix4) {
    this.origin.applyMatrix4(matrix4);
    this.direction.transformDirection(matrix4);
    return this;
  }
  equals(ray) { return ray.origin.equals(this.origin) && ray.direction.equals(this.direction); }
}

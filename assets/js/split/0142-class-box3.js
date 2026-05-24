/*
 * Box3 — axis-aligned 3D bounding box.
 *
 * The 3D analogue of Box2 with the same inverted-infinity sentinel for
 * the empty state and the same family of construction / grow / query
 * methods. Used everywhere a coarse bound is needed: per-geometry
 * boundingBox, per-Group occlusion proxy, scene-graph diagnostics.
 *
 * Notable extras over the 2D case:
 *
 *   - `setFromArray(array)` / `setFromBufferAttribute(attribute)`
 *     scan a flat (x, y, z, x, y, z, …) buffer directly without
 *     materialising Vector3s.
 *
 *   - `expandByObject(object, local, onlyvisible)` walks a scene
 *     graph subtree and grows the box to cover every leaf geometry's
 *     position attribute, transformed by either the local matrix
 *     (local-space accumulation) or the world matrix (world-space).
 *     Skips gizmo nodes (`isGizmo`).
 *
 *   - `intersectsTriangle(triangle)` uses the Separating-Axis Theorem
 *     (SAT) over 13 axes: 9 cross products of triangle edges with
 *     box axes, the 3 box axes themselves, and the triangle normal.
 *     If *any* axis separates them, no intersection.
 *
 *   - `intersectsPlane(plane)` projects the box onto the plane's
 *     normal — picking the box corner closest to / furthest from the
 *     plane based on the sign of each normal component — and tests
 *     whether the resulting interval straddles `plane.constant`.
 *
 *   - `applyMatrix4(m)` transforms the box's 8 corners through `m`
 *     and re-builds the AABB from min/max — but does it in 3 axis-
 *     decomposed passes that avoid materialising all 8 points.
 *
 *   - `getBoundingSphere` derives the smallest enclosing sphere from
 *     the box (centre + half-diagonal length).
 */
class Box3 {
  constructor(_min, max) {
    this.min = undefined !== _min ? _min : new Vector3( Infinity,  Infinity,  Infinity);
    this.max = undefined !== max  ? max  : new Vector3(-Infinity, -Infinity, -Infinity);
  }

  set(min, max) { this.min.copy(min); this.max.copy(max); return this; }

  // Flat (x,y,z, ...) scan — used by Geometry.computeBoundingBox.
  setFromArray(array) {
    let minX =  Infinity, minY =  Infinity, minZ =  Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0, l = array.length; i < l; i += 3) {
      const x = array[i], y = array[i + 1], z = array[i + 2];
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (z < minZ) minZ = z;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (z > maxZ) maxZ = z;
    }
    this.min.set(minX, minY, minZ);
    this.max.set(maxX, maxY, maxZ);
    return this;
  }

  setFromBufferAttribute(attribute) {
    let minX =  Infinity, minY =  Infinity, minZ =  Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0, l = attribute.count; i < l; i++) {
      const x = attribute.array[3 * i + 0];
      const y = attribute.array[3 * i + 1];
      const z = attribute.array[3 * i + 2];
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (z < minZ) minZ = z;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (z > maxZ) maxZ = z;
    }
    this.min.set(minX, minY, minZ);
    this.max.set(maxX, maxY, maxZ);
    return this;
  }

  setFromPoints(points) {
    this.makeEmpty();
    for (let i = 0, il = points.length; i < il; i++) this.expandByPoint(points[i]);
    return this;
  }
  setFromCenterAndSize(center, size) {
    const v1 = this.V1 || new Vector3();
    this.V1 = v1;
    const halfSize = v1.copy(size).multiplyScalar(0.5);
    this.min.copy(center).sub(halfSize);
    this.max.copy(center).add(halfSize);
    return this;
  }
  setFromObject(object) { this.makeEmpty(); return this.expandByObject(object); }
  clone()    { return new Box3().copy(this); }
  copy(box)  { this.min.copy(box.min); this.max.copy(box.max); return this; }

  makeEmpty() {
    this.min.x = this.min.y = this.min.z =  Infinity;
    this.max.x = this.max.y = this.max.z = -Infinity;
    return this;
  }
  isEmpty() { return this.max.x < this.min.x || this.max.y < this.min.y || this.max.z < this.min.z; }

  getCenter(target) {
    return this.isEmpty()
      ? target.set(0, 0, 0)
      : target.addVectors(this.min, this.max).multiplyScalar(0.5);
  }
  getSize(target) {
    return this.isEmpty() ? target.set(0, 0, 0) : target.subVectors(this.max, this.min);
  }

  expandByPoint(point)   { this.min.min(point); this.max.max(point); return this; }
  expandByVector(vector) { this.min.sub(vector); this.max.add(vector); return this; }
  expandByScalar(scalar) { this.min.addScalar(-scalar); this.max.addScalar(scalar); return this; }

  /*
   * Walk a subtree and grow the box to cover every leaf geometry's
   * positions. `local` chooses local-vs-world transform; `onlyvisible`
   * filters hidden nodes. Always skips `isGizmo` nodes (editor
   * helpers shouldn't contribute to scene bounds).
   */
  expandByObject(object, local, onlyvisible) {
    const v1 = this.V1 || new Vector3();
    this.V1 = v1;
    const scope = this;
    object.updateMatrixWorld(true);
    object.traverse((node) => {
      if (onlyvisible && !node.visible) return;
      if (node.isGizmo) return;
      const geometry = node.geometry;
      if (!geometry) return;
      const attribute = geometry.attributes.position;
      if (undefined === attribute) return;
      for (let i = 0, l = attribute.count; i < l; i++) {
        v1.fromBufferAttribute(attribute, i).applyMatrix4(local ? node.matrix : node.matrixWorld);
        scope.expandByPoint(v1);
      }
    });
    return this;
  }

  containsPoint(point) {
    return !(point.x < this.min.x || point.x > this.max.x ||
             point.y < this.min.y || point.y > this.max.y ||
             point.z < this.min.z || point.z > this.max.z);
  }
  containsBox(box) {
    return this.min.x <= box.min.x && box.max.x <= this.max.x &&
           this.min.y <= box.min.y && box.max.y <= this.max.y &&
           this.min.z <= box.min.z && box.max.z <= this.max.z;
  }

  getParameter(point, target) {
    return target.set(
      (point.x - this.min.x) / (this.max.x - this.min.x),
      (point.y - this.min.y) / (this.max.y - this.min.y),
      (point.z - this.min.z) / (this.max.z - this.min.z),
    );
  }

  intersectsBox(box) {
    return !(box.max.x < this.min.x || box.min.x > this.max.x ||
             box.max.y < this.min.y || box.min.y > this.max.y ||
             box.max.z < this.min.z || box.min.z > this.max.z);
  }

  // Box-vs-sphere: find the box's closest point to the sphere centre,
  // compare distance² against radius².
  intersectsSphere(sphere) {
    const closestPoint = this.V1 || new Vector3();
    this.V1 = closestPoint;
    this.clampPoint(sphere.center, closestPoint);
    return closestPoint.distanceToSquared(sphere.center) <= sphere.radius * sphere.radius;
  }

  // Box-vs-plane: project the box onto plane.normal — pick the min/
  // max corner per axis based on the normal's sign — and test whether
  // the resulting interval straddles plane.constant.
  intersectsPlane(plane) {
    let min, max;
    if (plane.normal.x > 0) { min = plane.normal.x * this.min.x; max = plane.normal.x * this.max.x; }
    else                    { min = plane.normal.x * this.max.x; max = plane.normal.x * this.min.x; }
    if (plane.normal.y > 0) { min += plane.normal.y * this.min.y; max += plane.normal.y * this.max.y; }
    else                    { min += plane.normal.y * this.max.y; max += plane.normal.y * this.min.y; }
    if (plane.normal.z > 0) { min += plane.normal.z * this.min.z; max += plane.normal.z * this.max.z; }
    else                    { min += plane.normal.z * this.max.z; max += plane.normal.z * this.min.z; }
    return min <= plane.constant && max >= plane.constant;
  }

  /*
   * Box-vs-triangle via SAT over 13 axes:
   *   - 9 axes: cross-products of each triangle edge (f0/f1/f2) with
   *     each box axis (X/Y/Z).
   *   - 3 axes: the box's own axes.
   *   - 1 axis: the triangle's normal.
   * If any axis separates the projections of the box (using extents)
   * and the triangle (using its three vertices), they don't overlap.
   */
  intersectsTriangle(triangle) {
    const v0 = this.V0 || new Vector3(); this.V0 = v0;
    const v1 = this.V1 || new Vector3(); this.V1 = v1;
    const v2 = this.V2 || new Vector3(); this.V2 = v2;
    const f0 = this.F0 || new Vector3(); this.F0 = f0;
    const f1 = this.F1 || new Vector3(); this.F1 = f1;
    const f2 = this.F2 || new Vector3(); this.F2 = f2;
    const testAxis       = this.V3 || new Vector3(); this.V3 = testAxis;
    const center         = this.V4 || new Vector3(); this.V4 = center;
    const extents        = this.V5 || new Vector3(); this.V5 = extents;
    const triangleNormal = this.V6 || new Vector3(); this.V6 = triangleNormal;

    function satForAxes(axes) {
      for (let i = 0, j = axes.length - 3; i <= j; i += 3) {
        testAxis.fromArray(axes, i);
        const r = extents.x * Math.abs(testAxis.x) +
                  extents.y * Math.abs(testAxis.y) +
                  extents.z * Math.abs(testAxis.z);
        const p0 = v0.dot(testAxis);
        const p1 = v1.dot(testAxis);
        const p2 = v2.dot(testAxis);
        if (Math.max(-Math.max(p0, p1, p2), Math.min(p0, p1, p2)) > r) return false;
      }
      return true;
    }

    if (this.isEmpty()) return false;
    this.getCenter(center);
    extents.subVectors(this.max, center);
    v0.subVectors(triangle.a, center);
    v1.subVectors(triangle.b, center);
    v2.subVectors(triangle.c, center);
    f0.subVectors(v1, v0);
    f1.subVectors(v2, v1);
    f2.subVectors(v0, v2);

    // 9 cross-product axes (edge × box-axis).
    let axes = [
      0,    -f0.z,  f0.y,   0,    -f1.z,  f1.y,   0,    -f2.z,  f2.y,
      f0.z,  0,    -f0.x,   f1.z,  0,    -f1.x,   f2.z,  0,    -f2.x,
     -f0.y,  f0.x,  0,     -f1.y,  f1.x,  0,     -f2.y,  f2.x,  0,
    ];
    if (!satForAxes(axes)) return false;

    // 3 box axes.
    axes = [1, 0, 0,   0, 1, 0,   0, 0, 1];
    if (!satForAxes(axes)) return false;

    // 1 triangle normal.
    triangleNormal.crossVectors(f0, f1);
    axes = [triangleNormal.x, triangleNormal.y, triangleNormal.z];
    return satForAxes(axes);
  }

  clampPoint(point, target) { return target.copy(point).clamp(this.min, this.max); }
  distanceToPoint(point) {
    const v1 = this.V1 || new Vector3();
    this.V1 = v1;
    return v1.copy(point).clamp(this.min, this.max).sub(point).length();
  }

  // Smallest sphere enclosing the box (centre + half-diagonal).
  getBoundingSphere(target = new Sphere()) {
    const v1 = this.V1 || new Vector3();
    this.V1 = v1;
    this.getCenter(target.center);
    target.radius = 0.5 * this.getSize(v1).length();
    return target;
  }

  intersect(box) {
    this.min.max(box.min);
    this.max.min(box.max);
    if (this.isEmpty()) this.makeEmpty();
    return this;
  }
  union(box) { this.min.min(box.min); this.max.max(box.max); return this; }

  /*
   * Transform the box by an affine matrix. Each output extent is the
   * sum, per axis, of the min/max of the row-decomposed contributions
   * from each input axis. This is the standard "8-corner AABB" trick
   * expressed without materialising all 8 corners.
   */
  applyMatrix4(matrix) {
    if (this.isEmpty()) return this;
    const m = matrix.elements;
    const xax = m[0] * this.min.x, xay = m[1] * this.min.x, xaz = m[2]  * this.min.x;
    const xbx = m[0] * this.max.x, xby = m[1] * this.max.x, xbz = m[2]  * this.max.x;
    const yax = m[4] * this.min.y, yay = m[5] * this.min.y, yaz = m[6]  * this.min.y;
    const ybx = m[4] * this.max.y, yby = m[5] * this.max.y, ybz = m[6]  * this.max.y;
    const zax = m[8] * this.min.z, zay = m[9] * this.min.z, zaz = m[10] * this.min.z;
    const zbx = m[8] * this.max.z, zby = m[9] * this.max.z, zbz = m[10] * this.max.z;
    this.min.x = Math.min(xax, xbx) + Math.min(yax, ybx) + Math.min(zax, zbx) + m[12];
    this.min.y = Math.min(xay, xby) + Math.min(yay, yby) + Math.min(zay, zby) + m[13];
    this.min.z = Math.min(xaz, xbz) + Math.min(yaz, ybz) + Math.min(zaz, zbz) + m[14];
    this.max.x = Math.max(xax, xbx) + Math.max(yax, ybx) + Math.max(zax, zbx) + m[12];
    this.max.y = Math.max(xay, xby) + Math.max(yay, yby) + Math.max(zay, zby) + m[13];
    this.max.z = Math.max(xaz, xbz) + Math.max(yaz, ybz) + Math.max(zaz, zbz) + m[14];
    return this;
  }
  translate(offset) { this.min.add(offset); this.max.add(offset); return this; }
  equals(box)       { return box.min.equals(this.min) && box.max.equals(this.max); }
}

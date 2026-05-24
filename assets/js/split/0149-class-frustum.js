/*
 * Frustum — six clipping planes describing a camera's view volume.
 *
 * Plane order (matches setFromMatrix's column extraction):
 *   [0] right, [1] left, [2] bottom, [3] top, [4] far, [5] near.
 *
 * Each plane is stored with its outward-pointing normal, so a point is
 * inside the frustum when every plane's `distanceToPoint(p) ≥ 0`. Used
 * for frustum culling — the renderer walks scene-graph leaves, builds
 * a bounding sphere per mesh, and tests it against the camera frustum
 * before issuing the draw.
 *
 * `setFromMatrix` extracts the planes from a projection×view matrix
 * (Gribb-Hartmann method): given M = P·V, the i-th column gives the
 * i-th plane equation. The normals are then `normalize`d in-place.
 *
 * `intersectsSphere` returns a tri-state when `setAsBoolean=false`:
 *   -1 = sphere is fully outside,
 *    0 = sphere straddles one or more planes,
 *    1 = sphere is fully inside.
 *
 * `intersectsBox` runs the standard AABB-vs-plane test using the
 * positive/negative vertex pair (the box corners furthest along and
 * against each plane's normal): if both are below the plane the box
 * is fully outside.
 *
 * `M1`, `S1`, `V1`, `V2` are lazy scratch fields used by hot-path
 * methods to avoid per-call allocations.
 */
class Frustum {
  constructor(p0, p1, p2, p3, p4, p5) {
    this.planes = [
      undefined !== p0 ? p0 : new Plane(),
      undefined !== p1 ? p1 : new Plane(),
      undefined !== p2 ? p2 : new Plane(),
      undefined !== p3 ? p3 : new Plane(),
      undefined !== p4 ? p4 : new Plane(),
      undefined !== p5 ? p5 : new Plane(),
    ];
  }

  set(p0, p1, p2, p3, p4, p5) {
    const planes = this.planes;
    planes[0].copy(p0); planes[1].copy(p1); planes[2].copy(p2);
    planes[3].copy(p3); planes[4].copy(p4); planes[5].copy(p5);
    return this;
  }
  clone()        { return new Frustum().copy(this); }
  copy(frustum)  {
    const planes = this.planes;
    for (let i = 0; i < 6; i++) planes[i].copy(frustum.planes[i]);
    return this;
  }

  /*
   * Gribb-Hartmann plane extraction from a 4×4 column-major matrix.
   * Each plane's (A, B, C, D) is a linear combination of two matrix
   * columns; normalize() at the end converts to unit normals.
   */
  setFromMatrix(m) {
    const planes = this.planes;
    const me  = m.elements;
    const me0 = me[0], me1 = me[1], me2 = me[2], me3 = me[3];
    const me4 = me[4], me5 = me[5], me6 = me[6], me7 = me[7];
    const me8 = me[8], me9 = me[9], me10 = me[10], me11 = me[11];
    const me12 = me[12], me13 = me[13], me14 = me[14], me15 = me[15];

    planes[0].setComponents(me3 - me0, me7 - me4, me11 - me8,  me15 - me12).normalize(); // right
    planes[1].setComponents(me3 + me0, me7 + me4, me11 + me8,  me15 + me12).normalize(); // left
    planes[2].setComponents(me3 + me1, me7 + me5, me11 + me9,  me15 + me13).normalize(); // bottom
    planes[3].setComponents(me3 - me1, me7 - me5, me11 - me9,  me15 - me13).normalize(); // top
    planes[4].setComponents(me3 - me2, me7 - me6, me11 - me10, me15 - me14).normalize(); // far
    planes[5].setComponents(me3 + me2, me7 + me6, me11 + me10, me15 + me14).normalize(); // near
    return this;
  }

  // Combine a camera's projection × world-inverse and feed it through.
  setFromCamera(camera) {
    const matrix = this.M1 || new Matrix4();
    this.M1 = matrix;
    matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    return this.setFromMatrix(matrix);
  }

  /*
   * Test an object's bounding sphere (lazily computed on its geometry,
   * then transformed by the object's world matrix) against the frustum.
   */
  intersectsObject(object, setAsBoolean = true) {
    const sphere = this.S1 || new Sphere();
    this.S1 = sphere;
    const geometry = object.geometry;
    if (!geometry) return false;
    if (null === geometry.boundingSphere) geometry.computeBoundingSphere();
    sphere.copy(geometry.boundingSphere).applyMatrix4(object.matrixWorld);
    return this.intersectsSphere(sphere, setAsBoolean);
  }

  /*
   * Sphere-vs-frustum. The tri-state form returns:
   *    1 — fully inside (all six planes report distance ≥ 0)
   *    0 — straddling
   *   -1 — fully outside
   * The boolean form just bails out on the first plane that fully
   * excludes the sphere.
   */
  intersectsSphere(sphere, setAsBoolean = true) {
    const planes    = this.planes;
    const center    = sphere.center;
    const negRadius = -sphere.radius;
    let insides = 0;
    for (let i = 0; i < 6; i++) {
      const distance = planes[i].distanceToPoint(center);
      if (distance < negRadius) return !setAsBoolean && -1;
      if (!setAsBoolean && distance >= 0) insides++;
    }
    return !!setAsBoolean || (6 === insides ? 1 : 0);
  }

  /*
   * AABB vs frustum using the positive/negative-vertex trick: for
   * each plane, build the box corner furthest along the normal (p1)
   * and furthest against it (p2); if both are below the plane the
   * box is fully outside.
   */
  intersectsBox(box) {
    const p1 = this.V1 || new Vector3();
    const p2 = this.V2 || new Vector3();
    this.V1 = p1;
    this.V2 = p2;
    const planes = this.planes;
    for (let i = 0; i < 6; i++) {
      const plane = planes[i];
      p1.x = plane.normal.x > 0 ? box.min.x : box.max.x;
      p2.x = plane.normal.x > 0 ? box.max.x : box.min.x;
      p1.y = plane.normal.y > 0 ? box.min.y : box.max.y;
      p2.y = plane.normal.y > 0 ? box.max.y : box.min.y;
      p1.z = plane.normal.z > 0 ? box.min.z : box.max.z;
      p2.z = plane.normal.z > 0 ? box.max.z : box.min.z;
      const d1 = plane.distanceToPoint(p1);
      const d2 = plane.distanceToPoint(p2);
      if (d1 < 0 && d2 < 0) return false;
    }
    return true;
  }

  containsPoint(point) {
    const planes = this.planes;
    for (let i = 0; i < 6; i++) if (planes[i].distanceToPoint(point) < 0) return false;
    return true;
  }
}

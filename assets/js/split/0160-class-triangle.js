/*
 * Triangle — three points in 3D plus convenience geometry queries.
 *
 * The static helpers `Triangle.getNormal`, `Triangle.getBarycoord`,
 * and `Triangle.containsPoint` live elsewhere — this instance API
 * forwards to them with `(this.a, this.b, this.c)`.
 *
 *   `getArea`     — 0.5 * |(c-b) × (a-b)|.
 *   `getMidpoint` — centroid (a+b+c)/3.
 *   `getNormal`   — outward face normal via cross product, normalised.
 *   `getPlane`    — fits a Plane through the three points.
 *   `getBarycoord(point, target)` — express `point` in barycentric
 *                   coords on the triangle.
 *   `containsPoint(point)`        — point-in-triangle test.
 *   `intersectsBox(box)`          — delegates to Box3.intersectsTriangle
 *                                   (the SAT-based test there).
 *
 * `V0`/`V1` are lazy scratch Vector3s used by `getArea`.
 */
class Triangle {
  constructor(a = new Vector3(), b = new Vector3(), c = new Vector3()) {
    this.a = a;
    this.b = b;
    this.c = c;
  }

  set(a, b, c) { this.a.copy(a); this.b.copy(b); this.c.copy(c); return this; }

  // Read three vertices out of a flat point array by index.
  setFromPointsAndIndices(points, i0, i1, i2) {
    this.a.copy(points[i0]);
    this.b.copy(points[i1]);
    this.c.copy(points[i2]);
    return this;
  }

  clone()         { return new Triangle().copy(this); }
  copy(triangle)  { this.a.copy(triangle.a); this.b.copy(triangle.b); this.c.copy(triangle.c); return this; }

  /*
   * Area via the cross-product magnitude formula:
   *   2 * area = |(c - b) × (a - b)|
   */
  getArea() {
    const v0 = this.V0 || new Vector3();
    const v1 = this.V1 || new Vector3();
    this.V0 = v0; this.V1 = v1;
    v0.subVectors(this.c, this.b);
    v1.subVectors(this.a, this.b);
    return 0.5 * v0.cross(v1).length();
  }

  getMidpoint(target = new Vector3()) {
    return target.addVectors(this.a, this.b).add(this.c).multiplyScalar(1 / 3);
  }
  getNormal(target)            { return Triangle.getNormal(this.a, this.b, this.c, target); }
  getPlane(target = new Vector3()) {
    return target.setFromCoplanarPoints(this.a, this.b, this.c);
  }
  getBarycoord(point, target)  { return Triangle.getBarycoord(point, this.a, this.b, this.c, target); }
  containsPoint(point)         { return Triangle.containsPoint(point, this.a, this.b, this.c); }
  intersectsBox(box)           { return box.intersectsTriangle(this); }
  equals(triangle) {
    return triangle.a.equals(this.a) && triangle.b.equals(this.b) && triangle.c.equals(this.c);
  }
}

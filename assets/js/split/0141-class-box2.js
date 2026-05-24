/*
 * Box2 — axis-aligned 2D bounding box.
 *
 * Defaults to the "inverted-infinity" empty state (min = +∞, max = -∞)
 * so the first `expandByPoint` always grows the box from nothing.
 * `isEmpty` detects this state via `max < min`.
 *
 *   set / setFromPoints / setFromCenterAndSize  — construction.
 *   getCenter / getSize                          — derived properties.
 *   expandByPoint / Vector / Scalar              — grow operations.
 *   containsPoint / containsBox                   — inclusion tests.
 *   intersectsBox                                  — fast overlap test
 *                                                    (separated-axis on
 *                                                    each axis pair).
 *   clampPoint / distanceToPoint                   — point queries.
 *   intersect / union                              — box arithmetic.
 *   translate / equals                             — utility.
 *
 * `V1` is a lazy scratch Vector2 used by `setFromCenterAndSize`.
 */
class Box2 {
  constructor(min, max) {
    this.min = undefined !== min ? min : new Vector2( Infinity,  Infinity);
    this.max = undefined !== max ? max : new Vector2(-Infinity, -Infinity);
  }

  set(min, max) { this.min.copy(min); this.max.copy(max); return this; }

  // Grow from empty until every point is contained.
  setFromPoints(points) {
    this.makeEmpty();
    for (let i = 0, il = points.length; i < il; i++) this.expandByPoint(points[i]);
    return this;
  }

  // Centre + extents form.
  setFromCenterAndSize(center, size) {
    const v1 = this.V1 || new Vector2();
    this.V1 = v1;
    const halfSize = v1.copy(size).multiplyScalar(0.5);
    this.min.copy(center).sub(halfSize);
    this.max.copy(center).add(halfSize);
    return this;
  }

  clone()    { return new Box2().copy(this); }
  copy(box)  { this.min.copy(box.min); this.max.copy(box.max); return this; }

  // Reset to the inverted-infinity sentinel.
  makeEmpty() { this.min.x = this.min.y =  Infinity; this.max.x = this.max.y = -Infinity; return this; }
  isEmpty()   { return this.max.x < this.min.x || this.max.y < this.min.y; }

  getCenter(target) {
    return this.isEmpty() ? target.set(0, 0) : target.addVectors(this.min, this.max).multiplyScalar(0.5);
  }
  getSize(target) {
    return this.isEmpty() ? target.set(0, 0) : target.subVectors(this.max, this.min);
  }

  expandByPoint(point)   { this.min.min(point); this.max.max(point); return this; }
  expandByVector(vector) { this.min.sub(vector); this.max.add(vector); return this; }
  expandByScalar(scalar) { this.min.addScalar(-scalar); this.max.addScalar(scalar); return this; }

  containsPoint(point) {
    return !(point.x < this.min.x || point.x > this.max.x ||
             point.y < this.min.y || point.y > this.max.y);
  }
  containsBox(box) {
    return this.min.x <= box.min.x && box.max.x <= this.max.x &&
           this.min.y <= box.min.y && box.max.y <= this.max.y;
  }

  // Local 0..1 parameter coordinates inside the box.
  getParameter(point, target) {
    return target.set(
      (point.x - this.min.x) / (this.max.x - this.min.x),
      (point.y - this.min.y) / (this.max.y - this.min.y),
    );
  }

  // Separated-axis test: any axis where the projections don't overlap
  // rules out intersection.
  intersectsBox(box) {
    return !(box.max.x < this.min.x || box.min.x > this.max.x ||
             box.max.y < this.min.y || box.min.y > this.max.y);
  }

  clampPoint(point, target) { return target.copy(point).clamp(this.min, this.max); }
  distanceToPoint(point) {
    const v1 = this.V1 || new Vector2();
    this.V1 = v1;
    return v1.copy(point).clamp(this.min, this.max).sub(point).length();
  }

  // In-place intersection (smallest box containing both regions of overlap).
  intersect(box) { this.min.max(box.min); this.max.min(box.max); return this; }
  // In-place union (smallest box containing both boxes).
  union(box)     { this.min.min(box.min); this.max.max(box.max); return this; }
  translate(offset) { this.min.add(offset); this.max.add(offset); return this; }
  equals(box)       { return box.min.equals(this.min) && box.max.equals(this.max); }
}

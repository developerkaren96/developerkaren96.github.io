/*
 * Line3 — a finite line segment from `start` to `end` in 3D.
 *
 *   `delta`     vector end − start.
 *   `at(t)`     sample at parameter t ∈ [0, 1] (origin at start).
 *   `closestPointToPointParameter(p, clamp)`
 *               t value of the foot of the perpendicular from `p`;
 *               clamped into [0, 1] when `clamp=true`.
 *   `closestPointToPoint(p, clamp, target)`
 *               actually evaluates `at(t)` for that parameter.
 *
 * `V1`/`V2` are lazy scratch Vector3s used by the closest-point
 * helper.
 */
class Line3 {
  constructor(start = new Vector3(), end = new Vector3()) {
    this.start = start;
    this.end   = end;
  }

  set(start, end) { this.start.copy(start); this.end.copy(end); return this; }
  clone()         { return new this.constructor().copy(this); }
  copy(line)      { this.start.copy(line.start); this.end.copy(line.end); return this; }

  getCenter(target = new Vector3()) { return target.addVectors(this.start, this.end).multiplyScalar(0.5); }
  delta(target = new Vector3())     { return target.subVectors(this.end, this.start); }

  distanceSq() { return this.start.distanceToSquared(this.end); }
  distance()   { return this.start.distanceTo(this.end); }

  at(t, target = new Vector3()) {
    return this.delta(target).multiplyScalar(t).add(this.start);
  }

  /*
   * Parameter t for the foot of the perpendicular from `point`. The
   * projection formula is t = ((p - start) · (end - start)) /
   * |end - start|². With `clampToLine`, t is clamped into [0, 1] so
   * the result is on the segment rather than its infinite extension.
   */
  closestPointToPointParameter(point, clampToLine) {
    const startP   = this.V1 || new Vector3();
    const startEnd = this.V2 || new Vector3();
    this.V1 = startP; this.V2 = startEnd;
    startP  .subVectors(point,    this.start);
    startEnd.subVectors(this.end, this.start);
    const startEnd2 = startEnd.dot(startEnd);
    let   t         = startEnd.dot(startP) / startEnd2;
    if (clampToLine) t = Math.clamp(t, 0, 1);
    return t;
  }

  closestPointToPoint(point, clampToLine, target = new Vector3()) {
    const t = this.closestPointToPointParameter(point, clampToLine);
    return this.delta(target).multiplyScalar(t).add(this.start);
  }

  applyMatrix4(matrix) { this.start.applyMatrix4(matrix); this.end.applyMatrix4(matrix); return this; }
  equals(line)         { return line.start.equals(this.start) && line.end.equals(this.end); }
}

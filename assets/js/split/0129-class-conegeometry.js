/*
 * ConeGeometry — a CylinderGeometry with `radiusTop = 0`. All the
 * tessellation, capping, and slanted-side-normal logic lives in
 * CylinderGeometry; this is just a convenience constructor.
 */
class ConeGeometry extends CylinderGeometry {
  constructor(radius, height, radialSegments, heightSegments, openEnded, thetaStart, thetaLength) {
    super(0, radius, height, radialSegments, heightSegments, openEnded, thetaStart, thetaLength);
  }
}

/*
 * RingGeometry — a flat annulus in the XY plane.
 *
 *   innerRadius, outerRadius   the two radii bounding the ring.
 *   thetaSegments              tessellation around the ring.
 *   phiSegments                radial tessellation (1 = single ring of
 *                              quads, >1 = concentric rings).
 *   thetaStart, thetaLength    angular start + sweep (radians).
 *
 * Vertices laid out as a `(phiSegments+1) × (thetaSegments+1)` grid;
 * row j is on the circle of radius `innerRadius + j * radiusStep`.
 * Faces stitch each grid quad into two triangles using the same
 * (a,b,d) + (b,c,d) pattern as PlaneGeometry.
 *
 * Normals are all +Z (single-sided ring).
 *
 * UVs map each vertex into the [0,1]² box centred at (0.5, 0.5) using
 * the outer radius as the normalisation factor, the same convention as
 * CircleGeometry.
 */
class RingGeometry extends Geometry {
  constructor(
    innerRadius   = 0.5,
    outerRadius   = 1,
    thetaSegments = 8,
    phiSegments   = 1,
    thetaStart    = 0,
    thetaLength   = 2 * Math.PI,
  ) {
    super();

    const indices  = [];
    const vertices = [];
    const normals  = [];
    const uvs      = [];
    const vertex   = new Vector3();
    const uv       = new Vector2();
    const radiusStep = (outerRadius - innerRadius) / phiSegments;
    let   radius   = innerRadius;
    let   segment;

    // Concentric vertex rings.
    for (let j = 0; j <= phiSegments; j++) {
      for (let i = 0; i <= thetaSegments; i++) {
        segment = thetaStart + (i / thetaSegments) * thetaLength;
        vertex.x = radius * Math.cos(segment);
        vertex.y = radius * Math.sin(segment);
        vertices.push(vertex.x, vertex.y, vertex.z);
        normals.push(0, 0, 1);
        uv.x = (vertex.x / outerRadius + 1) / 2;
        uv.y = (vertex.y / outerRadius + 1) / 2;
        uvs.push(uv.x, uv.y);
      }
      radius += radiusStep;
    }

    // Stitch each concentric-quad into two triangles.
    for (let j = 0; j < phiSegments; j++) {
      const thetaSegmentLevel = j * (thetaSegments + 1);
      for (let i = 0; i < thetaSegments; i++) {
        segment = i + thetaSegmentLevel;
        const a = segment;
        const b = segment + thetaSegments + 1;
        const c = segment + thetaSegments + 2;
        const d = segment + 1;
        indices.push(a, b, d);
        indices.push(b, c, d);
      }
    }

    this.index = new (Geometry.arrayNeedsUint32(indices) ? Uint32Array : Uint16Array)(indices);
    this.addAttribute('position', new GeometryAttribute(new Float32Array(vertices), 3));
    this.addAttribute('normal',   new GeometryAttribute(new Float32Array(normals),  3));
    this.addAttribute('uv',       new GeometryAttribute(new Float32Array(uvs),      2));
  }
}

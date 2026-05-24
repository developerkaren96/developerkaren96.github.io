/*
 * TorusKnotGeometry — extruded tube swept along a (p, q) torus knot.
 *
 *   radius            radius of the curve in the XY plane.
 *   tube              radius of the cross-section circle.
 *   tubularSegments   sampling along the curve.
 *   radialSegments    sampling around the cross-section.
 *   p                 number of windings around the torus axis.
 *   q                 number of windings around the tube axis.
 *
 * The (p, q) knot is built by sampling
 *   x = radius·(2 + cos(qu/p))·cos(u)·0.5
 *   y = radius·(2 + cos(qu/p))·sin(u)·0.5
 *   z = radius·sin(qu/p)·0.5
 * along u ∈ [0, 2π·p]. At each sample we estimate a Frenet-style
 * frame by central difference (P1 = γ(u), P2 = γ(u+δ)):
 *
 *   T = P2 − P1     (tangent — direction of travel)
 *   N = P2 + P1     (a rough "centre-pointing" vector — used only as
 *                    the seed for the next cross product)
 *   B = T × N
 *   N = B × T
 *
 * (The two cross products promote (T, N, B) into an orthonormal
 * triple; N's initial value cancels in the second cross.)
 *
 * For each tubular sample we lay down `radialSegments+1` vertices
 * around the circle in the (N, B) plane at radius `tube`. The vertex
 * normal is the displacement from the centre `P1`. UVs are simple
 * grid coordinates (i/tubular, j/radial).
 *
 * Faces stitch the (tubular × radial) grid into quads the usual way,
 * starting at `j == 1`/`i == 1` so the strip wraps closed cleanly.
 */
class TorusKnotGeometry extends Geometry {
  constructor(radius = 1, tube = 0.4, tubularSegments = 64, radialSegments = 8, p = 2, q = 3) {
    super();

    const indices  = [];
    const vertices = [];
    const normals  = [];
    const uvs      = [];

    const vertex = new Vector3();
    const normal = new Vector3();
    const P1     = new Vector3();
    const P2     = new Vector3();
    const B      = new Vector3();
    const T      = new Vector3();
    const N      = new Vector3();

    function calculatePositionOnCurve(u, p, q, radius, position) {
      const cu       = Math.cos(u);
      const su       = Math.sin(u);
      const quOverP  = (q / p) * u;
      const cs       = Math.cos(quOverP);
      position.x = radius * (2 + cs) * 0.5 * cu;
      position.y = radius * (2 + cs) * su  * 0.5;
      position.z = radius * Math.sin(quOverP) * 0.5;
    }

    // Sweep the cross-section along the curve.
    for (let i = 0; i <= tubularSegments; ++i) {
      const u = (i / tubularSegments) * p * Math.PI * 2;

      calculatePositionOnCurve(u,        p, q, radius, P1);
      calculatePositionOnCurve(u + 0.01, p, q, radius, P2);

      T.subVectors(P2, P1);                  // tangent
      N.addVectors(P2, P1);                  // seed for binormal cross
      B.crossVectors(T, N);                  // binormal
      N.crossVectors(B, T);                  // orthonormal normal
      B.normalize();
      N.normalize();

      for (let j = 0; j <= radialSegments; ++j) {
        const v  = (j / radialSegments) * Math.PI * 2;
        const cx = -tube * Math.cos(v);
        const cy =  tube * Math.sin(v);

        vertex.x = P1.x + (cx * N.x + cy * B.x);
        vertex.y = P1.y + (cx * N.y + cy * B.y);
        vertex.z = P1.z + (cx * N.z + cy * B.z);
        vertices.push(vertex.x, vertex.y, vertex.z);

        // Vertex normal = direction from curve centre to vertex.
        normal.subVectors(vertex, P1).normalize();
        normals.push(normal.x, normal.y, normal.z);

        uvs.push(i / tubularSegments);
        uvs.push(j / radialSegments);
      }
    }

    // Stitch quads. Starting at j=1/i=1 means a "ahead" lookup of
    // (j-1, i-1) is always valid.
    for (let j = 1; j <= tubularSegments; j++) {
      for (let i = 1; i <= radialSegments; i++) {
        const a = (radialSegments + 1) * (j - 1) + (i - 1);
        const b = (radialSegments + 1) *  j      + (i - 1);
        const c = (radialSegments + 1) *  j      +  i;
        const d = (radialSegments + 1) * (j - 1) +  i;
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

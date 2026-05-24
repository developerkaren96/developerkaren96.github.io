/*
 * CircleGeometry — a flat triangle-fan disc in the XY plane.
 *
 *   radius      disc radius.
 *   segments    number of triangle-fan slices.
 *   thetaStart  starting angle of the arc (radians).
 *   thetaLength angular sweep (radians); default 2π = full circle.
 *
 * Layout: one centre vertex at the origin (index 0) plus `segments+1`
 * rim vertices. Faces fan out from the centre: (centre, rim_i, rim_i+1).
 * All vertices share a +Z normal, so the disc is single-sided.
 *
 * UVs map the disc into the [0,1]² unit square centred at (0.5, 0.5)
 * by simple normalisation against the radius — a circle inscribed in
 * the unit square.
 */
class CircleGeometry extends Geometry {
  constructor(radius = 1, segments = 8, thetaStart = 0, thetaLength = 2 * Math.PI) {
    super();

    const indices  = [];
    const vertices = [];
    const normals  = [];
    const uvs      = [];
    const vertex   = new Vector3();
    const uv       = new Vector2();

    // Centre vertex.
    vertices.push(0, 0, 0);
    normals.push(0, 0, 1);
    uvs.push(0.5, 0.5);

    // Rim vertices, indices 1..segments+1.
    for (let s = 0, i = 3; s <= segments; s++, i += 3) {
      const segment = thetaStart + (s / segments) * thetaLength;
      vertex.x = radius * Math.cos(segment);
      vertex.y = radius * Math.sin(segment);
      vertices.push(vertex.x, vertex.y, vertex.z);
      normals.push(0, 0, 1);
      uv.x = (vertices[i]     / radius + 1) / 2;
      uv.y = (vertices[i + 1] / radius + 1) / 2;
      uvs.push(uv.x, uv.y);
    }

    // Fan triangles (rim_i, rim_i+1, centre).
    for (let i = 1; i <= segments; i++) indices.push(i, i + 1, 0);

    this.index = new (Geometry.arrayNeedsUint32(indices) ? Uint32Array : Uint16Array)(indices);
    this.addAttribute('position', new GeometryAttribute(new Float32Array(vertices), 3));
    this.addAttribute('normal',   new GeometryAttribute(new Float32Array(normals),  3));
    this.addAttribute('uv',       new GeometryAttribute(new Float32Array(uvs),      2));
  }
}

/*
 * SphereGeometry — UV-sphere (latitude × longitude grid).
 *
 *   radius          sphere radius.
 *   widthSegments   longitude divisions (around Y); clamped to ≥3.
 *   heightSegments  latitude  divisions (top→bottom); clamped to ≥2.
 *   phiStart,
 *   phiLength       azimuthal start + sweep — partial sphere wedges.
 *   thetaStart,
 *   thetaLength     polar start + sweep — partial sphere caps.
 *
 * Vertices on the spherical surface:
 *   x = -r cos(φ) sin(θ)
 *   y =  r cos(θ)
 *   z =  r sin(φ) sin(θ)
 * with φ = phiStart + u·phiLength and θ = thetaStart + v·thetaLength.
 * Normals are simply the normalized position (radius cancels).
 *
 * UV layout: U from `phi` (longitude), V from `theta` (latitude),
 * inverted to match conventional texture orientation.
 *
 * Pole degeneracy: at the top row (`iy == 0`), the lateral edge of
 * each quad has zero length so the (a,b,d) triangle is omitted (it
 * would have zero area). Same for the bottom row's (b,c,d). When
 * `thetaStart > 0` or `thetaEnd < π` the cap isn't actually pinched,
 * so the omission is skipped.
 */
class SphereGeometry extends Geometry {
  constructor(
    radius         = 1,
    widthSegments  = 8,
    heightSegments = 6,
    phiStart       = 0,
    phiLength      = 2 * Math.PI,
    thetaStart     = 0,
    thetaLength    = Math.PI,
  ) {
    super();
    widthSegments  = Math.max(3, Math.floor(widthSegments));
    heightSegments = Math.max(2, Math.floor(heightSegments));

    const thetaEnd = thetaStart + thetaLength;
    let   index    = 0;
    const grid     = [];
    const vertex   = new Vector3();
    const normal   = new Vector3();

    const indices  = [];
    const vertices = [];
    const normals  = [];
    const uvs      = [];

    for (let iy = 0; iy <= heightSegments; iy++) {
      const verticesRow = [];
      const v = iy / heightSegments;
      for (let ix = 0; ix <= widthSegments; ix++) {
        const u = ix / widthSegments;
        vertex.x = -radius * Math.cos(phiStart + u * phiLength) * Math.sin(thetaStart + v * thetaLength);
        vertex.y =  radius * Math.cos(thetaStart + v * thetaLength);
        vertex.z =  radius * Math.sin(phiStart + u * phiLength) * Math.sin(thetaStart + v * thetaLength);
        vertices.push(vertex.x, vertex.y, vertex.z);

        normal.set(vertex.x, vertex.y, vertex.z).normalize();
        normals.push(normal.x, normal.y, normal.z);

        uvs.push(u, 1 - v);
        verticesRow.push(index++);
      }
      grid.push(verticesRow);
    }

    for (let iy = 0; iy < heightSegments; iy++) {
      for (let ix = 0; ix < widthSegments; ix++) {
        const a = grid[iy    ][ix + 1];
        const b = grid[iy    ][ix    ];
        const c = grid[iy + 1][ix    ];
        const d = grid[iy + 1][ix + 1];
        // Skip the degenerate triangle at the +Y pole row.
        if (0 !== iy || thetaStart > 0)                indices.push(a, b, d);
        // Skip the degenerate triangle at the -Y pole row.
        if (iy !== heightSegments - 1 || thetaEnd < Math.PI) indices.push(b, c, d);
      }
    }

    this.index = new (Geometry.arrayNeedsUint32(indices) ? Uint32Array : Uint16Array)(indices);
    this.addAttribute('position', new GeometryAttribute(new Float32Array(vertices), 3));
    this.addAttribute('normal',   new GeometryAttribute(new Float32Array(normals),  3));
    this.addAttribute('uv',       new GeometryAttribute(new Float32Array(uvs),      2));
  }
}

/*
 * PlaneGeometry — a flat XY-plane quad, optionally subdivided.
 *
 *   width, height          dimensions in world units.
 *   widthSegments,
 *   heightSegments         tessellation (1×1 grid by default = two
 *                          triangles forming one quad).
 *
 * Vertices lay out in a (gridX+1) × (gridY+1) grid centred on the
 * origin, with the Y axis flipped (positive `y` of the segment index
 * goes downward in world space) so that the resulting UVs map 0..1
 * top→bottom matching conventional texture coordinates.
 *
 * Normals are uniformly +Z (single-sided plane).
 *
 * Quads stitch as two triangles (a,b,d) and (b,c,d) using the standard
 * grid-corner naming
 *      a───d
 *      │ ╲ │
 *      b───c
 */
class PlaneGeometry extends Geometry {
  constructor(width = 1, height = 1, widthSegments = 1, heightSegments = 1) {
    super();

    const width_half     = width  / 2;
    const height_half    = height / 2;
    const gridX          = Math.floor(widthSegments)  || 1;
    const gridY          = Math.floor(heightSegments) || 1;
    const gridX1         = gridX + 1;
    const gridY1         = gridY + 1;
    const segment_width  = width  / gridX;
    const segment_height = height / gridY;

    const indices  = [];
    const vertices = [];
    const normals  = [];
    const uvs      = [];

    // Grid vertices.
    for (let iy = 0; iy < gridY1; iy++) {
      const y = iy * segment_height - height_half;
      for (let ix = 0; ix < gridX1; ix++) {
        const x = ix * segment_width - width_half;
        vertices.push(x, -y, 0);
        normals.push(0, 0, 1);
        uvs.push(ix / gridX);
        uvs.push(1 - iy / gridY);
      }
    }

    // Stitch each quad into two tris.
    for (let iy = 0; iy < gridY; iy++) {
      for (let ix = 0; ix < gridX; ix++) {
        const a = ix     + gridX1 *  iy;
        const b = ix     + gridX1 * (iy + 1);
        const c = ix + 1 + gridX1 * (iy + 1);
        const d = ix + 1 + gridX1 *  iy;
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

/*
 * OctahedronGeometry — regular 8-face octahedron (or its subdivision).
 *
 * Seed vertices are the six axis-aligned unit points: ±X, ±Y, ±Z.
 * Faces stitch the four "top" triangles (around +Y) and four "bottom"
 * triangles (around -Y). PolyhedronGeometry projects the vertices
 * onto the requested-radius sphere and optionally subdivides.
 *
 * `parameters` is stashed for serialization / reconstruction debugging.
 */
class OctahedronGeometry extends PolyhedronGeometry {
  constructor(radius = 1, detail = 0) {
    super(
      // ±X, ±Y, ±Z unit vertices.
      [1, 0, 0,  -1, 0, 0,  0, 1, 0,  0, -1, 0,  0, 0, 1,  0, 0, -1],
      // 8 triangular faces: top fan around +Y (idx 2), bottom fan
      // around -Y (idx 3).
      [0, 2, 4,  0, 4, 3,  0, 3, 5,  0, 5, 2,
       1, 2, 5,  1, 5, 3,  1, 3, 4,  1, 4, 2],
      radius,
      detail,
    );
    this.type       = 'OctahedronGeometry';
    this.parameters = { radius: radius, detail: detail };
  }
}

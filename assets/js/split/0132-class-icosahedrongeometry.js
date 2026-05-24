/*
 * IcosahedronGeometry — regular 20-face icosahedron, optionally
 * subdivided into a spherical mesh.
 *
 * Seed vertices use the golden-ratio coordinates (±1, ±t, 0),
 * (0, ±1, ±t), (±t, 0, ±1) where t = (1+√5)/2. These 12 vertices
 * define the regular icosahedron inscribed in a unit-ish sphere; the
 * PolyhedronGeometry base class then projects them onto a sphere of
 * the requested `radius`.
 *
 * `detail = 0` gives the bare 20-face faceted icosahedron;
 * `detail >= 1` produces a geodesic sphere with 20 × 4^detail faces.
 */
class IcosahedronGeometry extends PolyhedronGeometry {
  constructor(radius, detail) {
    const t = (1 + Math.sqrt(5)) / 2;
    super(
      [
        // 12 vertices — three groups of (±1, ±t, 0) variations.
        -1,  t,  0,   1,  t,  0,  -1, -t,  0,   1, -t,  0,
         0, -1,  t,   0,  1,  t,   0, -1, -t,   0,  1, -t,
         t,  0, -1,   t,  0,  1,  -t,  0, -1,  -t,  0,  1,
      ],
      [
        // 20 triangular faces.
        0, 11, 5,  0,  5, 1,  0,  1, 7,  0,  7, 10, 0, 10, 11,
        1,  5, 9,  5, 11, 4, 11, 10, 2, 10,  7, 6,  7,  1,  8,
        3,  9, 4,  3,  4, 2,  3,  2, 6,  3,  6, 8,  3,  8,  9,
        4,  9, 5,  2,  4, 11, 6,  2, 10, 8,  6, 7,  9,  8,  1,
      ],
      radius,
      detail,
    );
  }
}

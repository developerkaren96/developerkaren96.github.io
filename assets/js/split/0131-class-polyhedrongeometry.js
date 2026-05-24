/*
 * PolyhedronGeometry — base class for the spherical polyhedra
 * (IcosahedronGeometry, OctahedronGeometry, etc).
 *
 * Inputs:
 *   vertices  flat [x,y,z, x,y,z, …] array of seed vertices.
 *   indices   triangle index list into `vertices` (multiple of 3).
 *   radius    target radius — every vertex is normalized and scaled
 *             to this distance after subdivision.
 *   detail    subdivision depth. Each face is split into 4^detail
 *             sub-triangles.
 *
 * Pipeline:
 *
 *   1. `subdivide`     — for each input triangle, walk the (a,b,c)
 *                        corners and split into a 2^detail × 2^detail
 *                        sub-grid via barycentric lerp, then flatten
 *                        each sub-grid into a strip of triangles. The
 *                        emitted vertices are *not* indexed — every
 *                        triangle gets its own three vertices, which
 *                        lets `correctUVs` and `correctSeam` operate
 *                        per-face without disturbing neighbours.
 *
 *   2. `applyRadius`   — normalize each emitted vertex and scale to
 *                        `radius`. After this step the original
 *                        seed-polyhedron has become a discrete sphere.
 *
 *   3. `generateUVs`   — spherical projection: U = azimuth/(2π)+0.5,
 *                        V = inclination/π+0.5. Then two correction
 *                        passes:
 *
 *      `correctUVs`     — at the +Y/-Y poles, vector.x == vector.z ==
 *                        0 so azimuth is undefined; use the face
 *                        centroid's azimuth as a fallback. Also
 *                        adjusts the `u == 1` boundary case.
 *      `correctSeam`    — wraps a face whose corners straddle the
 *                        u = 1 ↔ u = 0 seam: if one face corner sits
 *                        below 0.2 and another above 0.9 in U, the
 *                        small ones get +1 added so the texture
 *                        wraps continuously across the seam.
 *
 *   4. The normal attribute is initialised as a copy of the position
 *      buffer (since after the radius pass each vertex's position is
 *      its outward normal × radius); then `computeVertexNormals`
 *      (detail == 0) or `normalizeNormals` (detail > 0) produces the
 *      final normals. The detail-0 path uses face normals because the
 *      seed polyhedron is faceted; subdivided meshes use the smooth
 *      per-vertex direction.
 */
class PolyhedronGeometry extends Geometry {
  constructor(vertices, indices = [], radius = 1, detail = 0) {
    super();

    const vertexBuffer = [];
    const uvBuffer     = [];

    // ── Subdivide a single face into a triangle strip of size cols². ──
    function subdivideFace(a, b, c, detail) {
      const cols = Math.pow(2, detail);
      const v    = [];
      // Build a triangular grid of barycentric lerps.
      for (let i = 0; i <= cols; i++) {
        v[i] = [];
        const aj   = a.clone().lerp(c, i / cols);
        const bj   = b.clone().lerp(c, i / cols);
        const rows = cols - i;
        for (let j = 0; j <= rows; j++) {
          v[i][j] = (0 === j && i === cols) ? aj : aj.clone().lerp(bj, j / rows);
        }
      }
      // Walk the grid and emit two triangles per quad-half. Each
      // row has (2*(cols-i)-1) triangles; even j is "up-pointing",
      // odd j is "down-pointing".
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < 2 * (cols - i) - 1; j++) {
          const k = Math.floor(j / 2);
          if (j % 2 == 0) {
            pushVertex(v[i    ][k + 1]);
            pushVertex(v[i + 1][k    ]);
            pushVertex(v[i    ][k    ]);
          } else {
            pushVertex(v[i    ][k + 1]);
            pushVertex(v[i + 1][k + 1]);
            pushVertex(v[i + 1][k    ]);
          }
        }
      }
    }

    function pushVertex(vertex) {
      vertexBuffer.push(vertex.x, vertex.y, vertex.z);
    }

    function getVertexByIndex(index, vertex) {
      const stride = 3 * index;
      vertex.x = vertices[stride + 0];
      vertex.y = vertices[stride + 1];
      vertex.z = vertices[stride + 2];
    }

    // U adjustment helpers (see `correctUVs` / `correctSeam`).
    function correctUV(uv, stride, vector, azimuth) {
      if (azimuth < 0 && 1 === uv.x) uvBuffer[stride] = uv.x - 1;
      if (0 === vector.x && 0 === vector.z) uvBuffer[stride] = azimuth / 2 / Math.PI + 0.5;
    }

    function azimuth(vector) {
      return Math.atan2(vector.z, -vector.x);
    }

    // ── Step 1: subdivide every seed face. ────────────────────────────
    (function subdivide(detail) {
      const a = new Vector3();
      const b = new Vector3();
      const c = new Vector3();
      for (let i = 0; i < indices.length; i += 3) {
        getVertexByIndex(indices[i + 0], a);
        getVertexByIndex(indices[i + 1], b);
        getVertexByIndex(indices[i + 2], c);
        subdivideFace(a, b, c, detail);
      }
    })(detail);

    // ── Step 2: project every vertex onto the sphere of `radius`. ─────
    (function applyRadius(radius) {
      const vertex = new Vector3();
      for (let i = 0; i < vertexBuffer.length; i += 3) {
        vertex.x = vertexBuffer[i + 0];
        vertex.y = vertexBuffer[i + 1];
        vertex.z = vertexBuffer[i + 2];
        vertex.normalize().multiplyScalar(radius);
        vertexBuffer[i + 0] = vertex.x;
        vertexBuffer[i + 1] = vertex.y;
        vertexBuffer[i + 2] = vertex.z;
      }
    })(radius);

    // ── Step 3: spherical UVs + pole / seam corrections. ──────────────
    (function generateUVs() {
      const vertex = new Vector3();
      for (let i = 0; i < vertexBuffer.length; i += 3) {
        vertex.x = vertexBuffer[i + 0];
        vertex.y = vertexBuffer[i + 1];
        vertex.z = vertexBuffer[i + 2];
        const u = azimuth(vertex) / 2 / Math.PI + 0.5;
        const v = Math.atan2(-vertex.y, Math.sqrt(vertex.x * vertex.x + vertex.z * vertex.z)) / Math.PI + 0.5;
        uvBuffer.push(u, 1 - v);
      }

      // Per-face pole correction: at +Y/-Y the azimuth is degenerate
      // for the affected corners; reuse the face centroid's azimuth.
      (function correctUVs() {
        const a       = new Vector3();
        const b       = new Vector3();
        const c       = new Vector3();
        const centroid = new Vector3();
        const uvA = new Vector2();
        const uvB = new Vector2();
        const uvC = new Vector2();

        for (let i = 0, j = 0; i < vertexBuffer.length; i += 9, j += 6) {
          a.set(vertexBuffer[i + 0], vertexBuffer[i + 1], vertexBuffer[i + 2]);
          b.set(vertexBuffer[i + 3], vertexBuffer[i + 4], vertexBuffer[i + 5]);
          c.set(vertexBuffer[i + 6], vertexBuffer[i + 7], vertexBuffer[i + 8]);
          uvA.set(uvBuffer[j + 0], uvBuffer[j + 1]);
          uvB.set(uvBuffer[j + 2], uvBuffer[j + 3]);
          uvC.set(uvBuffer[j + 4], uvBuffer[j + 5]);

          centroid.copy(a).add(b).add(c).divideScalar(3);
          const azi = azimuth(centroid);
          correctUV(uvA, j + 0, a, azi);
          correctUV(uvB, j + 2, b, azi);
          correctUV(uvC, j + 4, c, azi);
        }
      })();

      // Per-face seam fix: faces whose Us straddle the wrap-around get
      // their small Us bumped up by 1 so the face is continuous in
      // texture space.
      (function correctSeam() {
        for (let i = 0; i < uvBuffer.length; i += 6) {
          const x0  = uvBuffer[i + 0];
          const x1  = uvBuffer[i + 2];
          const x2  = uvBuffer[i + 4];
          const max = Math.max(x0, x1, x2);
          const min = Math.min(x0, x1, x2);
          if (max > 0.9 && min < 0.1) {
            if (x0 < 0.2) uvBuffer[i + 0] += 1;
            if (x1 < 0.2) uvBuffer[i + 2] += 1;
            if (x2 < 0.2) uvBuffer[i + 4] += 1;
          }
        }
      })();
    })();

    this.addAttribute('position', new GeometryAttribute(new Float32Array(vertexBuffer),         3));
    // After applyRadius, position == outward normal × radius. Seed the
    // normal buffer from a copy so computeVertexNormals / normalizeNormals
    // can run downstream without a second pass.
    this.addAttribute('normal',   new GeometryAttribute(new Float32Array(vertexBuffer.slice()), 3));
    this.addAttribute('uv',       new GeometryAttribute(new Float32Array(uvBuffer),             2));

    // Faceted vs smoothed normals depending on subdivision depth.
    if (0 === detail) this.computeVertexNormals();
    else              this.normalizeNormals();
  }
}

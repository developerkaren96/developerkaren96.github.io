/*
 * CylinderGeometry — open or closed cylinder/frustum/cone.
 *
 *   radiusTop      radius at +Y end.
 *   radiusBottom   radius at -Y end.
 *   height         total height along Y.
 *   radialSegments tessellation around the axis.
 *   heightSegments tessellation along the axis.
 *   openEnded      if true, no top/bottom caps are emitted.
 *   thetaStart     starting angle of the side-wall arc.
 *   thetaLength    angular sweep (radians); 2π = closed wall.
 *   planarMapping  alternate cap UV mapping mode (the V coordinate
 *                  is mirrored on the bottom cap so top and bottom
 *                  share a single planar projection).
 *
 * Construction is split into two helpers:
 *
 *   `generateTorso` — the side wall as a (radialSegments+1) ×
 *                     (heightSegments+1) grid of vertices, normals
 *                     computed from the (sinθ, slope, cosθ) tangent
 *                     plane (so a cone gets correctly slanted normals).
 *                     UVs are simple (u,1-v) unless `planarMapping`
 *                     reuses the cap-style mapping.
 *
 *   `generateCap`   — fan around a centred ring of duplicate centre
 *                     vertices (one per radial segment so adjacent
 *                     fan triangles each get their own centre — this
 *                     is mainly to keep the index pattern uniform
 *                     with the torso grid). The winding order is
 *                     reversed for the bottom cap so faces stay
 *                     outward-facing.
 *
 * Cone is reused by ConeGeometry with `radiusTop = 0`.
 */
class CylinderGeometry extends Geometry {
  constructor(
    radiusTop      = 1,
    radiusBottom   = 1,
    height         = 1,
    radialSegments = 8,
    heightSegments = 1,
    openEnded      = false,
    thetaStart     = 0,
    thetaLength    = 2 * Math.PI,
    planarMapping  = false,
  ) {
    super();
    radialSegments = Math.floor(radialSegments);
    heightSegments = Math.floor(heightSegments);

    const indices    = [];
    const vertices   = [];
    const normals    = [];
    const uvs        = [];
    const indexArray = [];
    let   index      = 0;
    const halfHeight = height / 2;

    // ── Cap fan (top or bottom). ──────────────────────────────────────
    function generateCap(top) {
      const uv       = new Vector2();
      const vertex   = new Vector3();
      const radius   = true === top ? radiusTop : radiusBottom;
      const sign     = true === top ? 1 : -1;
      const signV    = planarMapping ? 1 : sign;

      // Centre-vertex band — one per radial segment, all duplicates of
      // the cap centre. Lets each fan triangle reference its own centre.
      const centerIndexStart = index;
      for (let x = 1; x <= radialSegments; x++) {
        vertices.push(0, halfHeight * sign, 0);
        normals.push(0, sign, 0);
        uvs.push(0.5, 0.5);
        index++;
      }

      // Rim vertices around the cap.
      const centerIndexEnd = index;
      for (let x = 0; x <= radialSegments; x++) {
        const theta    = (x / radialSegments) * thetaLength + thetaStart;
        const cosTheta = Math.cos(theta);
        const sinTheta = Math.sin(theta);
        vertex.x = radius   * sinTheta;
        vertex.y = halfHeight * sign;
        vertex.z = radius   * cosTheta;
        vertices.push(vertex.x, vertex.y, vertex.z);
        normals.push(0, sign, 0);
        uv.x = 0.5 * cosTheta + 0.5;
        uv.y = 0.5 * sinTheta * signV + 0.5;
        uvs.push(uv.x, uv.y);
        index++;
      }

      // Fan triangles. Reversed winding on bottom cap so all faces
      // remain outward.
      for (let x = 0; x < radialSegments; x++) {
        const c = centerIndexStart + x;
        const i = centerIndexEnd   + x;
        if (true === top) indices.push(i,     i + 1, c);
        else              indices.push(i + 1, i,     c);
      }
    }

    // ── Side wall. ────────────────────────────────────────────────────
    (function generateTorso() {
      const uv     = new Vector2();
      const normal = new Vector3();
      const vertex = new Vector3();
      // For a slanted-side cylinder (cone/frustum) the side-wall normal
      // tilts in along the slope.
      const slope  = (radiusBottom - radiusTop) / height;

      for (let y = 0; y <= heightSegments; y++) {
        const indexRow = [];
        const v        = y / heightSegments;
        const radius   = v * (radiusBottom - radiusTop) + radiusTop;

        for (let x = 0; x <= radialSegments; x++) {
          const u        = x / radialSegments;
          const theta    = u * thetaLength + thetaStart;
          const sinTheta = Math.sin(theta);
          const cosTheta = Math.cos(theta);

          vertex.x = radius * sinTheta;
          vertex.y = -v * height + halfHeight;
          vertex.z = radius * cosTheta;
          vertices.push(vertex.x, vertex.y, vertex.z);

          normal.set(sinTheta, slope, cosTheta).normalize();
          normals.push(normal.x, normal.y, normal.z);

          if (planarMapping) {
            uv.x = 0.5 * cosTheta + 0.5;
            uv.y = 0.5 * sinTheta + 0.5;
            uvs.push(uv.x, uv.y);
          } else {
            uvs.push(u, 1 - v);
          }
          indexRow.push(index++);
        }
        indexArray.push(indexRow);
      }

      // Stitch the grid into quads (two tris each).
      for (let x = 0; x < radialSegments; x++) {
        for (let y = 0; y < heightSegments; y++) {
          const a = indexArray[y    ][x    ];
          const b = indexArray[y + 1][x    ];
          const c = indexArray[y + 1][x + 1];
          const d = indexArray[y    ][x + 1];
          indices.push(a, b, d);
          indices.push(b, c, d);
        }
      }
    })();

    if (false === openEnded) {
      if (radiusTop    > 0) generateCap(true);
      if (radiusBottom > 0) generateCap(false);
    }

    this.index = new (Geometry.arrayNeedsUint32(indices) ? Uint32Array : Uint16Array)(indices);
    this.addAttribute('position', new GeometryAttribute(new Float32Array(vertices), 3));
    this.addAttribute('normal',   new GeometryAttribute(new Float32Array(normals),  3));
    this.addAttribute('uv',       new GeometryAttribute(new Float32Array(uvs),      2));
  }
}

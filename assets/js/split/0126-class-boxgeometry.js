/*
 * BoxGeometry — an axis-aligned box, tessellated into a configurable grid
 * per face.
 *
 *   new BoxGeometry(width, height, depth)              // 1×1×1 quads/face
 *   new BoxGeometry(2, 1, 2, 4, 2, 4)                  // segmented
 *
 * Construction strategy: build six planar grids (one per face), each with
 * its own (u, v, w) basis. `buildPlane` writes:
 *   - positions  — vertex `w`-axis pinned to ±depth/2 (the face's offset),
 *                  `u`/`v` axes ranged over the face.
 *   - normals    — outward unit vector along ±w.
 *   - uvs        — standard 0..1 grid (v flipped to match texture conv).
 *   - indices    — two triangles per quad cell.
 *
 * The two `buildPlane` calls per axis differ in:
 *   1. The sign of `depth` (selecting front vs back face — flips normals).
 *   2. The sign of one direction axis (`udir`/`vdir`) — to keep winding
 *      consistent and matching the flipped face.
 *
 * Indices are typed Uint32 when total vertex count overflows 16-bit
 * (`Geometry.arrayNeedsUint32`), else Uint16 — saves bandwidth on small meshes.
 */
class BoxGeometry extends Geometry {
  constructor(
    width = 1,
    height = 1,
    depth = 1,
    widthSegments = 1,
    heightSegments = 1,
    depthSegments = 1,
  ) {
    super();
    widthSegments  = Math.floor(widthSegments);
    heightSegments = Math.floor(heightSegments);
    depthSegments  = Math.floor(depthSegments);

    const indices  = [];
    const vertices = [];
    const normals  = [];
    const uvs      = [];
    let numberOfVertices = 0;

    /**
     * Generate one face.
     *   u/v: names of the axes that vary across the face ('x','y','z').
     *   w  : name of the pinned axis (face normal direction).
     *   udir/vdir: signs of the u/v sweep (used to flip winding per face).
     *   width/height: extents along u/v.
     *   depth: pinned distance along w — sign selects front vs back face.
     */
    function buildPlane(u, v, w, udir, vdir, width, height, depth, gridX, gridY, materialIndex) {
      const segmentWidth  = width  / gridX;
      const segmentHeight = height / gridY;
      const widthHalf  = width  / 2;
      const heightHalf = height / 2;
      const depthHalf  = depth  / 2;
      const gridX1 = gridX + 1;
      const gridY1 = gridY + 1;
      let vertexCounter = 0;
      const vector = new Vector3();
      let ix, iy;

      // Positions/normals/uvs — walk the (gridX+1)×(gridY+1) vertex grid.
      for (iy = 0; iy < gridY1; iy++) {
        const y = iy * segmentHeight - heightHalf;
        for (ix = 0; ix < gridX1; ix++) {
          const x = ix * segmentWidth - widthHalf;
          // Vertex position: spread along u/v, pinned at ±depthHalf along w.
          vector[u] = x * udir;
          vector[v] = y * vdir;
          vector[w] = depthHalf;
          vertices.push(vector.x, vector.y, vector.z);

          // Normal: unit vector along the pinned axis, sign chosen by depth.
          vector[u] = 0;
          vector[v] = 0;
          vector[w] = depth > 0 ? 1 : -1;
          normals.push(vector.x, vector.y, vector.z);

          uvs.push(ix / gridX);
          uvs.push(1 - iy / gridY);    // flip v so (0,0) is top-left
          vertexCounter += 1;
        }
      }

      // Two triangles per grid cell. Winding (a,b,d) + (b,c,d) is CCW from
      // outside given the udir/vdir signs the caller chose for this face.
      for (iy = 0; iy < gridY; iy++) {
        for (ix = 0; ix < gridX; ix++) {
          const a = numberOfVertices + ix       + gridX1 * iy;
          const b = numberOfVertices + ix       + gridX1 * (iy + 1);
          const c = numberOfVertices + (ix + 1) + gridX1 * (iy + 1);
          const d = numberOfVertices + (ix + 1) + gridX1 * iy;
          indices.push(a, b, d);
          indices.push(b, c, d);
        }
      }

      numberOfVertices += vertexCounter;
    }

    // Six faces. The udir/vdir/depth-sign choices give each face the right
    // outward winding so backface culling works.
    buildPlane('z', 'y', 'x', -1, -1,  depth,  height,   width, depthSegments, heightSegments, 0); // +X
    buildPlane('z', 'y', 'x',  1, -1,  depth,  height,  -width, depthSegments, heightSegments, 1); // -X
    buildPlane('x', 'z', 'y',  1,  1,  width,  depth,   height, widthSegments, depthSegments,  2); // +Y
    buildPlane('x', 'z', 'y',  1, -1,  width,  depth,  -height, widthSegments, depthSegments,  3); // -Y
    buildPlane('x', 'y', 'z',  1, -1,  width,  height,  depth,  widthSegments, heightSegments, 4); // +Z
    buildPlane('x', 'y', 'z', -1, -1,  width,  height, -depth,  widthSegments, heightSegments, 5); // -Z

    // Pick the narrowest index type that fits.
    this.index = new (Geometry.arrayNeedsUint32(indices) ? Uint32Array : Uint16Array)(indices);
    this.addAttribute('position', new GeometryAttribute(new Float32Array(vertices), 3));
    this.addAttribute('normal',   new GeometryAttribute(new Float32Array(normals),  3));
    this.addAttribute('uv',       new GeometryAttribute(new Float32Array(uvs),      2));
  }
}

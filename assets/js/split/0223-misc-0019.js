/*
 * GenerateTube — exported helper that builds a tube/cylinder Geometry
 * with auxiliary per-vertex attributes useful for procedural tube
 * shaders (e.g. swept-curve effects).
 *
 * Pipeline:
 *   1. Build a Three-style CylinderGeometry (radius=1, length=1)
 *      with the requested side count and length subdivisions.
 *   2. Rotate Z by 90° so the tube axis lies along X (which keeps
 *      the cylinder's "length axis" lined up with the U direction
 *      of typical sweeps).
 *   3. Convert the indexed face/vertex/uv arrays into flat triangle
 *      lists via the `BufferToVertices` helper.
 *   4. For every face vertex compute:
 *        - `position`  : zeroed Float32 placeholder (filled by GPU
 *                         shader using the other attributes).
 *        - `angle`     : atan2 of the (y, z) ring position, so the
 *                         shader knows the azimuthal angle around
 *                         the tube cross-section.
 *        - `cIndex`    : integer subdivision index along the tube
 *                         length (0…subdivisions-1) — useful for
 *                         sampling per-segment data textures.
 *        - `tuv`       : the original cylinder UVs.
 *   5. Stash `indexLookup` on the geometry so consumers can map
 *      vertices back to their subdivision slot, then destroy the
 *      scratch CylinderGeometry and return the new Geometry.
 */
Module(function GenerateTube() {
  this.exports = function generate(numSides = 8, subdivisions = 50, openEnded = false) {
    let geom = new CylinderGeometry(1, 1, 1, numSides, subdivisions, openEnded);
    geom.applyMatrix(new Matrix4().makeRotationZ(Math.PI / 2));
    require('BufferToVertices').toVertices(geom);
    let tmpVec = new Vector2(),
      xPositions = [],
      angles = [],
      uvs = [],
      vertices = geom.vertices,
      faceVertexUvs = geom.faceVertexUvs[0],
      indices = [];
    geom.faces.forEach((face, i) => {
      let { a: a, b: b, c: c } = face,
        verts = [vertices[a], vertices[b], vertices[c]],
        faceUvs = faceVertexUvs[i];
      verts.forEach((v, j) => {
        tmpVec.set(v.y, v.z).normalize();
        let angle = Math.atan2(tmpVec.y, tmpVec.x);
        angles.push(angle);
        xPositions.push(v.x);
        uvs.push(faceUvs[j].toArray());
        indices.push(Math.abs(Math.round(Math.range(v.x, -0.5, 0.5, 0, subdivisions - 1))));
      });
    });
    let posArray = new Float32Array(xPositions),
      angleArray = new Float32Array(angles),
      uvArray = new Float32Array(2 * uvs.length);
    for (let i = 0; i < posArray.length; i++) {
      let [u, v] = uvs[i];
      uvArray[2 * i + 0] = u;
      uvArray[2 * i + 1] = v;
    }
    let geometry = new Geometry();
    return (
      geometry.addAttribute(
        'position',
        new GeometryAttribute(new Float32Array(3 * posArray.length), 3),
      ),
      geometry.addAttribute('angle', new GeometryAttribute(angleArray, 1)),
      geometry.addAttribute('cIndex', new GeometryAttribute(new Float32Array(indices), 1)),
      geometry.addAttribute('tuv', new GeometryAttribute(uvArray, 2)),
      (geometry.indexLookup = indices),
      geom.destroy(),
      geometry
    );
  };
});

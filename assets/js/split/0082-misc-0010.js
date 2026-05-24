/*
 * BufferToVertices — bidirectional converter between Three.js
 * BufferGeometry (modern attribute arrays) and legacy Geometry
 * (Vector3 vertices + Face3 faces). Some Hydra effects (specifically
 * those that need to traverse face/vertex graphs — e.g., physics
 * decompositions, custom triangulation, planar subdivision) require
 * the legacy representation that newer Three.js removed.
 *
 * `toVertices(geom)`:
 *   In-place adds `vertices`, `faces`, `faceVertexUvs` to a
 *   BufferGeometry that already has `position`, `normal`, `uv`
 *   attributes plus an index buffer.
 *
 *   Algorithm:
 *     1. `buildFaces`:
 *        a. For each position triplet, push a Vector3 to `vertices`,
 *           a Vector3 normal to a scratch tempNormals, a Vector2 uv to
 *           tempUVs.
 *        b. For each index triplet i,i+1,i+2 → addFace which builds a
 *           Face3 with the three normals as the vertex-normal array
 *           and pushes the three UVs into faceVertexUvs[0].
 *
 *     2. `mergeVertices(geom)`:
 *        Dedupe vertices that round to the same 4-decimal coordinate
 *        triple. Build a `key = round(x*1e4)+'_'+round(y*1e4)+'_'+
 *        round(z*1e4)` → unique-index map. Remap each face's a/b/c
 *        into the deduped index space. If any face collapses to a
 *        degenerate (two of a/b/c equal) it's removed (along with its
 *        UVs). Returns the dedupe count diff.
 *
 *   The local Face3 ctor is inline (rather than imported from Three)
 *   so this module can run against Three builds where Face3 has been
 *   removed.
 *
 * `toBuffer(geom)`:
 *   Inverse: copy geom.vertices back into the position attribute array
 *   following the face.a/face.b/face.c indices. Used after modifying
 *   vertex positions (e.g., morphing) when the underlying GPU buffer
 *   needs to be re-uploaded. Note: only writes the position array; the
 *   caller is responsible for `attribute.needsUpdate = true`.
 */
Module(function BufferToVertices() {
  const FACES = ['a', 'b', 'c'];

  this.exports = {
    // BufferGeometry → legacy vertices/faces in-place. Dedupes
    // vertices and culls degenerate faces.
    toVertices: function toVertices(geom) {
      (function buildFaces(geom) {
        const attributes = geom.attributes;
        const positions  = attributes.position.array;
        const normals    = attributes.normal.array;
        const uvs        = attributes.uv.array;
        const tempNormals = [];
        const tempUVs     = [];
        geom.vertices      = [];
        geom.faceVertexUvs = [[]];
        geom.faces         = [];
        const indices = geom.index;

        // Inline Face3 — Three removed it; we still need its shape.
        function Face3(a, b, c, normal) {
          this.a = a;
          this.b = b;
          this.c = c;
          this.normal = normal;
        }

        for (let i = 0, j = 0; i < positions.length; i += 3, j += 2) {
          geom.vertices.push(new Vector3(positions[i], positions[i + 1], positions[i + 2]));
          tempNormals.push(new Vector3(normals[i], normals[i + 1], normals[i + 2]));
          tempUVs.push(new Vector2(uvs[j], uvs[j + 1]));
        }

        function addFace(a, b, c, materialIndex) {
          const face = new Face3(a, b, c, [
            tempNormals[a].clone(),
            tempNormals[b].clone(),
            tempNormals[c].clone(),
          ]);
          geom.faces.push(face);
          geom.faceVertexUvs[0].push([
            tempUVs[a].clone(),
            tempUVs[b].clone(),
            tempUVs[c].clone(),
          ]);
        }

        for (let i = 0; i < indices.length; i += 3) {
          addFace(indices[i], indices[i + 1], indices[i + 2]);
        }

        // Dedupe coincident vertices to 4-decimal precision; remap
        // face indices; cull degenerate faces.
        (function mergeVertices(geom) {
          const verticesMap = {};
          const unique  = [];
          const changes = [];
          const precision = Math.pow(10, 4);
          let v, key, i, il, face, indices, j, jl;

          for (i = 0, il = geom.vertices.length; i < il; i++) {
            v = geom.vertices[i];
            key = Math.round(v.x * precision) + '_' +
                  Math.round(v.y * precision) + '_' +
                  Math.round(v.z * precision);
            if (undefined === verticesMap[key]) {
              verticesMap[key] = i;
              unique.push(geom.vertices[i]);
              changes[i] = unique.length - 1;
            } else {
              changes[i] = changes[verticesMap[key]];
            }
          }

          const faceIndicesToRemove = [];
          for (i = 0, il = geom.faces.length; i < il; i++) {
            face = geom.faces[i];
            face.a = changes[face.a];
            face.b = changes[face.b];
            face.c = changes[face.c];
            indices = [face.a, face.b, face.c];
            for (let n = 0; n < 3; n++) {
              if (indices[n] === indices[(n + 1) % 3]) {
                faceIndicesToRemove.push(i);
                break;
              }
            }
          }

          for (i = faceIndicesToRemove.length - 1; i >= 0; i--) {
            const idx = faceIndicesToRemove[i];
            geom.faces.splice(idx, 1);
            for (j = 0, jl = geom.faceVertexUvs.length; j < jl; j++) {
              geom.faceVertexUvs[j].splice(idx, 1);
            }
          }

          const diff = geom.vertices.length - unique.length;
          geom.vertices = unique;
          return diff;
        })(geom);
      })(geom);
    },

    // Inverse: write back vertex positions into the GPU buffer. Caller
    // must flag attribute.needsUpdate.
    toBuffer: function toBuffer(geom) {
      const faces = geom.faces;
      const array = geom.attributes.position.array;
      for (let i = 0; i < faces.length; i++) {
        const face = faces[i];
        for (let f = 0; f < FACES.length; f++) {
          const index  = face[FACES[f]];
          const vertex = geom.vertices[index];
          array[3 * index + 0] = vertex.x;
          array[3 * index + 1] = vertex.y;
          array[3 * index + 2] = vertex.z;
        }
      }
    },
  };
});

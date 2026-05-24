/*
 * Face3 — a triangular face described by three *vertex indices*
 * (a, b, c) into a separate vertex array, plus a precomputed face
 * normal.
 *
 * Used by code paths that still operate on the indexed-mesh model
 * (a, b, c are integer indices, not Vector3s — that's what Triangle
 * uses). For example, GLTF / Draco geometry loaders that build their
 * own per-face data during import. Cheap value-type — no methods,
 * just a holder.
 */
class Face3 {
  constructor(a, b, c, normal = new Vector3()) {
    this.a      = a;
    this.b      = b;
    this.c      = c;
    this.normal = normal;
  }
}

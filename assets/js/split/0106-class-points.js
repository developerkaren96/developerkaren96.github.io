/*
 * Points — renderable for GL_POINTS draw mode (particle sprites, debug dots).
 *
 * Mirrors `Mesh` but with a `geometry` setter that drops the cached VAO so
 * the renderer rebuilds attribute bindings on next draw — useful when you
 * swap the underlying geometry at runtime (different attribute layout =
 * stale VAO). The shader gets a back-pointer (`shader.mesh = this`) so
 * uniform setters can walk back to the host point cloud.
 */
class Points extends Base3D {
  constructor(geometry, shader) {
    super();
    this._geometry = geometry;
    this.shader    = shader;
    this.isPoints  = true;
    this.id        = Renderer.ID++;
    if (shader) this.shader.mesh = this;
  }
  clone() { return new Points(this._geometry, this.shader).copy(this); }

  // Swapping geometry invalidates the VAO cache for this mesh.
  set geometry(g) {
    Geometry.renderer.resetMeshGeom(this);
    this._geometry = g;
  }
  get geometry() { return this._geometry; }
}

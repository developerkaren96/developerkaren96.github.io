/*
 * Mesh — a (geometry, shader) pair attached to a scene-graph node.
 *
 *   new Mesh(geometry, shader)
 *
 * `shader` accepts either a raw `Shader` or any wrapper that exposes `.shader`
 * (e.g. material classes), so callers don't have to know the level of nesting.
 *
 * Occlusion query system (optional, when `Renderer.useOcclusionQuery` is on):
 *   - For every non-query mesh, automatically create a bounding-box "occlusion
 *     mesh" — a double-sided cube sized to the geometry's bbox.
 *   - That helper is rendered through the GPU's hardware occlusion query.
 *   - Skipped in worker threads (`window.THREAD`), which don't render.
 *
 * Bounds (`box3`) is lazily allocated — only meshes that participate in
 * intersection tests pay for it.
 */
class Mesh extends Base3D {
  constructor(geometry, shader, isQuery = false) {
    super();

    // Default placeholder material — skipped in worker threads (no GL there).
    if (!shader && !window.THREAD) shader = new Shader('TestMaterial');

    this._geometry = geometry;
    // Accept either a Shader directly or a wrapper exposing `.shader`.
    this._shader = shader && shader.shader ? shader.shader : shader;
    this.isMesh = true;

    this.occlusionMesh = null;
    // Create a bbox-shaped occlusion helper when the feature is enabled.
    if (!isQuery && !window.THREAD && Renderer.useOcclusionQuery) {
      const occShader = new Shader('OcclusionMaterial', {
        bbMin: { value: new Vector3() },
        bbMax: { value: new Vector3() },
      });
      occShader.side = Shader.DOUBLE_SIDE;

      const _occlusionMesh = new Mesh(World.BOX, occShader, true);
      _occlusionMesh.occlusionCulled  = false;   // the helper isn't itself culled
      _occlusionMesh.doNotProject     = true;    // it never reaches user shaders
      _occlusionMesh._queryMesh       = this;
      _occlusionMesh.isOcclusionMesh  = true;
      this.add(_occlusionMesh);
      this._occlusionMesh   = _occlusionMesh;
      this._occlusionDirty  = true;
    }

    // Cheap unique id — fine for the use case (frame-local sort keys).
    this.id = Utils.timestamp();
    if (shader) this._shader.mesh = this;
  }

  clone() {
    return new Mesh(this._geometry, this.shader).copy(this);
  }

  // ─── Geometry swap notifies the renderer to drop cached GPU bindings ─────
  set geometry(g) {
    Geometry.renderer.resetMeshGeom(this);
    this._geometry = g;
  }
  get geometry() { return this._geometry; }

  // Shader swap with the same wrapper-unwrap convention as the constructor.
  set shader(shader) {
    this._shader = shader && shader.shader ? shader.shader : shader;
  }
  get shader() { return this._shader; }

  // ─── Bounding-volume intersection helpers ────────────────────────────────
  /** Is this mesh's AABB inside `mesh`'s AABB? */
  isInsideOf(mesh) {
    if (!this.box3) this.box3 = new Box3();
    this.box3.setFromObject(this);
    return mesh.isMeshInside(this);
  }
  /** Does `mesh`'s AABB intersect this one's? Caller must have `box3` set. */
  isMeshInside(mesh) {
    if (!this.box3) this.box3 = new Box3();
    this.box3.setFromObject(this);
    return mesh.box3.intersectsBox(this.box3);
  }

  /**
   * Recompute the occlusion helper's bbox shader uniforms from the current
   * geometry bounds. The tiny ±0.01 padding prevents Z-fighting at the
   * silhouette edges when the helper's faces graze the real mesh.
   *
   * Only the *non-hardware* (shader-based) occlusion path runs this — when
   * `useOcclusionQuery` is true, the GPU query handles it directly.
   */
  updateOcclusionMesh(force) {
    if (this.occlusionCulled && !Renderer.useOcclusionQuery && (this._occlusionDirty || force)) {
      this._geometry.computeBoundingBox();
      const bb = this._geometry.boundingBox;
      this._occlusionMesh?.shader?.set('bbMin', bb.min.add(new Vector3(-0.01, -0.01, -0.01)));
      this._occlusionMesh?.shader?.set('bbMax', bb.max.add(new Vector3( 0.01,  0.01,  0.01)));
      // Render the occlusion proxy late so it tests against final depth.
      this._occlusionMesh.renderOrder = this.renderOrder + 1e3;
      this._occlusionDirty = false;
    }
  }
}

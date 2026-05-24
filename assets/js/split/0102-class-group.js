/*
 * Group — a Base3D that holds children but has no geometry/shader of its
 * own. Used to bundle transforms (rotate a whole cluster of meshes by
 * rotating the group), and as the host node owned by an Object3D
 * Component.
 *
 * Occlusion-culling support: a Group can opt into hardware occlusion
 * queries via `generateOcclusionMesh`. The mesh-renderer's occlusion path
 * (`GeometryRenderer.draw` with `ANY_SAMPLES_PASSED_CONSERVATIVE`)
 * rasterizes a cheap proxy box around the group's bounds first; if zero
 * fragments pass, every child is hidden for the next frame.
 *
 * Two proxy meshes are involved (see Renderer / GeometryRenderer):
 *   - `_occlusionMesh`         — the actual occlusion proxy; drawn very
 *                                early (renderOrder = -1000) inside a
 *                                query, with `wireframe` for cheap raster.
 *   - `_occlusionMesh._occlusionMesh` — the slightly-inflated "outer"
 *                                proxy drawn very late (renderOrder =
 *                                1000) used to re-query whether occluded
 *                                groups become visible again.
 * Both proxies use the `OcclusionMaterial` shader with `bbMin`/`bbMax`
 * uniforms describing the world-aligned bounding box.
 *
 * `updateOcclusionBoundingBox` rebuilds the group's `Box3` from each
 * child's geometry bounding box, transformed by the child's local matrix.
 * The 8 vertices of the child AABB are pushed through the matrix
 * (handles rotations) and min/max-reduced into the group bound. The
 * outer proxy is inflated by 0.01 on each axis so it captures
 * grazing-angle visibility transitions cleanly.
 */
class Group extends Base3D {
  constructor() {
    super();
    this.isGroup        = true;
    this._occlusionMesh = null;
  }

  /*
   * Lazy-build the occlusion proxy on first request. Allocates the 8 reusable
   * AABB-corner Vector3s, the wireframe proxy mesh, and the `bb` Box3 that
   * `updateOcclusionBoundingBox` writes into.
   * Self-protected via the `occlusionCulled` flag — repeated calls are no-ops.
   */
  generateOcclusionMesh() {
    this._bbVertices = [];
    for (let i = 0; i < 8; i++) this._bbVertices.push(new Vector3());

    if (this.occlusionCulled) return;
    this.occlusionCulled = true;

    const occShader = new Shader('OcclusionMaterial', {
      bbMin: { value: new Vector3(0, 0, 0) },
      bbMax: { value: new Vector3(1, 1, 1) },
    });
    occShader.wireframe = true;

    const _occlusionMesh = new Mesh(World.BOX, occShader);
    _occlusionMesh.occlusionCulled              = true;
    _occlusionMesh._occlusionGroup              = this;
    _occlusionMesh.renderOrder                  = -1e3;   // drawn first
    _occlusionMesh.hideByOcclusion              = true;
    _occlusionMesh._occlusionMesh.renderOrder   =  1e3;   // outer proxy drawn last
    this.add(_occlusionMesh);
    this._occlusionMesh = _occlusionMesh;
    this.bb = new Box3();
  }

  /*
   * Recompute the group's world-aligned bounding box by union'ing each
   * (non-proxy) child's transformed geometry AABB, then push the result
   * into the proxy shader's `bbMin`/`bbMax` uniforms.
   * The proxy mesh itself is positioned at the centre of the box so the
   * box-geometry vertices map correctly through min/max.
   */
  updateOcclusionBoundingBox() {
    this.bb.makeEmpty();
    const self = this;

    self.children.forEach((child) => {
      if (undefined !== child._occlusionGroup) return; // skip proxy meshes
      child.updateOcclusionMesh();
      const bb = child._geometry.boundingBox;
      const m = bb.min, M = bb.max;
      // 8 corners of the child AABB.
      self._bbVertices[0].set(m.x, m.y, m.z);
      self._bbVertices[1].set(m.x, m.y, M.z);
      self._bbVertices[2].set(m.x, M.y, m.z);
      self._bbVertices[3].set(M.x, m.y, m.z);
      self._bbVertices[4].set(M.x, M.y, m.z);
      self._bbVertices[5].set(M.x, m.y, M.z);
      self._bbVertices[6].set(m.x, M.y, M.z);
      self._bbVertices[7].set(M.x, M.y, M.z);
      // Transform each corner by the child's local matrix and grow the
      // group's box to contain it.
      self._bbVertices.forEach((vertex) => {
        vertex.applyMatrix4(child.matrix);
        self.bb.min.x = Math.min(self.bb.min.x, vertex.x);
        self.bb.min.y = Math.min(self.bb.min.y, vertex.y);
        self.bb.min.z = Math.min(self.bb.min.z, vertex.z);
        self.bb.max.x = Math.max(self.bb.max.x, vertex.x);
        self.bb.max.y = Math.max(self.bb.max.y, vertex.y);
        self.bb.max.z = Math.max(self.bb.max.z, vertex.z);
      });
    });

    // Push bounds into both proxies' shaders. The outer proxy is inflated
    // slightly so it catches "just-came-into-view" transitions before the
    // tight proxy does.
    this._occlusionMesh?.shader?.set('bbMin', this.bb.min);
    this._occlusionMesh?.shader?.set('bbMax', this.bb.max);
    this._occlusionMesh?._occlusionMesh?.shader?.set('bbMin', this.bb.min.add(new Vector3(-0.01, -0.01, -0.01)));
    this._occlusionMesh?._occlusionMesh?.shader?.set('bbMax', this.bb.max.add(new Vector3( 0.01,  0.01,  0.01)));
    // Centre the proxy on the bounding-box midpoint.
    this._occlusionMesh.position.copy(this.bb.max.clone().add(this.bb.min).multiplyScalar(0.5));
  }

  /*
   * Toggle `hideByOcclusion` on every real (non-proxy) child. Called by
   * the renderer with `doHide=true` when the inner proxy's query returned
   * zero samples, and with `doHide=false` when the outer proxy says
   * something became visible again.
   */
  updateOcclusionVisibility(doHide) {
    this.children.forEach((child) => {
      if (undefined === child._occlusionGroup) child.hideByOcclusion = doHide;
    });
  }
}

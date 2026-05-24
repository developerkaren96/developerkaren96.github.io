/*
 * OrthographicCamera — non-perspective projection: parallel rays, no
 * foreshortening. Used for:
 *   - 2D / UI overlays (rendering a fullscreen quad pre-scaled to NDC).
 *   - Top-down/side technical views.
 *   - Shadow maps from directional lights (sun shadows).
 *   - Reflection / refraction passes that need a fixed-size frustum.
 *
 *   new OrthographicCamera(left, right, top, bottom, near, far)
 *
 * `left`/`right` and `top`/`bottom` are the world-space extents of the
 * view box. `zoom` shrinks the visible extents around their center
 * (zoom=2 → half the world width visible, zoom=0.5 → twice).
 *
 * Call `updateProjectionMatrix()` after touching any of the extents,
 * `near`/`far`, or `zoom`. `setViewport(w, h)` is a convenience that
 * centres a (w × h) view box on the origin and rebuilds the matrix.
 */
class OrthographicCamera extends CameraBase3D {
  constructor(left, right, top, bottom, near, far) {
    super();
    this.isOrthographicCamera = true;
    this.zoom   = 1;
    this.left   = left;
    this.right  = right;
    this.top    = top;
    this.bottom = bottom;
    this.near   = near !== undefined ? near : 0.1;
    this.far    = far  !== undefined ? far  : 2e3;
    this.position.z = 1;     // pulled forward so geometry at z=0 is in frustum
    this.updateProjectionMatrix();
  }

  clone() {
    return new OrthographicCamera().copy(this);
  }

  copy(source, recursive) {
    CameraBase3D.prototype.copy.call(this, source, recursive);
    this.left   = source.left;
    this.right  = source.right;
    this.top    = source.top;
    this.bottom = source.bottom;
    this.near   = source.near;
    this.far    = source.far;
    this.zoom   = source.zoom;
    // `view` is reserved by Three.js for multi-view (split-screen) data.
    // Preserve it as a shallow copy or null.
    this.view   = source.view === null ? null : Object.assign({}, source.view);
    return this;
  }

  /*
   * Recompute projectionMatrix. The current center is preserved while
   * each half-extent is scaled by 1/zoom.
   */
  updateProjectionMatrix() {
    const dx = (this.right - this.left)  / (2 * this.zoom);
    const dy = (this.top   - this.bottom) / (2 * this.zoom);
    const cx = (this.right + this.left)  / 2;
    const cy = (this.top   + this.bottom) / 2;
    const left   = cx - dx;
    const right  = cx + dx;
    const top    = cy + dy;
    const bottom = cy - dy;
    this.projectionMatrix.makeOrthographic(left, right, top, bottom, this.near, this.far);
  }

  /*
   * Centre a (width × height) view box on the origin. Convenience used
   * to size UI cameras to the canvas (or a render target).
   */
  setViewport(width, height) {
    this.left   = width  / -2;
    this.right  = width  /  2;
    this.top    = height /  2;
    this.bottom = height / -2;
    this.updateProjectionMatrix();
  }
}

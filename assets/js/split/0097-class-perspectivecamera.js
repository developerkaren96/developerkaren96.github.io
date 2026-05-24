/*
 * PerspectiveCamera — projects the scene with a frustum.
 *
 *   new PerspectiveCamera(fov, aspect, near, far)
 *
 *   - `fov`        — vertical field of view in degrees (Three.js convention).
 *   - `aspect`     — width / height of the render target.
 *   - `near`/`far` — clipping planes (camera-space distance).
 *   - `zoom`       — divides the frustum height; cheap "post-projection" zoom.
 *   - `focus`      — DoF reference distance (consumed by effect shaders).
 *   - `filmGauge`  — virtual sensor width (35mm by default). Combined with
 *                    `aspect` it gives an "effective film height" used to
 *                    convert between focal length and fov.
 *   - `filmOffset` — lens-shift along x (off-axis projection), measured in
 *                    the same units as `filmGauge`. Non-zero values produce
 *                    skewed perspective (vertical buildings keeping verticals).
 *
 * Call `updateProjectionMatrix()` after touching any of those.
 */
class PerspectiveCamera extends CameraBase3D {
  constructor(fov, aspect, near, far) {
    super();
    this.type       = 'PerspectiveCamera';
    this.fov        = fov    || 50;
    this.zoom       = 1;
    this.near       = near   || 0.1;
    this.far        = far    || 2e3;
    this.focus      = 10;
    this.aspect     = aspect || 1;
    this.filmGauge  = 35;
    this.filmOffset = 0;
    this.updateProjectionMatrix();
  }

  clone() { return new PerspectiveCamera().copy(this); }

  copy(source, recursive) {
    CameraBase3D.prototype.copy.call(this, source, recursive);
    this.fov        = source.fov;
    this.zoom       = source.zoom;
    this.near       = source.near;
    this.far        = source.far;
    this.focus      = source.focus;
    this.aspect     = source.aspect;
    this.filmGauge  = source.filmGauge;
    this.filmOffset = source.filmOffset;
    return this;
  }

  /**
   * Set fov via a physical focal length (mm-ish, in `filmGauge` units).
   * Inverse of `getFocalLength`.
   *
   *   tan(fov/2) = (filmHeight/2) / focalLength
   */
  setFocalLength(focalLength) {
    const vExtentSlope = (0.5 * this.getFilmHeight()) / focalLength;
    this.fov = Math.degrees(2 * Math.atan(vExtentSlope));
    this.updateProjectionMatrix();
  }
  getFocalLength() {
    const vExtentSlope = Math.tan(Math.radians(0.5 * this.fov));
    return (0.5 * this.getFilmHeight()) / vExtentSlope;
  }
  /** fov adjusted for the zoom factor — useful for HUD overlays that mimic the lens. */
  getEffectiveFOV() {
    return Math.degrees(2 * Math.atan(Math.tan(Math.radians(0.5 * this.fov)) / this.zoom));
  }
  /** Effective film width — `filmGauge` is the *long* side, so portrait shrinks it. */
  getFilmWidth()  { return this.filmGauge * Math.min(this.aspect, 1); }
  getFilmHeight() { return this.filmGauge / Math.max(this.aspect, 1); }

  /**
   * Build the projection matrix from current `fov`/`aspect`/`near`/`far`/`zoom`.
   *
   *   top   = near · tan(fov/2) / zoom
   *   width = aspect · 2·top
   *   skew  = filmOffset shifts the frustum left/right by (near · skew / filmWidth)
   *
   * Then delegates to `Matrix4.makePerspective` for the actual matrix fill.
   */
  updateProjectionMatrix() {
    const near = this.near;
    const top    = (near * Math.tan(Math.radians(0.5 * this.fov))) / this.zoom;
    const height = 2 * top;
    const width  = this.aspect * height;
    let left = -0.5 * width;
    const skew = this.filmOffset;   // (the parens around `this.view, this.filmOffset` in the
                                    //  minified original were a leftover comma-expr from a
                                    //  removed multi-view code path)
    if (skew !== 0) left += (near * skew) / this.getFilmWidth();

    this.projectionMatrix.makePerspective(left, left + width, top, top - height, near, this.far);
  }
}

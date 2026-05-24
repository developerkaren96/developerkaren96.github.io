/*
 * Scene — root node of the 3D scene graph. Extends `Base3D` (Object3D-like:
 * transform, parent/children, visibility).
 *
 * Fields:
 *   - `toRender`  — paired buffers `[opaque[], transparent[]]` that the
 *     Renderer fills each frame via traversal. Reset, never reallocated.
 *   - `displayNeedsUpdate` — setter doubles as an event channel: any time
 *     it's set `true`, every callback registered via `bindSceneChange`
 *     fires. Used by FBO post-process passes to know when to invalidate
 *     their cached output.
 *   - `autoUpdate` — Renderer skips world-matrix recompute when false
 *     (useful for static scenes that update their own transforms manually).
 */
class Scene extends Base3D {
  constructor() {
    super();
    this.autoUpdate = true;
    // Two render lists: opaque (front-to-back) and transparent (back-to-front).
    this.toRender = [[], []];
    this._displayNeedsUpdate = true;
    this.isScene = true;
    this.changes = [];
  }

  /** Setting to true notifies every bound listener (FBO invalidation, etc.). */
  set displayNeedsUpdate(v) {
    if (v === true) this.changes.forEach((cb) => cb());
    this._displayNeedsUpdate = v;
  }
  get displayNeedsUpdate() { return this._displayNeedsUpdate; }

  /** Register a one-way listener that fires when `displayNeedsUpdate = true`. */
  bindSceneChange(cb) {
    this.changes.push(cb);
  }
}

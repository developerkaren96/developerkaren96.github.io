/*
 * Shadow — depth render-target + camera attached to a light, used to
 * render a shadow map from the light's perspective.
 *
 * The light owns its camera (added as a child via `light.add(this.camera)`)
 * so it inherits the light's transform; the renderer calls
 * `BaseLight.prepareRender` each shadow pass to point the camera at
 * `target` from the light's world position.
 *
 * Defaults: 60° perspective frustum, 1024×1024 depth RT, near/far 0.1/50.
 * Switching `fov = -1` swaps to an orthographic frustum (for directional
 * lights — parallel projection is what a sun-style light wants).
 *
 * Live setters keep the camera's projection matrix in sync with frustum
 * tweaks (fov, area, near, far) and resize the depth RT for `size`. The
 * `_xxx` mirrors store the last applied value so the getter is cheap and
 * external code can read the same number it wrote.
 */
class Shadow {
  constructor(light) {
    this.light   = light;
    this.camera  = new PerspectiveCamera(60, 1, 0.1, 50);
    this.target  = new Vector3();
    this.rt      = new RenderTarget(1024, 1024);
    this.rt.createDepthTexture();   // we only need depth — color is dropped
    this.enabled = true;
    this._size   = 1024;
    this._fov    = 60;
    this._far    = 50;
    this._near   = 0.1;
    light.add(this.camera);
  }

  destroy() { this.rt.destroy(); }

  // fov = -1 → swap to orthographic projection (directional / sun light).
  // The light retains the old camera as a child until next add(); leave that
  // for callers, it matches the original behaviour.
  set fov(value) {
    this._fov = value;
    this.camera.fov = value;
    this.camera.updateProjectionMatrix();
    if (-1 == value) this.camera = new OrthographicCamera(-5, 5, 5, -5, 0.1, 50);
  }
  get fov() { return this._fov; }

  // Ortho frustum half-extent (centred on origin).
  set area(value) {
    this._area = value;
    this.camera.left   = -value;
    this.camera.right  =  value;
    this.camera.top    =  value;
    this.camera.bottom = -value;
    this.camera.updateProjectionMatrix();
  }
  get area() { return this._area; }

  set far(value)  { this._far = value;  this.camera.far  = value; this.camera.updateProjectionMatrix(); }
  get far()       { return this._far; }
  set near(value) { this._near = value; this.camera.near = value; this.camera.updateProjectionMatrix(); }
  get near()      { return this._near; }

  // Resize the depth RT (square — shadow maps are always 1:1).
  set size(value) { this._size = value; this.rt.setSize(value, value); }
  get size()      { return this._size; }
}

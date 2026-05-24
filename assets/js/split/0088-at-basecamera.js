/*
 * BaseCamera — a per-Component camera wrapper that lives inside a scene
 * graph. One BaseCamera = one logical "shot" or POV the component owns.
 *
 *   class HeroShot extends Component {
 *     init() {
 *       const cam = this.initClass(BaseCamera);
 *       cam.position.set(0, 1, 5);
 *       cam.lock();    // make the global Camera follow this view
 *     }
 *   }
 *
 * Responsibilities:
 *   - Own the actual `PerspectiveCamera` / `OrthographicCamera` node and
 *     keep its aspect / viewport in sync with the Stage on resize.
 *   - Provide `lock()` / `transition()` / `manualTransition()` shortcuts
 *     that talk to the global `Camera` singleton (which is what the
 *     Renderer actually reads each frame).
 *   - In playground/debug mode, render a small wireframe-cube mesh at the
 *     camera's pose so designers can see where shots are aimed from.
 *   - Expose `zoom` / `near` / `far` through Object3D's get/set wiring so
 *     they re-trigger `updateProjectionMatrix` transparently.
 */
Class(function BaseCamera(_input, _group) {
  Inherit(this, Object3D);
  const self = this;

  let _debugCamera;
  let _type = 'perspective';

  /**
   * Resize handler — keep camera aspect/viewport in lock with Stage.
   * `overrideResize` lets owners short-circuit the default behavior.
   */
  function resize() {
    if (self.overrideResize) {
      if (typeof self.overrideResize === 'function') self.overrideResize();
      return;
    }
    switch (_type) {
      case 'perspective':
        self.camera.aspect = Stage.width / Stage.height;
        self.camera.updateProjectionMatrix();
        break;
      case 'orthographic':
        if (self.width || self.height) {
          self.camera.setViewport(self.width, self.height);
        } else {
          // Default ortho fit: maintain a 9px-per-unit scale at 900px tall.
          const m = 900 / Stage.height / 100;
          self.camera.setViewport(Stage.width * m, Stage.height * m);
        }
    }
  }

  this.camera = new PerspectiveCamera(30, Stage.width / Stage.height, 0.1, 1e3);
  this.group.add(this.camera);

  /**
   * In Playground mode, if the wrapping component name is in the playground
   * path AND we're running in normal-render mode, automatically lock the
   * global Camera to this shot. Used by "scene preview" tooling.
   */
  this.playgroundLock = function (camera = Camera.instance()) {
    if (!Global.PLAYGROUND) return;
    if (Utils.getConstructorName(self.parent).includes(Global.PLAYGROUND.split('/')[0])
        && RenderManager.type === RenderManager.NORMAL) {
      camera.lock(self.camera);
    }
  };

  /**
   * Lock the global Camera to this shot. With no argument, walk up the
   * parent chain looking for an owner that wants to mediate (`useCamera`
   * on a "nuke"-style ancestor), otherwise lock the global Camera directly.
   */
  this.lock = function (camera) {
    if (_type === 'orthographic' && !camera.worldCamera.isOrthographicCamera) {
      return console.error(
        "You can't lock an orthographic camera to the main camera. Use an FXScene .setCamera",
      );
    }
    if (!camera) {
      // Bubble up looking for a useCamera mediator.
      let p = self.parent;
      while (p) {
        if (p.useCamera && p.nuke) return p.useCamera(self);
        p = p.parent;
      }
    }
    camera = camera || Camera.instance();
    if (RenderManager.type === RenderManager.NORMAL) camera.lock(self.camera);
  };

  /**
   * Animated transition to this shot. `delay` may be passed positionally
   * before `camera` (shifted internally). Resolves the returned promise
   * when `time + delay` has elapsed.
   */
  this.transition = function (time, ease, delay, camera = Camera.instance()) {
    if (typeof delay === 'object') { camera = delay; delay = 0; }
    const p = Promise.create();
    camera.transition(self.camera, time, ease, delay || 0);
    self.delayedCall(() => p.resolve(), time + (delay || 0));
    return p;
  };

  /** Step-driven transition — caller advances the `0..1` value manually. */
  this.manualTransition = function (camera = Camera.instance()) {
    return camera.manualTransition(self.camera);
  };

  this.setFOV = function (fov) {
    if (_type !== 'orthographic' && fov !== this.camera.fov) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  };
  this.getFOV = function () { return this.camera.fov; };

  /** Switch to orthographic projection (one-way, builds a fresh camera). */
  this.useOrthographic = function (w, h) {
    if (_type === 'orthographic') return;
    if (!isNaN(w)) this.width  = w;
    if (!isNaN(h)) this.height = h;
    if (this.camera) this.group.remove(this.camera);
    this.camera = new OrthographicCamera();
    this.group.add(this.camera);
    this.camera.position.z = 1;
    _type = 'orthographic';
    resize();
  };

  /** Switch back to perspective. */
  this.usePerspective = function () {
    if (_type === 'perspective') return;
    if (this.camera) this.group.remove(this.camera);
    this.camera = new PerspectiveCamera();
    this.group.add(this.camera);
    _type = 'perspective';
    resize();
  };

  /** Tag this camera with a path-curve — `Camera.transition` follows it. */
  this.useCurve = function (curve) {
    self.camera.curve = curve;
    return this;
  };

  // Component get/set hooks: changing these properties reactively rebuilds
  // the projection matrix on the underlying camera node.
  self.get('zoom', () => self.camera.zoom);
  self.set('zoom', (zoom) => {
    self.camera.zoom = zoom;
    self.camera.updateProjectionMatrix();
  });
  self.get('near', () => self.camera.near);
  self.set('near', (near) => {
    self.camera.near = near;
    self.camera.updateProjectionMatrix();
  });
  self.get('far',  () => self.camera.far);
  self.set('far',  (far) => {
    self.camera.far = far;
    self.camera.updateProjectionMatrix();
  });

  /**
   * Bulk-set projection properties; only triggers `updateProjectionMatrix`
   * once at the end (and only if anything actually moved).
   */
  self.setProjectionProperties = function ({ fov, near, far, zoom }) {
    let needsUpdate = false;
    if (_type !== 'orthographic' && fov !== undefined && fov !== this.camera.fov) {
      this.camera.fov = fov; needsUpdate = true;
    }
    if (near !== undefined && near !== this.camera.near) {
      this.camera.near = near; needsUpdate = true;
    }
    if (far !== undefined && far !== this.camera.far) {
      this.camera.far = far;   needsUpdate = true;
    }
    if (zoom !== undefined && zoom !== this.camera.zoom) {
      this.camera.zoom = zoom; needsUpdate = true;
    }
    if (needsUpdate) self.camera.updateProjectionMatrix();
  };

  // ─── Init ───────────────────────────────────────────────────────────────
  (function init() {
    self.startRender(() => {
      self.group.updateMatrixWorld(true);
      // Keep the debug gizmo at a constant on-screen size.
      if (_debugCamera && _debugCamera.visible) {
        Utils3D.decompose(self.camera, _debugCamera);
        const active = AppState.get('playground_camera_active');
        let viewportHeight;
        if (active.isOrthographicCamera) {
          viewportHeight = (active.top - active.bottom) / active.zoom;
        } else {
          viewportHeight = Utils3D.getHeightFromCamera(
            active,
            self.camera.position.distanceTo(active.position),
          );
        }
        // Scale so the gizmo is ~2.5% of the viewport height at unit distance.
        _debugCamera.scale.setScalar((0.025 * viewportHeight) / 0.1);
      }
    });
    self.onResize(resize);

    // CameraUIL — playground UI panel showing fov/near/far sliders, etc.
    if (_input) {
      self.prefix = _input.prefix;
      const cameraUIL = CameraUIL.add(self, _group);
      cameraUIL.setLabel('Camera');
      self.group._cameraUIL = cameraUIL;
    }

    // In playground mode, render a small cube where this camera sits.
    if (Global.PLAYGROUND) {
      AppState.bind('playground_camera_active', (active) => {
        if (!self.group._parent) return;
        if (active) {
          if (!_debugCamera) {
            _debugCamera = new Mesh(
              new BoxGeometry(0.1, 0.1, 0.2),
              new Shader('DebugCamera', {
                uColor: { value: new Color('#ffffff') },
                transparent: true,
                depthTest: false,
              }),
            );
            _debugCamera.renderOrder = 9999;
            // Defer attaching until parent is set up.
            self.delayedCall(() => self.group._parent.add(_debugCamera), 50);
          }
          _debugCamera.visible = true;
        } else if (_debugCamera) {
          _debugCamera.visible = false;
        }
      });
    }
  })();
});

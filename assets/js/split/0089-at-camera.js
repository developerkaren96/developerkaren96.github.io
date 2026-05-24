/*
 * Camera (singleton) — the cinematic-camera blender.
 *
 * The Renderer reads one `worldCamera` every frame. This class smoothly
 * blends that `worldCamera` toward whatever shot has been `lock`ed or
 * `transition`ed to, using a three-stage low-pass:
 *
 *   prev/lock → _target → _cameraTarget → _cameraTarget2 → worldCamera
 *                lerp        lerp2           finalLerp        finalLerp
 *
 * Each stage uses `Group.lerp` (`hz=false` so the alpha is interpreted as
 * a constant per-frame factor — the caller has already framerate-normalized
 * if needed).
 *
 * Transitions:
 *   - `lock(camera)`     — snap (filtered by the three lerps).
 *   - `transition(camera, dur, ease, delayOrSlot)` — tween a `weight` from
 *     0 → 1 over `dur`, slerping between `_prevCamera` and `_lockCamera`.
 *   - `manualTransition(camera)` — same as `transition` but the caller
 *     drives `weight` manually (UI scrubbing, scroll-locked shots).
 *
 * Curve mode:
 *   When the target camera has a `.curve`, the position interpolation runs
 *   along that curve (`getPointAt(weight)`), with `lerpOffset` lined up so
 *   the curve endpoints meet the prev/lock positions. Fires `onCurveComplete`
 *   when the weight first hits 1.
 *
 * `RenderManager.fire(self)` lets other systems hook into the post-blend
 * step (matrix-uniform updates, custom shadows, …).
 */
Class(function Camera(_worldCamera) {
  Inherit(this, Component);
  const self = this;

  let _debug, _prevCamera, _lockCamera, _curve, _manual, _scheduleSlot;
  const _calc          = new Vector3();
  const _target        = new Group();
  const _anim          = { weight: 0, weight2: 0 };
  const _center        = new Vector3();
  const _cameraTarget  = new Group();
  const _cameraTarget2 = new Group();

  /** Tick — gated by `_scheduleSlot` so external slot-owners can drive the order. */
  function loop() {
    if (!_scheduleSlot) render();
  }

  function render() {
    // Debug gizmo: hidden when at "origin" (initial position before any binds).
    if (_debug) _debug.visible = !_debug.position.equals(_center);
    // Manual mode: caller is driving `_anim.weight2` directly via `_manual.value`.
    if (_manual) _anim.weight2 = _manual.value;
    _anim.weight += (_anim.weight2 - _anim.weight) * self.lerp;

    if (_prevCamera) {
      // ── Transition: blend prev → lock by `_anim.weight` ──────────────────
      _prevCamera.updateMatrixWorld();
      _lockCamera.updateMatrixWorld();

      if (_curve) {
        // Curve-driven position: position runs along `_curve`; orientation
        // still slerps quaternions directly. `lerpOffset` aligns the curve's
        // endpoint with `_lockCamera`'s world position.
        if (!_curve.lerpPos) {
          _curve.lerpPos = new Vector3().copy(_prevCamera.getWorldPosition());
        }
        if (!_curve.lerpOffset) {
          _curve.lerpOffset = new Vector3()
            .copy(_curve.getPointAt(1))
            .multiplyScalar(-2)
            .add(_lockCamera.getWorldPosition());
        }
        const pos = _calc
          .copy(_curve.getPointAt(_anim.weight))
          .add(_curve.lerpOffset)
          .add(_lockCamera.getWorldPosition());
        _curve.lerpPos.lerp(pos, _curve.lerp || 1, false);
        _target.position.copy(_curve.lerpPos);

        if (_anim.weight >= 1) {
          _curve = _curve.lerpPos = _curve.lerpOffset = null;
          if (self.onCurveComplete) self.onCurveComplete();
        }
      } else {
        // Straight lerp between prev and lock positions.
        _target.position
          .copy(_prevCamera.getWorldPosition())
          .lerp(_lockCamera.getWorldPosition(), _anim.weight, false);
      }
      _target.quaternion
        .copy(_prevCamera.getWorldQuaternion())
        .slerp(_lockCamera.getWorldQuaternion(), _anim.weight, false);

      // Mix projection-affecting properties so cuts feel natural.
      let needsUpdate = false;
      const zoom = Math.mix(_prevCamera.zoom, _lockCamera.zoom, _anim.weight);
      if (_worldCamera.zoom !== zoom) {
        _worldCamera.zoom = zoom; needsUpdate = true;
      }
      const fov = !_worldCamera.isOrthographicCamera
        && Math.mix(_prevCamera.fov, _lockCamera.fov, _anim.weight);
      if (fov && _worldCamera.fov !== fov) {
        _worldCamera.fov = fov; needsUpdate = true;
      }
      const near = Math.mix(_prevCamera.near, _lockCamera.near, _anim.weight);
      if (_worldCamera.near !== near) {
        _worldCamera.near = near; needsUpdate = true;
      }
      const far  = Math.mix(_prevCamera.far, _lockCamera.far, _anim.weight);
      if (_worldCamera.far !== far) {
        _worldCamera.far = far; needsUpdate = true;
      }
      if (needsUpdate) _worldCamera.updateProjectionMatrix();

      // Stage 2 lowpass: `_target` → `_cameraTarget`.
      _cameraTarget.position.lerp(_target.position, self.lerp2, false);
      _cameraTarget.quaternion.slerp(_target.quaternion, self.lerp2, false);
    } else if (_lockCamera) {
      // ── Locked (no in-flight transition) — track lock directly ──────────
      _lockCamera.updateMatrixWorld();
      Utils3D.decompose(_lockCamera, _cameraTarget);
      let needsUpdate = false;
      if (_lockCamera.zoom && _worldCamera.zoom !== _lockCamera.zoom) {
        _worldCamera.zoom = _lockCamera.zoom; needsUpdate = true;
      }
      if (!_worldCamera.isOrthographicCamera && _worldCamera.fov !== _lockCamera.fov) {
        _worldCamera.fov = _lockCamera.fov;   needsUpdate = true;
      }
      if (_worldCamera.near !== _lockCamera.near) {
        _worldCamera.near = _lockCamera.near; needsUpdate = true;
      }
      if (_worldCamera.far !== _lockCamera.far) {
        _worldCamera.far  = _lockCamera.far;  needsUpdate = true;
      }
      if (needsUpdate) _worldCamera.updateProjectionMatrix();
    }

    // Stage 3: `_cameraTarget` → `_cameraTarget2` → `_worldCamera`.
    if (_prevCamera || _lockCamera) {
      _cameraTarget2.position.lerp(_cameraTarget.position, self.finalLerp, false);
      _cameraTarget2.quaternion.slerp(_cameraTarget.quaternion, self.finalLerp, false);
      _worldCamera.position.lerp(_cameraTarget2.position, self.finalLerp, false);
      _worldCamera.quaternion.slerp(_cameraTarget2.quaternion, self.finalLerp, false);
    }

    _worldCamera.updateMatrixWorld();

    if (_debug) {
      _debug.position.copy(_worldCamera.position);
      _debug.quaternion.copy(_worldCamera.quaternion);
    }
    RenderManager.fire(self);
  }

  // Default lerps = 1 (instant track); designers can lower for smoothing.
  this.lerp        = 1;
  this.lerp2       = 1;
  this.worldCamera = _worldCamera;
  this.finalLerp   = 1;
  this.multiTween  = true;

  (function init() {
    // In non-NORMAL render modes (e.g. offscreen/worker), this singleton is
    // inert — drop the worldCamera reference so callers don't accidentally
    // mutate the shared one.
    if (RenderManager.type !== RenderManager.NORMAL) {
      _worldCamera = undefined;
      self.worldCamera = _worldCamera;
      return;
    }
    _worldCamera.controllingCamera = self;
    self.startRender(loop, RenderManager.AFTER_LOOPS);
  })();

  /**
   * Snap to `camera` (still filtered by the three-stage lerps). When passed
   * another `Camera` instance, treat its slot as the schedule key (so locking
   * cascades stay ordered).
   */
  this.lock = function (camera, scheduleSlot) {
    if (camera instanceof Camera) {
      scheduleSlot = camera;
      camera = camera.worldCamera;
    } else if (camera.controllingCamera) {
      scheduleSlot = camera.controllingCamera;
    }
    _lockCamera = camera;
    _prevCamera = null;
    if (_worldCamera) {
      // Move our render slot to follow the new owner, if specified.
      if (_scheduleSlot) self.stopRender(render, _scheduleSlot);
      _scheduleSlot = scheduleSlot;
      if (_scheduleSlot) self.startRender(render, _scheduleSlot);

      if (_lockCamera.zoom) _worldCamera.zoom = _lockCamera.zoom;
      if (!_worldCamera.isOrthographicCamera) _worldCamera.fov = _lockCamera.fov;
      _worldCamera.updateProjectionMatrix();
      render();
    }
  };

  /**
   * Tween toward `camera` over `duration`. The 4th argument is overloaded:
   * a number → delay, an object → schedule slot. Re-targeting the *same*
   * camera mid-flight shortens the remaining duration and inverts the
   * weight so the motion stays continuous instead of snapping.
   */
  this.transition = function (camera, duration = 1e3, ease = 'easeInOutCubic', scheduleSlotOrDelay) {
    let delay, scheduleSlot;
    if (typeof scheduleSlotOrDelay === 'number') delay = scheduleSlotOrDelay;
    else if (scheduleSlotOrDelay) scheduleSlot = scheduleSlotOrDelay;

    if (camera instanceof Camera) {
      scheduleSlot = camera;
      camera = camera.worldCamera;
    } else if (camera.controllingCamera) {
      scheduleSlot = camera.controllingCamera;
    }

    // Drop any leftover curve from the previous transition.
    if (_curve) _curve = _curve.lerpPos = _curve.lerpOffset = null;
    if (camera.curve) {
      _curve = camera.curve;
      _curve.lerpPos = camera.lerpPos;
    }

    if (_prevCamera === camera) {
      // Re-targeting the same camera — preserve continuity.
      duration *= 0.5 * Math.smoothStep(0.5, 1, _anim.weight) + 0.5;
      _anim.weight = 1 - _anim.weight;
    } else {
      _anim.weight = 0;
    }
    _manual = undefined;

    if (scheduleSlot && _worldCamera) {
      if (_scheduleSlot) self.stopRender(render, _scheduleSlot);
      _scheduleSlot = scheduleSlot;
      self.startRender(render, _scheduleSlot);
    }

    _anim.weight2 = _anim.weight;
    _prevCamera   = _lockCamera;
    _lockCamera   = camera;
    return tween(_anim, { weight2: 1 }, duration, ease, delay);
  };

  /** Manual driver — caller advances `_manual.value` to drive `weight2`. */
  this.manualTransition = function (camera) {
    this.transition(camera).stop();
    _manual = { value: 0 };
    return _manual;
  };

  /**
   * Force-set the "previous" camera (skipping the implicit prev = current).
   * Used when the caller wants to start a transition mid-blend from a
   * non-current pose.
   */
  this.setPrevCamera = function (camera) {
    _prevCamera = camera.camera || camera;
  };

  this.get('worldCamera', () => _worldCamera);
  this.get('lockCamera',  () => _lockCamera);
  this.set('debugScale', (s) => {
    if (_debug) _debug.scale.setScalar(s);
  });

  /**
   * Create a *local* Camera that drives its own worldCamera (instead of the
   * shared singleton). Useful for picture-in-picture, mirrors, FXScene
   * sub-renders. If no camera is passed, clones the main `World.CAMERA` and
   * keeps its aspect synced with Stage.
   */
  this.createLocal = function (camera) {
    if (!camera) {
      camera = World.CAMERA.clone();
      self.onResize(() => {
        camera.aspect = Stage.width / Stage.height;
        camera.updateProjectionMatrix();
      });
    }
    return new Camera(camera.camera || camera);
  };
}, 'singleton');

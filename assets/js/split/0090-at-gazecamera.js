/*
 * GazeCamera — first-person-ish camera driven by pointer position or
 * mobile accelerometer, with optional sub-frame "wobble" for a hand-held
 * feel. Inherits BaseCamera so it plugs into the cinematic-camera
 * Camera blender (camera.lerp / camera.finalLerp) the same way other
 * camera variants do.
 *
 * Inputs in priority order (per frame):
 *   1. self.customMove (Vector2) — if useCustomMove was set true, the
 *      camera follows this vector clamped to [-1, 1]. Used when the
 *      app wants programmatic control (cinematic sequences, scroll-
 *      linked motion, etc.).
 *   2. Mobile.Accelerometer — if useAccelerometer is true and the
 *      device is reporting. X tilt only; Y stays at 0 so vertical
 *      drift doesn't motion-sick the user.
 *   3. Mouse / touch — Mouse.x/y mapped to [-1, 1] across Stage.
 *
 * The chosen (moveX, moveY) ∈ [-1, 1]² is then:
 *   • Scaled by `moveXY` (per-axis magnitude in world units),
 *     `strength` (master gain), and `_strength.v` (the 0↔1 tween used
 *     by `still()` / `orbit()` to freeze / unfreeze motion).
 *   • Added to the rest `position` to form `_move` — the target.
 *
 * Two-stage smoothing:
 *   `_position.lerp(_move, lerpSpeed2)` → intermediate pose, then
 *   `camera.position.lerp(_position, lerpSpeed)` → final pose. Two
 *   stages lets the camera follow targets sharply (high lerpSpeed2)
 *   while still riding gently (low lerpSpeed), which gives a
 *   "look-ahead with shoulder dampening" feel.
 *
 * Roll-on-flick:
 *   `_rotation` is driven by the X-axis velocity (`moveX - prevMoveX`),
 *   clamped to deltaRotate degrees, eased by deltaLerp. The roll
 *   applies to `_innerGroup` (a Group between self.group and the camera
 *   itself), so the camera frame banks slightly with horizontal motion
 *   without rotating the parent group's axes.
 *
 * Viewport focus offset (`focusViewport` IIFE):
 *   When `viewportFocus` is non-zero, after camera.lookAt the camera
 *   position is nudged so the lookAt target lands at the requested NDC
 *   coordinate (instead of dead center). It projects lookAt with the
 *   camera's matrices (cached into _cacheObj to avoid mutating
 *   self.camera's projection), shifts in NDC, unprojects, and adds the
 *   delta back to camera.position. The flag `_hasViewportFocusOffset`
 *   gates the subtract-from-camera step at the *start* of the next
 *   frame, so each frame zeroes-out the previous offset before applying
 *   the fresh one.
 *
 * Wobble:
 *   When `wobbleStrength > 0`, _innerGroup.position drifts on a
 *   compound-sinusoid Lissajous figure scaled by `_strength.v`. The
 *   chained sin/cos multiplications (lines for _wobble.x/y) intentionally
 *   produce non-periodic-looking motion despite being deterministic.
 *   When wobble turns off, the position eases back to zero and the
 *   'hasWobble' flag clears once it's within 1mm.
 *
 * Manual render:
 *   Default mode uses Hydra's render loop. Setting `manualRender = true`
 *   stops the loop; the caller must invoke `.update()` each frame.
 *   `.update()` emits a one-shot warning in LOCAL builds if used while
 *   manualRender is still false (caller forgot to opt in).
 */
Class(function GazeCamera(_input, _group) {
  Inherit(this, BaseCamera);
  const self = this;

  // _strength.v ∈ [0, 1] — the master multiplier toggled by orbit/still.
  const _strength = { v: 1 };
  // Scratch object that pretends to be a Camera for the focus-offset
  // project/unproject pass (avoids mutating self.camera's matrices).
  const _cacheObj = {};
  const _move = new Vector3();
  const _position = new Vector3();
  const _wobble = new Vector3();
  let _rotation = 0;
  // Random phase so multiple GazeCameras don't wobble in lockstep.
  const _wobbleAngle = Math.radians(Math.rand(0, 360));
  const _innerGroup = new Group();
  const _viewportFocusOffset = new Vector3();
  let _hasViewportFocusOffset = false;
  let _manualRender = false;
  const _quaternion = new Quaternion();
  let _useCustomMove = false;
  let _prevMoveX = 0;
  const V3_ZERO = new Vector3(0);

  /*
   * Main per-frame update. Owns input selection, smoothing, roll,
   * viewport focus, and wobble. Pulled out so .update() can call it
   * when manualRender is on.
   */
  function loop() {
    // Undo last frame's viewport-focus offset so this frame's recompute
    // is layered on the un-offset pose.
    if (_hasViewportFocusOffset) self.camera.position.sub(_viewportFocusOffset);

    // Input selection — custom > accelerometer > mouse.
    let moveX = 0;
    let moveY = 0;
    if (_useCustomMove) {
      moveX = Math.clamp(self.customMove.x, -1, 1);
      moveY = Math.clamp(self.customMove.y, -1, 1);
    } else if (self.useAccelerometer && Mobile.Accelerometer && Mobile.Accelerometer.connected) {
      // Accelerometer X is in g-units; map ±2g to ±1.
      // Y is held at 0 to avoid vertical drift on mobile.
      moveX = Math.range(Mobile.Accelerometer.x, -2, 2, -1, 1, true);
      moveY = 0;
    } else {
      moveX = Math.range(Mouse.x, 0, Stage.width, -1, 1, true);
      moveY = Math.range(Mouse.y, 0, Stage.height, -1, 1, true);
    }

    // Target = rest position + input-scaled offset.
    _move.x = self.position.x + moveX * _strength.v * self.moveXY.x * self.strength;
    _move.y = self.position.y + moveY * _strength.v * self.moveXY.y * self.strength;

    // X-velocity for roll-on-flick. Normalized against Stage.width so
    // fast pointer motion produces the full deltaRotate angle.
    const deltaX = moveX - _prevMoveX;
    _prevMoveX = moveX;
    const rotateStrength = Math.range(Math.abs(deltaX) / Stage.width, 0, 0.02, 0, 1, true);

    // Target roll, then double-lerp toward inner-group rotation for a
    // settled bank.
    _rotation = Math.lerp(
      Math.radians(self.deltaRotate) * rotateStrength * Math.sign(deltaX),
      _rotation,
      0.02 * self.deltaLerp * _strength.v,
    );
    _innerGroup.rotation.z = Math.lerp(_rotation, _innerGroup.rotation.z, 0.07 * self.deltaLerp);

    // Two-stage position smoothing.
    _move.z = self.position.z;
    _position.lerp(_move, self.lerpSpeed2);
    _position.z += self.zoomOffset;
    self.camera.position.lerp(_position, self.lerpSpeed);
    self.camera.lookAt(self.lookAt);

    // Optional extra rotation on top of the lookAt orientation.
    if (
      Math.abs(self.cameraRotation.x) > Base3D.DIRTY_EPSILON ||
      Math.abs(self.cameraRotation.y) > Base3D.DIRTY_EPSILON ||
      Math.abs(self.cameraRotation.z) > Base3D.DIRTY_EPSILON
    ) {
      _quaternion.setFromEuler(self.cameraRotation);
      self.camera.quaternion.multiply(_quaternion);
    }

    // Re-anchor lookAt at the requested NDC point (viewportFocus).
    (function focusViewport() {
      const nextHasViewportFocusOffset =
        Math.abs(self.viewportFocus.x) > 1e-4 || Math.abs(self.viewportFocus.y) > 1e-4;
      if (nextHasViewportFocusOffset !== _hasViewportFocusOffset) {
        if (!nextHasViewportFocusOffset) _viewportFocusOffset.setScalar(0);
        _hasViewportFocusOffset = nextHasViewportFocusOffset;
      }
      if (!_hasViewportFocusOffset) return;

      // Stand-in for a Camera object — Three's project()/unproject()
      // only need matrixWorld and projectionMatrix.
      const localCamera = _cacheObj;
      const camera = self.camera;
      if (camera.matrixDirty) camera.updateMatrix();
      localCamera.matrixWorld = camera.matrix;
      localCamera.projectionMatrix = camera.projectionMatrix;

      // Project lookAt → NDC, shift, unproject → world.
      _viewportFocusOffset.copy(self.lookAt).project(localCamera);
      // Camera looking straight at lookAt produces NaN/Inf in project
      // — pretend the offset is zero in that case.
      if (!isFinite(_viewportFocusOffset.x)) _viewportFocusOffset.set(0, 0, 0);
      _viewportFocusOffset.x -= self.viewportFocus.x;
      _viewportFocusOffset.y -= self.viewportFocus.y;
      _viewportFocusOffset.unproject(localCamera);
      _viewportFocusOffset.sub(self.lookAt);

      // Final shift; next frame begins by subtracting this offset.
      self.camera.position.add(_viewportFocusOffset);
    })();

    // Wobble: compound-sinusoid hand-held jitter on _innerGroup.
    if (self.wobbleStrength > 0) {
      const t = Render.TIME;
      _wobble.x =
        Math.cos(_wobbleAngle + t * (75e-5 * self.wobbleSpeed)) *
        (_wobbleAngle + 200 * Math.sin(t * (95e-5 * self.wobbleSpeed)));
      _wobble.y =
        Math.sin(Math.asin(Math.cos(_wobbleAngle + t * (85e-5 * self.wobbleSpeed)))) *
        (150 * Math.sin(_wobbleAngle + t * (75e-5 * self.wobbleSpeed)));
      _wobble.x *= 2 * Math.sin(_wobbleAngle + t * (75e-5 * self.wobbleSpeed));
      _wobble.y *= 1.75 * Math.cos(_wobbleAngle + t * (65e-5 * self.wobbleSpeed));
      _wobble.x *= 1.1 * Math.cos(_wobbleAngle + t * (75e-5 * self.wobbleSpeed));
      _wobble.y *= 1.15 * Math.sin(_wobbleAngle + t * (25e-5 * self.wobbleSpeed));
      _wobble.z = Math.sin(_wobbleAngle + 0.0025 * _wobble.x) * (100 * self.wobbleZ);
      _wobble.multiplyScalar(0.001 * self.wobbleStrength * _strength.v);
      _innerGroup.position.lerp(_wobble, 0.07);
      self.flag('hasWobble', true);
    } else if (self.flag('hasWobble')) {
      // Ease back to rest when wobble turns off; clear the flag once
      // we're effectively at zero so the lerp short-circuits next frame.
      _innerGroup.position.lerp(V3_ZERO, 0.07);
      if (_innerGroup.position.length() < 0.001) {
        _innerGroup.position.set(0, 0, 0);
        self.flag('hasWobble', false);
      }
    }
  }

  this.strength = 1;
  this.moveXY = new Vector2(4, 4);

  /*
   * `position` — sub-Component exposing x/y/z accessors plus copy /
   * set / toArray / fromArray. Setting Z directly also pushes into
   * _move and the live camera so the parallax base depth is honored
   * immediately (without waiting for a frame).
   */
  this.position = new (function Position() {
    Inherit(this, Component);
    let _x = 0;
    let _y = 0;
    let _z = 0;

    this.get('x', () => _x);
    this.get('y', () => _y);
    this.get('z', () => _z);
    this.set('x', (x) => { _x = x; });
    this.set('y', (y) => { _y = y; });
    this.set('z', (z) => {
      _z = z;
      _move.z = _z;
      self.camera.position.copy(_move);
      _position.copy(_move);
    });

    // Note: shadows Component's `set` for batch assignment. `noCopy`
    // lets `self.move(vec)` update the rest position without
    // overwriting the camera's current animated position.
    this.set = function (x, y, z, noCopy) {
      _x = x;
      _y = y;
      _z = z;
      _move.z = z;
      if (!noCopy) self.camera.position.copy(_move);
      _position.copy(_move);
    };
    this.toArray = function () { return [_x, _y, _z]; };
    this.fromArray = function (array) {
      _x = array[0];
      _y = array[1];
      _z = array[2];
      _move.set(_x, _y, _z);
      self.camera.position.copy(_move);
      _position.copy(_move);
    };
    this.copy = function (vec) {
      _x = vec.x;
      _y = vec.y;
      _z = vec.z;
      _move.set(_x, _y, _z);
      self.camera.position.copy(_move);
      _position.copy(_move);
    };
  })();

  this.lerpSpeed = 0.05;
  this.lerpSpeed2 = 1;
  this.lookAt = new Vector3(0, 0, 0);
  this.cameraRotation = new Euler();
  this.viewportFocus = new Vector2(0, 0);
  this.deltaRotate = 0;
  this.deltaLerp = 1;
  this.wobbleSpeed = 1;
  this.wobbleStrength = 0;
  this.wobbleZ = 1;
  this.zoomOffset = 0;

  // Init: optional UIL hook for in-editor tweaking, scene-graph wiring,
  // and start the render loop. _innerGroup sits between self.group and
  // self.camera so roll/wobble don't propagate to the parent.
  (function () {
    if (_input) {
      self.prefix = _input.prefix;
      const cameraUIL = CameraUIL.add(self, _group);
      cameraUIL.setLabel('Camera');
      self.group._cameraUIL = cameraUIL;
    }
    self.startRender(loop);
    _innerGroup.add(self.camera);
    self.group.add(_innerGroup);
  })();

  // Tween the master strength up to 1 (orbit) or down to 0 (still). The
  // still state keeps the camera locked at self.position regardless of
  // input.
  this.orbit = function (time = 1e3, ease = 'easeInOutSine') {
    return tween(_strength, { v: 1 }, time, ease);
  };
  this.still = function (time = 300, ease = 'easeInOutSine') {
    return tween(_strength, { v: 0 }, time, ease);
  };

  const _v1 = new Vector3();
  const _v2 = new Vector3();
  const _v3 = new Vector3();
  /*
   * Translate the entire camera frame (rest position + current animated
   * pose) by the delta between `vec` and the previous rest. Preserves
   * the three "in-flight" offsets (_move - rest, _move - position,
   * camera - position) so an in-progress lerp doesn't snap.
   */
  this.move = function (vec) {
    const moveDiff = _v1.subVectors(_move, self.position);
    const positionDiff = _v2.subVectors(_move, _position);
    const cameraPosDiff = _v3.subVectors(self.camera.position, _position);
    self.position.set(vec.x, vec.y, vec.z, true);
    _move.copy(vec).add(moveDiff);
    _position.copy(_move).add(positionDiff);
    self.camera.position.copy(_position).add(cameraPosDiff);
  };

  this.get('manualRender', () => _manualRender);
  this.set('manualRender', (value) => {
    value = !!value;
    if (value !== _manualRender) {
      _manualRender = value;
      if (_manualRender) self.stopRender(loop);
      else self.startRender(loop);
    }
  });

  this.get('useCustomMove', () => _useCustomMove);
  this.set('useCustomMove', (value) => {
    if (value) {
      _useCustomMove = true;
      if (!self.customMove) self.customMove = new Vector2();
    } else {
      _useCustomMove = false;
    }
  });

  /*
   * External tick hook for manualRender mode. Emits a one-shot warning
   * in LOCAL builds if the caller forgot to flip manualRender on.
   */
  this.update = function () {
    if (!_manualRender && Hydra.LOCAL && !self.flag('manualRenderWarned')) {
      console.warn('Set manualRender to true if using GazeCamera.update()');
      self.flag('manualRenderWarned', true);
    }
    loop();
  };
});

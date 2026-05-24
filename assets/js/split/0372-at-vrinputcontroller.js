/*
 * VRInputController — Object3D representing one physical XR
 * controller (left or right). Owns a swappable visual body, a
 * laser-beam, and a hit-position reticle, and bridges XR
 * gamepad button/joystick state to Hydra events.
 *
 * Composition (constructed via `_config`, defaulted in
 * `initConfig`):
 *   - `_body`  = VRInputControllerBody (or custom) — controller
 *     mesh, parented under `self.group`.
 *   - `_beam`  = VRInputControllerBeam — laser pointer ray;
 *     starts hidden, visibility toggled per-frame by the
 *     `beamRequested` flag (so callers `showBeam()` each frame
 *     they want it; idle frames hide it automatically).
 *   - `_point` = VRInputControllerPoint — small reticle placed
 *     at the last raycast hit, oriented to the surface normal.
 *
 * Per-frame loops:
 *   - `loop` (default render slot): decomposes `_grip` matrix
 *     into group position/quaternion/scale, refreshes
 *     `worldPos`/`worldQuat` caches, derives `self.pointer` as
 *     forward (-Z) rotated by world quaternion. Calls
 *     `PhysicalSync.realignObject` if PhysicalSync exists
 *     (compensates for motion-prediction reprojection).
 *   - `beforeRender` slot: applies the request flags onto
 *     beam/point visibility. If `enableHitHaptics` and a hit
 *     was requested but the point isn't visible (target left
 *     in-flight) → triggers a small 0.4-strength / 30ms haptic
 *     pulse. Resets both request flags at end of frame.
 *
 * Velocity: a VelocityTracker on the group position is started
 * immediately and `self.velocity` exposes the rolling value.
 *
 * Gamepad processing (`processGamepad(gamepad)`):
 *   - Emits VRInput.BUTTON `{pressed, label, controller}` on
 *     edge transitions for each gamepad button. Labels:
 *       0 trigger, 1 side_trigger, 2 touch_pad, 3 joy_click,
 *       4 a, 5 b.
 *   - Axes 2/3 → joystick X/Y; emits VRInput.JOYSTICK when the
 *     vector changes.
 *   - Drains pending haptic request: if `_haptics.needsUpdate`,
 *     calls `gamepad.hapticActuators[0].pulse(strength, time)`.
 *
 * Hit reticle: `setHitPosition(hit)` places the point at the
 * hit, oriented along the surface normal (transformed by the
 * hit object's world quaternion), and sets `_hitPositionRequested`
 * so visibility flips on next beforeRender.
 *
 * Config hot-swap: `applyControllerConfig(config)` destroys the
 * current body and rebuilds via `initBody`. The handler chain
 * (loop, beam, point) is preserved.
 *
 * Public surface: reactive getters/setters for `target`, `grip`,
 * `color`, `body`, `handedness`; `setBeamColor`, `showBeam`,
 * `triggerHaptics(strength, time)` (throws on missing args).
 */
Class(function VRInputController(_type, _config) {
  Inherit(this, Object3D);
  const self = this;
  var _body,
    _beam,
    _point,
    _hitPositionRequested,
    _beamRequested,
    _grip = new Matrix4(),
    _target = new Matrix4(),
    _q = new Quaternion(),
    _v3 = new Vector3(),
    _haptics = {},
    _buttons = {},
    _joystick = {
      x: 0,
      y: 0,
    };
  this.isVrController = true;
  this.pointer = new Vector3();
  const PHYSICAL_SYNC = !!window.PhysicalSync;
  function initBody() {
    _body = self.initClass(_config.body, {
      controller: self,
      type: _type,
    });
  }
  function loop() {
    _grip.decompose(self.group.position, self.group.quaternion, self.group.scale);
    self.group.updateMatrixWorld(true);
    self.group.getWorldPosition(self.group.worldPos);
    self.group.getWorldQuaternion(self.group.worldQuat);
    self.pointer.set(0, 0, -1).applyQuaternion(self.group.worldQuat);
    PHYSICAL_SYNC && PhysicalSync.realignObject(self.group);
  }
  function beforeRender() {
    _config.enableHitHaptics &&
      _hitPositionRequested &&
      !_point.group.visible &&
      self.triggerHaptics(0.4, 30);
    _beam && (_beam.group.visible = _beamRequested);
    _point && (_point.group.visible = _hitPositionRequested);
    _beamRequested = false;
    _hitPositionRequested = false;
  }
  function getButtonLabel(i) {
    let label;
    switch (i) {
      case 0:
        label = 'trigger';
        break;
      case 1:
        label = 'side_trigger';
        break;
      case 2:
        label = 'touch_pad';
        break;
      case 3:
        label = 'joy_click';
        break;
      case 4:
        label = 'a';
        break;
      case 5:
        label = 'b';
    }
    return label;
  }
  !(function () {
    !(function initConfig() {
      _config || (_config = {});
      _config.body || (_config.body = VRInputControllerBody);
      _config.beam || (_config.beam = VRInputControllerBeam);
      _config.point || (_config.point = VRInputControllerPoint);
    })();
    initBody();
    (function initBeam() {
      (_beam = self.initClass(_config.beam)).group.visible = false;
    })();
    let velocity = new VelocityTracker(self.group.position);
    velocity.start();
    self.velocity = velocity.value;
    Interaction3D.useInput(self);
    RenderManager.camera.wrapper.add(self.group);
    self.startRender(loop);
    self.startRender(beforeRender, RenderManager.BEFORE_RENDER);
  })();
  this.get('target', (_) => _target);
  this.set('target', (m) => _target.fromArray(m));
  this.get('grip', (_) => _grip);
  this.set('grip', (m) => _grip.fromArray(m));
  this.get('color', (_) => _beam.color);
  this.set('color', (c) => {
    _beam.color = c;
  });
  this.get('body', (_) => _body.mesh);
  this.get('handedness', (_) => self.inputSource.handedness);
  this.setHitPosition = function (hit) {
    _point &&
      _point.group &&
      hit &&
      hit.point &&
      (_point.group.position.copy(hit.point),
      _v3.copy(hit.face.normal),
      hit.object.getWorldQuaternion(_q),
      _v3.applyQuaternion(_q),
      _v3.add(hit.point),
      _point.group.lookAt(_v3),
      (_hitPositionRequested = true));
  };
  this.applyControllerConfig = function (config) {
    _config = config;
    _body && (self.group.remove(_body.group), _body.destroy(), (_body = null));
    initBody();
  };
  this.processGamepad = function (gamepad) {
    gamepad.buttons.forEach((b, i) => {
      b.pressed
        ? _buttons[i] ||
          ((_buttons[i] = true),
          self.events.fire(VRInput.BUTTON, {
            pressed: true,
            label: getButtonLabel(i),
            controller: self,
          }))
        : _buttons[i] &&
          ((_buttons[i] = false),
          self.events.fire(VRInput.BUTTON, {
            pressed: false,
            label: getButtonLabel(i),
            controller: self,
          }));
    });
    let joyX = gamepad.axes[2],
      joyY = gamepad.axes[3];
    (joyX == _joystick.x && joyY == _joystick.y) ||
      ((_joystick.x = joyX),
      (_joystick.y = joyY),
      (_joystick.controller = self),
      self.events.fire(VRInput.JOYSTICK, _joystick));
    1 == _haptics.needsUpdate &&
      gamepad.hapticActuators &&
      gamepad.hapticActuators.length &&
      ((_haptics.needsUpdate = false),
      gamepad.hapticActuators[0].pulse(_haptics.strength, _haptics.time));
  };
  this.onDestroy = function () {
    RenderManager.camera.wrapper.remove(self.group);
    World.SCENE.remove(_point.group);
  };
  this.setBeamColor = function (color) {
    _beam && (_beam.color = color);
  };
  this.showBeam = function () {
    _beam && (_beamRequested = true);
  };
  this.hideBeam = function () {};
  this.triggerHaptics = function (strength, time) {
    if ('number' != typeof strength || 'number' != typeof time)
      throw 'triggerHaptics requires (strength, time)';
    _haptics.strength = strength;
    _haptics.time = time;
    _haptics.needsUpdate = true;
  };
});

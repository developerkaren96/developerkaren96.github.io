/*
 * AbstractUserInput — base class for the unified pointer
 * abstraction shared by mouse/touch, VR controller, and gaze-
 * selector input back-ends (0354-0358). Holds the shared state
 * and event-dispatch primitives; subclasses populate the
 * position/quaternion fields from their backend's events.
 *
 * Fields:
 *   - `position`     (Vector3) — world-space pointer / controller
 *     position.
 *   - `quaternion`   (Quaternion) — world-space orientation.
 *   - `plane2D`      (Vector2) — projected 2D pointer for screen
 *     UI hit-testing.
 *   - `directionVec` (Vector3) — pointer ray direction.
 *   - `isDown`       (bool)    — pressed state.
 *   - `velocity` — `VelocityTracker(position)` (0360) measuring
 *     per-frame Δposition / Δt. Auto-started in the constructor.
 *
 * Event semantics:
 *   - `down()` fires `UserInput.DOWN`, stamps `_downTime`.
 *   - `up()` fires `UserInput.UP`; if held <500ms, also calls
 *     `click()` (which fires `UserInput.CLICK`).
 *   - Subclasses call these from their backend's pointer-down /
 *     pointer-up handlers.
 */
Class(function AbstractUserInput() {
  Inherit(this, Component);
  const self = this;
  var _downTime;
  this.position = new Vector3();
  this.quaternion = new Quaternion();
  this.plane2D = new Vector2();
  this.isDown = false;
  this.directionVec = new Vector3();
  this.velocity = new VelocityTracker(self.position);
  this.velocity.start();
  this.down = function () {
    self.isDown = true;
    self.events.fire(UserInput.DOWN);
    _downTime = Render.TIME;
  };
  this.up = function () {
    self.isDown = false;
    Render.TIME - _downTime < 500 && self.click();
    self.events.fire(UserInput.UP);
  };
  this.click = function () {
    self.events.fire(UserInput.CLICK);
  };
});

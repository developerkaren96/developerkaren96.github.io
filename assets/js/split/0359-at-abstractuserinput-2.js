/*
 * AbstractUserInput (re-declaration) — identical to 0353. The
 * original bundle contains two copies of this Class definition;
 * the second registration is a no-op in the Hydra `Class()`
 * runtime (it just overwrites the same name with the same
 * body). Preserved as-is so the split file ordering matches the
 * source. See 0353 for full documentation of fields and event
 * semantics.
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

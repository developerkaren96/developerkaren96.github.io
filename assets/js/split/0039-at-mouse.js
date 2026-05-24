/*
 * Mouse — singleton wrapper around `Interaction(__window)` that publishes
 * normalized pointer coordinates for shaders, parallax effects, and 3D
 * camera rigs.
 *
 * Output fields (all 2D):
 *   x, y           — raw window-space pixel coordinates.
 *   normal.x/y     — 0..1 across (Stage.width × Stage.height).
 *   tilt.x/y       — −1..1 signed; y inverted so +y is "up" (matches WebGL
 *                    NDC).
 *   inverseNormal  — normal.y flipped — useful for code that wants 0 at the
 *                    bottom instead of the top.
 *
 * Forwarded fields (aliased to the underlying Interaction): `hold`, `last`,
 * `delta`, `move`, `velocity`, plus a `down` boolean tracked across
 * START/END.
 *
 * `resetOnRelease` — on mobile, return the pointer to the screen centre on
 *                    touch-end so parallax effects don't get stuck at the
 *                    last touch position.
 *
 * `_offset.x/y` — tracks Stage's CSS top/left so the normal coords stay
 *                 right-anchored when the canvas isn't fullscreen.
 *                 Recomputed on every RESIZE.
 *
 * `force` — if set on the singleton, that synthetic pointer object
 *           supersedes real input (used by demos / tests).
 */
Class(function Mouse() {
  Inherit(this, Events);
  const self = this;

  this.x = 0;
  this.y = 0;
  this.normal        = { x: 0, y: 0 };
  this.tilt          = { x: 0, y: 0 };
  this.inverseNormal = { x: 0, y: 0 };
  this.resetOnRelease = false;

  const _offset = { x: 0, y: 0 };

  function init() {
    // Default pointer to screen centre on init.
    self.x = Stage.width  / 2;
    self.y = Stage.height / 2;
    defer(() => {
      if (self.resetOnRelease && Device.mobile) {
        self.x = Stage.width  / 2;
        self.y = Stage.height / 2;
      }
    });

    // `unlocked = true` lets move events fire even without a press (mouse
    // semantics, not touch).
    self.input = new Interaction(__window);
    self.input.unlocked = true;
    self.events.sub(self.input, Interaction.START, start);
    self.events.sub(self.input, Interaction.MOVE,  update);
    self.events.sub(self.input, Interaction.END,   end);
    self.hold     = self.input.hold;
    self.last     = self.input.last;
    self.delta    = self.input.delta;
    self.move     = self.input.move;
    self.velocity = self.input.velocity;

    defer(() => {
      self.events.sub(Events.RESIZE, resize);
      resize();
    });
  }

  function start(e) { self.down = true; update(e); }

  // Update derived coordinate spaces.
  function update(e) {
    if (self.force) e = self.force;
    self.x = e.x;
    self.y = e.y;
    if (Stage.width && Stage.height) {
      self.normal.x = e.x / Stage.width  - _offset.x;
      self.normal.y = e.y / Stage.height - _offset.y;
      // tilt = [−1, 1] with y flipped (WebGL convention).
      self.tilt.x   = 2 * self.normal.x - 1;
      self.tilt.y   = 1 - 2 * self.normal.y;
      self.inverseNormal.x =     self.normal.x;
      self.inverseNormal.y = 1 - self.normal.y;
    }
  }

  function end() {
    self.down = false;
    // On mobile, recenter the pointer so idle parallax doesn't freeze where
    // the finger left off.
    if (Device.mobile && self.resetOnRelease) {
      update({ x: Stage.width / 2, y: Stage.height / 2 });
    }
  }

  // Stage CSS top/left → normalised offset so Stage in a non-fullscreen
  // layout still maps correctly.
  function resize() {
    if (Stage.css('top'))  _offset.y = Stage.css('top')  / Stage.height;
    if (Stage.css('left')) _offset.x = Stage.css('left') / Stage.width;
  }

  Hydra.ready(init);
  self.update = update;
}, 'Static');

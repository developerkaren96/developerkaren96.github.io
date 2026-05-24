/*
 * GLUITextureDragHelper — input-routing glue that turns a
 * GLUITexture into a draggable surface. Knows about three input
 * flavours and gates `_capture.onDragMove` accordingly:
 *
 *   - 2D mouse / touch: mousedown while hovered → bind drag move,
 *     mouseup → unbind. Standard pointer drag.
 *   - VR controller `trigger` button: press while hovered → bind,
 *     release → unbind. Same shape as mouse, just gated on the
 *     trigger label from VRInput.
 *   - XR hand-tracking (`VRInput.isSetupHands` /
 *     `isSetupFakeHands`): the moment a hover starts, switch to
 *     "hand mode" and bind move immediately — there's no explicit
 *     press event for hands, so distance from the surface (read
 *     off `hit.distance` in `dragMove`) becomes the unbind trigger:
 *     once the hand moves farther than `distanceThreshold` (default
 *     0.2 world units), the move binding is released.
 *
 * `dragMove(e)` is wired in as `_capture.onDragMove`:
 *   - If we're in hand mode and the hit distance exceeds the
 *     threshold, unbind first so the consumer's `onDragMove`
 *     receives the last update and then nothing more.
 *   - Forwards the event to the user-supplied `self.onDragMove`.
 *   - `persist` mode (set via `persistMove()`) keeps the move
 *     binding alive regardless of hover/press state and disables
 *     all auto-unbind paths — useful for animation drives that
 *     need continuous hit feed.
 *
 * Setup:
 *   - Optional `$obj`: if provided, registers a hover-only
 *     interaction (`$obj.interact(hover, noopClick)`) so the
 *     helper learns when the texture is hovered. Click is a
 *     deliberate no-op — this helper is drag-only.
 *   - Subscribes to global Mouse and VRInput streams.
 *
 * Public:
 *   - `distanceThreshold` — hand-tracking detach distance.
 *   - `persistMove()`     — pin the drag on regardless of input.
 *   - `onDragMove`        — assignable callback for consumers.
 */
Class(function GLUITextureDragHelper(_capture, $obj) {
  Inherit(this, Component);
  const self = this;
  function dragMove(e) {
    self.flag('persist') ||
      (e || _capture.unbindMove(),
      e &&
        self.flag('handMode') &&
        e.hit.distance > self.distanceThreshold &&
        _capture.unbindMove());
    !self.onDragMove || (self.flag('persist') && !e) || self.onDragMove(e);
  }
  function vrButton(e) {
    self.flag('persist') ||
      ('trigger' == e.label &&
        (e.pressed ? self.flag('hover') && _capture.bindMove() : _capture.unbindMove()));
  }
  function mouseDown(e) {
    self.flag('persist') ||
      (self.flag('mouse_down', true), self.flag('hover') && _capture.bindMove());
  }
  function mouseUp(e) {
    self.flag('persist') || (self.flag('mouse_down', false), _capture.unbindMove());
  }
  function hover(e) {
    self.flag('persist') ||
      (self.flag('hover', 'over' == e.action),
      window.VRInput &&
        (VRInput.isSetupFakeHands || VRInput.isSetupHands) &&
        (self.flag('handMode', true), _capture.bindMove()));
  }
  this.distanceThreshold = 0.2;
  $obj && $obj.interact(hover, (_) => {});
  (function addListeners() {
    self.events.sub(Mouse.input, Interaction.START, mouseDown);
    self.events.sub(Mouse.input, Interaction.END, mouseUp);
    window.VRInput &&
      VRInput.ready().then((_) => {
        VRInput.controllers.forEach((c) => {
          self.events.sub(VRInput.BUTTON, vrButton);
        });
      });
  })();
  _capture.onDragMove = dragMove;
  this.persistMove = function () {
    _capture.bindMove();
    self.flag('persist', true);
  };
});

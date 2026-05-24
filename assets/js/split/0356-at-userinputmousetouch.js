/*
 * UserInputMouseTouch — non-VR back-end for the UserInput
 * facade. One per page (instantiated by UserInput when
 * RenderManager is not VR). Inherits AbstractUserInput so it
 * shares position/quaternion/plane2D/velocity/down/up/click.
 *
 * Per-frame `loop` (render slot 24):
 *   - Unprojects the screen-space `Mouse` into a 3D point at
 *     `parent.pointerDistanceFromCamera`, stores into
 *     `self.position`. Stamps `self.velocity.value` onto
 *     `position.velocity` so consumers (e.g. UI layers) can read
 *     the tracker's value without a second lookup.
 *   - Hover hit-test: if `_hoverMeshes` is non-empty, raycasts
 *     under World.CAMERA; the resulting hover transitions
 *     (over/out across object boundaries) are dispatched as
 *     `__uiHover({action})` callbacks attached at bind time.
 *   - Plane alignment: if `alignToPlane(mesh)` registered a
 *     plane, projects mouse UV onto it and writes
 *     `self.plane2D` in [-1, 1] range (off-screen → -10).
 *
 * Input events: subscribes to Mouse.input START/MOVE/END,
 * forwards START→`down()` and END→`up()`. MOVE is intentionally
 * a no-op (movement is sampled in the loop, not event-driven).
 *
 * Click binding bridges to `Interaction3D.find(World.CAMERA)`
 * (the 3D-pick router) for the actual click dispatch; hover
 * stays local because the raycaster is run by this class.
 * `bindProximity` aliases `bindClick` here — proximity is only
 * meaningful in VR (controller distance to mesh), so on desktop
 * it collapses to plain click semantics.
 */
Class(function UserInputMouseTouch() {
  Inherit(this, AbstractUserInput);
  const self = this;
  var _plane,
    _hoverMeshes = [],
    _activeHover = null;
  function loop() {
    if (
      World.CAMERA &&
      (self.position.copy(
        ScreenProjection.find(self.parent.camera).unproject(
          Mouse,
          self.parent.pointerDistanceFromCamera,
        ),
      ),
      (self.position.velocity = self.velocity.value),
      _hoverMeshes.length &&
        (function performHoverCheck() {
          let [newHover] = Raycaster.find(World.CAMERA).checkHit(_hoverMeshes);
          newHover
            ? _activeHover
              ? newHover.object !== _activeHover.object &&
                (_activeHover.object.__uiHover({
                  action: 'out',
                  hit: _activeHover,
                  mesh: _activeHover.object,
                }),
                newHover.object.__uiHover({
                  action: 'over',
                  newHover: newHover,
                  mesh: newHover.object,
                }),
                (_activeHover = newHover))
              : (newHover.object.__uiHover({
                  action: 'over',
                  newHover: newHover,
                  mesh: newHover.object,
                }),
                (_activeHover = newHover))
            : _activeHover &&
              (_activeHover.object.__uiHover({
                action: 'out',
                hit: _activeHover,
                mesh: _activeHover.object,
              }),
              (_activeHover = null));
        })(),
      _plane)
    ) {
      let [hit] = Raycaster.find(World.CAMERA).checkHit(_plane, Mouse);
      hit
        ? ((self.plane2D.x = Math.range(hit.uv.x, 0, 1, -1, 1)),
          (self.plane2D.y = Math.range(hit.uv.y, 0, 1, -1, 1)))
        : ((self.plane2D.x = -10), (self.plane2D.y = -10));
    }
  }
  function touchStart(e) {
    self.down();
  }
  function touchMove(e) {}
  function touchEnd(e) {
    self.up();
  }
  this.activeInput = true;
  self.startRender(loop, 24);
  (function addListeners() {
    self.events.sub(Mouse.input, Interaction.START, touchStart);
    self.events.sub(Mouse.input, Interaction.MOVE, touchMove);
    self.events.sub(Mouse.input, Interaction.END, touchEnd);
  })();
  this.bindClick = function (obj, hover, click) {
    hover && ((obj.__uiHover = hover), _hoverMeshes.push(obj));
    click && Interaction3D.find(World.CAMERA).add(obj, null, click);
    obj.hitDestroy = () => this.unbindClick(obj);
  };
  this.unbindClick = function (obj) {
    _hoverMeshes.remove(obj);
    Interaction3D.find(World.CAMERA).remove(obj);
  };
  this.bindProximity = function (obj, hover, click) {
    this.bindClick(obj, hover, click);
  };
  this.unbindProximity = function (obj) {
    this.unbindClick(obj);
  };
  this.alignToPlane = function (mesh) {
    _plane = mesh;
  };
});

/*
 * UserInputVRController — VR back-end for UserInput. One
 * instance per detected device: physical controller, abstract
 * hand-tracking hand, etc. Constructed with `(_controller,
 * _type)` where `_type` is `'controller'` or `'hand'`.
 *
 * Per-frame `loop` (slot 24, scheduled on World.NUKE so it runs
 * after the main pipeline):
 *   - Gates on the controller actually being present (body
 *     world-position non-zero) and `_controller.group.visible`.
 *   - Mirrors controller pose into self.position /
 *     self.quaternion (for hand tracking, position comes from
 *     `_controller.body.position` since the group is at origin).
 *   - Pointer ray direction comes from `_controller.pointer`
 *     into `_v3`.
 *   - Hover hit-test: same over/out transition pattern as the
 *     mouse adapter (0356), raycasting from the controller's
 *     origin along `self.directionVec`. Fires `__uiHover`.
 *   - Proximity check: for each registered proximity mesh,
 *     intersects the controller `body` against a lazily-built
 *     `__proximitySphere` (Box3-bounding sphere updated to the
 *     mesh's world position each frame). For abstract hands
 *     also tests each fingertip in `_controller.tips`. Hits
 *     trigger `fireProximity()`, which debounces at 500 ms.
 *   - Plane alignment: same UV → plane2D in [-1, 1] mapping as
 *     mouse adapter.
 *
 * Button handling: subscribes to `VRInput.BUTTON`; only the
 * `trigger` label is wired:
 *   - pressed → `self.down()`, claims `Interaction3D` input,
 *     deactivates all other inputs and sets self.activeInput.
 *   - released → `self.up()`, and if a hover is active, calls
 *     `__uiClick({action:'click'})` directly (so the click
 *     dispatches even if Interaction3D's own raycaster wouldn't
 *     have picked it).
 *
 * Bind APIs:
 *   - `bindClick` / `unbindClick`     — pure hover/click via ray.
 *   - `bindProximity` / `unbindProximity` — distance-based.
 *   - `alignToPlane(plane)` — for floating UI panels.
 *
 * Cross-controller sync:
 *   - `setState(hoverMeshes, proximity)` lets one controller
 *     replicate another's binding state.
 *   - `updateVRState(array)` (called by UserInput.updateState
 *     when the input set changes) pushes current state into
 *     every sibling so all controllers/hands share the same
 *     bound-mesh set.
 *
 * Utilities:
 *   - `getPosRelativeTo(head)` returns controller position with
 *     Y zero'd and offset by head x/z (used for body-relative
 *     UI placement).
 *   - `triggerHaptics(strength, time)` forwards to the device.
 *
 * Right-handed controller (non-abstract-hand) defaults to
 * `activeInput = true` so the UI starts with the user's primary
 * hand driving Interaction3D.
 */
Class(function UserInputVRController(_controller, _type) {
  Inherit(this, AbstractUserInput);
  const self = this;
  var _plane,
    _hoverMeshes = [],
    _activeHover = null,
    _proximity = [],
    _v3 = new Vector3();
  const ZERO = new Vector3();
  function initProximitySphere(obj) {
    let box = new Box3().setFromObject(obj);
    obj.__proximitySphere = box.getBoundingSphere();
  }
  function intersects(objA, objB) {
    return (
      objA.__proximitySphere || initProximitySphere(objA),
      objB.__proximitySphere || initProximitySphere(objB),
      objA.__proximitySphere.center.copy(objA.getWorldPosition()),
      objB.__proximitySphere.center.copy(objB.getWorldPosition()),
      objA.__proximitySphere.intersectsSphere(objB.__proximitySphere)
    );
  }
  function loop() {
    if (
      _controller.body &&
      _controller.body.getWorldPosition &&
      World.CAMERA &&
      !_controller.body.getWorldPosition().equals(ZERO) &&
      _controller.group.visible
    ) {
      if (
        (_v3.copy(_controller.pointer),
        self.position.copy(_controller.group.position),
        self.quaternion.copy(_controller.group.quaternion),
        _controller.isAbstractHand && self.position.copy(_controller.body.position),
        _hoverMeshes.length &&
          (function performHoverCheck() {
            let [newHover] = Raycaster.checkFromValues(
              _hoverMeshes,
              World.CAMERA.position,
              self.directionVec,
            );
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
        _proximity.length)
      )
        for (let i = _proximity.length - 1; i > -1; i--) {
          let mesh = _proximity[i];
          mesh.visible &&
            (_controller.isAbstractHand &&
              _controller.tips.forEach((t) => {
                t.body && intersects(t.body, mesh) && fireProximity(mesh, t.body);
              }),
            intersects(_controller.body, mesh) && fireProximity(mesh, _controller.body));
        }
      if (_plane) {
        let [hit] = Raycaster.find(World.CAMERA).checkFromValues(
          _plane,
          _controller.group.position,
          _v3,
        );
        hit
          ? ((self.plane2D.x = Math.range(hit.uv.x, 0, 1, -1, 1)),
            (self.plane2D.y = Math.range(hit.uv.y, 0, 1, -1, 1)))
          : ((self.plane2D.x = -10), (self.plane2D.y = -10));
      }
    }
  }
  function fireProximity(mesh, body) {
    Render.TIME - mesh.__uiFireTime < 500 ||
      ((mesh.__uiFireTime = Render.TIME),
      mesh.__uiClick &&
        mesh.__uiClick({
          action: 'click',
          mesh: mesh,
          handedness: _controller.handedness,
          controller: _controller,
          hitBody: body,
        }));
  }
  function button(e) {
    World.CAMERA &&
      !_controller.body.getWorldPosition().equals(ZERO) &&
      _controller.group.visible &&
      'trigger' === e.label &&
      (e.pressed
        ? (self.down(),
          _controller.isAbstractHand || Interaction3D.useInput(_controller),
          UserInput.inputs.forEach((inp) => (inp.activeInput = false)),
          (self.activeInput = true))
        : (self.up(),
          _activeHover &&
            _activeHover.object.__uiClick({
              action: 'click',
              mesh: _activeHover.object,
              hit: _activeHover.hit,
            })));
  }
  this.controller = _controller;
  this.type = _type;
  (function addListeners() {
    self.events.sub(_controller, VRInput.BUTTON, button);
  })();
  self.startRender(loop, 24, World.NUKE);
  'right' !== _controller.handedness ||
    _controller.isAbstractHand ||
    (Interaction3D.useInput(_controller), (self.activeInput = true));
  self.position.velocity = self.velocity.value;
  this.bindClick = function (obj, over, click) {
    obj.__uiHover = over;
    obj.__uiClick = click;
    _hoverMeshes.push(obj);
    obj.hitDestroy = (_) => _hoverMeshes.remove(obj);
  };
  this.unbindClick = function (obj) {
    _hoverMeshes.remove(obj);
  };
  this.bindProximity = function (obj, over, click) {
    obj.__uiHover = over;
    obj.__uiClick = click;
    _proximity.push(obj);
    obj.hitDestroy = (_) => _proximity.remove(obj);
  };
  this.unbindProximity = function (obj) {
    _proximity.remove(obj);
  };
  this.alignToPlane = function (plane) {
    _plane = plane;
  };
  this.setState = function (hoverMeshes, proximity) {
    _hoverMeshes = [...hoverMeshes];
    _proximity = [...proximity];
  };
  this.updateVRState = function (array) {
    array.forEach((obj) => {
      obj.setState && obj != self && obj.setState(_hoverMeshes, _proximity);
    });
  };
  this.getPosRelativeTo = function (head) {
    return (_v3.set(head.x, 0, head.z), _v3.add(self.position), _v3);
  };
  this.triggerHaptics = function (strength, time) {
    _controller.triggerHaptics && _controller.triggerHaptics(strength, time);
  };
});

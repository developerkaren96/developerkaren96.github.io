/*
 * UserInputPositionManager — child of UserInput (0354) that
 * publishes pointer / hand positions onto AppState so any
 * subscriber (HUDs, UI, shaders) can read them without knowing
 * which backend produced them.
 *
 * AppState keys written:
 *   - `UserInput/pointer`  Vector3 lerped to inputs[0].position
 *     each frame (non-VR mouse/touch path).
 *   - `UserInput/hand0`    Vector3 of "left" pointer in VR
 *     (initial sentinel: +99999).
 *   - `UserInput/hand1`    Vector3 of "right" pointer in VR
 *     (initial sentinel: -99999 — opposite-sign sentinel so a
 *     "neither hand present" query still produces a huge
 *     distance whichever hand you check).
 *   - `UserInput/VRButton` / `UserInput/VRJoystick` (forced
 *     events, `set(..., true)`) — controller button/joystick
 *     payloads forwarded from VRInput.
 *
 * Render loops:
 *   - `handlePointer` (non-VR): smooth-tracks
 *     `inputs[0].position` into `pointer` with 0.5 lerp.
 *   - `handleVR` (VR): rebuilds `leftHand`/`rightHand` from the
 *     current input set. ≤2 inputs → take inputs 0/1 directly.
 *     >2 inputs (mixed controllers + hands) → filter by `_type`
 *     ('controller'|'hand') set via `update(type)` so only the
 *     currently-active modality drives the AppState slots.
 *
 * `initVR()` / `initPointer()` are called by UserInput depending
 * on the boot path. `update(type)` is called when VRInput
 * announces hand↔controller transitions; on first call for a
 * controller it also wires VRInput BUTTON/JOYSTICK events into
 * AppState (gated by `addedEvents` so subsequent calls don't
 * double-subscribe).
 *
 * Body fallback: when `AppState['UserInputBody/detected']`
 * becomes true (UserInputBody has a tracked-body match), this
 * stops both render loops and re-points hand0/hand1 to the
 * body adapter's `leftHand3D` / `rightHand3D` AppState values,
 * so downstream consumers transparently follow the body
 * instead of controllers.
 */
Class(function UserInputPositionManager() {
  Inherit(this, Component);
  const self = this;
  var _type;
  const pointer = new Vector3(99999, 99999, 99999),
    leftHand = new Vector3(99999, 99999, 99999),
    rightHand = new Vector3(-99999, -99999, -99999),
    _inputs = self.parent.inputs;
  function switchToBody() {
    self.stopRender(handlePointer);
    self.stopRender(handleVR);
    AppState.set('UserInput/hand0', AppState.get('UserInputBody/leftHand3D'));
    AppState.set('UserInput/hand1', AppState.get('UserInputBody/rightHand3D'));
  }
  function handleVR() {
    leftHand.set(99999, 99999, 99999);
    rightHand.set(-99999, -99999, -99999);
    _inputs.length <= 2
      ? (_inputs[0] && leftHand.copy(_inputs[0].position),
        _inputs[1] && rightHand.copy(_inputs[1].position))
      : _inputs.forEach((input, i) => {
          input.type == _type &&
            (i % 2 == 0 ? leftHand.copy(input.position) : rightHand.copy(input.position));
        });
  }
  function handlePointer() {
    pointer.lerp(_inputs[0].position, 0.5);
  }
  AppState.set('UserInput/hand0', leftHand);
  AppState.set('UserInput/hand1', rightHand);
  AppState.set('UserInput/pointer', pointer);
  AppState.bind('UserInputBody/detected', switchToBody);
  this.update = function (type) {
    _type = type;
    _inputs.forEach((input) => {
      'controller' != input.type ||
        input.addedEvents ||
        ((input.addedEvents = true),
        self.events.sub(input.controller, VRInput.BUTTON, (e) =>
          AppState.set('UserInput/VRButton', e, true),
        ),
        self.events.sub(input.controller, VRInput.JOYSTICK, (e) =>
          AppState.set('UserInput/VRJoystick', e, true),
        ));
    });
  };
  this.initVR = function () {
    self.startRender(handleVR);
  };
  this.initPointer = function () {
    self.startRender(handlePointer);
  };
});

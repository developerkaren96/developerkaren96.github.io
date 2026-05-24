/*
 * UserInput — static singleton: unified facade over pointer
 * backends (mouse/touch, VR controllers, hand tracking, gaze
 * selector). Picks the right backend(s) at boot based on
 * RenderManager type and the available VRInput devices.
 *
 * Boot pipeline (async; gated on Hydra + RenderManager ready):
 *   - Sets `self.camera = World.CAMERA`, instantiates
 *     `UserInputPositionManager` (0357), and optionally a body
 *     adapter (`UserInputBody` if defined).
 *   - Non-VR: pushes a single `UserInputMouseTouch` into
 *     `self.inputs` and inits the pointer through the manager.
 *   - VR (`RenderManager.VR`):
 *       - On `VRInput.ready()`, instantiates a
 *         `UserInputVRController` per detected controller
 *         (mode = 'controller').
 *       - On `VRInput.handsReady()`, adds two more inputs for
 *         left/right hand tracking (mode = 'hand').
 *       - `updateState()` calls each input's `updateVRState`
 *         (lets each adapter learn which siblings exist —
 *         needed for cross-hand UI like "non-dominant hand
 *         holds menu, dominant hand interacts").
 *       - On `VRInput.CHANGE` (controller↔hand switch), flips
 *         the `active` flag on each input so only the matching
 *         pair are live, and lazily adds hand inputs if the
 *         user enabled tracking mid-session.
 *
 * Public surface (all `await self.ready()` first):
 *   - `bindClick(obj, hover, click)` — forwards to every input;
 *     each backend hit-tests in its own way (raycaster for
 *     pointer, ray for controller, etc.).
 *   - `unbindClick(obj)`            — symmetric.
 *   - `bindGaze(obj, hover, click)` — in VR: lazy `_gazeSelector`
 *     instance handles a center-of-view dwell selector. Outside
 *     VR: collapses to a normal click bind.
 *   - `bindProximity(obj, hover, click)` / `unbindProximity` —
 *     distance-based hover (controllers/hands near a mesh).
 *   - `alignToPlane(mesh)` — flatten input rays to a planar
 *     surface (e.g. virtual touch panel in space).
 *   - `getGaze()` / `getGazeMesh()` / `resetGaze(animateIn?)`
 *     — direct access to the gaze selector for advanced UI.
 *
 * Event constants: `DOWN`, `UP`, `CLICK` — fired by each input
 * on its own `events` bus (subclasses of AbstractUserInput).
 *
 * `pointerDistanceFromCamera = 1` is the default 3D pointer
 * depth used by the position manager for screen-space rays.
 */
Class(function UserInput() {
  Inherit(this, Component);
  const self = this;
  var _vr, _gazeSelector, _manager;
  function updateState() {
    for (let i = 0; i < self.inputs.length; i++)
      self.inputs[i].updateVRState && self.inputs[i].updateVRState(self.inputs);
  }
  this.inputs = [];
  this.DOWN = 'user_input_down';
  this.UP = 'user_input_up';
  this.CLICK = 'user_input_click';
  this.pointerDistanceFromCamera = 1;
  this.camera = null;
  (async function () {
    await Hydra.ready();
    await Hydra.ready();
    await RenderManager.initialized;
    self.camera = World.CAMERA;
    _manager = self.initClass(UserInputPositionManager);
    window.UserInputBody && (self.body = self.initClass(UserInputBody));
    RenderManager.type != RenderManager.VR
      ? (self.inputs.push(self.initClass(UserInputMouseTouch)),
        self.flag('loaded', true),
        _manager.initPointer())
      : ((_vr = true),
        _manager.initVR(),
        VRInput.ready().then((_) => {
          VRInput.controllers.forEach((controller) => {
            self.inputs.push(self.initClass(UserInputVRController, controller, 'controller'));
          });
          self.inputs.forEach((inp) => (inp.active = !inp.handedness));
          self.flag('loaded', true);
          updateState();
          _manager.update('controller');
        }),
        VRInput.handsReady().then((_) => {
          self.inputs.push(self.initClass(UserInputVRController, VRInput.getHand('left'), 'hand'));
          self.inputs.push(self.initClass(UserInputVRController, VRInput.getHand('right'), 'hand'));
          self.flag('loaded', true);
          updateState();
          _manager.update('hand');
          self.inputs.forEach((inp) => (inp.active = inp.handedness));
          self.events.sub(VRInput.CHANGE, (type) => {
            _manager.update('controllers' == type ? 'controller' : 'hand');
            let left = VRInput.getHand('left');
            for (let i = 0; i < self.inputs.length; i++)
              if (self.inputs[i].controller == left) return;
            self.inputs.push(
              self.initClass(UserInputVRController, VRInput.getHand('left'), 'hand'),
            );
            self.inputs.push(
              self.initClass(UserInputVRController, VRInput.getHand('right'), 'hand'),
            );
            updateState();
            self.inputs.forEach(
              (inp) => (inp.active = 'hands' == type ? inp.handedness : !inp.handedness),
            );
          });
        }));
  })();
  this.bindClick = async function (obj, hover, click) {
    await self.ready();
    self.inputs.forEach((inp) => inp.bindClick(obj, hover, click));
  };
  this.unbindClick = async function (obj) {
    await self.ready();
    self.inputs.forEach((inp) => inp.unbindClick(obj));
  };
  this.bindGaze = async function (obj, hover, click) {
    _vr
      ? (_gazeSelector || (_gazeSelector = UserInputGazeSelector.instance()),
        _gazeSelector.bind(obj, hover, click))
      : self.bindClick(obj, hover, click);
  };
  this.unbindGaze = function (obj) {
    _gazeSelector && _gazeSelector.unbind(obj);
  };
  this.getGaze = function () {
    return (_gazeSelector || (_gazeSelector = UserInputGazeSelector.instance()), _gazeSelector);
  };
  this.bindProximity = async function (obj, hover, click) {
    await self.ready();
    self.inputs.forEach((inp) => inp.bindProximity(obj, hover, click));
  };
  this.unbindProximity = async function (obj) {
    await self.ready();
    self.inputs.forEach((inp) => inp.unbindProximity(obj));
  };
  this.alignToPlane = async function (mesh) {
    await self.ready();
    self.inputs.forEach((inp) => inp.alignToPlane(mesh));
  };
  this.ready = function () {
    return self.wait('loaded');
  };
  this.getGazeMesh = function () {
    return (
      _gazeSelector || (_gazeSelector = UserInputGazeSelector.instance()),
      _gazeSelector.mesh
    );
  };
  this.resetGaze = function (animateIn = false) {
    _gazeSelector &&
      (_gazeSelector.reset(), animateIn && !_gazeSelector.isVisible && _gazeSelector.animateIn());
  };
}, 'static');

/*
 * VRInput — static singleton: WebXR input-source orchestrator.
 * Reads `XRSession.inputSources` each XR frame and instantiates
 * the matching Hydra object (VRInputController for physical
 * controllers, VRInputHand for real hand-tracking joints,
 * VRInputControllerHand for synthetic "fake hands" rendered on
 * top of controllers when `useControllerHands` is enabled).
 *
 * Constants:
 *   - SELECT_START / SELECT_END — bridged from XR selectstart/
 *     selectend (trigger semantics — fired per-controller).
 *   - NATIVE — bridged from session 'native' event.
 *   - BUTTON / JOYSTICK — fired by VRInputController from
 *     gamepad polling.
 *   - CHANGE — payload `{type: 'hands'|'controllers'}` —
 *     announces input-modality switch (UserInput 0354 listens
 *     and flips `active` flags).
 *
 * Per-frame `onXRFrame(t, frame)` (installed as
 * `RenderManager.renderer.onFrame`):
 *   - Walks `_session.inputSources`. For each:
 *     - `source.hand` present → real hand tracking. Lazily
 *       create `_hands[handedness]`, push the joint update.
 *       First time `handsActive` flips true: hide all
 *       controllers and fake hands, show real hands. Fire
 *       `CHANGE: 'hands'` once both hands ready and feed their
 *       fingertips to Interaction3D.
 *     - Otherwise → physical controller. Skips poses with
 *       identity matrix (not yet posed). Lazily create
 *       `VRInputController`, store inputSource + grip matrix,
 *       call `processGamepad` for buttons/joystick events.
 *       If `useControllerHands` → also drive a fake-hand mesh
 *       per controller. When transitioning back from
 *       hands-active, restore visibility for controllers /
 *       fake-hands and fire `CHANGE: 'controllers'` once both
 *       fake hands ready, also feeding their tips into
 *       Interaction3D.
 *
 * Setup path:
 *   - `setup()` runs on `XRDeviceManager.SESSION_START` (only
 *     when `RenderManager.type == WEBVR`):
 *     - Awaits VR session, sets up `_matrix` / `_identity`
 *       Matrix4 scratches, requests frame-of-reference from
 *       RenderManager.camera, hooks selectstart/selectend/
 *       native, swaps in `onXRFrame` as the renderer's frame
 *       callback. Waits for `isSetup` (first controller
 *       present), then fires `XRDeviceManager.CONTROLS_START`.
 *
 * Public surface:
 *   - `controllers` getter, `getHand(type)`, `getHandType()`
 *     ('real'|'fake'), `setHandColor(handedness, color)`,
 *     `setBeamColor(color)` (applies to all controllers).
 *   - `setControllerObject(Class)` / `setControllerConfig(cfg)`
 *     — install custom controller body model class.
 *   - `ready()` waits for `isSetup`; `handsReady()` resolves on
 *     either real or fake hand setup (race) — UserInput uses
 *     this to know when to push hand-input adapters.
 */
Class(function VRInput() {
  Inherit(this, Component);
  const self = this;
  var _sources,
    _session,
    _frame,
    _reference,
    _controller,
    _matrix,
    _identity,
    _controllers = [],
    _handColors = {},
    _hands = {},
    _fakeHands = {};
  function onXRFrame(t, frame) {
    _session = (_frame = frame).session;
    _frame.getViewerPose(_reference);
    (function updateControllers() {
      _sources = _session.inputSources;
      for (let index = 0; index < _sources.length; ++index) {
        let source = _sources[index];
        if (source.hand) {
          if (
            (_hands[source.handedness] ||
              (_hands[source.handedness] = self.initClass(VRInputHand, source.handedness)),
            _handColors[source.handedness] &&
              _hands[source.handedness].setColor(_handColors[source.handedness]),
            _hands[source.handedness].update(_frame, source.hand, _reference),
            !self.flag('handsActive'))
          ) {
            self.flag('handsActive', true);
            _controllers.forEach((c) => (c.group.visible = false));
            for (let key in _fakeHands) _fakeHands[key].group.visible = false;
            for (let key in _hands) _hands[key].group.visible = true;
            self.isSetupFakeHands = false;
          }
        } else {
          let pose = _frame.getPose(source.targetRaySpace, _reference);
          if (!pose) continue;
          if ((_matrix.fromArray(pose.transform.matrix), _matrix.equals(_identity))) continue;
          let handedness = source.handedness,
            controller = _controllers.find((c) => c.handedness === handedness);
          if (!controller) {
            controller = self.initClass(VRInputController, handedness, _controller);
            let insertIndex = Math.min(index, _controllers.length);
            _controllers.splice(insertIndex, 0, controller);
          }
          if (
            ((controller.inputSource = source),
            source.gamepad && controller.processGamepad(source.gamepad),
            pose && pose.transform && (controller.grip = pose.transform.matrix),
            self.useControllerHands &&
              (_fakeHands[handedness] ||
                (_fakeHands[handedness] = self.initClass(
                  VRInputControllerHand,
                  handedness,
                  controller,
                )),
              _handColors[source.handedness] &&
                _fakeHands[handedness].setColor(_handColors[source.handedness]),
              (_fakeHands[handedness].handedness = handedness),
              _fakeHands[handedness].update(pose.transform.matrix),
              _controllers.forEach((c) => (c.group.visible = false))),
            self.isSetupHands && self.flag('handsActive'))
          ) {
            if ((self.flag('handsActive', false), self.useControllerHands))
              for (let key in _fakeHands) _fakeHands[key].group.visible = true;
            else _controllers.forEach((c) => (c.group.visible = true));
            for (let key in _hands) _hands[key].group.visible = false;
            self.isSetupHands = false;
          }
        }
      }
      !self.isSetup && _controllers[0] && (self.isSetup = true);
      !self.isSetupHands &&
        _hands.left &&
        self.flag('handsActive') &&
        ((self.isSetupHands = true),
        Promise.all([_hands.left.ready(), _hands.right.ready()]).then((_) => {
          Interaction3D.useInput([..._hands.left.tips, ..._hands.right.tips]);
        }),
        self.events.fire(self.CHANGE, {
          type: 'hands',
        }));
      self.isSetupFakeHands ||
        !_fakeHands.left ||
        self.flag('handsActive') ||
        ((self.isSetupFakeHands = true),
        Promise.all([_fakeHands.left.ready(), _fakeHands.right.ready()]).then((_) => {
          Interaction3D.useInput([..._fakeHands.left.tips, ..._fakeHands.right.tips]);
        }),
        self.events.fire(self.CHANGE, {
          type: 'controllers',
        }));
    })();
  }
  async function setup() {
    if (RenderManager.type == RenderManager.WEBVR) {
      var session = await XRDeviceManager.getVRSession();
      session &&
        ((_matrix = new Matrix4()),
        new Matrix4(),
        (_identity = new Matrix4()),
        (_reference = await RenderManager.camera.getFrameOfReference()),
        session.addEventListener('selectstart', onSelectStart),
        session.addEventListener('selectend', onSelectEnd),
        session.addEventListener('native', nativeEvent),
        await self.wait(100),
        (RenderManager.renderer.onFrame = onXRFrame),
        await self.wait(self, 'isSetup'),
        self.events.fire(XRDeviceManager.CONTROLS_START));
    }
  }
  function nativeEvent(e) {
    if (self.enabled)
      for (let controller of _controllers)
        controller.inputSource == e.inputSource &&
          ((e.controller = controller), controller.events.fire(self.NATIVE, e));
  }
  function onSelectStart(e) {
    if (self.enabled)
      for (let controller of _controllers)
        controller.inputSource == e.inputSource &&
          ((e.controller = controller), controller.events.fire(self.SELECT_START, e));
  }
  function onSelectEnd(e) {
    if (self.enabled)
      for (let controller of _controllers)
        controller.inputSource == e.inputSource &&
          ((e.controller = controller), controller.events.fire(self.SELECT_END, e));
  }
  this.SELECT_START = 'select_start';
  this.SELECT_END = 'select_end';
  this.NATIVE = 'native';
  this.BUTTON = 'vr_button';
  this.JOYSTICK = 'vr_joystick';
  this.CHANGE = 'vr_input_change';
  (async function () {
    await Hydra.ready();
    (function addHandlers() {
      self.events.sub(XRDeviceManager.SESSION_START, setup);
    })();
    self.enabled = true;
  })();
  this.get('controllers', (_) => _controllers);
  this.setControllerConfig = function (config) {
    _controller = config;
    for (let controller of _controllers) controller.applyControllerConfig(config);
  };
  this.ready = function () {
    return self.wait('isSetup');
  };
  this.getHandType = function () {
    return self.isSetupHands ? 'real' : 'fake';
  };
  this.handsReady = function () {
    return Promise.race([self.wait('isSetupHands'), self.wait('isSetupFakeHands')]);
  };
  this.getHand = function (type) {
    return self.isSetupHands ? _hands[type] : _fakeHands[type];
  };
  this.setHandColor = function (handedness, color) {
    _handColors[handedness] = color;
    self.isSetupHands ? _hands[handedness].setColor(color) : _fakeHands[handedness].setColor(color);
  };
  this.setBeamColor = async function (color) {
    await self.ready();
    for (let controller of _controllers) controller.setBeamColor(color);
  };
  this.setControllerObject = function (Class) {
    self.setControllerConfig({
      body: Class,
    });
  };
}, 'static');

/*
 * SceneLayoutGizmo — in-scene transform-handle widget that drives
 * authoring of object positions / scales (and a few keyboard
 * shortcuts) in SceneLayout (0298). Renders interactive arrows /
 * boxes that the user drags to translate or scale the attached
 * Object3D, and writes the result back into the corresponding UIL
 * control so it persists.
 *
 *   - `findCamera()` walks up the parent chain to the nearest
 *     Scene+Nuke to pick the correct view camera for raycasting
 *     (so gizmos inside FX scenes use that scene's camera, not the
 *     world camera).
 *   - `update()` is the periodic write-back: depending on the
 *     control mode (`translate` vs `scale`), reads the right
 *     vector off the attached object, diffs it against `_lastVal`
 *     with `Base3D.DIRTY_EPSILON` tolerance, and if changed calls
 *     `forceUpdatePOSITION` / `forceUpdateSCALE` /
 *     `forceUpdateGROUPPOS` (cameras have a separate position UIL
 *     key, hence the `cameraUIL → groupPos` rename) on the linked
 *     UIL row so the number field reflects the drag.
 *   - `startMoving` / `stopMoving` use a 250ms interval rather than
 *     per-frame writes (the underlying controls already render at
 *     full rate; we only need the UIL value to land at human-
 *     readable cadence). On stop, one final `update()` ensures the
 *     last value is captured.
 *   - `keyDown(e)` implements common DCC shortcuts (W/E/R style,
 *     plus `.` to toggle translate). Skips when focus is in a
 *     text input so typing into the UIL doesn't move the gizmo.
 */
Class(function SceneLayoutGizmo() {
  Inherit(this, Object3D);
  const self = this;
  var _controls, _update, _attached, _lastVal;
  function findCamera() {
    let camera = World.CAMERA,
      p = self.group._parent;
    for (; p; ) {
      p instanceof Scene && p.nuke && (camera = p.nuke.camera);
      p = p._parent;
    }
    return camera;
  }
  function update() {
    let uil = _attached._cameraUIL || _attached._meshUIL,
      key = 'translate' == _controls.getMode() ? 'position' : 'scale',
      value = _attached[key].toArray();
    (function same(a, b) {
      return !(
        !a ||
        !b ||
        Math.abs(a[0] - b[0]) > Base3D.DIRTY_EPSILON ||
        Math.abs(a[1] - b[1]) > Base3D.DIRTY_EPSILON ||
        Math.abs(a[2] - b[2]) > Base3D.DIRTY_EPSILON
      );
    })(value, _lastVal) ||
      ((_lastVal = value),
      _attached._cameraUIL && 'position' == key && (key = 'groupPos'),
      uil?.[`forceUpdate${key.toUpperCase()}`]?.(value));
  }
  function startMoving() {
    _update = setInterval(update, 250);
  }
  function stopMoving() {
    clearInterval(_update);
    update();
  }
  function keyDown(e) {
    document.activeElement.tagName.toLowerCase().includes(['textarea', 'input']) ||
      ('.' == e.key && _controls.setMode('translate'),
      '/' == e.key && _controls.setMode('scale'),
      ('=' != e.key && '+' != e.key) || (_controls.visible = !_controls.visible));
  }
  function playgroundEvent(camera) {
    camera || ((_controls.visible = false), (camera = findCamera()));
    _controls.camera = camera;
  }
  async function nodeFocused(e) {
    if (((_controls.visible = false), 'Config' != e.name && e.layoutInstance == self.parent)) {
      let layer = await self.parent.getLayer(e.name),
        group = layer.group || layer;
      if (!group || !group.updateMatrixWorld) return;
      _controls.attach(group);
      _attached = group;
      _controls.visible = true;
    }
  }
  this.isGizmo = true;
  (_controls = new TransformControls(findCamera(), World.ELEMENT.div)).onChange =
    _controls.onMouseDown =
    _controls.onMouseUp =
    _controls.onObjectChange =
      (e) => {};
  _controls.onMouseDown = startMoving;
  _controls.onMouseUp = stopMoving;
  _controls.draggingChanged = (e) => {
    let activeControls = Playground.instance().activeControls;
    activeControls && (activeControls.enabled = !e.value);
  };
  SceneLayoutGizmo.initialized
    ? (_controls.visible = false)
    : (SceneLayoutGizmo.initialized = true);
  self.group.add(_controls);
  AppState.bind('playground_camera_active', playgroundEvent);
  (function addListeners() {
    self.events.sub(Keyboard.DOWN, keyDown);
    self.events.sub(UILGraphNode.FOCUSED, nodeFocused);
  })();
  self.delayedCall((_) => {
    _controls.camera = findCamera();
  }, 500);
  self.group.traverse((obj) => {
    obj.isGizmo = true;
  });
  self.group.visible = false;
});

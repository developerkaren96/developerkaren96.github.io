/*
 * CameraUILConfig — per-camera editor panel attached under a
 * `CAMERA_${camera.prefix}` UILFolder. Each control is bound to
 * a UILStorage key so values persist across reloads and round-
 * trip through the UIL graph editor.
 *
 * Common controls (always added):
 *   - `Type` (select)  — perspective | orthographic, dispatches to
 *     `_camera.usePerspective()` / `useOrthographic()`.
 *   - `position` (vec3) — `_camera.position` direct binding.
 *   - If `_camera.group` exists: `groupPos` and `rotation`
 *     (euler in degrees, converted to radians via `Math.radians`).
 *   - `fov` (number)   — `_camera.setFOV(value)`.
 *   - `zoom`, `near`, `far` (number) — direct property writes.
 *
 * For "rich" cameras with `moveXY`-style controls (e.g. dolly
 * cams used by SceneLayout):
 *   - `moveXY`, `lookAt`, `viewportFocus` (vec3).
 *   - `cameraRotation` (euler degrees → radians).
 *   - `lerpSpeed`, `lerpSpeed2`, `deltaRotate`, `deltaLerp`,
 *     `wobbleSpeed`, `wobbleStrength`, `wobbleZ` (numbers).
 *
 * Dynamic FOV editor:
 *   - "Dynamic FOV" button opens a `UILExternalEditor` (400×900)
 *     for free-form JS. The expression is wrapped into
 *     `function getFOV() { ... }` (adds `return` if missing) and
 *     `eval`-bound to `_camera._getDynamicFOV`. `_camera.dynamicFOV`
 *     is defined as: ignore in orthographic; call the user function;
 *     warn on NaN; otherwise `setFOV`. It runs on resize.
 *
 * Cross-instance sync:
 *   - `addListeners` subscribes to `CameraUIL.UPDATE`. The handler
 *     ignores events from the same group, matches on `prefix`, and
 *     dispatches based on payload flags (`fov | number | rotation
 *     | vec`) — used by remote UILSocket / multi-instance editor.
 *
 * Helpers per control type:
 *   - `initFOV` / `initNumber` / `initVec` / `initRotation`
 *     each: (a) read `UILStorage.get(prefix+key)`, falling back to
 *     the live camera value or `9999` as a "missing" sentinel;
 *     (b) build the corresponding UIL control wired to onChange/
 *     onFinishChange; (c) write the initial value back into the
 *     camera (and into UILStorage on commit). `initVec` also
 *     exposes a `forceUpdateKEY()` helper for programmatic refresh.
 *
 * Validation: throws "camera.prefix required when using MeshUIL"
 * if the camera lacks a stable prefix (each panel needs a unique
 * UILStorage namespace).
 *
 * `setLabel(name)` retitles the folder.
 */
Class(function CameraUILConfig(_camera, _uil) {
  const self = this;
  if (!_camera.prefix) throw 'camera.prefix required when using MeshUIL';
  var prefix = 'CAMERA_' + _camera.prefix,
    _group = _uil ? createFolder() : null,
    _dynamicFOVCallback = null;
  function createFolder() {
    if (!UIL.sidebar) return null;
    let folder = new UILFolder(prefix, {
      label: _camera.prefix,
      closed: true,
    });
    return (_uil.add(folder), folder);
  }
  function initFOV(key) {
    let initValue = UILStorage.get(`${prefix}${key}`) || _camera.camera.fov || 9999;
    if (_group) {
      let number = new UILControlNumber(`${prefix}${key}`, {
        label: key,
        value: initValue,
        step: 0.05,
      });
      number.onFinishChange((e) => {
        _group && self['tweenUIL_' + key]?.(e);
        _camera.setFOV(e);
        UILStorage.set(`${prefix}${key}`, e);
      });
      _group.add(number);
    }
    defer((_) => {
      _camera.setFOV(initValue);
    });
  }
  function initVec(key) {
    let initValue = UILStorage.get(`${prefix}${key}`) || _camera[key]?.toArray();
    if (initValue) {
      if (_group) {
        UILStorage.state.bind(`${prefix}${key}`, (val) => _camera[key].fromArray(val));
        let vector = new UILControlVector(`${prefix}${key}`, {
          label: key,
          value: initValue,
          step: 0.05,
        });
        vector.onChange((e) => {
          _group && self['tweenUIL_' + key]?.(e);
          _camera[key].fromArray(e);
        });
        vector.onFinishChange((e) => UILStorage.set(`${prefix}${key}`, e));
        _group.add(vector);
        self['forceUpdate' + key.toUpperCase()] = (_) => {
          let val = _camera[key].toArray();
          self['tweenUIL_' + key]
            ? self['tweenUIL_' + key](val)
            : vector.force(_camera[key].toArray(), true);
        };
      }
      _camera[key].fromArray(initValue);
    }
  }
  function initNumber(key) {
    let initValue =
      UILStorage.get(`${prefix}${key}`) || (undefined === _camera[key] ? 9999 : _camera[key]);
    if (_group) {
      UILStorage.state.bind(`${prefix}${key}`, (val) => (_camera[key] = val));
      let number = new UILControlNumber(`${prefix}${key}`, {
        label: key,
        value: initValue,
        step: 0.05,
      });
      number.onChange((e) => {
        _camera[key] = e;
        _group && self['tweenUIL_' + key]?.(e);
      });
      number.onFinishChange((e) => UILStorage.set(`${prefix}${key}`, e));
      _group.add(number);
    }
    _camera[key] = initValue;
  }
  function initRotation(key, applyValue) {
    let toRadians = (array) =>
        array ? ((array.length = 3), array.map((x) => Math.radians(x))) : [0, 0, 0],
      initValue = toRadians(UILStorage.get(`${prefix}${key}`));
    if (_group) {
      UILStorage.state.bind(`${prefix}${key}`, (val) => {
        (_camera[key] || _camera.group[key]).fromArray(toRadians(val));
      });
      let vector = new UILControlVector(`${prefix}${key}`, {
        label: key,
        value:
          ((array = initValue),
          array ? ((array.length = 3), array.map((x) => Math.degrees(x))) : [0, 0, 0]),
      });
      vector.onChange((e) => {
        _group && self['tweenUIL_' + key]?.(toRadians(e));
        applyValue(toRadians(e), key);
      });
      vector.onFinishChange((e) => UILStorage.set(`${prefix}${key}`, e));
      _group.add(vector);
    }
    var array;
    applyValue(initValue, key);
  }
  function initDynamicFOV(key) {
    let defaultCode = '',
      code = UILStorage.get(`${prefix}${key}Code`) || defaultCode,
      evalCode = (value) => {
        let method = value.includes('return')
          ? `(function(){ return function getFOV() { ${value}}})()`
          : `(function(){ return function getFOV() { return ${value}}})()`;
        _camera._getDynamicFOV = eval(method);
      },
      editCode = (_) => {
        let editor = new UILExternalEditor(`${prefix}${key}`, 400, 900);
        editor.setCode(code, 'c');
        editor.onSave = (value) => {
          UILStorage.set(`${prefix}${key}Code`, value);
          evalCode(value);
          code = value;
          _camera.dynamicFOV();
        };
      },
      btn = new UILControlButton('btn', {
        actions: [
          {
            title: 'Dynamic FOV',
            callback: editCode,
          },
        ],
        hideLabel: true,
      });
    _group && _group.add(btn);
    defer((_) => {
      evalCode(code);
      _camera.dynamicFOV = (_) => {
        if (_camera.camera.isOrthographicCamera) return;
        let fov = _camera._getDynamicFOV?.() || _camera.camera.fov;
        if (isNaN(fov)) return console.warn(`${prefix} Dynamic FOV requires a float value`);
        _camera.setFOV(fov);
      };
      _camera.onResize((_) => _camera.dynamicFOV());
    });
  }
  function initType() {
    let initValue = UILStorage.get(`${prefix}type`) || 'perspective';
    if (_group) {
      let control = new UILControlSelect(`${prefix}type`, {
        label: 'Type',
        value: initValue,
        options: [
          {
            label: 'Perspective',
            value: 'perspective',
          },
          {
            label: 'Orthographic',
            value: 'orthographic',
          },
        ],
      });
      UILStorage.state.bind(`${prefix}type`, (val) => control.onChange(val));
      control.onChange((e) => {
        'orthographic' === e ? _camera.useOrthographic() : _camera.usePerspective();
      });
      control.onFinishChange((e) => UILStorage.set(`${prefix}type`, e));
      _group.add(control);
    }
    'orthographic' === initValue && _camera.useOrthographic();
  }
  function addListeners() {
    Events.emitter._addEvent(CameraUIL.UPDATE, update, self);
  }
  function update(e) {
    e.prefix == prefix &&
      e.group != self &&
      (e.fov && _camera.setFOV(e.val),
      e.number && (_camera[e.key] = e.val),
      e.rotation && _camera.group[e.key].fromArray(e.val),
      e.vec && _camera[e.key].fromArray(e.val));
  }
  initType();
  _camera.position && initVec('position');
  _camera.group &&
    ((_camera.groupPos = _camera.group.position),
    initVec('groupPos'),
    initRotation('rotation', (value, key) => {
      _camera.group[key].fromArray(value);
    }));
  initFOV('fov');
  initNumber('zoom');
  initNumber('near');
  initNumber('far');
  _camera.moveXY &&
    (initVec('moveXY'),
    initVec('lookAt'),
    initRotation('cameraRotation', (value, key) => {
      _camera[key].fromArray(value);
    }),
    initVec('viewportFocus'),
    initNumber('lerpSpeed'),
    initNumber('lerpSpeed2'),
    initNumber('deltaRotate'),
    initNumber('deltaLerp'),
    initNumber('wobbleSpeed'),
    initNumber('wobbleStrength'),
    initNumber('wobbleZ'));
  initDynamicFOV('dynamicFOV');
  _group && addListeners();
  this.setLabel = function (name) {
    _group && _group.setLabel(name);
  };
});

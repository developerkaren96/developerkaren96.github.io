/*
 * ShadowUILConfig — per-light shadow camera editor. Builds a
 * `SHADOW_${light.prefix}` UILFolder and binds the following
 * controls (all persisted to UILStorage):
 *
 *   - `position` (vec3, step 0.05) — light position (writes
 *     `_light.position`).
 *   - `target`   (vec3, step 0.05) — point the shadow camera
 *     looks at. Each change also calls
 *     `_light.shadow.camera.lookAt(_light.target)` to keep the
 *     view matrix in sync (so the shadow frustum tracks the
 *     light's intent immediately, without waiting for the next
 *     scene `updateMatrixWorld`).
 *   - `fov`, `size`, `area`, `near`, `far` (number, step 0.05)
 *     — write straight to `_light.shadow.*`. `size` controls the
 *     shadow-map resolution, `area` the orthographic frustum
 *     side, `fov` the perspective angle.
 *   - `static` (checkbox) — flips `_light.static`. Tells the
 *     renderer the shadow can be rendered once and cached.
 *
 * `_light.target = _light.shadow.target` aliases the shadow
 * camera's target onto the light so the vector control above
 * has something concrete to mutate.
 *
 * Pattern note: same prefix-required guard as MeshUIL / CameraUIL.
 * Error message kept as "MeshUIL" — original codebase shares the
 * message string verbatim across panels.
 */
Class(function ShadowUILConfig(_light, _uil) {
  if (!_light.prefix) throw 'light.prefix required when using MeshUIL';
  var prefix = 'SHADOW_' + _light.prefix,
    _group = _uil
      ? (function createFolder() {
          if (!UIL.sidebar) return null;
          let folder = new UILFolder(prefix, {
            label: _light.prefix,
            closed: true,
          });
          return (_uil.add(folder), folder);
        })()
      : null;
  function initNumber(key) {
    let initValue = UILStorage.get(`${prefix}${key}`) || _light.shadow[key];
    if (_group) {
      UILStorage.state.bind(`${prefix}${key}`, (val) => (_light.shadow[key] = val));
      let number = new UILControlNumber(`${prefix}${key}`, {
        label: key,
        value: initValue,
        step: 0.05,
      });
      number.onFinishChange((e) => {
        _light.shadow[key] = e;
        UILStorage.set(`${prefix}${key}`, e);
      });
      _group.add(number);
    }
    _light.shadow[key] = initValue;
  }
  function initVec(key) {
    let initValue = UILStorage.get(`${prefix}${key}`) || _light[key].toArray();
    if (_group) {
      UILStorage.state.bind(`${prefix}_${key}`, (val) => _light[key].fromArray(val));
      let vector = new UILControlVector(`${prefix}${key}`, {
        label: key,
        value: initValue,
        step: 0.05,
      });
      vector.onChange((e) => {
        _light[key].fromArray(e);
        'target' == key && _light.shadow.camera.lookAt(_light.target);
      });
      vector.onFinishChange((e) => {
        _light[key].fromArray(e);
        'target' == key && _light.shadow.camera.lookAt(_light.target);
        UILStorage.set(`${prefix}${key}`, e);
      });
      _group.add(vector);
    }
    _light[key].fromArray(initValue);
  }
  _light.target = _light.shadow.target;
  initVec('position');
  initVec('target');
  initNumber('fov');
  initNumber('size');
  initNumber('area');
  initNumber('near');
  initNumber('far');
  (function initTick(key) {
    let initValue = UILStorage.get(`${prefix}${key}`);
    if (_group) {
      UILStorage.state.bind(`${prefix}_${key}`, (val) => (_light[key] = val));
      let tick = new UILControlCheckbox(`${prefix}${key}`, {
        label: key,
        value: initValue,
      });
      tick.onFinishChange((e) => {
        _light[key] = e;
        UILStorage.set(`${prefix}${key}`, e);
      });
      _group.add(tick);
    }
    _light[key] = initValue;
  })('static');
  this.setLabel = function (name) {
    _group && _group.setLabel(name);
  };
});

/*
 * MeshUILConfig — per-mesh transform editor. Mirrors
 * CameraUILConfig (0320) in shape but for arbitrary meshes:
 * exposes position / scale / rotation controls inside a
 * `MESH_${mesh.prefix}` folder.
 *
 * De-dup:
 *   - Won't create the folder if `MeshUIL.exists[prefix]` is set
 *     (caller already owns the panel for this prefix). Without
 *     this, a mesh that participates in multiple SceneLayouts
 *     would render duplicate panels.
 *
 * Controls (each backed by UILStorage):
 *   - `position` (vec3, step 0.05) — direct write to
 *     `_mesh.position`.
 *   - `scale`    (vec3, step 0.05) — direct write to `_mesh.scale`.
 *   - `rotation` (vec3, degrees in UI, radians on the mesh).
 *     Also captures the initial euler as a `Quaternion` on
 *     `_mesh.customRotation` for renderers that prefer quaternion
 *     math.
 *
 * Each `initVec(key)` also exposes a `forceUpdateKEY()` method
 * so external code can push a freshly-mutated `_mesh.position`
 * back into the UIL panel (with optional `tweenUIL_${key}`
 * animator if present).
 *
 * Cross-instance sync via `MeshUIL.UPDATE`: events with the same
 * `prefix` but different `group` write the payload's array onto
 * the matching `_mesh.{key}`.
 *
 * `save()` snapshots all current vector control values back to
 * `UILStorage` (called on onFinishChange so vector dragging
 * doesn't spam storage writes).
 *
 * Validation: throws "mesh.prefix required when using MeshUIL"
 * if the caller hasn't given the mesh a stable `prefix`
 * (UILStorage needs a unique key namespace).
 */
Class(function MeshUILConfig(_mesh, _uil) {
  const self = this;
  if (!_mesh.prefix) throw 'mesh.prefix required when using MeshUIL';
  var prefix = 'MESH_' + _mesh.prefix,
    _group =
      _uil && !MeshUIL.exists[prefix]
        ? (function createFolder() {
            if (!UIL.sidebar) return null;
            let folder = new UILFolder(prefix, {
              label: _mesh.prefix,
              closed: true,
            });
            return (_uil.add(folder), folder);
          })()
        : null,
    _controls = _group ? {} : null;
  function initVec(key) {
    let initValue = UILStorage.get(`${prefix}${key}`) || _mesh[key].toArray();
    if (_group) {
      UILStorage.state.bind(`${prefix}${key}`, (val) => _mesh[key].fromArray(val));
      let vector = new UILControlVector(`${prefix}${key}`, {
        label: key,
        value: initValue,
        step: 0.05,
      });
      vector.onChange((e) => {
        _mesh[key].fromArray(e);
        _group && self['tweenUIL_' + key]?.(e);
      });
      vector.onFinishChange(save);
      _group.add(vector);
      self['forceUpdate' + key.toUpperCase()] = (_) => {
        let val = _mesh[key].toArray();
        self['tweenUIL_' + key]
          ? self['tweenUIL_' + key](val)
          : vector.force(_mesh[key].toArray(), true);
      };
      _controls[key] = vector;
    }
    _mesh[key].fromArray(initValue);
  }
  function save() {
    for (let key in _controls) {
      let value = _controls[key].value;
      UILStorage.set(`${prefix}${key}`, value);
    }
  }
  function update(e) {
    e.prefix == prefix && e.group != self && _mesh[e.key].fromArray(e.val);
  }
  this.group = _group;
  initVec('position');
  initVec('scale');
  (function initRotation() {
    let key = 'rotation',
      toRadians = (array) =>
        array ? ((array.length = 3), array.map((x) => Math.radians(x))) : [0, 0, 0],
      toDegrees = (array) =>
        array ? ((array.length = 3), array.map((x) => Math.degrees(x))) : [0, 0, 0],
      initValue = toRadians(UILStorage.get(`${prefix}${key}`));
    if (_group) {
      UILStorage.state.bind(`${prefix}${key}`, (val) => _mesh[key].fromArray(toRadians(val)));
      let vector = new UILControlVector(`${prefix}${key}`, {
        label: key,
        value: toDegrees(initValue),
      });
      vector.onChange((e) => {
        _mesh[key].fromArray(toRadians(e));
        _group && self['tweenUIL_' + key]?.(e);
      });
      vector.onFinishChange(save);
      _group.add(vector);
      _controls[key] = vector;
    }
    _mesh[key].fromArray(initValue);
    let rotationEuler = new Euler().fromArray(initValue);
    _mesh.customRotation = new Quaternion().setFromEuler(rotationEuler);
  })();
  _group &&
    (function addListeners() {
      Events.emitter._addEvent(MeshUIL.UPDATE, update, self);
    })();
  this.setLabel = function (name) {
    _group && _group.setLabel(name);
  };
  this.forceUpdate = function (key, val) {
    _mesh[key].fromArray(val);
    self['forceUpdate' + key.toUpperCase()]?.();
  };
});

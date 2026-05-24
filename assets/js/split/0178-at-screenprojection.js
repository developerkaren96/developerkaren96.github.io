/*
 * ScreenProjection — bidirectional screen-space ↔ world-space mapper
 * bound to a single camera.
 *
 * `unproject(mouse, rect = Stage, distance = 1)`:
 *   Treats `(mouse.x / rect.width, mouse.y / rect.height)` as NDC,
 *   unprojects through the camera at `z = 0.5`, then walks from the
 *   camera's world position along that direction for `distance` units
 *   to produce the world-space point. Useful for placing a 3D object
 *   "under" the pointer at a given depth.
 *
 *   `(rect, distance)` arguments are overloaded — if `rect` is a
 *   number, it's used as `distance` and `rect` defaults to `Stage`.
 *
 * `project(pos, screen = Stage)`:
 *   Inverse of unproject. Accepts a `Base3D` (in which case it pulls
 *   the world matrix translation) or a raw Vector3, projects through
 *   the camera, and maps NDC to pixel coordinates of the supplied
 *   rect.
 *
 * Static side: `ScreenProjection.find(camera)` returns a memoised
 * instance per-camera via WeakMap; `ScreenProjection.project` /
 * `.unproject` use a lazy `World.CAMERA` singleton.
 */
Class(
  function ScreenProjection(_camera) {
    Inherit(this, Component);
    const _v3 = new Vector3();
    const _v32 = new Vector3();
    const _value = new Vector3();

    _camera = _camera.camera || _camera;

    this.set('camera', (v) => {
      _camera = v.camera || v;
    });
    this.get('camera', () => _camera);

    this.unproject = function (mouse, rect = Stage, distance = 1) {
      if (typeof rect === 'number') {
        distance = rect;
        rect = Stage;
      }
      _v3.set((mouse.x / rect.width) * 2 - 1, (-mouse.y / rect.height) * 2 + 1, 0.5);
      _v3.unproject(_camera);
      const pos = _camera.getWorldPosition();
      _v3.sub(pos).normalize().multiplyScalar(distance);
      _value.copy(pos).add(_v3);
      return _value;
    };

    this.project = function (pos, screen) {
      screen = screen || Stage;
      if (pos instanceof Base3D) {
        pos.updateMatrixWorld();
        _v32.set(0, 0, 0).setFromMatrixPosition(pos.matrixWorld);
      } else {
        _v32.copy(pos);
      }
      _v32.project(_camera);
      _v32.x = ((_v32.x + 1) / 2) * screen.width;
      _v32.y = (-(_v32.y - 1) / 2) * screen.height;
      return _v32;
    };
  },
  () => {
    let _screen;
    const _map = new WeakMap();

    ScreenProjection.unproject = function (mouse, distance) {
      if (!_screen) _screen = new ScreenProjection(World.CAMERA);
      return _screen.unproject(mouse, distance);
    };

    ScreenProjection.project = function (pos, screen) {
      if (!_screen) _screen = new ScreenProjection(World.CAMERA);
      return _screen.project(pos, screen);
    };

    ScreenProjection.find = function (camera) {
      if (!_map.has(camera)) _map.set(camera, new ScreenProjection(camera));
      return _map.get(camera);
    };
  },
);

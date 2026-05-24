/*
 * GLUIObject shared geometry/noop helpers — static attachments on
 * the `GLUIObject` class set up once at script-load.
 *
 *   - `GLUIObject.getGeometry('2d')` returns a lazily-built unit
 *     PlaneGeometry translated by (+0.5, -0.5, 0) so that its
 *     origin sits at the top-left corner (matches GLUI's "Y grows
 *     down" 2D layout — see 0237 for usage).
 *   - `GLUIObject.getGeometry('3d')` returns the world's shared
 *     `World.PLANE` (centred at the origin, Y-up), used when the
 *     object opts into 3D mode via `enable3D()`.
 *   - `GLUIObject.clear()` drops both cached geometries so they
 *     get rebuilt on next access (used by World rebuild flows that
 *     replace shared resources).
 *   - `GLUIObject.noop` — shared empty function, assigned to
 *     `_onOver`/`_onClick` after `clearInteract()` to avoid having
 *     to null-check every callsite.
 */
!(function () {
  var _geom2d, _geom3d;
  GLUIObject.getGeometry = function (type) {
    return '2d' == type
      ? (_geom2d ||
          (_geom2d = new PlaneGeometry(1, 1)).applyMatrix(
            new Matrix4().makeTranslation(0.5, -0.5, 0),
          ),
        _geom2d)
      : (_geom3d || (_geom3d = World.PLANE), _geom3d);
  };
  GLUIObject.clear = function () {
    _geom2d = _geom3d = null;
  };
  GLUIObject.noop = (_) => {};
})();

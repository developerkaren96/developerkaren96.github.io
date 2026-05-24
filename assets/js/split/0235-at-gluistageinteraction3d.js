/*
 * GLUIStageInteraction3D — thin adapter that bridges the GLUI
 * interaction surface (`obj.mesh.glui._onOver` / `_onClick`) to the
 * shared world-space `Interaction3D` raycast registry.
 *
 * Each registered object's mesh becomes a hit candidate for the
 * given camera; on hit, the `onHover` / `onClick` wrappers forward
 * the event to the GLUI sibling with `{ action, object }`.
 *
 * API mirrors GLUIStageInteraction2D so consumers can use either
 * with the same call shapes:
 *   - `add(obj, camera?)`              — register.
 *   - `remove(obj, camera?)`           — unregister.
 *   - `checkObjectHit(object, mouse, camera?)`               — single hit test.
 *   - `checkObjectFromValues(object, origin, direction, camera?)` — ray hit.
 *   - `getObjectHitLocalCoords(v, object, mouse, camera?)`   — local-space hit.
 */
Class(function GLUIStageInteraction3D() {
  Inherit(this, Component);
  function onHover(e) {
    e.mesh.glui._onOver({
      action: e.action,
      object: e.mesh.glui,
    });
  }
  function onClick(e) {
    e.mesh.glui._onClick({
      action: e.action,
      object: e.mesh.glui,
    });
  }
  this.add = function (obj, camera = World.CAMERA) {
    Interaction3D.find(camera).add(obj.mesh || obj, onHover, onClick);
  };
  this.remove = function (obj, camera = World.CAMERA) {
    Interaction3D.find(camera).remove(obj.mesh || obj);
  };
  this.checkObjectHit = function (object, mouse, camera = World.CAMERA) {
    return Interaction3D.find(camera).checkObjectHit(object.mesh, mouse);
  };
  this.checkObjectFromValues = function (object, origin, direction, camera = World.CAMERA) {
    return Interaction3D.find(camera).checkObjectFromValues(object.mesh, origin, direction);
  };
  this.getObjectHitLocalCoords = function (v, object, mouse, camera = World.CAMERA) {
    return Interaction3D.find(camera).getObjectHitLocalCoords(v, object.mesh, mouse);
  };
});

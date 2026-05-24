/*
 * GLUIUtils — helpers for swapping a GLUI object between the
 * "stage" coordinate space (1 unit = 1 logical pixel) and the
 * "retina" coordinate space (rendered through a 3D scene parented
 * to a stage-layout anchor). Retina mode lets 2D HUD content draw
 * at native device resolution inside the 3D scene's RT.
 *
 * `setRetinaMode($obj, retinaMode, parent?)`:
 *   - Resolves the anchor parent (defaults to `$obj.anchor._parent`
 *     or `$obj.group._parent`).
 *   - When entering retina mode:
 *       * Walks up the anchor chain for the nearest ancestor with
 *         `glSceneEnabled` (a nested GLUI-to-RT scene); falls back
 *         to the global `GLUI.Scene`.
 *       * Adds the object to that scene, and parents `$obj.anchor`
 *         to the original stage parent so layout updates still
 *         propagate.
 *       * Propagates the async load promise from `group` to
 *         `anchor` so consumers waiting on either get notified.
 *       * If the anchor and group transforms diverge, marks the
 *         mesh dirty and forces an onBeforeRender so retina draws
 *         catch up immediately.
 *   - When leaving retina mode: detaches the anchor, removes from
 *     the scene, restores `group.visible` from parent visibility,
 *     and either dirty-redraws or resets transforms to identity.
 *   - Re-parents `$obj.group` to its stage parent at the end.
 *
 * WebVR is special-cased: retina mode is disabled entirely
 * (returns false in `isRetinaMode`, forces `retinaMode=false`).
 *
 * `isRetinaMode($obj)` — true iff the object's anchor is currently
 * parented under a non-WebVR scene chain.
 */
Class(function GLUIUtils() {
  const self = this;
  self.setRetinaMode = function ($obj, retinaMode, parent) {
    if (
      (RenderManager.type === RenderManager.WEBVR && (retinaMode = false),
      parent || (parent = ($obj.anchor && $obj.anchor._parent) || $obj.group._parent))
    )
      if (retinaMode) {
        let gluiToRTScene,
          p = parent;
        for (; p; ) {
          p.glSceneEnabled && (gluiToRTScene = p);
          p = p.parent;
        }
        gluiToRTScene ? gluiToRTScene.glScene.add($obj) : GLUI.Scene.add($obj);
        parent.add($obj.anchor);
        $obj.anchor.retinaAnchorFor = $obj;
        $obj.group.asyncPromise &&
          !$obj.anchor.asyncPromise &&
          ($obj.anchor.asyncPromise = $obj.group.asyncPromise);
        ($obj.anchor.position.equals($obj.group.position) &&
          $obj.anchor.scale.equals($obj.group.scale) &&
          $obj.anchor.quaternion.equals($obj.group.quaternion)) ||
          (($obj.isDirty = true),
          $obj.mesh && $obj.mesh.onBeforeRender && $obj.mesh.onBeforeRender());
      } else {
        self.isRetinaMode($obj) &&
          (parent.remove($obj.anchor),
          GLUI.Scene.remove($obj),
          ($obj.anchor._parent = null),
          ($obj.group.visible = parent.determineVisible()),
          'boolean' == typeof $obj.isDirty && $obj.mesh && $obj.mesh.onBeforeRender
            ? (($obj.isDirty = true), $obj.mesh.onBeforeRender())
            : ($obj.group.position.setScalar(0),
              $obj.group.quaternion.set(0, 0, 0, 1),
              $obj.group.scale.setScalar(1)),
          ($obj.deferred = false),
          ($obj.parent = null));
        parent.add($obj.group);
      }
  };
  self.isRetinaMode = function ($obj) {
    return (
      RenderManager.type !== RenderManager.WEBVR &&
      $obj.anchor &&
      $obj.anchor._parent &&
      $obj.parent === GLUI.Scene
    );
  };
}, 'static');

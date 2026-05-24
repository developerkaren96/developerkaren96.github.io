/*
 * CameraUIL — static facade for the camera editor. Single method
 * `add(camera, group)` wraps a `CameraUILConfig` (0320) panel
 * around the given camera and attaches it to either `UIL.global`,
 * a caller-supplied group, or no group (`null` preserves the
 * "detached" semantics — caller owns mounting).
 *
 * `UPDATE` event constant is the channel CameraUILConfig fires on
 * each parameter change so consumers can re-render previews.
 */
Class(function CameraUIL() {
  this.UPDATE = 'camera_uil_update';
  this.add = function (light, group) {
    return new CameraUILConfig(light, null === group ? null : group || UIL.global);
  };
}, 'static');

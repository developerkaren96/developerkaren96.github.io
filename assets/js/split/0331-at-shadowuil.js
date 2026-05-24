/*
 * ShadowUIL — static facade for `ShadowUILConfig` (0332).
 * Single-method singleton (`add(light, group)`) that mounts a
 * per-light shadow-camera editor panel under a UIL group
 * (`UIL.global` by default; `null` keeps it detached).
 */
Class(function ShadowUIL() {
  this.add = function (light, group) {
    return new ShadowUILConfig(light, null === group ? null : group || UIL.global);
  };
}, 'static');

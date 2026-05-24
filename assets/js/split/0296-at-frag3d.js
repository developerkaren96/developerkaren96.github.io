/*
 * Frag3D — minimal Object3D wrapper that mounts a named SceneLayout
 * as its content. Used in nested scene composition where a sub-scene
 * is referenced by name. `uploadSync` is a no-op stub so callers
 * that introspect the upload pipeline see a uniform interface
 * (Frag3D itself doesn't ship sync state — its inner layout does).
 */
Class(function Frag3D(_name) {
  Inherit(this, Object3D);
  this.layout = this.initClass(SceneLayout, _name);
  this.uploadSync = function () {};
});

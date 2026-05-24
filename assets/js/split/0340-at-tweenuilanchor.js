/*
 * TweenUILAnchor — empty Object3D marker used by SceneLayout to
 * publish a node as a "tween target" in the editor. The
 * `isTweenAnchor = true` duck-type lets TweenUIL discover these
 * nodes during scene scans and offer their transforms as
 * authorable tween channels.
 *
 * No behaviour, no children — purely a typed handle.
 */
Class(function TweenUILAnchor() {
  Inherit(this, Object3D);
  this.isTweenAnchor = true;
});

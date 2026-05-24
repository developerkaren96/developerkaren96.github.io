/*
 * FXScrollUI — tiny SceneLayout glue: when this component is added
 * as a child of an FXScroll root, it registers `this.element` as the
 * FXScroll's `scrollContainer` (so HTML inputs on the UI layer feed
 * the WebGL scroll controller) and hides the DOM element from the
 * normal page flow.
 *
 * Walks up the parent chain looking for the nearest ancestor whose
 * `.scene` is a Scene (i.e. the FXScroll root that owns the WebGL
 * scene). The HTML element under this component is the source of
 * scroll/touch input but never visible — FXScroll renders the
 * matching contents in 3D.
 */
Class(function FXScrollUI() {
  let fxScrollRoot;
  let p = this.parent;
  while (p) {
    if (p.scene instanceof Scene) fxScrollRoot = p;
    p = p.parent;
  }
  fxScrollRoot.scrollContainer = this.element;
  this.element.visible = false;
});

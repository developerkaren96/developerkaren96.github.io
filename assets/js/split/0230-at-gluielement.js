/*
 * GLUIElement — thin Component wrapper around a single `$gl()`
 * (GLUIObject). Subclasses inherit `this.element` and use
 * `create(w, h, t)` as a shorthand for `this.element.create(...)`.
 *
 * Purpose: gives any Component a ready-made GLUI surface without
 * having to remember the `$gl()` factory call boilerplate. The
 * surface stays nameless until the subclass calls `create()`.
 */
Class(function GLUIElement() {
  Inherit(this, Component);
  this.element = $gl();
  this.create = function (w, h, t) {
    return this.element.create(w, h, t);
  };
});

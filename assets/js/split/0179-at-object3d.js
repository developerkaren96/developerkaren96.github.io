/*
 * Object3D — Hydra Component that wraps a `Group` for use in the
 * Component/state hierarchy. Lets user-land Components participate in the
 * 3D scene-graph without subclassing Base3D directly.
 *
 * The Component owns a `group` (its scene-graph node); `add`/`remove`
 * forward to the group, accepting either raw Base3D children or other
 * Object3D wrappers (in which case we forward to their `.group`).
 *
 * `__element = true` flags the Component as a tree-node owner (drives
 * the lifecycle: traversal, destruction order, etc.). On destroy we mark
 * the group as deleted and detach it from its parent.
 *
 * The `visible` setter mirrors the value onto the underlying group's
 * `visible` so visibility flows through the scene-graph traversal.
 */
Class(function Object3D() {
  Inherit(this, Component);
  const self = this;
  let _visible = true;

  this.__element = true;
  this.group = new Group();
  this.group.classRef = this;   // back-pointer for tools/inspectors

  this.add = function (child) {
    this.group.add(child.group || child);
  };
  this.remove = function (child) {
    if (!child) return;
    this.group.remove(child.group || child);
  };
  this.onDestroy = function () {
    this.group.deleted = true;
    this.group.classRef = null;
    if (this.group && this.group._parent) this.group._parent.remove(this.group);
  };

  this.set('visible', (v) => (self.group.visible = _visible = v));
  this.get('visible', (_) => _visible);
});

/*
 * MeshUIL — static facade for `MeshUILConfig` (0328). Same
 * pattern as CameraUIL / InputUIL / ShaderUIL:
 *
 *   - `add(mesh, group)` builds a transform/material editor panel
 *     for the mesh. When `group === null`, the panel runs
 *     detached (no parent panel). Otherwise it stashes the group
 *     on `mesh.__uilGroup` (so descendant tooling can find the
 *     panel a mesh belongs to) and attaches under the supplied
 *     group or `UIL.global`.
 *
 *   - `exists` is a per-mesh-prefix de-dup map (populated by
 *     `MeshUILConfig`) so duplicate panels aren't created for
 *     the same mesh.
 *
 *   - `UPDATE` is the cross-instance event channel for value
 *     propagation (mirrors `CameraUIL.UPDATE`).
 */
Class(function MeshUIL() {
  Inherit(this, Component);
  this.exists = {};
  this.UPDATE = 'mesh_uil_update';
  this.add = function (mesh, group) {
    return (
      (group = null === group ? null : group) && (mesh.__uilGroup = group),
      new MeshUILConfig(mesh, group || UIL.global)
    );
  };
}, 'static');

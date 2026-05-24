/*
 * Line — renderable for line-primitive geometry (GL_LINES / GL_LINE_STRIP).
 *
 * Same shape as `Mesh`: a `Base3D` carrying a `geometry` + `shader` pair.
 * The renderer dispatches on `isLine` to switch the draw mode to lines and
 * skip features that only make sense for solid triangles (face normals,
 * culling). `id` from the global `Renderer.ID++` counter is used as the
 * VAO-cache key in `GeometryRenderer`.
 */
class Line extends Base3D {
  constructor(geometry, shader) {
    super();
    this.geometry = geometry;
    this.shader   = shader;
    this.isLine   = true;
    this.id       = Renderer.ID++;
  }
  clone() { return new Line(this.geometry, this.shader).copy(this); }
}

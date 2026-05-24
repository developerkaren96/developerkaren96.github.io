/*
 * VAO — wrapper around a WebGL Vertex Array Object handle.
 *
 * A VAO records the attribute-pointer + element-buffer bindings for a
 * particular (geometry × shader-attribs) pair so subsequent draws can swap
 * a whole binding set with a single GL call (`bindVertexArray`). Hydra's
 * `GeometryRenderer` keeps a cache keyed by `${geomId}_${shaderProgId}` and
 * ref-counts these per host mesh.
 *
 * WebGL2 has VAOs as a core feature. WebGL1 reaches them through the
 * `OES_vertex_array_object` extension — the wrapper hides the
 * native/extension dispatch so callers can use the same `bind/unbind/destroy`
 * API regardless of GL version.
 */
class VAO {
  constructor(gl) {
    this.gl     = gl;
    this.WEBGL2 = Renderer.type == Renderer.WEBGL2;
    this.vao    = this.WEBGL2
      ? gl.createVertexArray()
      : Renderer.extensions.VAO.createVertexArrayOES();
  }

  bind() {
    const gl = this.gl;
    if (this.WEBGL2) gl.bindVertexArray(this.vao);
    else             Renderer.extensions.VAO.bindVertexArrayOES(this.vao);
  }

  unbind() {
    const gl = this.gl;
    if (this.WEBGL2) gl.bindVertexArray(null);
    else             Renderer.extensions.VAO.bindVertexArrayOES(null);
  }

  destroy() {
    const gl = this.gl;
    if (this.WEBGL2) gl.deleteVertexArray(this.vao);
    else             Renderer.extensions.VAO.deleteVertexArrayOES(this.vao);
    this.vao = null;
  }
}

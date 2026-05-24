/*
 * MultiRenderTarget — a RenderTarget with multiple colour attachments
 * (multi-render-target / MRT).
 *
 * Used by deferred-shading style passes: a single geometry draw writes
 * out, say, albedo to attachment 0, normals to attachment 1, and a
 * position/depth buffer to attachment 2 in one rasterization pass. The
 * GLSL side uses `layout(location=N)` outputs (WebGL2) or the
 * `EXT_draw_buffers` extension (WebGL1). The shader compiler in
 * `Shader.onBeforeCompile` rewrites `#drawbuffer` directives into the
 * right declarations per backend.
 *
 * `attachments` starts pre-populated with the base RenderTarget's own
 * texture; additional textures are pushed onto this list and bound to
 * `COLOR_ATTACHMENT0+N` when the framebuffer is set up.
 *
 * `multi = true` is the flag the renderer checks to take the MRT
 * framebuffer-setup path rather than the single-texture one.
 */
class MultiRenderTarget extends RenderTarget {
  constructor(width, height, options = {}) {
    super(width, height, options);
    this.multi       = true;
    this.attachments = [this.texture];
  }
}

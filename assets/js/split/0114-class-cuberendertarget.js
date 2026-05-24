/*
 * CubeRenderTarget — a RenderTarget that renders into one face of a
 * cube map at a time.
 *
 * Used for dynamic reflection probes and environment captures: render
 * the scene 6 times with the camera oriented at the +X, -X, +Y, -Y,
 * +Z, -Z faces, swapping `activeFace` between passes. The renderer
 * uses this index to pick the correct `TEXTURE_CUBE_MAP_POSITIVE_X+N`
 * attachment when binding the framebuffer.
 *
 * `cube = true` is the discriminator the renderer checks to take the
 * cube-map framebuffer setup path.
 */
class CubeRenderTarget extends RenderTarget {
  constructor(width, height, options = {}) {
    super(width, height, options);
    this.activeFace = 0;
    this.cube       = true;
  }
}

/*
 * Texture3D — volumetric texture (width × height × depth) sampled with a
 * `sampler3D` in GLSL. WebGL2-only — requires `texImage3D`.
 *
 * Used by Hydra for things like:
 *   - 3D LUTs (colour grading look-up tables).
 *   - Volume rendering (smoke / cloud noise lookups).
 *   - Lattice fields for raymarching.
 *
 * Defaults:
 *   - `format` = RGBA, `type` = FLOAT — typical for HDR volume data.
 *   - LINEAR filtering on min/mag — trilinear when both are LINEAR.
 *   - CLAMP_TO_EDGE on all three wrap axes (S/T/R) — volumetric data
 *     usually shouldn't tile.
 *   - `generateMipmaps` off; trilinear interpolation is enough.
 *
 * The `isTexture3D` flag selects the volumetric upload path in
 * TextureRendererWebGL — `texImage3D` against `TEXTURE_3D`, with the
 * extra `depth` dimension and the third `wrapR` parameter.
 */
class Texture3D extends Texture {
  constructor(image, width, height, depth, format, type, filter = null) {
    super();
    this.format = format || Texture.RGBAFormat;
    this.width  = width;
    this.height = height;
    this.depth  = depth;
    this.image  = image;

    this.minFilter = this.magFilter = filter || Texture.LINEAR;
    this.wrapS = this.wrapT = this.wrapR = Texture.CLAMP_TO_EDGE;
    this.generateMipmaps = false;
    this.type = type || Texture.FLOAT;

    this.isTexture3D = true;
  }
}

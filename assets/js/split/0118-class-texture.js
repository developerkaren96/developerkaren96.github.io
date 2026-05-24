/*
 * Texture — wraps an image source (HTMLImageElement, video, canvas, raw data)
 * and the GL state describing how to sample it.
 *
 *   const tex = new Texture(img);
 *   tex.upload();    // schedules GPU upload via Texture.renderer
 *
 * The `_image` private + `image` accessor lets dynamic sources (videos,
 * GLUI textures) register an `onCreateTexture` callback to wire themselves
 * back to this Texture (e.g. mark needsUpdate when frame changes).
 *
 * Defaults match Three.js (LINEAR mag, mipmapped min, RGBA, clamp).
 * Constants (`Texture.LINEAR`, etc.) live on the constructor — see the
 * statics installer earlier in the bundle.
 */
class Texture {
  constructor(img) {
    this.magFilter = Texture.LINEAR;
    this.minFilter = Texture.LINEAR_MIPMAP;
    this.format    = Texture.RGBAFormat;
    this.wrapS = this.wrapT = Texture.CLAMP_TO_EDGE;
    this._image    = img;
    this.needsUpdate     = true;
    this.generateMipmaps = true;
    this.anisotropy = 1;
    this.type = Texture.UNSIGNED_BYTE;
    this.isTexture = true;

    // Let dynamic sources hook back so they can flip needsUpdate later.
    if (img && img.onCreateTexture) img.onCreateTexture(this);
  }

  set image(img) {
    this._image = img;
    if (img && img.onCreateTexture) img.onCreateTexture(this);
  }
  get image() { return this._image; }

  /** Schedule a GPU upload via the renderer (no-op if `_gl` already set). */
  upload() {
    if (!this._gl) Texture.renderer.upload(this);
  }

  destroy() {
    Texture.renderer.destroy(this);
    this._image = null;
  }

  /** Shallow clone — shares the underlying image, copies all sampler state. */
  clone() {
    const texture = new Texture(this.img);
    texture.format          = this.format;
    texture.type            = this.type;
    texture.anisotropy      = this.anisotropy;
    texture.wrapS           = this.wrapS;
    texture.wrapT           = this.wrapT;
    texture.generateMipmaps = this.generateMipmaps;
    texture.minFilter       = this.minFilter;
    texture.magFilter       = this.magFilter;
    return texture;
  }
}

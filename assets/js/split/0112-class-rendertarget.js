/*
 * RenderTarget — an offscreen render destination (color texture + optional
 * depth/stencil). Wraps the GL FBO + its color attachment(s).
 *
 *   const rt = new RenderTarget(512, 512, { format: Texture.RGBAFormat });
 *   renderer.render(scene, camera, rt);
 *
 * Two relevant variants:
 *   - **Multisample**: when `options.multisample` is set on WebGL2, a hidden
 *     companion `_rtMultisample` is created and the main RT serves as the
 *     *resolve* target. Renderer binds the multisample buddy for the draw,
 *     then blits into `this` at the end of the frame.
 *   - **Shared renderbuffer**: lets several RTs reuse one depth/stencil
 *     attachment — useful when ping-ponging color targets while keeping a
 *     stable depth pass.
 *
 * The actual GL handle (`_gl`) is created lazily by `RenderTarget.renderer.upload(this)`
 * (set up by `Renderer` at init).
 */
class RenderTarget {
  constructor(width, height, options = {}) {
    this.width    = width;
    this.height   = height;
    this.options  = options;
    this.viewport = new Vector2(0, 0);

    if (options.minFilter === undefined) options.minFilter = Texture.LINEAR;
    this.stencil = typeof options.stencil === 'boolean' && options.stencil;

    // Shared-renderbuffer mode: borrow another RT's depth buffer.
    if (options.sharedRenderbuffer) {
      this.sharedRenderbuffer = true;
      this.clearDepth   = typeof options.clearDepth !== 'boolean' || options.clearDepth;
      this._depthBuffer = options.sharedRenderbuffer.rt._depthBuffer;
    }

    // Color attachment as a Texture, so it can be sampled like any other.
    this.texture = new Texture(null);
    this.texture.generateMipmaps = options.generateMipmaps;
    this.texture.rt        = this;
    this.texture.width     = width;
    this.texture.height    = height;
    this.texture.minFilter = options.minFilter || Texture.LINEAR;
    this.texture.magFilter = options.magFilter || Texture.LINEAR;
    this.texture.wrapS     = options.wrapS     || Texture.CLAMP_TO_EDGE;
    this.texture.wrapT     = options.wrapT     || Texture.CLAMP_TO_EDGE;
    this.texture.format    = options.format    || Texture.RGBFormat;
    if (options.type) this.texture.type = options.type;

    // Multisample (WebGL2 only): build a companion RT for the actual MSAA
    // storage. We render INTO `_rtMultisample` and resolve into `this`.
    const isWebGL2 = Renderer.type ? Renderer.type == Renderer.WEBGL2 : Device.graphics.webgl.webgl2;
    if (options.multisample && isWebGL2) {
      options.multisample           = false;
      this.multisample              = true;
      this._rtMultisample           = new RenderTarget(width, height, options);
      this._rtMultisample.internalMultisample = true;
      this._rtMultisample.parent    = this;
      this._rtMultisample._samplesAmount
        = options.samplesAmount === undefined ? 100 : options.samplesAmount;
    }

    this.isRT = true;
  }

  /**
   * Resize the RT in place. Also reallocates the multisample buddy if its
   * dims got out of sync (e.g. one branch was skipped on the first resize).
   */
  setSize(width, height) {
    this.width  = width;
    this.height = height;
    this.texture.width  = width;
    this.texture.height = height;
    this.viewport.set(0, 0);
    RenderTarget.renderer.resize(this);

    if (this.multisample
        && (this._rtMultisample.width !== width || this._rtMultisample.height !== height)) {
      this._rtMultisample.destroy();
      this._rtMultisample = new RenderTarget(width, height, this.options);
      this._rtMultisample.internalMultisample = true;
      this._rtMultisample.parent = this;
      this._rtMultisample._samplesAmount
        = this.options.samplesAmount === undefined ? 100 : this.options.samplesAmount;
    }
  }

  clone() {
    return new RenderTarget(this.width, this.height, { ...this.options }).copy(this);
  }

  copy(source) {
    this.width  = source.width;
    this.height = source.height;
    const options = { ...this.options };
    this.options = options;
    this.viewport.copy(source.viewport);
    this.stencil = source.stencil;
    if (source.sharedRenderbuffer) {
      this.sharedRenderbuffer = true;
      this.clearDepth         = source.clearDepth;
      this._depthBuffer       = source._depthBuffer;
    }
    this.texture = source.texture.clone();
    if (source.multisample) {
      options.multisample = false;
      this.multisample    = true;
      this._rtMultisample = new RenderTarget(this.width, this.height, options);
      this._rtMultisample.internalMultisample = true;
      this._rtMultisample.parent = this;
      this._rtMultisample._samplesAmount = source._rtMultisample._samplesAmount;
    }
    return this;
  }

  /**
   * Attach a sampleable depth texture (for shadow maps, SSR, post-FX). Nearest
   * filtering + clamp wrapping is the only safe combination for depth.
   * Forces a re-upload by destroying the existing FBO.
   */
  createDepthTexture() {
    this.depth = new Texture(null);
    this.depth.generateMipmaps = false;
    this.depth.minFilter = Texture.NEAREST;
    this.depth.magFilter = Texture.NEAREST;
    this.depth.wrapS     = Texture.CLAMP_TO_EDGE;
    this.depth.wrapT     = Texture.CLAMP_TO_EDGE;
    if (this._gl) RenderTarget.renderer.destroy(this);
    return this.depth;
  }

  destroy() { RenderTarget.renderer.destroy(this); }

  /** Lazy GPU allocation. Multisample buddy gets uploaded recursively. */
  upload() {
    if (!this._gl) RenderTarget.renderer.upload(this);
    if (this._rtMultisample) this._rtMultisample.upload();
  }
}

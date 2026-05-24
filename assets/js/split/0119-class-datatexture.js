/*
 * DataTexture — Texture backed by a raw typed-array of pixel values.
 *
 * Defaults that differ from a regular image-backed Texture:
 *   - `minFilter` / `magFilter` default to NEAREST (point sampling) because
 *     data-textures are usually look-up tables, not photographs.
 *   - `type` defaults to FLOAT — these are typically used as float-buffer
 *     storage (HDR pre-bakes, simulation state, position-buffer animation).
 *   - `generateMipmaps` is forced false (a float LUT shouldn't be filtered
 *     down).
 *   - `isDataTexture` flag distinguishes the upload path in
 *     TextureRendererWebGL — instead of `texImage2D(image)` it uses the
 *     internalformat / format / type triple returned by `getFloatParams`.
 *
 * `destroyDataAfterUpload` (opt-in) lets the renderer drop the JS-side
 * Float32Array reference once it has been pushed to GPU memory, freeing
 * up RAM for textures that don't need re-uploads.
 *
 * `uploadAsync` delegates to the shared Texture.renderer which slices the
 * data into 4 chunks and uploads one chunk per Render.Worker tick — used
 * to avoid stalling the frame on a multi-MB position-buffer upload.
 */
class DataTexture extends Texture {
  constructor(data, width, height, format, type, filter = null) {
    super();
    if (format) this.format = format;
    this.width  = width;
    this.height = height;
    this.data   = data;

    this.minFilter = this.magFilter = filter || Texture.NEAREST;
    this.generateMipmaps = false;
    this.type = type || Texture.FLOAT;

    this.isDataTexture           = true;
    this.destroyDataAfterUpload  = false;
  }

  uploadAsync() {
    return Texture.renderer.uploadAsync(this);
  }
}

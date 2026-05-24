/*
 * AntimatterAttribute — wraps a Float32Array as a DataTexture that the
 * Antimatter shader pipeline can sample. The texture's side length is
 * derived from buffer length / components, so callers don't pass a
 * separate size.
 *
 * Backing:
 *   `buffer`    raw Float32Array (live; mutate then set `needsUpdate`).
 *   `texture`   DataTexture in RGB or RGBA float format. Float texture
 *               support is assumed (Antimatter requires it; see
 *               AntimatterPass for the WebGL1/iOS half-float fallback
 *               on RTs).
 *   `size`      texture side length (computed from buffer.length).
 *   `count`     size² (texel count).
 *
 * `needsUpdate` is exposed as a setter (via Component's `.set()`) so
 * `attr.needsUpdate = true` re-uploads on the next render. The reason
 * it's a setter rather than a property: in some build modes the
 * DataTexture may have been destroyed and reconstructed, and we want
 * the live texture to receive the flag.
 *
 * `bufferData(data, components)`:
 *   Live-swap the backing buffer. If the component count changed, we
 *   must rebuild the DataTexture (different internal format). Otherwise
 *   just point `.data` at the new array and flag for re-upload.
 *
 * `upload()` / `uploadAsync()`:
 *   Force a GPU upload. The async variant sets `distributeTextureData`
 *   first so the driver streams the upload over multiple frames,
 *   avoiding hitches on large textures.
 *
 * `clone()` returns an independent copy backed by the same buffer
 * reference (it's a snapshot of the wrapping, not a deep clone of
 * underlying data — callers that need a fresh buffer should
 * `new AntimatterAttribute(data.slice(), components)` themselves).
 */
Class(function AntimatterAttribute(_data, _components) {
  Inherit(this, Component);
  const self = this;
  const _size = Math.sqrt(_data.length / (_components || 3));

  this.size   = _size;
  this.count  = _size * _size;
  this.buffer = _data;
  this.texture = new DataTexture(
    _data,
    _size,
    _size,
    4 == _components ? Texture.RGBAFormat : Texture.RGBFormat,
    Texture.FLOAT,
  );

  // Setter form — pings the texture if still alive.
  this.set('needsUpdate', function () {
    if (self.texture) self.texture.needsUpdate = true;
  });

  /*
   * Live-swap the backing buffer. Component-count change forces a
   * texture rebuild (different internal format); same component count
   * just retargets `.data` and flags for re-upload.
   */
  this.bufferData = function (data, components) {
    self.buffer = data;
    if (components != _components) {
      self.texture.destroy();
      self.texture = new DataTexture(
        data,
        _size,
        _size,
        4 == components ? Texture.RGBAFormat : Texture.RGBFormat,
        Texture.FLOAT,
      );
    } else {
      self.texture.data = data;
      self.texture.needsUpdate = true;
    }
    _components = components;
    _data = data;
  };

  this.upload = function () { self.texture.upload(); };

  // Async upload: stream texture data over multiple frames so the
  // upload doesn't cause a frame hitch.
  this.uploadAsync = function () {
    self.texture.distributeTextureData = true;
    self.texture.upload();
    return self.texture.uploadAsync();
  };

  this.clone = function () { return new AntimatterAttribute(_data, _components); };

  this.onDestroy = function () {
    if (self.texture && self.texture.destroy) self.texture.destroy();
  };
});

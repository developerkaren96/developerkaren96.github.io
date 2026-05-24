/*
 * TextureRendererWebGL — the GPU-side implementation of texture upload,
 * binding, and per-draw activation, owned by the Renderer.
 *
 * Instantiated once per GL context and assigned to Texture.renderer so
 * any Texture / DataTexture / Texture3D / cube-texture can route through
 * the same upload pipeline.
 *
 * Responsibilities:
 *
 *   - `draw(texture, loc, key, id)`
 *       Bind `texture._gl` to texture unit `id`, set the sampler
 *       uniform `loc` to that unit, and trigger a re-upload if the
 *       texture is dirty (`needsReupload`) or animated (`dynamic` /
 *       `needsUpdate`).
 *
 *   - `upload(texture)`
 *       Three-way dispatch:
 *         (1) Cube map        — 6 face uploads, compressed or
 *             texImage2D-per-face, then generateMipmap on the cube
 *             target.
 *         (2) 3D texture      — single texImage3D, with explicit
 *             pixel-store toggles and wrapR for the depth axis.
 *         (3) Regular 2D      — either the float-data path
 *             (DataTexture or any `type` containing "float") via
 *             getFloatParams + texImage2D with raw data, or the
 *             image-backed path via texImage2D(image). Compressed
 *             images go through per-mip compressedTexImage2D.
 *
 *   - `uploadAsync(texture)`
 *       Chunked async upload — slices `texture.data` into 4 vertical
 *       strips and uploads one strip per Render.Worker tick using
 *       texSubImage2D. Resolves the cached `_uploadAsyncPromise` once
 *       all 4 chunks are in. Used to avoid frame stalls on multi-MB
 *       float textures.
 *
 *   - `updateDynamic(texture)`
 *       Re-upload contents of an already-allocated texture, used by
 *       video textures and dynamic data textures. Avoids re-running
 *       parameter setup.
 *
 *   - `manualUpdateDynamic(texture)`
 *       Same but skips the `dynamic` flag check (caller knows it
 *       needs an update right now).
 *
 *   - `destroy(texture)`
 *       deleteTexture + drop the JS-side data reference, with
 *       RenderCount bookkeeping.
 *
 * State caching:
 *   `_state.flipY` and `_state.premultiply` mirror the GL pixel-store
 *   flags so we only call `pixelStorei` when the value actually
 *   changes. These are surprisingly expensive on some drivers.
 *
 * Sentinel data arrays:
 *   `FLOAT_DATA`, `UINT_DATA`, `INT_DATA`, `DATA` — single 4-element
 *   typed-array placeholders used by setTextureParams to allocate a 1×1
 *   texture of the right type when the real data isn't ready yet.
 *   HALF_FLOAT explicitly uses `null` data because there's no JS typed
 *   array for it.
 *
 * EXT_OES support:
 *   `texture.EXT_OES === true` switches the bind target from TEXTURE_2D
 *   to TEXTURE_EXTERNAL_OES — used for video / camera textures on
 *   Android via the OES_EGL_image_external extension.
 *
 * Compressed textures:
 *   Either cube or 2D, both with the same shape: a `compressedData`
 *   array of per-mip byte buffers plus a parallel `sizes` array and a
 *   `gliFormat` (GLI-style format enum). The `uncompressed` flag
 *   inside the image indicates the data is actually raw RGBA bytes
 *   stored in the compressed-texture container (used for fallback /
 *   testing).
 */
Class(function TextureRendererWebGL(_gl) {
  const self = this;

  // GL pixel-store state cache. We flip these only when the desired
  // value differs from the last set value.
  var _state = {};

  // Type-keyed sentinel data buffers for 1×1 texture initialization
  // before the real upload arrives. HALF_FLOAT has no JS typed-array,
  // so it falls through to `null`.
  const FLOAT_DATA = new Float32Array([0, 0, 0, 0]);
  const UINT_DATA  = new Uint32Array ([0, 0, 0, 0]);
  const INT_DATA   = new Int32Array  ([0, 0, 0, 0]);
  const DATA       = new Uint8Array  ([0, 0, 0, 0]);

  const {
    getFormat,
    getProperty,
    getType,
    getFloatParams,
    getInternalFormat,
  } = require('GLTypes');

  /*
   * Allocate a 1×1 placeholder of the right type/format and apply the
   * wrap / filter / anisotropy / premultiplyAlpha state. Called the
   * first time we touch a texture.
   *
   * For cube and 3D textures we skip the placeholder texImage2D (the
   * caller handles allocation in face-loop / texImage3D paths). For
   * compressed textures we also skip — `compressedTexImage2D` runs
   * later.
   *
   * The big nested ternary on lines 40-45 picks a `UNPACK_PREMULTIPLY_ALPHA`
   * mode:
   *   - data-backed or non-RGBA → never premultiply.
   *   - explicit `premultiplyAlpha === false` → off.
   *   - otherwise → on (the default for image-backed RGBA).
   */
  function setTextureParams(texture, textureType = _gl.TEXTURE_2D) {
    let format         = getFormat(texture);
    let internalFormat = getInternalFormat(texture);
    let type           = getType(texture);
    let data           = DATA;

    switch (texture.type) {
      case Texture.FLOAT:             data = FLOAT_DATA; break;
      case Texture.UNSIGNED_INTEGER:  data = UINT_DATA;  break;
      case Texture.INTEGER:           data = INT_DATA;   break;
      case Texture.HALF_FLOAT:        data = null;       break;
    }

    if (textureType == _gl.TEXTURE_2D && !texture.compressed) {
      _gl.texImage2D(textureType, 0, internalFormat, 1, 1, 0, format, type, data);
    }

    _gl.texParameteri(textureType, _gl.TEXTURE_WRAP_S,     getProperty(texture.wrapS));
    _gl.texParameteri(textureType, _gl.TEXTURE_WRAP_T,     getProperty(texture.wrapT));
    _gl.texParameteri(textureType, _gl.TEXTURE_MAG_FILTER, getProperty(texture.magFilter));
    _gl.texParameteri(textureType, _gl.TEXTURE_MIN_FILTER, getProperty(texture.minFilter));

    // PremultiplyAlpha decision:
    //   raw-data OR non-RGBA → off (cached); image-backed RGBA →
    //   honour `premultiplyAlpha` (default true).
    if (texture.data || texture.format != Texture.RGBAFormat) {
      if (_state.premultiply == 1) {
        _gl.pixelStorei(_gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        _state.premultiply = false;
      }
    } else if (false === texture.premultiplyAlpha) {
      _gl.pixelStorei(_gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      _state.premultiply = false;
    } else {
      _gl.pixelStorei(_gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      _state.premultiply = true;
    }

    if (texture.anisotropy > 1) {
      _gl.texParameterf(
        textureType,
        Renderer.extensions.anisotropy.TEXTURE_MAX_ANISOTROPY_EXT,
        texture.anisotropy,
      );
    }
  }

  /*
   * Re-upload an already-allocated texture's contents. For DataTextures
   * we go through texSubImage2D with the float-params triple (cached on
   * the texture so we don't re-derive it each frame). For image-backed
   * textures we re-run texImage2D (cheaper than figuring out subImage
   * for video frames).
   */
  function updateDynamic(texture) {
    if (texture.isDataTexture) {
      // flipY toggle, cached.
      if (true === texture.flipY) {
        if (!_state.flipY) {
          _gl.pixelStorei(_gl.UNPACK_FLIP_Y_WEBGL, true);
          _state.flipY = true;
        }
      } else if (_state.flipY) {
        _gl.pixelStorei(_gl.UNPACK_FLIP_Y_WEBGL, false);
        _state.flipY = false;
      }

      // DataTextures never premultiply.
      if (_state.premultiply) {
        _gl.pixelStorei(_gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        _state.premultiply = false;
      }

      // Cache the format triple on first dynamic update.
      if (!texture.glFormat) {
        let { internalformat, format, type } = getFloatParams(texture);
        texture.iformat   = internalformat;
        texture.glFormat  = format;
        texture.glType    = type;
      }

      _gl.texSubImage2D(
        _gl.TEXTURE_2D, 0,
        0, 0, texture.width, texture.height,
        texture.glFormat, texture.glType, texture.data,
      );
    } else {
      // Image-backed (typically video). Always flipY on, premultiply
      // follows the texture's flag.
      if (!_state.flipY) {
        _gl.pixelStorei(_gl.UNPACK_FLIP_Y_WEBGL, true);
        _state.flipY = true;
      }

      if (texture.format == Texture.RGBAFormat) {
        if (false === texture.premultiplyAlpha) {
          _gl.pixelStorei(_gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
          _state.premultiply = false;
        } else {
          _gl.pixelStorei(_gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
          _state.premultiply = true;
        }
      } else if (_state.premultiply) {
        _gl.pixelStorei(_gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        _state.premultiply = false;
      }

      if (!texture.glFormat) texture.glFormat = getFormat(texture);

      // texImage2D can throw on a not-yet-decoded video frame; swallow
      // it and try again next tick.
      try {
        _gl.texImage2D(
          _gl.TEXTURE_2D, 0,
          texture.glFormat, texture.glFormat,
          getType(texture), texture.image,
        );
      } catch (e) {}
    }
  }

  /*
   * Per-draw activation. Run from GeometryRenderer when binding a
   * mesh's sampler uniforms.
   *   - upload on first sight or when needsReupload is set.
   *   - bind the right target (cube / 3D / OES / 2D).
   *   - set the sampler uniform to the texture unit.
   *   - if the texture is animated, push fresh pixel data.
   */
  this.draw = function (texture, loc, key, id) {
    if (undefined === texture._gl || texture.needsReupload) this.upload(texture);

    _gl.activeTexture(_gl[`TEXTURE${id}`]);

    if (texture.cube) {
      _gl.bindTexture(_gl.TEXTURE_CUBE_MAP, texture._gl);
    } else if (texture.isTexture3D) {
      _gl.bindTexture(_gl.TEXTURE_3D, texture._gl);
    } else {
      let texType = texture.EXT_OES ? _gl.TEXTURE_EXTERNAL_OES : _gl.TEXTURE_2D;
      _gl.bindTexture(texType, texture._gl);
    }

    _gl.uniform1i(loc, id);

    if (texture.dynamic || texture.needsUpdate) updateDynamic(texture);
    texture.needsUpdate = false;
  };

  /*
   * The big three-branch upload dispatcher. Idempotent — bails out if
   * `_gl` is set and neither dirty flag is on.
   */
  this.upload = function (texture) {
    if (texture._gl && !texture.needsReupload && !texture.needsUpdate) return;

    let format = getFormat(texture);

    if (Utils.query('debugUpload')) console.log('?debugUpload – upload texture', texture);

    // ── Branch 1: Cube map ───────────────────────────────────────────
    if (texture.cube) {
      if (texture.compressed) {
        if (1 !== texture.cube.length) throw 'Compressed cube texture requires 1 file with 6 faces';
      } else if (6 !== texture.cube.length) {
        throw 'Cube texture requires 6 images';
      }
      return uploadCube(texture);
    }

    // ── Branch 2: 3D texture ─────────────────────────────────────────
    if (texture.isTexture3D) return uploadTexture3D(texture);

    // ── Branch 3: 2D texture ─────────────────────────────────────────
    let texType = texture.EXT_OES ? _gl.TEXTURE_EXTERNAL_OES : _gl.TEXTURE_2D;

    if (undefined === texture._gl) {
      texture._gl = _gl.createTexture();
      RenderCount.add('texture');
      _gl.bindTexture(texType, texture._gl);
      setTextureParams(texture, texType);
    } else {
      _gl.bindTexture(texType, texture._gl);
    }

    // Data-backed (DataTexture or any float-typed texture) goes
    // through the float-params path with raw typed-array data.
    if (texture.isDataTexture || (texture.type && texture.type.includes('float'))) {
      if (true === texture.flipY) {
        if (!_state.flipY) { _gl.pixelStorei(_gl.UNPACK_FLIP_Y_WEBGL, true);  _state.flipY = true;  }
      } else if (_state.flipY) {
        _gl.pixelStorei(_gl.UNPACK_FLIP_Y_WEBGL, false); _state.flipY = false;
      }

      _gl.pixelStorei(_gl.UNPACK_ALIGNMENT, 1);

      let { internalformat, format, type } = getFloatParams(texture);
      // IE-specific try/catch for a long-fixed legacy bug.
      if ('ie' === Device.system.browser) {
        try {
          _gl.texImage2D(
            _gl.TEXTURE_2D, 0, internalformat,
            texture.width, texture.height, 0,
            format, type,
            texture.distributeTextureData ? null : texture.data,
          );
        } catch (e) { console.log(e); }
      } else {
        _gl.texImage2D(
          _gl.TEXTURE_2D, 0, internalformat,
          texture.width, texture.height, 0,
          format, type,
          texture.distributeTextureData ? null : texture.data,
        );
      }

      // Optionally drop the JS-side data once it's on GPU.
      if (texture.destroyDataAfterUpload) {
        texture.data = null;
        delete texture.data;
        texture.onDataDestroyed?.();
      }
    } else {
      // Image-backed 2D (or compressed image).
      let needsFlipY = !texture.compressed && false !== texture.flipY;
      if (needsFlipY !== !!_state.flipY) {
        _gl.pixelStorei(_gl.UNPACK_FLIP_Y_WEBGL, needsFlipY);
        _state.flipY = needsFlipY;
      }

      if (texture.image && texture.compressed) {
        let data = texture.image.compressedData;
        for (let i = 0; i < data.length; i++) {
          let size = texture.image.sizes[i];
          if (texture.image.uncompressed) {
            _gl.texImage2D(
              _gl.TEXTURE_2D, i, _gl.RGBA,
              size.width, size.height, 0,
              _gl.RGBA, _gl.UNSIGNED_BYTE, data[i],
            );
          } else {
            _gl.compressedTexImage2D(
              _gl.TEXTURE_2D, i, texture.image.gliFormat,
              size.width || size, size.height || size, 0, data[i],
            );
          }
        }
        // Drop the compressed buffer list — uploaded, no longer needed.
        data.length = 0;
      } else if (texture.image && !(texture.image instanceof HTMLVideoElement)) {
        try {
          _gl.texImage2D(_gl.TEXTURE_2D, 0, format, format, getType(texture), texture.image);
        } catch (e) {
          console.log('error loading texture', e, texture.image);
        }
      }

      if (!texture.distributeTextureData) RenderCount.add('tex_upload', texture);
    }

    if ((texture.image || texture.data) && texture.generateMipmaps && !texture.compressed) {
      _gl.generateMipmap(_gl.TEXTURE_2D);
    }

    texture.needsUpdate = texture.needsReupload = false;
    texture.onUpdate && texture.onUpdate();
  };

  /*
   * Cube-map upload helper. Compressed cubes ship as one buffer with 6
   * stacked face-payloads per mip level; uncompressed cubes ship as 6
   * separate HTMLImageElements.
   */
  function uploadCube(texture) {
    if (undefined === texture._gl) {
      texture._gl = _gl.createTexture();
      _gl.bindTexture(_gl.TEXTURE_CUBE_MAP, texture._gl);

      let needsFlipY = true === texture.flipY;
      if (needsFlipY !== !!_state.flipY) {
        _gl.pixelStorei(_gl.UNPACK_FLIP_Y_WEBGL, needsFlipY);
        _state.flipY = needsFlipY;
      }
      setTextureParams(texture, _gl.TEXTURE_CUBE_MAP);
    }

    let format = getFormat(texture);

    if (texture.compressed) {
      // image.compressedData[mip] is one byte-buffer of length
      // (faceLength × 6); slice it into per-face views.
      let image = texture.cube[0];
      for (let i = 0; i < image.compressedData.length; i++) {
        let size       = image.sizes[i];
        let data       = image.compressedData[i];
        let faceLength = data.length / 6;
        for (let j = 0; j < 6; j++) {
          if (image.uncompressed) {
            let view = new Uint8Array(data.buffer, j * faceLength, faceLength);
            _gl.texImage2D(
              _gl.TEXTURE_CUBE_MAP_POSITIVE_X + j, i,
              _gl.RGBA, size.width, size.height, 0,
              _gl.RGBA, _gl.UNSIGNED_BYTE, view,
            );
          } else {
            let view = new DataView(data.buffer, j * faceLength, faceLength);
            _gl.compressedTexImage2D(
              _gl.TEXTURE_CUBE_MAP_POSITIVE_X + j, i,
              image.gliFormat,
              size.width || size, size.height || size, 0, view,
            );
          }
        }
      }
    } else {
      for (let i = 0; i < 6; i++) {
        _gl.texImage2D(
          _gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, 0,
          format, format, getType(texture), texture.cube[i],
        );
      }
      _gl.generateMipmap(_gl.TEXTURE_CUBE_MAP);
    }

    texture.needsUpdate = texture.needsReupload = false;
    texture.onUpdate && texture.onUpdate();
  }

  /*
   * 3D-texture upload helper. Single texImage3D call with explicit
   * pixel-store toggles (always off for volumetric data) and the
   * third wrapR parameter.
   */
  function uploadTexture3D(texture) {
    if (undefined === texture._gl) {
      let format         = getFormat(texture);
      let internalFormat = getInternalFormat(texture);
      let type           = getType(texture);

      texture._gl = _gl.createTexture();
      _gl.bindTexture(_gl.TEXTURE_3D, texture._gl);

      _gl.pixelStorei(_gl.UNPACK_FLIP_Y_WEBGL, false);
      _gl.pixelStorei(_gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);

      _gl.texParameteri(_gl.TEXTURE_3D, _gl.TEXTURE_WRAP_S,     getProperty(texture.wrapS));
      _gl.texParameteri(_gl.TEXTURE_3D, _gl.TEXTURE_WRAP_T,     getProperty(texture.wrapT));
      _gl.texParameteri(_gl.TEXTURE_3D, _gl.TEXTURE_WRAP_R,     getProperty(texture.wrapR));
      _gl.texParameteri(_gl.TEXTURE_3D, _gl.TEXTURE_MAG_FILTER, getProperty(texture.magFilter));
      _gl.texParameteri(_gl.TEXTURE_3D, _gl.TEXTURE_MIN_FILTER, getProperty(texture.minFilter));

      _gl.texImage3D(
        _gl.TEXTURE_3D, 0, internalFormat,
        texture.width, texture.height, texture.depth, 0,
        format, type, texture.image,
      );

      texture.needsUpdate = texture.needsReupload = false;
      texture.onUpdate && texture.onUpdate();
    }
  }

  /*
   * Caller-driven re-upload of a dynamic texture, bypassing the
   * `dynamic` flag check that `draw` performs.
   */
  this.manualUpdateDynamic = function (texture) {
    if (undefined === texture._gl || texture.needsReupload) this.upload(texture);
    _gl.bindTexture(_gl.TEXTURE_2D, texture._gl);
    updateDynamic(texture);
  };

  /*
   * Chunked async upload. Allocates the GL texture immediately (via a
   * `distributeTextureData` pass that uploads `null` data), then
   * spreads four `texSubImage2D` calls across four Render.Worker
   * ticks so each frame only stalls on a quarter of the buffer.
   *
   * Returns (and caches) a Promise that resolves once all 4 chunks
   * are in.
   */
  this.uploadAsync = function (texture) {
    let { format, type } = getFloatParams(texture);
    if (texture._uploadAsyncPromise) return texture._uploadAsyncPromise;
    texture._uploadAsyncPromise = Promise.create();
    RenderCount.add('tex_uploadAsync', texture);

    // Allocate GL texture with null data the first time around.
    if (!texture._gl) {
      texture.distributeTextureData = true;
      self.upload(texture);
    }

    let pixelsPerChunk = texture.height       / 4;
    let dataPerChunk   = texture.data.length  / 4;
    let i = 0;

    let worker = new Render.Worker(function workerUploadAsync() {
      let pixelOffset = pixelsPerChunk * i;
      let dataOffset  = dataPerChunk   * i;
      let subarray    = texture.data.subarray(dataOffset, dataOffset + dataPerChunk);

      if (true === texture.flipY) {
        if (!_state.flipY) { _gl.pixelStorei(_gl.UNPACK_FLIP_Y_WEBGL, true);  _state.flipY = true;  }
      } else if (_state.flipY) {
        _gl.pixelStorei(_gl.UNPACK_FLIP_Y_WEBGL, false); _state.flipY = false;
      }

      _gl.bindTexture(_gl.TEXTURE_2D, texture._gl);
      _gl.texSubImage2D(
        _gl.TEXTURE_2D, 0,
        0, pixelOffset, texture.width, pixelsPerChunk,
        format, type, subarray,
      );
      _gl.bindTexture(_gl.TEXTURE_2D, null);

      if (4 == ++i) {
        worker.stop();
        texture._uploadAsyncPromise.resolve();
      }
    });

    return texture._uploadAsyncPromise;
  };

  /*
   * Tear-down. Deletes the GL handle, drops the JS-side data
   * reference (so a follow-up GC pass can reclaim it), and updates
   * RenderCount bookkeeping.
   */
  this.destroy = function (texture) {
    if (texture._gl) {
      _gl.deleteTexture(texture._gl);
      RenderCount.remove('texture');
      RenderCount.add('tex_destroy', texture);
    }
    if (texture.data) {
      texture.data = null;
      delete texture.data;
    }
    delete texture._gl;
  };
});

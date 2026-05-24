/*
 * FBORendererWebGL — the WebGL backend for `RenderTarget`.
 *
 * Responsibilities (driven by `RenderTarget.renderer = new FBORendererWebGL(gl)`
 * inside `Renderer`):
 *   - `upload(rt)`  — lazily create the FBO + color attachment(s) + optional
 *                      depth/stencil. Handles cube, 3D-texture, multi-target,
 *                      and multisample variants.
 *   - `bind(rt)`    — bind for drawing: set viewport/scissor, clear if
 *                      `autoClear` is on, point cube faces at the right side.
 *   - `unbind(rt)`  — back to default framebuffer.
 *   - `resize(rt)`  — re-allocate attachment storage at the new dims.
 *   - `destroy(rt)` — free everything.
 *
 * Format dispatch is centralised in the `GLTypes` module (`getFormat`,
 * `getType`, `getInternalFormat`, `getFloatParams`). Float textures need
 * separate WebGL2 internalformats / types — the `texture.type.includes('float')`
 * branch funnels through `getFloatParams`.
 */
Class(function FBORendererWebGL(_gl) {
  const WEBGL2 = Renderer.type == Renderer.WEBGL2;
  const _maxSamples = WEBGL2 && _gl.getParameter(_gl.MAX_SAMPLES);
  const { getFormat, getInternalFormat, getProperty, getType, getFloatParams } = require('GLTypes');

  /** Allocate a GL texture handle and apply the sampler state. */
  function prepareTexture(texture) {
    texture._gl = _gl.createTexture();
    _gl.bindTexture(_gl.TEXTURE_2D, texture._gl);
    _gl.texParameteri(_gl.TEXTURE_2D, _gl.TEXTURE_WRAP_S,     getProperty(texture.wrapS));
    _gl.texParameteri(_gl.TEXTURE_2D, _gl.TEXTURE_WRAP_T,     getProperty(texture.wrapT));
    _gl.texParameteri(_gl.TEXTURE_2D, _gl.TEXTURE_MAG_FILTER, getProperty(texture.magFilter));
    _gl.texParameteri(_gl.TEXTURE_2D, _gl.TEXTURE_MIN_FILTER, getProperty(texture.minFilter));
    texture.needsUpdate = false;
  }

  /** Allocate empty 2D storage for `texture` sized to `rt`. Float types route through `getFloatParams`. */
  function texImageDB(rt, texture) {
    if (texture.type.includes('float')) {
      const { internalformat, format, type } = getFloatParams(texture);
      _gl.texImage2D(_gl.TEXTURE_2D, 0, internalformat, rt.width, rt.height, 0, format, type, null);
    } else {
      _gl.texImage2D(_gl.TEXTURE_2D, 0, getFormat(texture), rt.width, rt.height,
        0, getFormat(texture), getType(texture), null);
    }
    _gl.bindTexture(_gl.TEXTURE_2D, null);
  }

  function getRenderBufferInternalFormat(texture) {
    return texture.type.includes('float')
      ? getFloatParams(texture).internalformat
      : getInternalFormat(texture);
  }

  /**
   * The big one: build the FBO + all attachments. Branches:
   *
   *   1. **Cube RT** — create a TEXTURE_CUBE_MAP, allocate 6 faces, attach
   *      a 16-bit depth renderbuffer. `bind()` later picks which face is
   *      bound to COLOR_ATTACHMENT0 (`rt.activeFace`).
   *   2. **3D texture RT** — multiple framebuffer-layer attachments
   *      (`framebufferTextureLayer`) into the same 3D texture.
   *   3. **Multi-target (MRT)** — N color textures, one COLOR_ATTACHMENT
   *      slot each, set via `drawBuffers`.
   *   4. **Multisample storage** — renderbufferStorageMultisample backing,
   *      no sampleable texture (resolves later via blit).
   *   5. **Plain RT** — one color texture + depth renderbuffer (or depth
   *      texture if `rt.depth`).
   */
  this.upload = function (rt) {
    if (rt._gl) return;

    // ── 1. Cube RT ──────────────────────────────────────────────────
    if (rt.cube) {
      (function uploadCube(rt) {
        rt._gl = _gl.createFramebuffer();
        _gl.bindFramebuffer(_gl.FRAMEBUFFER, rt._gl);
        const texture = rt.texture;
        texture._gl  = _gl.createTexture();
        texture.cube = true;
        texture.needsUpdate = false;
        _gl.bindTexture(_gl.TEXTURE_CUBE_MAP, texture._gl);
        for (let i = 0; i < 6; i++) {
          _gl.texImage2D(_gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, 0, getFormat(texture),
            rt.width, rt.height, 0, getFormat(texture), _gl.UNSIGNED_BYTE, null);
        }
        _gl.texParameteri(_gl.TEXTURE_CUBE_MAP, _gl.TEXTURE_WRAP_S,     getProperty(texture.wrapS));
        _gl.texParameteri(_gl.TEXTURE_CUBE_MAP, _gl.TEXTURE_WRAP_T,     getProperty(texture.wrapT));
        _gl.texParameteri(_gl.TEXTURE_CUBE_MAP, _gl.TEXTURE_MAG_FILTER, getProperty(texture.magFilter));
        _gl.texParameteri(_gl.TEXTURE_CUBE_MAP, _gl.TEXTURE_MIN_FILTER, getProperty(texture.minFilter));

        rt._depthBuffer = _gl.createRenderbuffer();
        _gl.bindRenderbuffer(_gl.RENDERBUFFER, rt._depthBuffer);
        _gl.renderbufferStorage(_gl.RENDERBUFFER, _gl.DEPTH_COMPONENT16, rt.width, rt.height);
        _gl.framebufferRenderbuffer(_gl.FRAMEBUFFER, _gl.DEPTH_ATTACHMENT, _gl.RENDERBUFFER, rt._depthBuffer);

        _gl.bindFramebuffer(_gl.FRAMEBUFFER, null);
        _gl.bindTexture(_gl.TEXTURE_2D, null);
        _gl.bindRenderbuffer(_gl.RENDERBUFFER, null);
      })(rt);
      return;
    }

    // ── 2. 3D texture RT ────────────────────────────────────────────
    if (rt.texture.isTexture3D) {
      (function upload3DTexture(rt) {
        rt.texture.upload();
        const colorAttachments = [];
        rt._gl = _gl.createFramebuffer();
        _gl.bindFramebuffer(_gl.FRAMEBUFFER, rt._gl);
        for (let i = 0; i < rt.indices.length; i++) {
          const key = 'COLOR_ATTACHMENT' + i;
          colorAttachments.push(_gl[key]);
          // Each attachment maps a different z-slice of the same 3D texture.
          _gl.framebufferTextureLayer(_gl.FRAMEBUFFER, _gl[key], rt.texture._gl, 0, rt.indices[i]);
        }
        _gl.drawBuffers(colorAttachments);
        _gl.bindFramebuffer(_gl.FRAMEBUFFER, null);
      })(rt);
      return;
    }

    // ── 3/4/5. Plain (MRT / multisample / single) FBO ───────────────
    rt._gl = _gl.createFramebuffer();

    // Pre-allocate depth renderbuffer if needed (skipped when sampleable
    // depth texture is requested via `rt.depth`, or `disableDepth`).
    if (!rt.depth && !rt.disableDepth) {
      rt._depthBuffer = _gl.createRenderbuffer();
      _gl.bindRenderbuffer(_gl.RENDERBUFFER, rt._depthBuffer);
      if (rt.internalMultisample) {
        const samples = Math.min(_maxSamples, rt._samplesAmount);
        _gl.renderbufferStorageMultisample(_gl.RENDERBUFFER, samples,
          rt.stencil ? _gl.DEPTH24_STENCIL8 : _gl.DEPTH_COMPONENT24,
          rt.width, rt.height);
      } else {
        _gl.renderbufferStorage(_gl.RENDERBUFFER,
          rt.stencil ? (WEBGL2 ? _gl.DEPTH24_STENCIL8 : _gl.DEPTH_STENCIL)
                     : (WEBGL2 ? _gl.DEPTH_COMPONENT24 : _gl.DEPTH_COMPONENT16),
          rt.width, rt.height);
      }
    }

    RenderCount.add(`fbo_${Math.round(rt.width)}x${Math.round(rt.height)}`, rt);
    _gl.bindFramebuffer(_gl.FRAMEBUFFER, rt._gl);

    if (rt.multi) {
      // ── Multi-target (MRT) ────────────────────────────────────────
      if (WEBGL2) {
        const colorAttachments = [];
        for (let i = 0; i < rt.attachments.length; i++) {
          const key = 'COLOR_ATTACHMENT' + i;
          const texture = rt.attachments[i];
          colorAttachments.push(_gl[key]);
          prepareTexture(texture);
          texImageDB(rt, texture);
          _gl.framebufferTexture2D(_gl.FRAMEBUFFER, _gl[key], _gl.TEXTURE_2D, texture._gl, 0);
          // For multisample MRT we need a per-attachment "blit" FBO so the
          // resolve step (`Renderer.blit`) can address each color buffer
          // individually (attachment 0 is resolved through the main FBO).
          if (rt.multisample && i > 0) {
            texture._blitFramebuffer = _gl.createFramebuffer();
            _gl.bindFramebuffer(_gl.FRAMEBUFFER, texture._blitFramebuffer);
            _gl.framebufferTexture2D(_gl.FRAMEBUFFER, _gl.COLOR_ATTACHMENT0, _gl.TEXTURE_2D, texture._gl, 0);
          }
        }
        _gl.drawBuffers(colorAttachments);
      } else {
        // WebGL1: use WEBGL_draw_buffers extension.
        const ext = Renderer.extensions.drawBuffers;
        const colorAttachments = [];
        for (let i = 0; i < rt.attachments.length; i++) {
          const key = 'COLOR_ATTACHMENT' + i + '_WEBGL';
          const texture = rt.attachments[i];
          colorAttachments.push(ext[key]);
          prepareTexture(texture);
          texImageDB(rt, texture);
          _gl.framebufferTexture2D(_gl.FRAMEBUFFER, ext[key], _gl.TEXTURE_2D, texture._gl, 0);
        }
        ext.drawBuffersWEBGL(colorAttachments);
      }
    } else if (rt.internalMultisample) {
      // ── Multisample-only storage ──────────────────────────────────
      // No sampleable texture — the FBO is just a render target whose
      // contents get resolved into the parent's color texture via blit.
      const samples = Math.min(_maxSamples, rt._samplesAmount);
      if (rt.parent.multi) {
        const colorAttachments = [];
        const attachments = rt.parent.attachments;
        for (let i = 0; i < attachments.length; i++) {
          const key     = 'COLOR_ATTACHMENT' + i;
          const texture = attachments[i];
          colorAttachments.push(_gl[key]);
          texture._colorBuffer = _gl.createRenderbuffer();
          _gl.bindRenderbuffer(_gl.RENDERBUFFER, texture._colorBuffer);
          _gl.renderbufferStorageMultisample(_gl.RENDERBUFFER, samples,
            getRenderBufferInternalFormat(texture), rt.width, rt.height);
          _gl.framebufferRenderbuffer(_gl.FRAMEBUFFER, _gl[key], _gl.RENDERBUFFER, texture._colorBuffer);
          _gl.bindRenderbuffer(_gl.RENDERBUFFER, null);
        }
        _gl.drawBuffers(colorAttachments);
      } else {
        rt._colorBuffer = _gl.createRenderbuffer();
        _gl.bindRenderbuffer(_gl.RENDERBUFFER, rt._colorBuffer);
        _gl.renderbufferStorageMultisample(_gl.RENDERBUFFER, samples,
          getRenderBufferInternalFormat(rt.texture), rt.width, rt.height);
        _gl.framebufferRenderbuffer(_gl.FRAMEBUFFER, _gl.COLOR_ATTACHMENT0, _gl.RENDERBUFFER, rt._colorBuffer);
      }
    } else {
      // ── Plain single-target ───────────────────────────────────────
      prepareTexture(rt.texture);
      if (rt.texture.type.includes('float')) {
        const { internalformat, format, type } = getFloatParams(rt.texture);
        _gl.texImage2D(_gl.TEXTURE_2D, 0, internalformat, rt.width, rt.height, 0, format, type, null);
      } else {
        _gl.texImage2D(_gl.TEXTURE_2D, 0, getFormat(rt.texture), rt.width, rt.height,
          0, getFormat(rt.texture), getType(rt.texture), null);
      }
      _gl.framebufferTexture2D(_gl.FRAMEBUFFER, _gl.COLOR_ATTACHMENT0, _gl.TEXTURE_2D, rt.texture._gl, 0);
    }

    // ── Depth attachment ────────────────────────────────────────────
    if (rt.depth) {
      // Sampleable depth texture.
      prepareTexture(rt.depth);
      const iformat = rt.stencil
        ? (WEBGL2 ? _gl.DEPTH24_STENCIL8 : _gl.DEPTH_STENCIL)
        : (WEBGL2 ? _gl.DEPTH_COMPONENT24 : _gl.DEPTH_COMPONENT);
      const type = rt.stencil
        ? (WEBGL2 ? _gl.UNSIGNED_INT_24_8 : Renderer.extensions.depthTextures.UNSIGNED_INT_24_8_WEBGL)
        : _gl.UNSIGNED_INT;
      _gl.texImage2D(_gl.TEXTURE_2D, 0, iformat, rt.width, rt.height, 0,
        rt.stencil ? _gl.DEPTH_STENCIL : _gl.DEPTH_COMPONENT, type, null);
      _gl.framebufferTexture2D(_gl.FRAMEBUFFER,
        rt.stencil ? _gl.DEPTH_STENCIL_ATTACHMENT : _gl.DEPTH_ATTACHMENT,
        _gl.TEXTURE_2D, rt.depth._gl, 0);
    } else if (!rt.disableDepth) {
      // Renderbuffer-only depth.
      // (the original had a no-op `rt.internalMultisample,` here — likely
      // a leftover comma-expr from a removed branch)
      _gl.framebufferRenderbuffer(_gl.FRAMEBUFFER,
        rt.stencil ? _gl.DEPTH_STENCIL_ATTACHMENT : _gl.DEPTH_ATTACHMENT,
        _gl.RENDERBUFFER, rt._depthBuffer);
    }

    _gl.bindFramebuffer(_gl.FRAMEBUFFER, null);
    _gl.bindTexture(_gl.TEXTURE_2D, null);
    _gl.bindRenderbuffer(_gl.RENDERBUFFER, null);
  };

  /**
   * Bind for drawing. Cube RTs re-point COLOR_ATTACHMENT0 at the current
   * `activeFace` so successive `render()` calls can iterate the 6 faces.
   * Honours `scissor` and `customViewport` overrides if set.
   */
  this.bind = function (rt) {
    if (!rt._gl) this.upload(rt);
    _gl.bindFramebuffer(_gl.FRAMEBUFFER, rt._gl);
    if (rt.cube) {
      _gl.framebufferTexture2D(_gl.FRAMEBUFFER, _gl.COLOR_ATTACHMENT0,
        _gl.TEXTURE_CUBE_MAP_POSITIVE_X + rt.activeFace, rt.texture._gl, 0);
    }
    if (rt.scissor) {
      _gl.enable(_gl.SCISSOR_TEST);
      _gl.scissor(rt.scissor.x, rt.scissor.y, rt.scissor.width, rt.scissor.height);
    }
    _gl.viewport(rt.viewport.x, rt.viewport.y, rt.width, rt.height);
    if (rt.customViewport) {
      _gl.viewport(rt.customViewport.x, rt.customViewport.y, rt.customViewport.z, rt.customViewport.w);
    }
    if (Renderer.instance.autoClear) {
      _gl.clearColor(Renderer.CLEAR[0], Renderer.CLEAR[1], Renderer.CLEAR[2], Renderer.CLEAR[3]);
      // Shared-renderbuffer mode: optionally skip depth clear (so a previous
      // pass's depth buffer can be reused across color targets).
      if (rt.sharedRenderbuffer) {
        if (rt.clearDepth) _gl.clear(_gl.COLOR_BUFFER_BIT | _gl.DEPTH_BUFFER_BIT);
        else               _gl.clear(_gl.COLOR_BUFFER_BIT);
      } else {
        _gl.clear(_gl.COLOR_BUFFER_BIT | _gl.DEPTH_BUFFER_BIT | _gl.STENCIL_BUFFER_BIT);
      }
    }
  };

  this.unbind = function (rt) {
    if (rt.scissor) _gl.disable(_gl.SCISSOR_TEST);
    _gl.bindFramebuffer(_gl.FRAMEBUFFER, null);
  };

  /**
   * Re-allocate storage at the new size. Mirrors `upload`'s branching but
   * only the `texImage2D` / `renderbufferStorage*` calls — the FBO and
   * attachment bindings themselves are kept.
   */
  this.resize = function (rt) {
    if (!(rt.texture._gl && rt._gl)) return;
    _gl.bindFramebuffer(_gl.FRAMEBUFFER, rt._gl);

    if (rt.multi) {
      // MRT: resize each color texture.
      for (let i = 0; i < rt.attachments.length; i++) {
        const texture = rt.attachments[i];
        _gl.bindTexture(_gl.TEXTURE_2D, texture._gl);
        if (texture.type.includes('float')) {
          const { internalformat, format, type } = getFloatParams(texture);
          _gl.texImage2D(_gl.TEXTURE_2D, 0, internalformat, rt.width, rt.height, 0, format, type, null);
        } else {
          _gl.texImage2D(_gl.TEXTURE_2D, 0, getFormat(texture), rt.width, rt.height,
            0, getFormat(texture), getType(texture), null);
        }
      }
    } else if (rt.internalMultisample) {
      const samples = Math.min(_maxSamples, rt._samplesAmount);
      if (rt.parent.multi) {
        const attachments = rt.parent.attachments;
        for (let i = 0; i < attachments.length; i++) {
          const texture = attachments[i];
          _gl.bindRenderbuffer(_gl.RENDERBUFFER, texture._colorBuffer);
          _gl.renderbufferStorageMultisample(_gl.RENDERBUFFER, samples,
            getRenderBufferInternalFormat(texture), rt.width, rt.height);
          _gl.bindRenderbuffer(_gl.RENDERBUFFER, null);
        }
      } else {
        _gl.bindRenderbuffer(_gl.RENDERBUFFER, rt._colorBuffer);
        _gl.renderbufferStorageMultisample(_gl.RENDERBUFFER, samples,
          getRenderBufferInternalFormat(rt.texture), rt.width, rt.height);
        _gl.framebufferRenderbuffer(_gl.FRAMEBUFFER, _gl.COLOR_ATTACHMENT0, _gl.RENDERBUFFER, rt._colorBuffer);
      }
    } else {
      _gl.bindTexture(_gl.TEXTURE_2D, rt.texture._gl);
      if (rt.texture.type.includes('float')) {
        const { internalformat, format, type } = getFloatParams(rt.texture);
        _gl.texImage2D(_gl.TEXTURE_2D, 0, internalformat, rt.width, rt.height, 0, format, type, null);
      } else {
        _gl.texImage2D(_gl.TEXTURE_2D, 0, getFormat(rt.texture), rt.width, rt.height,
          0, getFormat(rt.texture), getType(rt.texture), null);
      }
    }

    if (rt.depth) {
      _gl.bindTexture(_gl.TEXTURE_2D, rt.depth._gl);
      const iformat = rt.stencil
        ? (WEBGL2 ? _gl.DEPTH24_STENCIL8 : _gl.DEPTH_STENCIL)
        : (WEBGL2 ? _gl.DEPTH_COMPONENT24 : _gl.DEPTH_COMPONENT);
      const type = rt.stencil
        ? (WEBGL2 ? _gl.UNSIGNED_INT_24_8 : Renderer.extensions.depthTextures.UNSIGNED_INT_24_8_WEBGL)
        : _gl.UNSIGNED_INT;
      _gl.texImage2D(_gl.TEXTURE_2D, 0, iformat, rt.width, rt.height, 0,
        rt.stencil ? _gl.DEPTH_STENCIL : _gl.DEPTH_COMPONENT, type, null);
      _gl.framebufferTexture2D(_gl.FRAMEBUFFER,
        rt.stencil ? _gl.DEPTH_STENCIL_ATTACHMENT : _gl.DEPTH_ATTACHMENT,
        _gl.TEXTURE_2D, rt.depth._gl, 0);
    } else if (!rt.disableDepth) {
      _gl.bindRenderbuffer(_gl.RENDERBUFFER, rt._depthBuffer);
      if (rt.internalMultisample) {
        const samples = Math.min(_maxSamples, rt._samplesAmount);
        _gl.renderbufferStorageMultisample(_gl.RENDERBUFFER, samples,
          rt.stencil ? _gl.DEPTH24_STENCIL8 : _gl.DEPTH_COMPONENT24,
          rt.width, rt.height);
      } else {
        _gl.renderbufferStorage(_gl.RENDERBUFFER,
          rt.stencil
            ? (WEBGL2 ? _gl.DEPTH24_STENCIL8 : _gl.DEPTH_STENCIL)
            : (WEBGL2 ? _gl.DEPTH_COMPONENT24 : _gl.DEPTH_COMPONENT16),
          rt.width, rt.height);
      }
    }

    _gl.bindTexture(_gl.TEXTURE_2D, null);
    _gl.bindFramebuffer(_gl.FRAMEBUFFER, null);
    _gl.bindRenderbuffer(_gl.RENDERBUFFER, null);
  };

  /** Free FBO + depth renderbuffer + color texture (+ MRT attachments). */
  this.destroy = function (rt) {
    _gl.deleteFramebuffer(rt._gl);
    if (rt._depthBuffer) _gl.deleteRenderbuffer(rt._depthBuffer);
    Texture.renderer.destroy(rt.texture);
    RenderCount.remove(`fbo_${Math.round(rt.width)}x${Math.round(rt.height)}`);
    if (rt.multi) {
      rt.attachments.forEach((t) => {
        if (t._colorBuffer)      _gl.deleteRenderbuffer(t._colorBuffer);
        if (t._blitFramebuffer)  _gl.deleteFramebuffer(t._blitFramebuffer);
        Texture.renderer.destroy(t);
      });
    }
    rt._gl = null;
  };
});

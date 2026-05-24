/*
 * Texture sentinel constants + GLSLOptimizer + GLTypes module.
 *
 * 1) Texture constants
 *    String tokens used as backend-agnostic stand-ins for the
 *    corresponding WebGL enums. The backend (GLTypes.getProperty /
 *    getFormat / getType) maps each token to the real `gl.*` enum at
 *    upload time. Using strings keeps `Texture` instances usable on
 *    workers / SSR where there's no live GL context.
 *
 * 2) GLSLOptimizer Module
 *    Trivial GLSL pre-processor that expands `#pragma unroll_loop`
 *    directives. The matching loop body has any `[i]` index references
 *    rewritten to the literal integer for each unrolled iteration —
 *    saves a per-iteration branch on hot fragment paths (e.g. light
 *    accumulation, blur taps).
 *
 *      #pragma unroll_loop
 *      for (int i = 0; i < 4; i++) {
 *          sum += sample(uv + offsets[i]);
 *      }
 *
 *    becomes four straight-line copies with `[0]`, `[1]`, `[2]`, `[3]`.
 *
 * 3) GLTypes Module
 *    Centralised dispatch from Texture sentinel constants to live WebGL
 *    enums. Used by every renderer (FBO, Texture, Shader) so the format
 *    mapping lives in one place.
 *      - getFormat        — RGBA/RGB/RG/R → integer or normalized variant.
 *      - getInternalFormat — sized internalformat for WebGL2 (RGBA32F,
 *                            RGB8, R16F, …); falls back to RGBA/RGB on WebGL1.
 *      - getType          — FLOAT, HALF_FLOAT (with OES_texture_half_float
 *                            fallback on WebGL1), INT, UNSIGNED_INT, …
 *      - getProperty      — sampler state: filters and wrap modes.
 *      - getFloatParams   — bundle of (internalformat, format, type) for
 *                            data-texture uploads.
 *      - getGLTypeForTypedArray — dispatch on JS TypedArray ctor.
 */

// Texture sentinel constants (backend-agnostic; resolved to gl.* enums by GLTypes).
Texture.NEAREST                = 'texture_nearest';
Texture.CLAMP_TO_EDGE          = 'texture_clamp';
Texture.REPEAT                 = 'texture_repeat';
Texture.MIRROR_REPEAT          = 'texture_mirror_repeat';
Texture.LINEAR                 = 'texture_linear';
Texture.LINEAR_MIPMAP          = 'texture_linear_mip';
Texture.LINEAR_MIPMAP_NEAREST  = 'texture_linear_mip_nearest';
Texture.NEAREST_MIPMAP         = 'texture_nearest_mip';
Texture.RFormat                = 'texture_rFormat';
Texture.RGFormat               = 'texture_rgFormat';
Texture.RGBFormat              = 'texture_rgbFormat';
Texture.RGBAFormat             = 'texture_rgbaFormat';
Texture.UNSIGNED_BYTE          = 'texture_unsigned_byte';
Texture.DEPTH                  = 'texture_depth';
Texture.FLOAT                  = 'texture_float';
Texture.HALF_FLOAT             = 'texture_half_float';
Texture.UNSIGNED_INTEGER       = 'texture_unsigned_integer';
Texture.INTEGER                = 'texture_integer';

Module(function GLSLOptimizer() {
  /*
   * Unroll `#pragma unroll_loop` for-loops into straight-line code.
   * Each `[i]` inside the loop body is rewritten to `[N]` for each
   * iteration. The match is greedy up to the closing `}` of the loop —
   * nested braces inside the body will break the match.
   */
  this.exports = function (code) {
    return (function unrollLoops(string) {
      return string.replace(
        /#pragma unroll_loop[\s]+?for \(int i \= (\d+)\; i < (\d+)\; i\+\+\) \{([\s\S]+?)(?=\})\}/g,
        function (match, start, end, snippet) {
          let unroll = '';
          for (let i = parseInt(start); i < parseInt(end); i++) {
            unroll += snippet.replace(/\[i\]/g, '[' + i + ']');
          }
          return unroll;
        },
      );
    })(code);
  };
});

Module(function GLTypes() {
  /*
   * Texture.RGBAFormat → gl.RGBA (or gl.RGBA_INTEGER for INTEGER types).
   * For READING back as integer attachment from MRT.
   */
  function getFormat(texture) {
    const _gl = Renderer.context;
    const integer = texture.type === Texture.UNSIGNED_INTEGER || texture.type === Texture.INTEGER;
    switch (texture.format) {
      case Texture.RGBAFormat: return integer ? _gl.RGBA_INTEGER : _gl.RGBA;
      case Texture.RGBFormat:  return integer ? _gl.RGB_INTEGER  : _gl.RGB;
      case Texture.RGFormat:   return integer ? _gl.RG_INTEGER   : _gl.RG;
      case Texture.RFormat:    return integer ? _gl.RED_INTEGER  : _gl.RED;
    }
  }

  /*
   * Sized internalformat for WebGL2 (e.g. RGBA32F). Required for
   * float/half-float/integer textures. WebGL1 has no sized
   * internalformat — collapse everything to RGBA / RGB.
   */
  function getInternalFormat(texture) {
    const _gl = Renderer.context;
    if (Renderer.type !== Renderer.WEBGL2) {
      return texture.format === Texture.RGBAFormat ? _gl.RGBA : _gl.RGB;
    }
    switch (texture.format) {
      case Texture.RGBAFormat:
        switch (texture.type) {
          case Texture.FLOAT:            return _gl.RGBA32F;
          case Texture.HALF_FLOAT:       return _gl.RGBA16F;
          case Texture.UNSIGNED_INTEGER: return _gl.RGBA32UI;
          case Texture.INTEGER:          return _gl.RGBA32I;
          case Texture.UNSIGNED_BYTE:    return _gl.RGBA8;
        }
        break;
      case Texture.RGBFormat:
        switch (texture.type) {
          case Texture.FLOAT:            return _gl.RGB32F;
          case Texture.HALF_FLOAT:       return _gl.RGB16F;
          case Texture.UNSIGNED_INTEGER: return _gl.RGB32UI;
          case Texture.INTEGER:          return _gl.RGB32I;
          case Texture.UNSIGNED_BYTE:    return _gl.RGB8;
        }
        break;
      case Texture.RGFormat:
        switch (texture.type) {
          case Texture.FLOAT:            return _gl.RG32F;
          case Texture.HALF_FLOAT:       return _gl.RG16F;
          case Texture.UNSIGNED_INTEGER: return _gl.RG32UI;
          case Texture.INTEGER:          return _gl.RG32I;
          case Texture.UNSIGNED_BYTE:    return _gl.RG8;
        }
        break;
      case Texture.RFormat:
        switch (texture.type) {
          case Texture.FLOAT:            return _gl.R32F;
          case Texture.HALF_FLOAT:       return _gl.R16F;
          case Texture.UNSIGNED_INTEGER: return _gl.R32UI;
          case Texture.INTEGER:          return _gl.R32I;
          case Texture.UNSIGNED_BYTE:    return _gl.R8;
        }
    }
  }

  /*
   * Maps the texture's element type to the GL pixel-data type. HALF_FLOAT
   * has two enums — native (WebGL2) vs OES extension (WebGL1).
   */
  function getType(texture) {
    const _gl = Renderer.context;
    switch (texture.type) {
      case Texture.FLOAT:            return _gl.FLOAT;
      case Texture.HALF_FLOAT:
        return Renderer.type === Renderer.WEBGL2
          ? _gl.HALF_FLOAT
          : Renderer.extensions.halfFloat.HALF_FLOAT_OES;
      case Texture.UNSIGNED_INTEGER: return _gl.UNSIGNED_INT;
      case Texture.INTEGER:          return _gl.INT;
      default:                       return _gl.UNSIGNED_BYTE;
    }
  }

  this.exports = {
    getFormat,
    getInternalFormat,
    getType,

    /*
     * Sampler-state token → gl enum (filters, wrap modes).
     */
    getProperty(property) {
      const _gl = Renderer.context;
      switch (property) {
        case Texture.NEAREST:               return _gl.NEAREST;
        case Texture.LINEAR:                return _gl.LINEAR;
        case Texture.LINEAR_MIPMAP:         return _gl.LINEAR_MIPMAP_LINEAR;
        case Texture.NEAREST_MIPMAP:        return _gl.NEAREST_MIPMAP_LINEAR;
        case Texture.LINEAR_MIPMAP_NEAREST: return _gl.LINEAR_MIPMAP_NEAREST;
        case Texture.CLAMP_TO_EDGE:         return _gl.CLAMP_TO_EDGE;
        case Texture.REPEAT:                return _gl.REPEAT;
        case Texture.MIRROR_REPEAT:         return _gl.MIRRORED_REPEAT;
      }
    },

    /*
     * Bundle used by float-data uploads: the renderer needs all three
     * GL params (internalformat, format, type) to call `texImage2D`
     * with raw data.
     */
    getFloatParams(texture) {
      return {
        internalformat: getInternalFormat(texture),
        format:         getFormat(texture),
        type:           getType(texture),
      };
    },

    /*
     * Map a JS TypedArray constructor to the corresponding GL data type
     * (used when uploading index buffers / generic attribute arrays).
     * Default is FLOAT for unrecognised array types.
     */
    getGLTypeForTypedArray(typedArray) {
      const _gl = Renderer.context;
      if (typedArray instanceof Float32Array)      return _gl.FLOAT;
      if (typedArray instanceof Int32Array)        return _gl.INT;
      if (typedArray instanceof Uint32Array)       return _gl.UNSIGNED_INT;
      if (typedArray instanceof Int16Array)        return _gl.SHORT;
      if (typedArray instanceof Uint16Array)       return _gl.UNSIGNED_SHORT;
      if (typedArray instanceof Int8Array)         return _gl.BYTE;
      if (typedArray instanceof Uint8Array || typedArray instanceof Uint8ClampedArray) {
        return _gl.UNSIGNED_BYTE;
      }
      return _gl.FLOAT;
    },
  };
});

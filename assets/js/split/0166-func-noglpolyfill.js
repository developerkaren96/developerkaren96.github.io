/*
 * NoGLPolyfill — drop-in stub for a WebGL context that does nothing.
 *
 * Used when no GL context is available (SSR pre-render, headless test
 * harness, worker thread, GL context loss). Every method the engine
 * might call on `Renderer.context` is assigned to a no-op so the
 * renderer can run its uniform / draw bookkeeping without throwing —
 * the eventual rasterisation just produces no pixels.
 *
 * Special cases:
 *   - `getShaderParameter` / `getProgramParameter` return `true` so
 *     compile / link checks pass and the pipeline continues setup
 *     (otherwise the renderer would bail out reporting a "compile
 *     failed" error against the absent driver).
 *
 * Coverage: all WebGL1 calls + the WebGL2 additions the engine touches
 * (drawElementsInstanced, vertexAttribDivisor, uniformBlockBinding,
 * VAO + drawBuffers, blitFramebuffer, texImage2D).
 *
 * This is the legacy chained-assignment form (single `(_) => {}` arrow
 * fan-out) — preserves the same surface as the live GL context with
 * minimum bytes.
 */
function NoGLPolyfill() {
  const noop = () => {};
  this.createQuery =
    this.activeTexture =
    this.attachShader =
    this.bindAttribLocation =
    this.bindBuffer =
    this.bindFramebuffer =
    this.bindRenderbuffer =
    this.bindTexture =
    this.blendColor =
    this.blendEquation =
    this.blendEquationSeparate =
    this.blendFunc =
    this.blendFuncSeparate =
    this.bufferData =
    this.bufferSubData =
    this.checkFramebufferStatus =
    this.clear =
    this.clearColor =
    this.clearDepthf =
    this.clearStencil =
    this.colorMask =
    this.compileShader =
    this.compressedTexImage2D =
    this.compressedTexSubImage2D =
    this.copyTexImage2D =
    this.copyTexSubImage2D =
    this.createProgram =
    this.createShader =
    this.cullFace =
    this.deleteBuffers =
    this.deleteFramebuffers =
    this.deleteProgram =
    this.deleteRenderbuffers =
    this.deleteShader =
    this.deleteTextures =
    this.depthFunc =
    this.depthMask =
    this.depthRangef =
    this.detachShader =
    this.disable =
    this.disableVertexAttribArray =
    this.drawArrays =
    this.drawElements =
    this.enable =
    this.enableVertexAttribArray =
    this.finish =
    this.flush =
    this.framebufferRenderbuffer =
    this.framebufferTexture2D =
    this.frontFace =
    this.generateMipmap =
    this.getActiveAttrib =
    this.getActiveUniform =
    this.getAttachedShaders =
    this.getAttribLocation =
    this.getBooleanv =
    this.getBufferParameteriv =
    this.getError =
    this.getFloatv =
    this.getFramebufferAttachmentParameteriv =
    this.getIntegerv =
    this.getProgramiv =
    this.getProgramInfoLog =
    this.getRenderbufferParameteriv =
    this.getShaderiv =
    this.getShaderInfoLog =
    this.getShaderPrecisionFormat =
    this.getShaderSource =
    this.getString =
    this.getTexParameterfv =
    this.getTexParameteriv =
    this.getUniformfv =
    this.getUniformiv =
    this.getUniformLocation =
    this.getVertexAttribfv =
    this.getVertexAttribiv =
    this.getVertexAttribPointerv =
    this.isBuffer =
    this.isEnabled =
    this.isFramebuffer =
    this.isProgram =
    this.isRenderbuffer =
    this.isShader =
    this.isTexture =
    this.lineWidth =
    this.linkProgram =
    this.pixelStorei =
    this.polygonOffset =
    this.readPixels =
    this.releaseShaderCompiler =
    this.renderbufferStorage =
    this.sampleCoverage =
    this.scissor =
    this.shaderBinary =
    this.shaderSource =
    this.stencilFunc =
    this.stencilFuncSeparate =
    this.stencilMask =
    this.stencilMaskSeparate =
    this.stencilOp =
    this.stencilOpSeparate =
    this.texParameterf =
    this.texParameterfv =
    this.texParameteri =
    this.texParameteriv =
    this.texSubImage2D =
    this.uniform1f =
    this.uniform1fv =
    this.uniform1i =
    this.uniform1iv =
    this.uniform2f =
    this.uniform2fv =
    this.uniform2i =
    this.uniform2iv =
    this.uniform3f =
    this.uniform3fv =
    this.uniform3i =
    this.uniform3iv =
    this.uniform4f =
    this.uniform4fv =
    this.uniform4i =
    this.uniform4iv =
    this.uniformMatrix2fv =
    this.uniformMatrix3fv =
    this.uniformMatrix4fv =
    this.useProgram =
    this.validateProgram =
    this.vertexAttrib1f =
    this.vertexAttrib1fv =
    this.vertexAttrib2f =
    this.vertexAttrib2fv =
    this.vertexAttrib3f =
    this.vertexAttrib3fv =
    this.vertexAttrib4f =
    this.vertexAttrib4fv =
    this.vertexAttribPointer =
    this.viewport =
    this.getParameter =
    this.getExtension =
    // WebGL2 additions.
    this.drawElementsInstanced =
    this.drawArraysInstanced =
    this.vertexAttribDivisor =
    this.getUniformBlockIndex =
    this.uniformBlockBinding =
    this.bindBufferBase =
    this.createVertexArray =
    this.bindVertexArray =
    this.deleteVertexArray =
    this.drawBuffers =
    this.blitFramebuffer =
    this.texImage2D =
    // Misc.
    this.getContextAttributes =
    this.isContextLost =
    this.clearDepth =
    this.depthRange =
    this.createTexture =
    this.createBuffer =
    this.createFramebuffer =
    this.createRenderbuffer =
    this.deleteTexture =
    this.deleteBuffer =
    this.deleteFramebuffer =
    this.getBufferParameter =
    this.getRenderbufferParameter =
    this.getProgramParameter =
    this.getVertexAttribOffset =
    this.getFramebufferAttachmentParemeter =
    this.getUniform =
    this.getTexParameter =
    this.getShaderParameter =
    this.getSupportedExtensions =
      noop;

  // Compile / link queries return `true` so the renderer's pipeline
  // setup doesn't bail out on the "failed shader" path.
  this.getShaderParameter = this.getProgramParameter = function () {
    return true;
  };
}

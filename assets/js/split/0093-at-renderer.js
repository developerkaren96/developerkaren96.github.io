/*
 * Renderer — the WebGL frontend. Owns the canvas + GL context, runs the
 * per-frame scene traversal, sorts draw lists, drives shadow passes, and
 * exposes the usual surface controls (resize, clear, readPixels, blit, …).
 *
 * Per-frame flow (see `render`):
 *   1. If `displayNeedsUpdate`, clear the scene's two draw lists (opaque/
 *      transparent) and re-populate them via `projectObject`.
 *   2. Sort opaque list (renderOrder → shader-program id → object id) and
 *      transparent list (renderOrder → z → id), or use a front-to-back
 *      strategy when the scene requests it.
 *   3. If shadows are on AND not paused AND scene has at least one
 *      shadow light, render each light's depth pass into its shadow RT.
 *   4. Render to RT (XR has its own path) or directly to canvas: walk both
 *      lists, run frustum culling, optional occlusion-query early-out,
 *      attach matrices+UBO uniforms, draw. Double-sided-transparent shaders
 *      get a back-then-front pair of draws to preserve depth order.
 *   5. Generate mipmaps / resolve multisample-RT if needed; reset shader
 *      state machine so the next pass starts from a known clean state.
 *
 * UBO mode (WebGL2): camera-shared per-frame uniforms (projection, view,
 * cameraPosition, cameraQuaternion, resolution, time, timeScale) are packed
 * into a single block ("global"). On WebGL1 the same uniforms are appended
 * per-shader individually — slower, but correct.
 *
 * Occlusion-query path: meshes flagged with `_occlusionMesh` get a bbox-
 * shaped helper drawn first. After GPU read-back, `_gl.occluded === true`
 * causes the real geometry draw to be skipped. The `_occlusionGroup` hook
 * lets groups react to per-mesh occlusion results.
 */
Class(function Renderer(_params = {}) {
  Inherit(this, Component);
  const self = this;

  let _canvas, _gl, _width, _height, _anisotropy, _clearColor;
  let _projScreenMatrix, _frustum, _ubo;
  let _dpr = 1;
  const _resolution = new Vector2();
  const _m0 = new Matrix4();   // scratch: light projection * (view * model)
  const _m1 = new Matrix4();   // scratch: light view * model
  const _time = { value: 0 };  // shared uniform: seconds since renderer init
  let _stencilActive = false;

  /**
   * Lazily build a camera's UBO. The order here MUST match the GLSL "global"
   * block declared in shaders (projectionMatrix, viewMatrix, cameraPosition,
   * cameraQuaternion, resolution, time, timeScale).
   */
  function initCameraUBO(camera) {
    camera._ubo = new UBO(0, _gl);
    camera._ubo.push({ value: camera.projectionMatrix });
    camera._ubo.push({ value: camera.matrixWorldInverse });
    camera._ubo.push({ value: camera.worldPos });
    camera._ubo.push({ value: camera.worldQuat });
    camera._ubo.push({ value: _resolution });
    camera._ubo.push(_time);
    camera._ubo.push(Render.timeScaleUniform);
    camera._ubo.upload();
  }

  /**
   * Sort `array` so closer objects come first.
   *   - FRONT_TO_BACK_BOUNDING: use the geometry's bounding-sphere center
   *     (cheaper for skinned/animated geometry where the world matrix is
   *     unrepresentative).
   *   - FRONT_TO_BACK: use the object's model-view position (post-camera).
   * Each object caches its own `__sortVec` to avoid allocs.
   */
  function sortFrontToBack(array, sortOrder, camera) {
    for (let i = array.length - 1; i > -1; i--) {
      const obj = array[i];
      if (!obj.__sortVec) obj.__sortVec = new Vector3();
      if (sortOrder == Scene.FRONT_TO_BACK_BOUNDING && obj.geometry && obj.geometry.boundingSphere) {
        obj.__sortVec.copy(obj.geometry.boundingSphere.center);
      } else {
        obj.__sortVec.setFromMatrixPosition(camera.modelViewMatrix);
      }
    }
    array.sort((a, b) => b.__sortVec.z - a.__sortVec.z);
  }

  /**
   * Walk the scene graph and (re)populate `scene.toRender[0/1]` (opaque /
   * transparent). Also computes per-object modelViewMatrix + normalMatrix
   * and primes the occlusion-mesh helper when applicable.
   *
   * The `displayNeedsUpdate` flag turns the traversal from a "compute
   * matrices for visible objects" pass into a "rebuild the draw lists from
   * scratch" pass.
   */
  function projectObject(object, camera, scene) {
    // Occlusion meshes always live in the opaque queue when rebuilding.
    if (object.isOcclusionMesh && scene.displayNeedsUpdate) scene.toRender[0].push(object);
    if (object.doNotProject) return;

    let isVisible = false;
    if (undefined !== object.shader) {
      const visible = object.determineVisible()
        && object.shader.visible
        && !object.shader.neverRender
        && !object.hidden;

      if (visible) {
        object.modelViewMatrix.multiplyMatrices(camera.matrixWorldInverse, object.matrixWorld);
        object.normalMatrix.getNormalMatrix(object.modelViewMatrix);

        // Mirror the matrices onto the occlusion proxy so its draw uses the
        // same transform as the real mesh.
        if (object._occlusionMesh !== null && object.isMesh && this.useOcclusionQuery) {
          object.updateOcclusionMesh();
          object._occlusionMesh.matrixWorld.copy(object.matrixWorld);
          object._occlusionMesh.normalMatrix.copy(object.normalMatrix);
          object._occlusionMesh.modelViewMatrix.copy(object.modelViewMatrix);
        }
      }
      isVisible = visible;

      // World position is needed for transparent z-sort and any time the
      // draw lists are being rebuilt.
      if (scene.displayNeedsUpdate
          || (object.shader.transparent && !scene.disableAutoSort && visible)) {
        object.getWorldPosition(object.worldPos);
      }
      if (scene.displayNeedsUpdate) {
        scene.toRender[object.shader.transparent ? 1 : 0].push(object);
      }
    } else {
      isVisible = object.visible && !object.hidden;
    }

    // Descend if this node contributes OR if we're rebuilding lists (so
    // hidden subtrees still get picked up when they become visible later).
    if (isVisible || scene.displayNeedsUpdate) {
      for (let i = object.childrenLength - 1; i > -1; i--) {
        projectObject(object.children[i], camera, scene);
      }
    }
  }

  /**
   * Attach per-object matrices, camera/global uniforms (or bind the UBO),
   * and — when this object receives shadows — pack shadow matrices for all
   * shadow lights into a single Float32Array and feed it via `shadowMatrix`.
   */
  function attachSceneUniforms(object, scene, camera) {
    Shader.renderer.appendUniform(object.shader, 'normalMatrix', object.normalMatrix);
    Shader.renderer.appendUniform(object.shader, 'modelMatrix', object.matrixWorld);
    Shader.renderer.appendUniform(object.shader, 'modelViewMatrix', object.modelViewMatrix);

    if (_ubo) {
      camera._ubo.bind(object.shader._gl.program, 'global');
    } else {
      // WebGL1 fallback: push everything individually.
      Shader.renderer.appendUniform(object.shader, 'projectionMatrix', camera.projectionMatrix);
      Shader.renderer.appendUniform(object.shader, 'viewMatrix',       camera.matrixWorldInverse);
      Shader.renderer.appendUniform(object.shader, 'cameraPosition',   camera.worldPos);
      Shader.renderer.appendUniform(object.shader, 'cameraQuaternion', camera.worldQuat);
      Shader.renderer.appendUniform(object.shader, 'resolution',       _resolution);
      Shader.renderer.appendUniform(object.shader, 'time',             _time.value);
      Shader.renderer.appendUniform(object.shader, 'timeScale',        Render.timeScaleUniform.value);
    }

    if (self.shadows && object.shader.receiveShadow && !self.overridePreventShadows) {
      const lights = Lighting.getShadowLights();
      if (!object._gl) object._gl = {};
      if (!object._gl.shadowData) {
        object._gl.shadowData = { combined: new Float32Array(16 * lights.length) };
      }
      // Pre-multiply (light.proj * light.view * model) for each shadow
      // light, write all matrices into one packed array.
      for (let i = 0; i < lights.length; i++) {
        const light = lights[i];
        _m1.multiplyMatrices(light.shadow.camera.matrixWorldInverse, object.matrixWorld);
        _m0.multiplyMatrices(light.shadow.camera.projectionMatrix, _m1);
        _m0.toArray(object._gl.shadowData.combined, 16 * i);
      }
      if (scene._shadowData && scene._shadowData.count) {
        object.shader.uniforms.shadowMap.value
          = scene._shadowData[self.overridePreventShadows ? 'emptyMaps' : 'maps'];
        Shader.renderer.appendUniform(object.shader, 'shadowMatrix',   object._gl.shadowData.combined, 'matrix');
        Shader.renderer.appendUniform(object.shader, 'shadowLightPos', scene._shadowData.pos,          'vec3');
        Shader.renderer.appendUniform(object.shader, 'shadowSize',     scene._shadowData.size,         'float');
      }
    }
  }

  /**
   * Uniform attach used by the shadow depth-pass — bound to `object.shader.shadow`
   * (the simplified depth shader), not the main material.
   */
  function attachShadowUniforms(object, scene, light) {
    if (!light._mvm) light._mvm = new Matrix4();
    if (!light._nm)  light._nm  = new Matrix3();
    light._mvm.multiplyMatrices(light.shadow.camera.matrixWorldInverse, object.matrixWorld);
    light._nm.getNormalMatrix(object.modelViewMatrix);

    Shader.renderer.appendUniform(object.shader.shadow, 'normalMatrix',    light._nm);
    Shader.renderer.appendUniform(object.shader.shadow, 'modelMatrix',     object.matrixWorld);
    Shader.renderer.appendUniform(object.shader.shadow, 'modelViewMatrix', light._mvm);

    if (_ubo) {
      light.shadow.camera._ubo.bind(object.shader._gl.program, 'global');
    } else {
      Shader.renderer.appendUniform(object.shader.shadow, 'projectionMatrix', light.shadow.camera.projectionMatrix);
      Shader.renderer.appendUniform(object.shader.shadow, 'viewMatrix',       light.shadow.camera.matrixWorldInverse);
    }
  }

  /** Tick — accumulate shader `time` uniform in seconds (dt is in ms). */
  function loop(t, dt) {
    _time.value += 0.001 * dt;
  }

  /**
   * The actual draw pass. Either targets `rt` (and its multisample buddy if
   * present) or the canvas. Walks both draw lists, runs frustum + occlusion
   * culling, performs the draw, and handles double-sided-transparency as a
   * back-then-front pair.
   */
  function render(scene, camera, rt) {
    if (rt && rt.width) {
      _resolution.set(rt.width, rt.height);
      if (rt.multisample) RenderTarget.renderer.bind(rt._rtMultisample);
      else                RenderTarget.renderer.bind(rt);
    } else {
      if (!Renderer.overrideViewport) {
        _gl.viewport(0, 0, _width * _dpr, _height * _dpr);
        _resolution.set(_canvas.width, _canvas.height);
      }
      if (self.autoClear) {
        _gl.clearColor(Renderer.CLEAR[0], Renderer.CLEAR[1], Renderer.CLEAR[2], Renderer.CLEAR[3]);
        _gl.clear(_gl.COLOR_BUFFER_BIT | _gl.DEPTH_BUFFER_BIT);
      }
    }

    camera.getWorldPosition(camera.worldPos);
    camera.getWorldQuaternion(camera.worldQuat);
    _frustum.setFromCamera(camera);

    if (_ubo) {
      if (camera._ubo) camera._ubo.update();
      else             initCameraUBO(camera);
    }

    // Two passes: opaque (l=0), then transparent (l=1).
    for (let l = 0; l < 2; l++) {
      const len = scene.toRender[l].length;
      for (let i = 0; i < len; i++) {
        const object = scene.toRender[l][i];
        if (object.onBeforeRender) object.onBeforeRender();
        object._drawing = false;

        const passesShader = object.determineVisible()
          && object.shader.visible
          && !object.shader.neverRender
          && !object.neverRender;

        if (!passesShader) continue;

        // Drive occlusion-group bookkeeping and the bbox-mesh draw before
        // the real draw (the GL query straddles these calls).
        if (self.useOcclusionQuery && object._occlusionGroup) {
          object._occlusionGroup.updateOcclusionBoundingBox();
          object._occlusionGroup.updateOcclusionVisibility(object?._gl?.occluded);
        }
        if (self.useOcclusionQuery
            && object.isOcclusionMesh
            && self.type == Renderer.WEBGL2
            && object._queryMesh.occlusionCulled) {
          object.shader.draw(object, object.geometry);
          attachSceneUniforms(object, scene, camera);
          object.geometry.draw(object, object.shader, true);
        }

        // Frustum culling — `frustumCulled === false` opts out entirely.
        const inFrustum = false === object.frustumCulled || true === _frustum.intersectsObject(object);
        if (!inFrustum) continue;

        object._drawing = true;

        // Skip-cases AFTER marking _drawing so other systems know we
        // intended to draw but bailed at the GL level.
        if (object.shader.nullRender || object?._gl?.occluded || object.isOcclusionMesh) continue;

        const doubleSideTransparency = object.shader.side === Shader.DOUBLE_SIDE_TRANSPARENCY;
        if (doubleSideTransparency) object.shader.side = Shader.BACK_SIDE;

        object.shader.draw(object, object.geometry);
        attachSceneUniforms(object, scene, camera);
        object.geometry.draw(object, object.shader);

        // Second pass for DOUBLE_SIDE_TRANSPARENCY — front faces over back.
        if (doubleSideTransparency) {
          object.shader.side = Shader.FRONT_SIDE;
          object.shader.draw(object, object.geometry);
          attachSceneUniforms(object, scene, camera);
          object.geometry.draw(object, object.shader);
          object.shader.side = Shader.DOUBLE_SIDE_TRANSPARENCY;
        }
      }
    }

    if (rt && rt.width) {
      if (rt.texture.generateMipmaps) {
        _gl.bindTexture(_gl.TEXTURE_2D, rt.texture._gl);
        _gl.generateMipmap(_gl.TEXTURE_2D);
        _gl.bindTexture(_gl.TEXTURE_2D, null);
      }
      if (rt.multisample) {
        self.blit(rt._rtMultisample, rt);
        RenderTarget.renderer.unbind(rt._rtMultisample);
      } else {
        RenderTarget.renderer.unbind(rt);
      }
    }
  }

  // ── Defaults / class statics ──────────────────────────────────────────
  this.autoClear         = true;
  this.shadows           = Renderer.SHADOWS_MED;
  this.useOcclusionQuery = false;
  Renderer.instance      = self;
  Renderer.CLEAR         = [0, 0, 0, 1];

  // ── Init: WebGL context selection ─────────────────────────────────────
  (function initContext() {
    const contextAttributes = {
      antialias:             undefined !== _params.antialias && _params.antialias,
      powerPreference:       _params.powerPreference,
      preserveDrawingBuffer: _params.preserveDrawingBuffer,
      xrCompatible:          _params.xrCompatible,
      alpha:                 undefined !== _params.alpha && _params.alpha,
      stencil:               _params.stencil,
    };

    // Workaround: iOS 16.7–17.1 context loss when `powerPreference` is set.
    const iOSContextLoss = () =>
      'ios' === Device.system.os
      && Device.system.browserVersion > 16.7
      && Device.system.browserVersion < 17.1;
    if (iOSContextLoss()) delete contextAttributes.powerPreference;

    self.stencil = !!_params.stencil;
    _canvas = _params.canvas || document.createElement('canvas');
    _canvas.addEventListener('webglcontextlost',
      () => Events.emitter._fireEvent(Events.WEBGL_CONTEXT_LOSS),
      false);

    if (_params.gl) {
      // Caller-provided context (e.g. WebXR session, offscreen).
      _gl = _params.gl;
      self.type = Device.graphics.webgl.version.includes(['webgl 2', 'webgl2'])
        ? Renderer.WEBGL2
        : Renderer.WEBGL1;
    } else if (Device.graphics.webgl) {
      // Try WebGL2 first, fall back to WebGL1 / experimental-webgl.
      ['webgl2', 'webgl', 'experimental-webgl'].forEach((name) => {
        if (_gl) return;
        if ('webgl2' == name && _params.forceWebGL1) return;
        _gl = _canvas.getContext(name, contextAttributes);
        self.type = (_gl && 'webgl2' == name) ? Renderer.WEBGL2 : Renderer.WEBGL1;
      });
    } else {
      // Headless environment (workers, SSR) — install a no-op polyfill.
      _gl = new NoGLPolyfill();
      self.type = Renderer.WEBGL2;
    }

    if (!_gl) throw 'Error! Could not create WebGL context';

    self.domElement          = _canvas;
    _canvas.style.background = 'black';
    Renderer.type            = self.type;
    Renderer.context         = self.context = _gl;
  })();

  // ── Init: feature extensions ──────────────────────────────────────────
  (function setExtensions() {
    self.extensions = {};
    if (self.type != Renderer.WEBGL2) {
      // WebGL1 needs explicit extensions for features that are core in WebGL2.
      self.extensions.VAO                 = _gl.getExtension('OES_vertex_array_object');
      self.extensions.instancedArrays     = _gl.getExtension('ANGLE_instanced_arrays');
      self.extensions.standardDerivatives = _gl.getExtension('OES_standard_derivatives');
      self.extensions.elementIndexUint    = _gl.getExtension('OES_element_index_uint');
      self.extensions.depthTextures       = _gl.getExtension('WEBGL_depth_texture');
      self.extensions.drawBuffers         = _gl.getExtension('WEBGL_draw_buffers');
      self.extensions.halfFloat           = _gl.getExtension('OES_texture_half_float');
      self.extensions.float               = _gl.getExtension('OES_texture_float');
      self.extensions.colorBufferFloat    = _gl.getExtension('WEBGL_color_buffer_float');
      self.extensions.lod                 = _gl.getExtension('EXT_shader_texture_lod');
      self.extensions.minMax              = _gl.getExtension('EXT_blend_minmax');
    } else {
      // WebGL2-only extensions.
      self.extensions.disjointTimerQuery = _gl.getExtension('EXT_disjoint_timer_query_webgl2');
      self.extensions.colorBufferFloat   = _gl.getExtension('EXT_color_buffer_float');
      self.extensions.oculusMultiview    = _gl.getExtension('OCULUS_multiview');
      self.extensions.oculusMultiview2   = _gl.getExtension('OVR_multiview2');
    }

    // Format/feature extensions available on both targets.
    self.extensions.filterFloat = _gl.getExtension('OES_texture_float_linear');
    self.extensions.anisotropy
      = _gl.getExtension('EXT_texture_filter_anisotropic')
      || _gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');
    self.extensions.astc   = _gl.getExtension('WEBGL_compressed_texture_astc');
    self.extensions.atc    = _gl.getExtension('WEBGL_compressed_texture_atc');
    self.extensions.etc    = _gl.getExtension('WEBGL_compressed_texture_etc');
    self.extensions.etc1   = _gl.getExtension('WEBGL_compressed_texture_etc1');
    self.extensions.pvrtc  = _gl.getExtension('WEBGL_compressed_texture_pvrtc')
      || _gl.getExtension('WEBKIT_WEBGL_compressed_texture_pvrtc');
    self.extensions.s3tc   = _gl.getExtension('WEBGL_compressed_texture_s3tc')
      || _gl.getExtension('WEBKIT_WEBGL_compressed_texture_s3tc');
    self.extensions.bptc      = _gl.getExtension('EXT_texture_compression_bptc');
    self.extensions.s3tc_srgb = _gl.getExtension('WEBGL_compressed_texture_s3tc_srgb');
    Renderer.extensions = self.extensions;
  })();

  // ── Init: per-resource renderer backends ──────────────────────────────
  (function initRenderers() {
    Geometry.renderer     = new GeometryRendererWebGL(_gl);
    Texture.renderer      = new TextureRendererWebGL(_gl);
    Shader.renderer       = new ShaderRendererWebGL(_gl);
    RenderTarget.renderer = new FBORendererWebGL(_gl);
  })();

  // ── Init: math scratch + frustum helper ───────────────────────────────
  (function initMath() {
    _projScreenMatrix = new Matrix4();
    new Vector3();         // (leftover allocation from the minified source)
    _frustum          = new Frustum();
  })();

  // ── Init: UBO availability flag ───────────────────────────────────────
  (function initUBO() {
    if (self.type == Renderer.WEBGL2) _ubo = true;
    Renderer.UBO = _ubo;
  })();

  self.startRender(loop);

  /**
   * Top-level render entrypoint. Handles:
   *   - draw-list rebuild + sorting,
   *   - optional `modifyCameraBeforeRender` hook (clones the camera so the
   *     mutation doesn't bleed back into the caller),
   *   - shadow pre-pass,
   *   - dispatch to canvas / RT / XR rendering path,
   *   - reset shader state after the frame.
   */
  this.render = function (scene, camera, rt, forceToScreen) {
    if (self.preventRender) return;

    if (scene.displayNeedsUpdate) {
      scene.toRender[0].length = 0;
      scene.toRender[1].length = 0;
    }

    // Allow caller to mutate a *clone* of the camera per-frame (XR head poses,
    // post-process eye nudges) without disturbing the scene's camera state.
    if (self.modifyCameraBeforeRender) {
      if (!camera.renderCamera) camera.renderCamera = camera.clone();
      camera.renderCamera.copy(camera);
      camera = camera.renderCamera;
      self.modifyCameraBeforeRender(camera);
    }

    scene.updateMatrixWorld();
    if (!camera.parent) camera.updateMatrixWorld();   // root cameras need explicit update
    projectObject(scene, camera, scene);

    // ── Sort opaque ────────────────────────────────────────────────────
    if (scene.displayNeedsUpdate || scene.opaqueSortOrder == Scene.FRONT_TO_BACK) {
      (function sortOpaque(array, sortOrder, camera) {
        // Ensure shaders are uploaded so `_gl._id` is available for sort key.
        for (let i = array.length - 1; i > -1; i--) {
          const obj = array[i];
          if (!obj.shader._gl) obj.shader.upload();
        }
        if (sortOrder == Scene.FRONT_TO_BACK) {
          sortFrontToBack(array, sortOrder, camera);
        } else {
          // Default: renderOrder → shader-program id (batch by material) → object id.
          array.sort((a, b) => {
            if (a.renderOrder !== b.renderOrder) return a.renderOrder - b.renderOrder;
            const aid = a.shader._gl._id;
            const bid = b.shader._gl._id;
            return aid !== bid ? aid - bid : a.id - b.id;
          });
        }
      })(scene.toRender[0], scene.opaqueSortOrder, camera);
    }

    // ── Sort transparent ───────────────────────────────────────────────
    if (scene.displayNeedsUpdate || (scene.toRender[1].length && !scene.disableAutoSort)) {
      (function sortTransparent(array, sortOrder, camera) {
        RenderStats.update('SortTransparent', array.length);
        if (sortOrder == Scene.FRONT_TO_BACK || sortOrder == Scene.FRONT_TO_BACK_BOUNDING) {
          sortFrontToBack(array, sortOrder, camera);
        } else {
          // Default: renderOrder → world-z (back-to-front for correct blending) → id.
          array.sort((a, b) =>
            a.renderOrder !== b.renderOrder
              ? a.renderOrder - b.renderOrder
              : a.worldPos.z !== b.worldPos.z
                ? a.worldPos.z - b.worldPos.z
                : a.id - b.id);
        }
      })(scene.toRender[1], scene.transparentSortOrder, camera);
    }

    // ── Shadow pre-pass ────────────────────────────────────────────────
    if (self.shadows
        && !self.overridePreventShadows
        && !self.pauseShadowRendering
        && scene.hasShadowLight) {
      (function renderShadows(scene, camera) {
        // Render `light`'s depth pass into its shadow RT.
        const renderLight = (light, lightIndex) => {
          RenderTarget.renderer.bind(light.shadow.rt);
          RenderStats.update('ShadowLights');
          light.shadow.camera.updateMatrixWorld();
          camera.getWorldPosition(camera.worldPos);
          _frustum.setFromCamera(camera);

          if (_ubo) {
            if (light.shadow.camera._ubo) light.shadow.camera._ubo.update();
            else                          initCameraUBO(light.shadow.camera);
          }

          for (let l = 0; l < 2; l++) {
            for (let i = 0; i < scene.toRender[l].length; i++) {
              const object = scene.toRender[l][i];
              // Object can opt-out / customize via `onBeforeRenderShadow`.
              if (object.onBeforeRenderShadow && object.onBeforeRenderShadow(light, lightIndex)) continue;
              if (true !== object.castShadow) continue;
              if (!object.determineVisible() || !object.shader.visible || object.shader.neverRender) continue;
              if (false !== object.frustumCulled && true !== _frustum.intersectsObject(object)) continue;

              if (!object.shader.shadow) Lighting.initShadowShader(object);
              object.shader.shadow.draw(object, object.geometry);
              attachShadowUniforms(object, 0, light);
              object.geometry.draw(object, object.shader.shadow);
              if (_ubo) light.shadow.camera._ubo.unbind();
              RenderStats.update('ShadowMesh');
            }
          }
          RenderTarget.renderer.unbind(light.shadow.rt);
        };

        const lights = Lighting.getShadowLights();

        // Reallocate the packed shadow-data buffers if the light count changed.
        if (!scene._shadowData) {
          scene._shadowData = {
            maps:      [],
            emptyMaps: [],
            size:      new Float32Array(lights.length),
            pos:       new Float32Array(3 * lights.length),
            count:     lights.length,
          };
        }
        if (scene._shadowData.count != lights.length) {
          scene._shadowData.size  = new Float32Array(lights.length);
          scene._shadowData.pos   = new Float32Array(3 * lights.length);
          scene._shadowData.count = lights.length;
        }

        // Snapshot light state for this frame (depth textures, sizes, positions).
        for (let i = 0; i < lights.length; i++) {
          const light = lights[i];
          light.prepareRender();
          scene._shadowData.maps[i]      = light.shadow.rt.depth;
          scene._shadowData.emptyMaps[i] = Utils3D.getEmptyTexture();
          scene._shadowData.size[i]      = light.shadow.size;
          light.position.toArray(scene._shadowData.pos, 3 * i);
        }

        for (let i = 0; i < lights.length; i++) {
          const light = lights[i];
          if (!light.shadow.frozen && light.determineVisible()) renderLight(light, i);
        }
      })(scene, camera);
    }

    // ── Dispatch to canvas/RT/XR ───────────────────────────────────────
    if ((rt && !rt.vrRT) || !self.vrRenderingPath || forceToScreen) {
      if (rt || !self.arRenderingPath || forceToScreen) {
        render(scene, camera, rt);
      } else {
        self.arRenderingPath(render, scene, camera);
      }
    } else {
      self.vrRenderingPath(scene, camera, _projScreenMatrix, _frustum, attachSceneUniforms, rt);
    }

    scene.displayNeedsUpdate = false;
    Shader.renderer.resetState();
  };

  /**
   * One-shot single-object draw — skips the scene traversal/sort. Used by
   * FX passes, UI overlays, and other places where one mesh is rendered in
   * isolation. Handles `DOUBLE_SIDE_TRANSPARENCY` and `_renderFrontFirst`
   * (which swaps which side is drawn first).
   */
  this.renderSingle = function (object, camera, rt) {
    if (self.preventRender) return;

    if (rt) {
      _resolution.set(rt.width, rt.height);
      if (rt.multisample) RenderTarget.renderer.bind(rt._rtMultisample);
      else                RenderTarget.renderer.bind(rt);
    } else {
      if (!Renderer.overrideViewport) {
        _gl.viewport(0, 0, _width * _dpr, _height * _dpr);
        _resolution.set(_canvas.width, _canvas.height);
      }
      if (self.autoClear) {
        _gl.clearColor(Renderer.CLEAR[0], Renderer.CLEAR[1], Renderer.CLEAR[2], Renderer.CLEAR[3]);
        _gl.clear(_gl.COLOR_BUFFER_BIT | _gl.DEPTH_BUFFER_BIT);
      }
    }

    camera.getWorldPosition(camera.worldPos);
    camera.getWorldQuaternion(camera.worldQuat);
    object.modelViewMatrix.multiplyMatrices(camera.matrixWorldInverse, object.matrixWorld);
    object.normalMatrix.getNormalMatrix(object.modelViewMatrix);
    object.getWorldPosition(object.worldPos);

    if (_ubo) {
      if (camera._ubo) {
        if (!camera.pauseUBO) camera._ubo.update();
      } else {
        initCameraUBO(camera);
      }
    }

    const doubleSideTransparency = object.shader.side === Shader.DOUBLE_SIDE_TRANSPARENCY;
    if (doubleSideTransparency) {
      object.shader.side = Shader.BACK_SIDE;
      if (object.shader._renderFrontFirst) object.shader.side = Shader.FRONT_SIDE;
    }

    object.shader.draw(object, object.geometry);
    if (!object.noMatrices) {
      Shader.renderer.appendUniform(object.shader, 'normalMatrix',    object.normalMatrix);
      Shader.renderer.appendUniform(object.shader, 'modelMatrix',     object.matrixWorld);
      Shader.renderer.appendUniform(object.shader, 'modelViewMatrix', object.modelViewMatrix);
    }
    if (_ubo) {
      camera._ubo.bind(object.shader._gl.program, 'global');
    } else {
      Shader.renderer.appendUniform(object.shader, 'projectionMatrix', camera.projectionMatrix);
      Shader.renderer.appendUniform(object.shader, 'viewMatrix',       camera.matrixWorldInverse);
      Shader.renderer.appendUniform(object.shader, 'cameraPosition',   camera.worldPos);
      Shader.renderer.appendUniform(object.shader, 'cameraQuaternion', camera.worldQuat);
      Shader.renderer.appendUniform(object.shader, 'resolution',       _resolution);
      Shader.renderer.appendUniform(object.shader, 'time',             _time.value);
      Shader.renderer.appendUniform(object.shader, 'timeScale',        Render.timeScaleUniform.value);
    }
    object.geometry.draw(object, object.shader);

    if (doubleSideTransparency) {
      object.shader.side = Shader.FRONT_SIDE;
      if (object.shader._renderFrontFirst) object.shader.side = Shader.BACK_SIDE;
      object.shader.draw(object, object.geometry);
      object.geometry.draw(object, object.shader);
      object.shader.side = Shader.DOUBLE_SIDE_TRANSPARENCY;
    }

    if (_ubo) camera._ubo.unbind();

    if (rt) {
      if (rt.texture.generateMipmaps) {
        _gl.bindTexture(_gl.TEXTURE_2D, rt.texture._gl);
        _gl.generateMipmap(_gl.TEXTURE_2D);
        _gl.bindTexture(_gl.TEXTURE_2D, null);
      }
      if (rt.multisample) {
        self.blit(rt._rtMultisample, rt);
        RenderTarget.renderer.unbind(rt._rtMultisample);
      } else {
        RenderTarget.renderer.unbind(rt);
      }
    }
    Shader.renderer.resetState();
  };

  // ── Clear color / alpha helpers ───────────────────────────────────────
  this.setClearColor = function (color, alpha = 1) {
    _clearColor = new Color(color);
    Renderer.CLEAR = [_clearColor.r, _clearColor.g, _clearColor.b, alpha];
  };
  this.setClearAlpha = function (alpha) { Renderer.CLEAR[3] = alpha; };
  this.getClearColor = function () {
    if (!_clearColor) _clearColor = new Color(0, 0, 0);
    return _clearColor;
  };
  this.getClearAlpha = function () { return Renderer.CLEAR[3]; };

  /** Set device pixel ratio; re-applies the existing logical size. */
  this.setPixelRatio = function (dpr) {
    _dpr = dpr;
    this.setSize(_width, _height);
  };

  /** Resize canvas: backing-store dims are scaled by dpr, CSS dims aren't. */
  this.setSize = function (width, height) {
    _width  = width;
    _height = height;
    _canvas.width  = width  * _dpr;
    _canvas.height = height * _dpr;
    _canvas.style.width  = `${width}px`;
    _canvas.style.height = `${height}px`;
    _resolution.set(_canvas.width, _canvas.height);
  };

  /** Cached query of `MAX_TEXTURE_MAX_ANISOTROPY_EXT` — returns 0 if unsupported. */
  this.getMaxAnisotropy = function () {
    if (!Device.graphics.webgl || !self.extensions.anisotropy) return 0;
    if (!_anisotropy) {
      _anisotropy = _gl.getParameter(self.extensions.anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
    }
    return _anisotropy;
  };

  /**
   * Synchronous pixel read-back. Binds `rt`'s FBO (or default framebuffer if
   * `rt` is null) and copies pixels into `array` (allocated if absent).
   *
   * Note: the (`width - x`, `height - y`) used to size the *output* array is
   * preserved as-is — it's a leftover quirk; passing `x`/`y` non-zero with
   * an auto-sized array can therefore under-allocate. Callers in this code-
   * base only pass `x=y=0` (or pass their own `array`), so it works in
   * practice.
   */
  this.readPixels = function (rt, x = 0, y = 0, width, height, array, type = _gl.UNSIGNED_BYTE) {
    if (!width)  width  = rt ? rt.width  : 1;
    if (!height) height = rt ? rt.height : 1;
    width  = Math.round(width);
    height = Math.round(height);
    type   = type || _gl.UNSIGNED_BYTE;
    const w = Math.round(width  - x);
    const h = Math.round(height - y);

    if (!array) array = new Uint8Array(w * h * 4);
    _gl.bindFramebuffer(_gl.FRAMEBUFFER, rt ? rt._gl : null);
    _gl.readPixels(x, y, width, height, _gl.RGBA, type, array);
    _gl.bindFramebuffer(_gl.FRAMEBUFFER, null);
    return array;
  };

  /**
   * WebGL2-only: resolve multisample buffer to single-sample, or generally
   * copy `input` → `output`. When `input` is `output._rtMultisample`, also
   * carries the depth/stencil masks across and resolves any additional
   * color attachments (multi-RT).
   */
  this.blit = function (input, output, mask = _gl.COLOR_BUFFER_BIT) {
    if (self.type != Renderer.WEBGL2) return false;
    if (!input._gl)  input.upload();
    if (!output._gl) output.upload();
    _gl.bindFramebuffer(_gl.READ_FRAMEBUFFER, input._gl);
    _gl.bindFramebuffer(_gl.DRAW_FRAMEBUFFER, output._gl);

    if (input === output._rtMultisample) {
      if (output.depth)   mask |= _gl.DEPTH_BUFFER_BIT;
      if (output.stencil) mask |= _gl.STENCIL_BUFFER_BIT;
    }

    _gl.blitFramebuffer(0, 0, input.width, input.height,
                        0, 0, output.width, output.height,
                        mask, _gl.NEAREST);

    if (input === output._rtMultisample && output.multi) {
      // Multi-target FBO: resolve attachments 1..N individually (only
      // attachment 0 was covered by the blit above).
      const attachments = output.attachments;
      for (let i = 1; i < attachments.length; i++) {
        const texture = attachments[i];
        _gl.readBuffer(_gl[`COLOR_ATTACHMENT${i}`]);
        _gl.bindFramebuffer(_gl.DRAW_FRAMEBUFFER, texture._blitFramebuffer);
        _gl.blitFramebuffer(0, 0, input.width, input.height,
                            0, 0, output.width, output.height,
                            _gl.COLOR_BUFFER_BIT, _gl.NEAREST);
      }
      _gl.readBuffer(_gl.COLOR_ATTACHMENT0);
    }

    _gl.bindFramebuffer(_gl.READ_FRAMEBUFFER, null);
    _gl.bindFramebuffer(_gl.DRAW_FRAMEBUFFER, null);
    return true;
  };

  // ── Stencil utilities (used by clip-paths / masked composites) ────────
  /** Begin a stencil pass: write `ref` into the stencil buffer wherever drawn. */
  this.setupStencilMask = function (ref = 1) {
    if (!_stencilActive) {
      _gl.enable(_gl.STENCIL_TEST);
      _gl.clear(_gl.STENCIL_BUFFER_BIT | _gl.DEPTH_BUFFER_BIT);
    }
    _stencilActive = true;
    _gl.stencilFunc(_gl.ALWAYS, ref, 255);
    _gl.stencilOp(_gl.KEEP, _gl.KEEP, _gl.REPLACE);
    _gl.stencilMask(255);
    _gl.colorMask(false, false, false, false);   // mask is invisible
    _gl.disable(_gl.DEPTH_TEST);
  };

  /** Switch to drawing inside (mode='inside') or outside the masked region. */
  this.setupStencilDraw = function (mode, ref = 1) {
    _gl.colorMask(true, true, true, true);
    _gl.enable(_gl.DEPTH_TEST);
    _gl.stencilFunc('inside' == mode ? _gl.EQUAL : _gl.NOTEQUAL, ref, 255);
    _gl.stencilOp(_gl.KEEP, _gl.KEEP, _gl.KEEP);
  };

  this.clearStencil = function () {
    _gl.disable(_gl.STENCIL_TEST);
    _stencilActive = false;
  };

  /** Clear depth on `rt` (or default framebuffer if `rt` is falsy). */
  this.clearDepth = function (rt) {
    if (rt && !rt._gl) rt.upload();
    if (rt) _gl.bindFramebuffer(_gl.FRAMEBUFFER, rt._gl);
    _gl.clear(_gl.DEPTH_BUFFER_BIT);
    if (rt) _gl.bindFramebuffer(_gl.FRAMEBUFFER, null);
  };

  /** Clear color on `rt` using the current `Renderer.CLEAR`. */
  this.clearColor = function (rt) {
    if (rt && !rt._gl) rt.upload();
    if (rt) _gl.bindFramebuffer(_gl.FRAMEBUFFER, rt._gl);
    _gl.clearColor(Renderer.CLEAR[0], Renderer.CLEAR[1], Renderer.CLEAR[2], Renderer.CLEAR[3]);
    _gl.clear(_gl.COLOR_BUFFER_BIT);
    if (rt) _gl.bindFramebuffer(_gl.FRAMEBUFFER, null);
  };

  this.get('resolution', (_) => _resolution);
  this.get('time',       (_) => _time);
  this.get('canvas',     (_) => _canvas);
}, (_) => {
  // Class statics.
  Renderer.WEBGL1         = 'webgl1';
  Renderer.WEBGL2         = 'webgl2';
  Renderer.STATIC_SHADOWS = 'static_shadows';
  Renderer.SHADOWS_LOW    = 'shadows_low';
  Renderer.SHADOWS_MED    = 'shadows_med';
  Renderer.SHADOWS_HIGH   = 'shadows_high';
  Renderer.ID             = 0;
});

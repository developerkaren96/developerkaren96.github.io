/*
 * VRRenderer — owns the per-XR-frame loop in WEBVR mode. Wraps
 * the underlying `_renderer` (Renderer) and `_nuke` post chain
 * so each XR frame goes through Hydra's normal pipeline but
 * with eye-specific cameras and the XR framebuffer bound.
 *
 * Major responsibilities:
 *   - Acquire `XRWebGLLayer` (with `framebufferScaleFactor`
 *     adjusted by `_scaleFactor` / `_nativeScaleFactor`) and
 *     hook the XR rAF loop, replacing `Render.useRAF` so the
 *     engine's frame callback fires per XR vsync.
 *   - Multiview path: when `XRDeviceManager.multiview` is on AND
 *     the device has `extensions.oculusMultiview`, builds an
 *     `XRGLBinding` projection layer with multiview enabled,
 *     allocates a depth/stencil multiview texture, and rewrites
 *     every shader's vertex code on first use to inject the
 *     `GL_OVR_multiview` extension + `layout(num_views=2) in`
 *     directive. The rewrite swaps `modelViewMatrix` /
 *     `projectionMatrix` references for
 *     `(gl_ViewID_OVR == 0u ? leftXXX : rightXXX)` so a single
 *     draw call renders both eyes in one pass.
 *   - Non-multiview path: bind `_session.baseLayer.framebuffer`
 *     once, then iterate `pose.views`, set viewport per eye,
 *     resolve eye camera from VRCamera, and call
 *     `_renderer.render(scene, camera)` per eye.
 *
 * Frustum cache: builds and reuses two Frustum objects (one per
 * eye) so cull tests don't reallocate per frame.
 *
 * Event protocol:
 *   - Fires `Nuke.EYE_RENDER` between eyes so post-passes can
 *     run per-eye.
 *   - `_firedEyeRender` guards against double-firing when the
 *     pose has only one view.
 *
 * State flags:
 *   - `_currentUnparsedScaleFactor` — last app-set scale value
 *     to detect changes vs the resolved `_scaleFactor`.
 *   - `_xrFramebuffer` / `_xrGLBinding` — chosen rendering
 *     surface depending on multiview availability.
 *   - `_viewCameras` — WeakMap of view→eye-camera for reuse.
 *
 * The class is long because the eye-binding state machine,
 * the multiview shader rewrite, and the resize/foveation paths
 * each handle several device quirks. See body for per-block
 * detail.
 */
Class(function VRRenderer(_renderer, _nuke) {
  Inherit(this, Component);
  const self = this;
  var _session,
    _gl,
    _callback,
    _frame,
    _scaleFactor,
    _nativeScaleFactor,
    _currentUnparsedScaleFactor,
    _frameOfRef,
    _vrCamera,
    _frameBound,
    _firedEyeRender,
    _xrFramebuffer,
    _xrGLBinding,
    _mvExt,
    _depthStencilTex,
    _multiviewLayer,
    _frustums = [],
    _renderEvt = {},
    _objRenderEvt = {},
    _cameras = {},
    _viewCameras = new WeakMap();
  const USE_UBO = Renderer.UBO;
  function updateShaderMultiView(shader) {
    let vs = shader.vertexShader,
      obj = shader.mesh;
    if (obj && _renderer.extensions.oculusMultiview && XRDeviceManager.multiview) {
      let topLevelScene = false,
        parent = obj._parent;
      for (; parent; ) {
        parent == World.SCENE && (topLevelScene = true);
        parent = parent._parent;
      }
      if (topLevelScene) {
        let newHeader = '#version 300 es\n';
        newHeader += '#extension GL_OVR_multiview : require\n';
        newHeader += 'layout(num_views=2) in;\n';
        let uniforms = 'uniform mat4 leftProjectionMat;\n';
        uniforms += 'uniform mat4 leftModelViewMat;\n';
        uniforms += 'uniform mat4 rightProjectionMat;\n';
        uniforms += 'uniform mat4 rightModelViewMat;\n';
        uniforms += '#define MULTIVIEW 1\n';
        vs = vs.replace('#version 300 es\n', newHeader);
        vs = vs.replace(
          /modelViewMatrix[ *]/g,
          '(gl_ViewID_OVR == 0u ? leftModelViewMat : rightModelViewMat)',
        );
        vs = vs.replace(
          /projectionMatrix[ *]/g,
          '(gl_ViewID_OVR == 0u ? leftProjectionMat : rightProjectionMat)',
        );
        vs = vs.split('__ACTIVE_THEORY_LIGHTS__');
        vs[0] += uniforms;
        vs = vs.join('__ACTIVE_THEORY_LIGHTS__');
        shader.vertexShader = vs;
      }
    }
  }
  function parseScaleFactor(value) {
    return 'number' == typeof value ? value : 'native' === value ? _nativeScaleFactor : 1;
  }
  function parseFixedFoveation(foveationLevel) {
    return Math.range(
      foveationLevel || 0,
      XRDeviceManager.FOVEATION_LEVEL_NONE,
      XRDeviceManager.FOVEATION_LEVEL_HIGH_TOP,
      0,
      1,
      true,
    );
  }
  async function setup() {
    (_session = await XRDeviceManager.waitForVRSession()) &&
      ((_nativeScaleFactor = XRWebGLLayer.getNativeFramebufferScaleFactor(_session)),
      (_currentUnparsedScaleFactor = XRDeviceManager.scaleFactor),
      (_scaleFactor = parseScaleFactor(_currentUnparsedScaleFactor)),
      (function initBaseLayers() {
        let scaleFactors = [
            _scaleFactor,
            ...XRDeviceManager.preallocatedScaleFactors.map(parseScaleFactor),
          ],
          baseLayers = {};
        scaleFactors.forEach((scaleFactor) => {
          baseLayers[scaleFactor] ||
            (baseLayers[scaleFactor] = new XRWebGLLayer(_session, _renderer.context, {
              stencil: _renderer.stencil,
              framebufferScaleFactor: scaleFactor,
            }));
        });
        _session.baseLayer = baseLayers[_scaleFactor];
        XRDeviceManager.preallocatedScaleFactors.length && (_baseLayers = baseLayers);
      })(),
      Render.useRAF(rAFOverride),
      (_vrCamera = RenderManager.camera),
      (_frameOfRef = await _vrCamera.getFrameOfReference()),
      (_renderer.vrRenderingPath = render),
      (_gl = _renderer.context),
      XRDeviceManager.MULTIVIEW
        ? (console.log('SET UP MULTIVIEW'),
          (_xrFramebuffer = _gl.createFramebuffer()),
          (_xrGLBinding = new XRWebGLBinding(_session, _gl)),
          ((_multiviewLayer = _xrGLBinding.createProjectionLayer({
            scaleFactor: _scaleFactor,
            textureType: 'texture-array',
            depthFormat: _gl.DEPTH_COMPONENT24,
          })).fixedFoveation = parseFixedFoveation(XRDeviceManager.foveationLevel)),
          _session.updateRenderState({
            layers: [_multiviewLayer],
          }),
          (_mvExt = _renderer.extensions.oculusMultiview))
        : _session.updateRenderState({
            baseLayer: _session.baseLayer,
          }),
      self.events.fire(XRDeviceManager.SESSION_START),
      setTimeout((_) => {
        World.RENDERER.preventRender = false;
        _session.requestAnimationFrame(rAF);
        setTimeout((_) => {
          AppState.set('Global/immersive', Utils.uuid());
        }, 20);
      }));
  }
  function getCamera(eye, camera) {
    return (_cameras[eye] || (_cameras[eye] = camera.clone()), _cameras[eye]);
  }
  function initCameraUBO(camera) {
    camera._ubo = new UBO(0, _gl);
    camera._ubo.push({
      value: camera.projectionMatrix,
    });
    camera._ubo.push({
      value: camera.matrixWorldInverse,
    });
    camera._ubo.push({
      value: camera.worldPos,
    });
    camera._ubo.push({
      value: camera.worldQuat,
    });
    camera._ubo.push({
      value: _renderer.resolution,
    });
    camera._ubo.push(_renderer.time);
    camera._ubo.push(Render.timeScaleUniform);
    camera._ubo.upload();
  }
  function rAF(t, frame) {
    _vrCamera.newFrame();
    _frame = frame;
    _frameBound = false;
    _firedEyeRender = false;
    _callback && _callback(t);
    self.onFrame && self.onFrame(t, frame);
    _session.requestAnimationFrame(rAF);
  }
  function render(scene, camera, projScreenMatrix, frustum, attachSceneUniforms, rt) {
    if (!_frame) return;
    let pose;
    camera.getWorldPosition(camera.worldPos);
    camera.getWorldQuaternion(camera.worldQuat);
    USE_UBO && (camera._ubo ? camera._ubo.update() : initCameraUBO(camera));
    try {
      if (((pose = _frame.getViewerPose(_frameOfRef)), !pose)) return;
    } catch (e) {
      return;
    }
    if (rt) {
      let width = _session.baseLayer.framebufferWidth,
        height = _session.baseLayer.framebufferHeight;
      (rt.width == width && rt.height == height) ||
        rt.setSize(Math.round(width * rt.vrRT), Math.round(height * rt.vrRT), true);
      rt._gl || rt.upload();
    }
    let multiViewport,
      fixedFoveation = parseFixedFoveation(XRDeviceManager.foveationLevel);
    _session.baseLayer &&
      fixedFoveation !== _session.baseLayer.fixedFoveation &&
      (_session.baseLayer.fixedFoveation = fixedFoveation);
    _multiviewLayer &&
      fixedFoveation !== _multiviewLayer.fixedFoveation &&
      (_multiviewLayer.fixedFoveation = fixedFoveation);
    let fireEyeRender = !_firedEyeRender;
    _firedEyeRender = true;
    for (let i = 0; i < pose.views.length; i++) {
      let view = pose.views[i],
        renderCamera = _vrCamera.getRenderCamera(view, pose);
      if (!renderCamera) continue;
      let viewCamera = getCamera(view.eye, renderCamera);
      _viewCameras.set(view, viewCamera);
      viewCamera.projectionMatrix.copy(renderCamera.projectionMatrix);
      viewCamera.matrix.copy(renderCamera.matrix);
      viewCamera.matrixWorld.copy(renderCamera.matrixWorld);
      viewCamera.matrixWorldInverse.getInverse(viewCamera.matrixWorld);
      viewCamera.worldPos.copy(renderCamera.worldPos);
      viewCamera.worldQuat.copy(renderCamera.worldQuat);
      viewCamera.position.copy(renderCamera.position);
      viewCamera.quaternion.copy(renderCamera.quaternion);
      let viewport = _session.baseLayer.getViewport(view);
      if (
        (USE_UBO && (viewCamera._ubo ? viewCamera._ubo.update() : initCameraUBO(viewCamera)),
        fireEyeRender &&
          ((_renderEvt.stage = viewport),
          (_renderEvt.camera = viewCamera),
          (_renderEvt.view = i),
          (_renderEvt.eye = view.eye),
          RenderManager.fire(RenderManager.EYE_RENDER, _renderEvt)),
        _frustums[i] || (_frustums[i] = new Frustum()),
        _frustums[i].setFromCamera(viewCamera),
        XRDeviceManager.MULTIVIEW && scene == World.SCENE)
      ) {
        let glLayer = _xrGLBinding.getViewSubImage(_session.renderState.layers[0], view),
          viewport = glLayer.viewport;
        glLayer.framebuffer = _xrFramebuffer;
        _gl.bindFramebuffer(_gl.FRAMEBUFFER, _xrFramebuffer);
        multiViewport = viewport;
        0 == i &&
          (_mvExt.framebufferTextureMultiviewOVR(
            _gl.DRAW_FRAMEBUFFER,
            _gl.COLOR_ATTACHMENT0,
            glLayer.colorTexture,
            0,
            0,
            2,
          ),
          null == glLayer.depthStencilTexture
            ? _depthStencilTex ||
              ((_depthStencilTex = _gl.createTexture()),
              _gl.bindTexture(_gl.TEXTURE_2D_ARRAY, _depthStencilTex),
              _gl.texStorage3D(
                _gl.TEXTURE_2D_ARRAY,
                1,
                _gl.DEPTH_COMPONENT24,
                viewport.width,
                viewport.height,
                2,
              ))
            : (_depthStencilTex = glLayer.depthStencilTexture),
          _mvExt.framebufferTextureMultiviewOVR(
            _gl.DRAW_FRAMEBUFFER,
            _gl.DEPTH_ATTACHMENT,
            _depthStencilTex,
            0,
            0,
            2,
          ));
      }
    }
    let forceClear = false;
    if (
      (_frameBound ||
        ((_frameBound = !rt),
        multiViewport ||
          _gl.bindFramebuffer(_gl.FRAMEBUFFER, rt ? rt._gl : _session.baseLayer.framebuffer),
        XRDeviceManager.autoClearFrameBuffer && (forceClear = true)),
      _gl.clearColor(
        Renderer.CLEAR[0],
        Renderer.CLEAR[1],
        Renderer.CLEAR[2],
        XRDeviceManager.mixedReality ? 0 : Renderer.CLEAR[3],
      ),
      (forceClear || rt || (_renderer.autoClear && self.autoClear)) &&
        _gl.clear(_gl.COLOR_BUFFER_BIT | _gl.DEPTH_BUFFER_BIT),
      XRDeviceManager.MULTIVIEW && scene == World.SCENE)
    )
      for (let l = 0; l < 2; l++)
        for (let i = 0; i < scene.toRender[l].length; i++) {
          let object = scene.toRender[l][i];
          if (
            (object.onBeforeRender && object.onBeforeRender(),
            (object._drawing = false),
            !object.determineVisible() ||
              !object.shader.visible ||
              object.shader.neverRender ||
              object.neverRender)
          )
            continue;
          let inFrustum = false;
          for (let f = 0; f < pose.views.length; f++)
            inFrustum || (inFrustum = _frustums[f].intersectsObject(object));
          if (!object.frustumCulled || inFrustum) {
            object._drawing = true;
            object.shader.draw(object, object.geometry);
            let views = pose.views;
            _objRenderEvt.object = object;
            _objRenderEvt.view = 0;
            _objRenderEvt.eye = views[0].eye;
            RenderManager.fire(RenderManager.BEFORE_OBJECT_EYE_RENDER, _objRenderEvt);
            _objRenderEvt.object = null;
            let leftCamera = _viewCameras.get(views[0]),
              rightCamera = _viewCameras.get(views[1]),
              viewport = multiViewport;
            _renderer.resolution.set(2 * viewport.width, viewport.height);
            USE_UBO && (leftCamera._ubo ? leftCamera._ubo.update() : initCameraUBO(leftCamera));
            object.leftModelViewMatrix ||
              ((object.leftModelViewMatrix = new Matrix4()),
              (object.rightModelViewMatrix = new Matrix4()));
            object.leftModelViewMatrix.multiplyMatrices(
              leftCamera.matrixWorldInverse,
              object.matrixWorld,
            );
            object.rightModelViewMatrix.multiplyMatrices(
              rightCamera.matrixWorldInverse,
              object.matrixWorld,
            );
            object.normalMatrix.getNormalMatrix(object.modelViewMatrix);
            _gl.viewport(viewport.x, viewport.y, viewport.width, viewport.height);
            attachSceneUniforms(object, scene, leftCamera);
            Shader.renderer.appendUniform(
              object.shader,
              'leftProjectionMat',
              leftCamera.projectionMatrix,
              'mat4',
            );
            Shader.renderer.appendUniform(
              object.shader,
              'rightProjectionMat',
              rightCamera.projectionMatrix,
              'mat4',
            );
            Shader.renderer.appendUniform(
              object.shader,
              'leftModelViewMat',
              object.leftModelViewMatrix,
              'mat4',
            );
            Shader.renderer.appendUniform(
              object.shader,
              'rightModelViewMat',
              object.rightModelViewMatrix,
              'mat4',
            );
            object.geometry.draw(object, object.shader);
            USE_UBO && leftCamera._ubo.unbind();
          }
        }
    else
      for (let l = 0; l < 2; l++)
        for (let i = 0; i < scene.toRender[l].length; i++) {
          let object = scene.toRender[l][i];
          if (
            (object.onBeforeRender && object.onBeforeRender(),
            (object._drawing = false),
            !object.determineVisible() ||
              !object.shader.visible ||
              object.shader.neverRender ||
              object.neverRender)
          )
            continue;
          let inFrustum = false;
          for (let f = 0; f < pose.views.length; f++)
            inFrustum || (inFrustum = _frustums[f].intersectsObject(object));
          if (!object.frustumCulled || inFrustum) {
            object._drawing = true;
            object.shader.draw(object, object.geometry);
            for (let j = 0; j < pose.views.length; j++) {
              let view = pose.views[j];
              _objRenderEvt.object = object;
              _objRenderEvt.view = j;
              _objRenderEvt.eye = view.eye;
              RenderManager.fire(RenderManager.BEFORE_OBJECT_EYE_RENDER, _objRenderEvt);
              _objRenderEvt.object = null;
              let viewCamera = _viewCameras.get(view),
                viewport = _session.baseLayer.getViewport(view);
              rt
                ? _renderer.resolution.set(rt.width, rt.height)
                : _renderer.resolution.set(2 * viewport.width, viewport.height);
              USE_UBO && (viewCamera._ubo ? viewCamera._ubo.update() : initCameraUBO(viewCamera));
              object.modelViewMatrix.multiplyMatrices(
                viewCamera.matrixWorldInverse,
                object.matrixWorld,
              );
              object.normalMatrix.getNormalMatrix(object.modelViewMatrix);
              rt
                ? _gl.viewport((j * rt.width) / 2, 0, rt.width / 2, rt.height)
                : _gl.viewport(viewport.x, viewport.y, viewport.width, viewport.height);
              attachSceneUniforms(object, scene, viewCamera);
              object.geometry.draw(object, object.shader);
              USE_UBO && viewCamera._ubo.unbind();
            }
          }
        }
    Shader.renderer.resetState();
  }
  function rAFOverride(callback) {
    _callback = callback;
  }
  this.autoClear = true;
  Shader.renderer.multiViewOverride = updateShaderMultiView;
  setup();
  this.render = function (scene, camera) {
    _frame && _renderer.render(scene, camera);
  };
  this.setSize = function (width, height) {
    _renderer.setSize(width, height);
  };
  this.reset = function () {
    setup();
  };
  this.getBaseLayer = function () {
    return _session.baseLayer;
  };
});

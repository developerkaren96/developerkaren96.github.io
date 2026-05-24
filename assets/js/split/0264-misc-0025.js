/*
 * FX.Mirror — planar mirror / reflection FX scene. Given a target
 * mesh whose surface should act as a mirror, sets up a MirrorRenderer
 * (0265) keyed off the mesh's plane and renders the rest of the
 * scene into an RT from the reflected camera position; the host
 * shader on `_mesh` then samples that RT.
 *
 * Two renderers (`_renderer`, `_renderer2`) cover the stereo
 * eye case: in VR the per-eye `loop` callback supplies `eye:
 * 'left' | 'right'` and the appropriate mirror camera is chosen.
 *
 * Per-frame loop:
 *   - Skips if hidden, disabled, or `_mesh` is missing.
 *   - In stage rendering, the camera/stage/nuke wiring is taken
 *     from the active stage; outside stage rendering the mirror
 *     follows the configured `_params.nuke.camera`.
 *   - Optional frustum culling: if `frustumCulled`, builds a
 *     Frustum from the active nuke camera and bails when the mesh
 *     is offscreen. Saves rendering the reflection scene to an RT
 *     when it can't be seen anyway.
 *   - `self.draw()` triggers the FXScene pipeline.
 *   - The mirror renderer's transform is sync'd to the mesh's
 *     world matrix each frame (so a moving mirror stays correct).
 *   - `clearColor` override is temporarily applied to the global
 *     renderer (saved + restored).
 *   - `overridePreventShadows = true` forces shadow rendering even
 *     when the host scene has shadows suppressed; mirrors generally
 *     need shadows in the reflection to look correct.
 *   - `renderer.autoClear = !view` — when there is a parent view
 *     (XR stereo composite), let the parent clear; otherwise clear
 *     per-mirror pass.
 *   - `customViewport` propagation supports stereo split-viewport
 *     rendering.
 *   - `postRender` hook lets consumers add a custom finalisation
 *     step (e.g. apply a per-mirror colour grade).
 */
FX.Class(
  function Mirror(_mesh, _params = {}) {
    Inherit(this, FXScene);
    const self = this;
    var _renderer, _renderer2;
    if (_mesh.isAppState) {
      let props = _mesh;
      _mesh = props.mesh;
      _params = props;
    }
    var _renderTarget,
      _frustum = new Frustum();
    function loop({ stage: stage, camera: camera, view: view, eye: eye }) {
      if (!self.visible || !self.enabled || !_mesh) return;
      let renderer = 'right' === eye ? _renderer2 : _renderer;
      if (
        (stage
          ? ((renderer.camera = camera), (self.nuke.camera = camera), (self.nuke.stage = stage))
          : (_params.nuke &&
              _params.nuke.camera != self.nuke.camera &&
              (self.nuke.camera = _params.nuke.camera),
            self.nuke.camera != _renderer.camera && (_renderer.camera = self.nuke.camera)),
        self.frustumCulled &&
          (_frustum.setFromCamera(self.nuke.camera), !_frustum.intersectsObject(_mesh)))
      )
        return;
      self.draw();
      _mesh.matrixWorld.decompose(renderer.position, renderer.quaternion, renderer.scale);
      let clearColor = null;
      self.clearColor &&
        ((clearColor = World.RENDERER.getClearColor().getHex()),
        World.RENDERER.setClearColor(self.clearColor));
      World.RENDERER.overridePreventShadows = true;
      _renderTarget.customViewport = renderer.customViewport;
      renderer.autoClear = !view;
      renderer.render(self.scene);
      World.RENDERER.overridePreventShadows = false;
      self.clearColor && World.RENDERER.setClearColor(clearColor);
      self.postRender && self.postRender();
    }
    function decorateShader(shader) {
      shader.uniforms.tMirrorReflection = {
        value: _renderer.renderTarget.texture,
        ignoreUIL: true,
      };
      shader.uniforms.uMirrorMatrix = {
        value: _renderer.textureMatrix,
        ignoreUIL: true,
      };
      shader.uniforms.uIsMirror = FX.Mirror.isMirrorUniform;
      self.usingVR &&
        RenderManager.schedule(({ object: object, eye: eye }) => {
          object.shader === shader &&
            Shader.renderer.appendUniform(
              object.shader,
              'uMirrorMatrix',
              'left' === eye ? _renderer.textureMatrix : _renderer2.textureMatrix,
            );
        }, RenderManager.BEFORE_OBJECT_EYE_RENDER);
    }
    this.visible = true;
    this.enabled = 'boolean' != typeof _params.enabled || _params.enabled;
    this.frustumCulled = true;
    this.manualRender = true;
    _mesh &&
      _mesh.isGroup &&
      _mesh.traverse((obj) => {
        obj.shader && 'TestMaterial' !== obj.shader.fsName && (_mesh = obj);
      });
    _mesh && !_params.shader && (_params.shader = _mesh.shader);
    _params.nuke =
      _params.nuke ||
      (function findNuke() {
        let p = self.parent;
        for (; p; ) {
          if (p.nuke) return p.nuke;
          p = p.parent;
        }
        for (p = self.parent; p; ) {
          if (p.nuke) return p.nuke;
          p = p.group ? p.group._parent : p.parent || p._parent;
        }
        return World.NUKE;
      })();
    self.create(_params.nuke);
    self.preventRTDraw = true;
    self.usingVR = RenderManager.type === RenderManager.VR;
    (function initMirror() {
      let width = _params.width || 512,
        height = _params.height || 512;
      _params.size && (width = height = _params.size);
      self.usingVR && (width *= 2);
      let filter = _params.mipmaps ? Texture.LINEAR_MIPMAP : Texture.LINEAR;
      _renderTarget = new RenderTarget(width, height, {
        minFilter: filter,
        magFilter: filter,
        format: _params.format || Texture.RGBFormat,
        generateMipmaps: _params.mipmaps || false,
      });
      _renderer = new MirrorRenderer(_params.nuke.camera, {
        renderTarget: _renderTarget,
        clipBias: _params.clipBias || 0.01,
        sx: self.usingVR ? 0.25 : 0.5,
      });
      self.usingVR &&
        ((_renderer2 = new MirrorRenderer(_params.nuke.camera, {
          renderTarget: _renderTarget,
          clipBias: _params.clipBias || 0.01,
          sx: 0.25,
          tx: 0.5,
        })),
        (_renderer.customViewport = new Vector4(0, 0, width / 2, height)),
        (_renderer2.customViewport = new Vector4(width / 2, 0, width / 2, height)));
      _params.normal &&
        ((_renderer.normalDir = _params.normal),
        self.usingVR && (_renderer2.normalDir = _params.normal));
    })();
    decorateShader(_params.shader);
    this.onDestroy = function () {
      _renderer.destroy();
      _renderer2 && _renderer2.destroy();
    };
    this.applyTo = decorateShader;
    this.start = function (nuke = _params.nuke) {
      self.startRender(loop, self.usingVR ? RenderManager.EYE_RENDER : nuke);
    };
    this.stop = function (nuke = _params.nuke) {
      self.stopRender(loop, self.usingVR ? RenderManager.EYE_RENDER : nuke);
    };
    this.decorate = decorateShader;
    this.useMesh = function (mesh) {
      _mesh = mesh;
      _params.shader || (_params.shader = _mesh.shader);
      decorateShader(_params.shader);
    };
    this.useCamera = function (camera) {
      camera = camera.camera || camera;
      _renderer.camera = camera;
      self.nuke.camera = camera;
      _renderer2 && (_renderer2.camera = camera);
    };
    this.add = async function (obj) {
      return _params.nuke.attachments > 1
        ? (await obj.shader.onBeforePrecompilePromise, self.addObject(obj))
        : self.addObject(obj);
    };
    this.render = loop;
    this.set('clipBias', (v) => (_renderer.clipBias = v));
  },
  () => {
    FX.Mirror.isMirrorUniform = {
      value: 0,
      type: 'f',
      ignoreUIL: true,
    };
  },
);

/*
 * ARRenderer — drives Hydra's render loop from a WebXR AR
 * session instead of the browser rAF. Wraps an underlying
 * `_renderer` (Renderer instance) and `_nuke` (post chain).
 *
 * `setup()` (deferred to next tick after construction):
 *   - Acquires AR session via XRDeviceManager.
 *   - Builds an `XRWebGLLayer` on the renderer's GL context,
 *     with `framebufferScaleFactor = DPR / devicePixelRatio` so
 *     the XR framebuffer matches Hydra's chosen pixel ratio.
 *   - Sets `baseLayer` via `updateRenderState`.
 *   - Requests a 'local' reference space from the ARCamera
 *     (0368), stores into `ARUtils.frameOfReference`.
 *   - Kicks the XR rAF loop (`_session.requestAnimationFrame
 *     (rAF)`).
 *   - Flips `Renderer.overrideViewport = true` (so Renderer
 *     won't reset the viewport — XR controls it).
 *   - Swaps `_renderer.arRenderingPath = renderAR` so each
 *     render call goes through the XR framebuffer-bind path.
 *   - Replaces Render's rAF source with `rAFOverride` (which
 *     just stashes the engine callback; the XR rAF will fire
 *     it manually each XR frame).
 *   - Fires `XRDeviceManager.SESSION_START`.
 *
 * `rAF(t, frame)` — XR-frame callback:
 *   - Recursively re-requests the next XR frame.
 *   - Reads viewer pose, stores into `ARUtils.pose`.
 *   - Takes `pose.views[0]` (mono AR — single view) into
 *     `_view`. If `window.AURA` (camera-passthrough overlay
 *     present), binds the framebuffer through AURA and points
 *     `_nuke.rtt` at it.
 *   - Updates the ARCamera from view+pose, then runs the
 *     deferred engine rAF callback `_callback(t)`.
 *
 * `renderAR(render, scene, camera)` — `arRenderingPath`:
 *   - Binds the XR framebuffer, sets viewport from XRView,
 *     updates `_renderer.resolution`, disables autoClear (XR
 *     already cleared), runs the normal render, unbinds
 *     framebuffer and runs `_nuke.postRender` if present.
 *
 * Public methods:
 *   - `render(scene, camera)` — driven by Render loop. If
 *     post passes exist AND AURA is active, runs the full
 *     `_nuke.render()`; otherwise plain `_renderer.render`.
 *   - `setSize(w, h)` — proxies to `_renderer.setSize` with
 *     XR-adjusted DPR.
 *   - `getCameraTexture(texture)` — assigns the AR session's
 *     passthrough camera texture into a Hydra Texture's `_gl`
 *     slot, for shaders that need to sample reality.
 */
Class(function ARRenderer(_renderer, _nuke) {
  Inherit(this, Component);
  const self = this;
  var _session, _arCamera, _callback, _frame, _frameOfRef, _gl, _view;
  async function setup() {
    (_session = await XRDeviceManager.getARSession()).baseLayer = new XRWebGLLayer(
      _session,
      _renderer.context,
      {
        framebufferScaleFactor: RenderManager.DPR / Device.pixelRatio,
        stencil: _renderer.stencil,
      },
    );
    _session.updateRenderState({
      baseLayer: _session.baseLayer,
    });
    _gl = _renderer.context;
    _arCamera = RenderManager.camera;
    _frameOfRef = await _arCamera.getFrameOfReference();
    ARUtils.frameOfReference = _frameOfRef;
    _session.requestAnimationFrame(rAF);
    Renderer.overrideViewport = true;
    _renderer.arRenderingPath = renderAR;
    Render.useRAF(rAFOverride);
    self.events.fire(XRDeviceManager.SESSION_START);
  }
  function renderAR(render, scene, camera) {
    _gl.bindFramebuffer(_gl.FRAMEBUFFER, _session.baseLayer.framebuffer);
    let viewport = _session.baseLayer.getViewport(_view);
    _gl.viewport(viewport.x, viewport.y, viewport.width, viewport.height);
    _renderer.resolution.set(viewport.width, viewport.height);
    _renderer.autoClear = false;
    render(scene, camera);
    _gl.bindFramebuffer(_gl.FRAMEBUFFER, null);
    _renderer.autoClear = true;
    _nuke.postRender && _nuke.postRender();
  }
  function rAFOverride(callback) {
    _callback = callback;
  }
  function rAF(t, frame) {
    _session.requestAnimationFrame(rAF);
    let pose = frame.getViewerPose(_frameOfRef);
    pose &&
      ((ARUtils.pose = pose),
      (_view = pose.views[0]),
      window.AURA &&
        (ARUtils.setFramebuffer(_session.baseLayer, _view), (_nuke.rtt = ARUtils.getFramebuffer())),
      _arCamera.getRenderCamera(_view, pose),
      (_frame = frame),
      _callback && _callback(t));
  }
  defer(setup);
  this.render = function (scene, camera) {
    _frame &&
      (_nuke.passes.length && window.AURA ? _nuke.render() : _renderer.render(scene, camera));
  };
  this.setSize = function (width, height) {
    _renderer.setPixelRatio(RenderManager.DPR);
    _renderer.setSize(width, height);
  };
  this.getCameraTexture = function (texture) {
    texture._gl = _session.getCameraTexture();
  };
});

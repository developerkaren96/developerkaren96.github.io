/*
 * ARUtils — static singleton: scene-side helpers for AR
 * sessions. Sits next to ARRenderer (0369) / ARCamera (0368);
 * exposes hit-testing, anchors, env-lighting, and camera quad
 * helpers to app code so call sites don't touch the WebXR
 * `XRSession` directly.
 *
 * Boot: awaits Hydra.ready, then subscribes to
 * `XRDeviceManager.SESSION_START`. Only activates when
 * `RenderManager.type === WEBAR`; on first AR frame, hooks the
 * session's `onCreated` (fires `TRACKING_STARTED`), starts a
 * 10Hz `checkStatus` poll, and listens for `envTexture` events.
 *
 * Events:
 *   - FIRST_TRANSFORM      — first headset transform observed.
 *   - TRACKING_CHANGE      — payload `{tracking: bool}`.
 *   - TRACKING_STARTED     — fires once when session created.
 *   - CLOUD_ANCHOR         — cloud-anchor recovery event.
 *
 * Env lighting:
 *   - `handleEnvTexture` is fired by the AR layer whenever a
 *     new probe cubemap arrives. Wraps as a Texture (marked
 *     cubic, both `_metal` and `_gl` slots populated for Metal
 *     and GL renderers), then feeds a `DynamicEnvGenerator`
 *     (iOS: 256-side, Android: 16-side HDR). On ready, pushes
 *     the specular+diffuse textures into every previously-
 *     registered shader (`applyEnvLighting` clients). Destroys
 *     the previous env to release GPU memory.
 *
 * Hit testing:
 *   - `findSurface(obj = Mouse)` — builds an origin / direction
 *     pair from the world-camera matrix (origin = camera world
 *     position, direction = camera-forward). Calls
 *     `session.requestHitTest(origin, dir, frameOfReference)`,
 *     converts each `hitMatrix` to a Group with decomposed
 *     pose. (The `obj` parameter is reserved but unused — the
 *     ray currently always uses camera-forward.)
 *
 * Anchors:
 *   - `addAnchor(hit, type='normal')` — passes hit (unwrapped
 *     from a Group if needed) to `session.addAnchor`. Under
 *     `window.AURA`, the type is preserved; otherwise dropped
 *     because the upstream session.addAnchor signature differs.
 *   - `removeAnchor(hit)` — symmetric.
 *
 * Camera passthrough:
 *   - `getCameraTexture()` — lazily asks the renderer for the
 *     passthrough texture and caches as a Hydra Texture with
 *     `needsUpdate = false`.
 *   - `getCameraQuad(shader?)` — builds a renderOrder -999
 *     fullscreen quad showing the camera feed; if no shader is
 *     supplied, creates an `ARCameraQuad` shader.
 *
 * Framebuffer helpers:
 *   - `setFramebuffer(baseLayer, view)` — builds a Hydra
 *     RenderTarget aliased to the XRWebGLLayer's framebuffer
 *     (so the Nuke pipeline can render into it).
 *   - `getFramebuffer()` — returns it.
 *
 * `lightIntensity` is a public uniform-shaped object for
 * shaders to bind to the per-frame ambient light scalar.
 */
Class(function ARUtils() {
  Inherit(this, Component);
  const self = this;
  var _origin,
    _direction,
    _matrix,
    _session,
    _env,
    _framebuffer,
    _originArray,
    _directionArray,
    _cameraTexture,
    _envShaders = [],
    _tracking = false;
  function checkStatus() {
    _session.trackingStatus
      ? _tracking ||
        ((_tracking = true),
        self.events.fire(self.TRACKING_CHANGE, {
          tracking: true,
        }))
      : _tracking &&
        ((_tracking = false),
        self.events.fire(self.TRACKING_CHANGE, {
          tracking: false,
        }));
  }
  async function handleEnvTexture({ texture: texture }) {
    let t = new Texture();
    t.cube = true;
    t.needsReupload = t.needsUpdate = false;
    t._metal = t._gl = texture;
    let size = 'ios' == Device.system.os ? 256 : 16,
      hdr = 'android' == Device.system.os,
      lastEnv = _env;
    _env = self.initClass(DynamicEnvGenerator, t, size, 30, hdr);
    await _env.ready();
    _envShaders.forEach((shader) => {
      shader.set('tEnvSpecular', _env.specular.texture);
      shader.set('tEnvDiffuse', _env.diffuse.texture);
    });
    lastEnv && lastEnv.destroy();
  }
  this.lightIntensity = {
    type: 'f',
    value: 0,
  };
  this.FIRST_TRANSFORM = 'arutils_first_transform';
  this.TRACKING_CHANGE = 'arutils_tracking_change';
  this.TRACKING_STARTED = 'arutils_tracking_started';
  this.CLOUD_ANCHOR = 'cloud_anchor';
  (async function () {
    await Hydra.ready();
    self.events.sub(XRDeviceManager.SESSION_START, async (_) => {
      RenderManager.type == RenderManager.WEBAR &&
        (((_session = await XRDeviceManager.getARSession()).onCreated = (_) =>
          self.events.fire(self.TRACKING_STARTED)),
        self.startRender(checkStatus, 10),
        _session.addEventListener('envTexture', handleEnvTexture));
    });
  })();
  this.getTrackingStatus = async function () {
    return (_session || (_session = await XRDeviceManager.getARSession()), _session.trackingStatus);
  };
  this.resetOrigin = function () {};
  this.findSurface = async function (obj = Mouse) {
    if ((_session || (_session = await XRDeviceManager.getARSession()), !self.frameOfReference))
      return;
    _origin ||
      ((_origin = new Vector3()),
      (_direction = new Vector3()),
      (_matrix = new Matrix4()),
      (_originArray = new Float32Array(3)),
      (_directionArray = new Float32Array(3)));
    _matrix.copy(World.CAMERA.matrixWorld);
    _origin.set(0, 0, 0);
    _origin.applyMatrix4(_matrix);
    _direction.set(0, 0, -1);
    _direction.applyMatrix4(_matrix);
    _direction.sub(_origin).normalize();
    _origin.toArray(_originArray);
    _direction.toArray(_directionArray);
    let output = [];
    return (
      (await _session.requestHitTest(_originArray, _directionArray, self.frameOfReference)).forEach(
        (hit) => {
          let array = hit.hitMatrix,
            group = new Group();
          group.matrixWorld.fromArray(array);
          group.matrix.fromArray(array);
          group.matrixWorld.decompose(group.position, group.rotation, group.scale);
          group.hit = hit;
          output.push(group);
        },
      ),
      output
    );
  };
  this.addAnchor = async function (hit, type = 'normal') {
    return (
      _session || (_session = await XRDeviceManager.getARSession()),
      (hit = hit.hit || hit),
      window.AURA ? (hit.type = type) : (type = undefined),
      _session.addAnchor(hit, type)
    );
  };
  this.removeAnchor = async function (hit) {
    hit = hit.hit || hit;
    _session || (_session = await XRDeviceManager.getARSession());
    _session.removeAnchor(hit, hit.type);
  };
  this.getCameraTexture = async function () {
    return (
      _session || (_session = await XRDeviceManager.getARSession()),
      _cameraTexture ||
        ((_cameraTexture = new Texture()),
        await RenderManager.renderer.getCameraTexture(_cameraTexture),
        (_cameraTexture.needsUpdate = false)),
      _cameraTexture
    );
  };
  this.getCameraQuad = async function (shader) {
    let texture = await self.getCameraTexture();
    shader
      ? shader.set('tMap', texture)
      : (shader = self.initClass(Shader, 'ARCameraQuad', {
          tMap: {
            value: texture,
          },
          depthWrite: false,
          depthTest: false,
        }));
    let mesh = new Mesh(World.QUAD, shader);
    return ((mesh.renderOrder = -999), mesh);
  };
  this.applyEnvLighting = async function (shader) {
    _env && (await _env.ready(), shader.set('tEnvDiffuse', _env.diffuse.texture));
    _envShaders.push(shader);
  };
  this.setFramebuffer = function (baseLayer, view) {
    if (!self.framebuffer) {
      let viewport = baseLayer.getViewport(view);
      (_framebuffer = new RenderTarget(viewport.width, viewport.height))._gl =
        baseLayer.framebuffer;
    }
  };
  this.getFramebuffer = function () {
    return _framebuffer;
  };
}, 'static');

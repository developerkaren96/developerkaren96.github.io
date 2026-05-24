/*
 * XRDeviceManager — static singleton that owns the WebXR
 * `XRSession` lifecycle and surfaces it as Hydra events. Single
 * entry point for app code to start/stop immersive sessions.
 *
 * Config fields (set by XRConfig 0366 before boot):
 *   - `multiview` (default true) — request OVR_multiview2 +
 *     'layers' feature; flips `MULTIVIEW = true` if available.
 *   - `mixedReality` (default false) — when device supports AR,
 *     uses `immersive-ar` instead of `immersive-vr`.
 *   - `scaleFactor`, `targetFramerate`, `antialias`,
 *     `foveationLevel` — runtime XR parameters consumed by the
 *     XR renderer layer.
 *   - `features` — XR feature names list. Default
 *     `['bounded-floor']`, plus anything else (e.g.
 *     'hand-tracking' from XRConfig). `getFoveationFeatureName()`
 *     returns the per-level WebXR feature string.
 *   - `preallocatedScaleFactors` — list of resolution scales to
 *     prewarm at boot so runtime changes don't stall.
 *   - `reloadWhenSessionEnds` — whether the page should reload
 *     on session end (consumed elsewhere; this class only
 *     fires SESSION_END).
 *
 * Constants:
 *   - SESSION_START / SESSION_END — session lifecycle events.
 *   - CONTROLS_START — fires when VR controls finish hookup.
 *   - HEADSET_IDLE / HEADSET_RESUME — bridged from
 *     XRSession.visibilitychange ('visible-blurred'|'hidden' →
 *     IDLE; 'visible' → RESUME).
 *   - FOVEATION_LEVEL_NONE/LOW/MEDIUM/HIGH/HIGH_TOP — 0-4 enum.
 *
 * Methods:
 *   - `getVRSession()` — lazy: requests `immersive-vr` (or
 *     `-ar` if MR + AR-capable device) with required-features
 *     `['local-floor']` and optional features (custom + foveation).
 *     `disable3D` short-circuits to null. Wires `end` to clear
 *     state and fire SESSION_END.
 *   - `getARSession()` — same shape for `immersive-ar`.
 *   - `waitForVRSession()` — 20ms-poll fallback that resolves
 *     once `_session` is non-null (used by callers that can't
 *     drive the request themselves).
 *   - `startSession()` — boots a session and returns a promise
 *     that resolves on SESSION_START. Resets camera/renderer if
 *     `needNewSession` was flagged (post-end re-init path).
 *   - `endSession()` — flags needNewSession, fires SESSION_END,
 *     calls `_session.end()`.
 *   - `waitForEnd()` — promise-form of SESSION_END.
 *   - `disable3D()/enable3D()/isDisabled()` — kill switch.
 *   - reactive `targetFramerate` setter — awaits SESSION_START
 *     then calls `updateTargetFrameRate` on the session.
 */
Class(function XRDeviceManager() {
  Inherit(this, Component);
  const self = this;
  var _session, _promise;
  function getFoveationFeatureName() {
    switch (self.foveationLevel) {
      case self.FOVEATION_LEVEL_LOW:
        return 'low-fixed-foveation-level';
      case self.FOVEATION_LEVEL_MEDIUM:
        return 'medium-fixed-foveation-level';
      case self.FOVEATION_LEVEL_HIGH:
      case self.FOVEATION_LEVEL_HIGH_TOP:
        return 'high-fixed-foveation-level';
      default:
        return 'no-fixed-foveation';
    }
  }
  this.SESSION_START = 'xr_start';
  this.SESSION_END = 'xr_end';
  this.CONTROLS_START = 'controls_start';
  this.HEADSET_IDLE = 'headset_idle';
  this.HEADSET_RESUME = 'headset_resume';
  this.FOVEATION_LEVEL_NONE = 0;
  this.FOVEATION_LEVEL_LOW = 1;
  this.FOVEATION_LEVEL_MEDIUM = 2;
  this.FOVEATION_LEVEL_HIGH = 3;
  this.FOVEATION_LEVEL_HIGH_TOP = 4;
  this.multiview = true;
  this.scaleFactor = 1;
  this.preallocatedScaleFactors = [];
  this.features = ['bounded-floor'];
  this.reloadWhenSessionEnds = true;
  this.mixedReality = false;
  this.getVRSession = async function () {
    if (_session) return _session;
    if (self.flag('disable3D')) return (self.flag('needNewSession', true), null);
    let requiredFeatures = ['local-floor'];
    if (self.multiview) {
      World.RENDERER.extensions.oculusMultiview &&
        (requiredFeatures.push('layers'), (self.MULTIVIEW = true));
    }
    let optionalFeatures = [...self.features, getFoveationFeatureName()],
      sessionType = 'immersive-' + (self.mixedReality && Device.system.xr.ar ? 'ar' : 'vr');
    return (
      'immersive-vr' == sessionType && self.mixedReality && (self.mixedReality = false),
      (_session = await navigator.xr.requestSession(sessionType, {
        requiredFeatures: requiredFeatures,
        optionalFeatures: optionalFeatures,
      })).addEventListener('end', (_) => {
        _session = null;
        self.flag('needNewSession', true);
        self.events.fire(self.SESSION_END);
      }),
      _session.addEventListener('visibilitychange', (e) => {
        switch (e.session.visibilityState) {
          case 'visible':
            self.events.fire(self.HEADSET_RESUME);
            break;
          case 'visible-blurred':
          case 'hidden':
            self.events.fire(self.HEADSET_IDLE);
        }
      }),
      _session
    );
  };
  this.waitForVRSession = async function () {
    let promise = Promise.create(),
      inter = setInterval((_) => {
        _session && (clearInterval(inter), promise.resolve(_session));
      }, 20);
    return promise;
  };
  this.getARSession = async function () {
    return (
      _session ||
      ((_session = await navigator.xr.requestSession('immersive-ar')).addEventListener(
        'end',
        (_) => {
          _session = null;
          self.flag('needNewSession', true);
          self.events.fire(self.SESSION_END);
        },
      ),
      _session.addEventListener('visibilitychange', (e) => {
        switch (e.session.visibilityState) {
          case 'visible':
            self.events.fire(self.HEADSET_RESUME);
            break;
          case 'visible-blurred':
          case 'hidden':
            self.events.fire(self.HEADSET_IDLE);
        }
      }),
      _session)
    );
  };
  this.startSession = function () {
    return (
      self.isDisabled() && self.enable3D(),
      self.flag('needNewSession') &&
        (self.flag('needNewSession', false),
        RenderManager.camera.reset?.(),
        RenderManager.renderer.reset?.(),
        (_promise = null)),
      self.getVRSession(),
      _promise ||
        ((_promise = Promise.create()),
        self.events.sub(self.SESSION_START, _promise.resolve),
        _promise)
    );
  };
  this.endSession = function () {
    self.flag('needNewSession', true);
    self.events.fire(self.SESSION_END);
    let promise = _session?.end();
    return ((_session = null), promise);
  };
  this.waitForEnd = function () {
    let promise = Promise.create();
    return (self.events.sub(self.SESSION_END, promise.resolve), promise);
  };
  this.disable3D = function () {
    self.flag('disable3D', true);
  };
  this.enable3D = function () {
    self.flag('disable3D', false);
  };
  this.isDisabled = function () {
    return self.flag('disable3D');
  };
  this.set('targetFramerate', async (value) => {
    await _promise;
    _session?.updateTargetFrameRate?.(value);
  });
}, 'static');

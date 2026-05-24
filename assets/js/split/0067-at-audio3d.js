/*
 * Audio3D — front-end audio playback abstraction that picks a concrete
 * implementation at construction time based on capability flags. The
 * resulting `self.context` exposes a uniform play/pause/load/etc API
 * regardless of which engine sits underneath.
 *
 * Backend selection ladder:
 *
 *   Native shells (GlobalAudio3D.native = true):
 *     • `window._al`       Active Theory's AL bridge → Audio3DALBuffer
 *     • `window.AVFSound`  iOS native (AVFoundation) → Audio3DNBuffer('AVF')
 *     • `window.MPAudio`   Native player; two sub-modes:
 *         - `_options.stream` → Audio3DNBuffer('MP') (low-latency stream)
 *         - else              → Audio3DNBuffer('GVR') (positional)
 *
 *   Browser (GlobalAudio3D.native = false):
 *     • `_options.fallback` or `GlobalAudio3D.fallback` →
 *         Audio3DFallback (plain <audio> element).
 *     • `_options.positional` + `GlobalAudio3D.resonanceAudio` →
 *         Audio3DResonanceAudio (Google Resonance positional).
 *     • `_options.simpleBuffer` (non-IE) → Audio3DWASimpleBuffer
 *         (WebAudio AudioBufferSourceNode — lowest overhead).
 *     • Default non-stream non-IE → Audio3DWABuffer (WebAudio buffer
 *         with the full feature surface).
 *     • Stream mode or IE → Audio3DWAStream (MediaElementSource for
 *         long clips that don't fit in memory).
 *
 * Interface forwarding (`initInterface`):
 *   Three categories from the Audio3DConfig module:
 *     • commands  → direct method forwarding (play, pause, stop, …).
 *     • setters   → `self.set(name, …)` proxy: writing `audio.volume =
 *                   0.5` writes to `context.volume`.
 *     • getters   → `self.get(name, …)` proxy.
 *   This pattern lets every backend implement whatever subset they
 *   support and Audio3DConfig declares the full union.
 *
 * Event bridges (`addHandlers`):
 *   END and LOADED events from the chosen context are republished on
 *   self.events so consumers always subscribe to the Audio3D instance
 *   (not the engine-specific context). VISIBILITY (page visible/blur)
 *   routes to `onVisibility`.
 *
 * Visibility behavior (`onVisibility`):
 *   When GlobalAudio3D.blurs is enabled, blurring the tab pauses any
 *   playing audio and stamps `wasPlaying=true`. Refocus resumes only
 *   if we explicitly paused for blur (avoiding awkward resumes of
 *   audio the user already stopped). `visibilityMuted` is the engine-
 *   level flag for backends that prefer their own pause logic.
 *
 * Options pass-through (`initOptions`):
 *   Constructor `_options` keys matching a setter name are forwarded
 *   straight onto the context (volume, loop, etc.). The `label` option
 *   binds to a GlobalAudio3D label-state's `mute` channel so a UI
 *   toggle on the label can mute every audio bound to it. The binding
 *   is stashed in `_bindingLabel` and torn down on destroy.
 *
 * Tween helper:
 *   `audio.tween('volume', 0, 0.5)` forwards to the global tween()
 *   with `self` as the target — useful for fade-outs that touch the
 *   `volume` setter, which proxies to context internally.
 *
 * Cleanup:
 *   `onDestroy` unloads the backend (`context.unload()`) and destroys
 *   the label binding if any.
 */
Class(function Audio3D(_options) {
  Inherit(this, Component);
  const self = this;
  let _bindingLabel;
  const _config = require('Audio3DConfig');

  // VISIBILITY handler: pause on blur, resume on focus (only if we
  // were the ones who paused). visibilityMuted is the engine-side flag.
  function onVisibility(e) {
    if (!self.context || !GlobalAudio3D.blurs) return;
    const hasFocus = 'focus' === e.type;
    self.context.visibilityMuted = !hasFocus;
    if (!self.context.playing && !self.flag('wasPlaying')) return;
    if (hasFocus) {
      self.flag('wasPlaying', false);
      self.context.play();
    } else {
      self.flag('wasPlaying', true);
      self.context.pause();
    }
  }

  /*
   * Pick a backend based on environment & options. See header for the
   * full decision tree.
   */
  (function initContext() {
    if (!_options) _options = {};

    if (GlobalAudio3D.native) {
      if (window._al)      self.context = self.initClass(Audio3DALBuffer);
      if (window.AVFSound) self.context = self.initClass(Audio3DNBuffer, 'AVF');
      if (window.MPAudio) {
        self.context = _options.stream
          ? self.initClass(Audio3DNBuffer, 'MP')
          : self.initClass(Audio3DNBuffer, 'GVR');
      }
    } else if (_options.fallback || GlobalAudio3D.fallback) {
      self.context = self.initClass(Audio3DFallback);
    } else if (_options.positional && GlobalAudio3D.resonanceAudio) {
      self.context = self.initClass(Audio3DResonanceAudio);
    } else if (_options.simpleBuffer && 'ie' !== Device.system.browser) {
      self.context = self.initClass(Audio3DWASimpleBuffer);
    } else if (true !== _options.stream && 'ie' !== Device.system.browser) {
      self.context = self.initClass(Audio3DWABuffer);
    } else {
      self.context = self.initClass(Audio3DWAStream);
    }
  })();

  /*
   * Forward the configured surface from the picked context onto `self`.
   * Commands route to backend methods; setters/getters proxy property
   * access so consumers can write `audio.volume = 0.5` etc.
   */
  (function initInterface() {
    for (const command of _config.commands) self[command] = self.context[command];
    for (const setter of _config.setters) {
      self.set(setter, (e) => {
        if (self.context) self.context[setter] = e;
      });
    }
    for (const getter of _config.getters) {
      self.get(getter, (_) => {
        if (self.context) return self.context[getter];
      });
    }
  })();

  // Republish END/LOADED through self.events; subscribe to global
  // visibility for blur/focus handling.
  (function addHandlers() {
    self.events.sub(self.context, Events.END,    (e) => self.events.fire(Events.END, e));
    self.events.sub(self.context, Events.LOADED, (e) => self.events.fire(Events.LOADED, e));
    self.events.sub(Events.VISIBILITY, onVisibility);
  })();

  /*
   * Apply construction options that match setter names directly onto
   * the context. The `label` option binds a mute toggle from a shared
   * GlobalAudio3D label state — destroyed alongside this Audio3D.
   */
  (function initOptions() {
    if (!_options) return;
    for (const option in _options) {
      if (_config.setters.includes(option)) self.context[option] = _options[option];
    }
    if (_options.label) {
      _bindingLabel = GlobalAudio3D.getLabelState(_options.label).bind('mute', async (bool) => {
        if (!self.context) return _bindingLabel.destroy();
        self.context.muted = bool;
      });
    }
  })();

  // Tween helper: tween into properties that proxy through setters.
  this.tween = function () { return tween(self, ...arguments); };

  this.clone = function () { return new Audio3D(_options); };

  this.onDestroy = function () {
    self.context.unload();
    _bindingLabel?.destroy?.();
  };
});

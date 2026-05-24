/*
 * Audio3DResonanceAudio — per-instance Resonance Audio backend. Pairs
 * with the Audio3DResonance static singleton (engine + context owner).
 * Inherits Audio3DBase for the spatial-position helpers.
 *
 * Construction (async IIFE):
 *   1. Wait for Audio3DResonance to have an engine (lazy first-use
 *      bootstrap, so author code doesn't have to await separately).
 *   2. Initialize options with Resonance-specific defaults pulled from
 *      `ResonanceAudio.Utils.DEFAULT_*` (gain, source width, directivity
 *      sharpness/alpha). These determine the cardioid pattern + spread
 *      of the directional sound emitter.
 *   3. Subscribe to GlobalAudio3D UPDATE to re-mix the global mute /
 *      volume / playback rate into the local volume.
 *
 * Per-frame `loop`:
 *   Push source pose into the Resonance source node. Position is the
 *   world-space audio position; orientation is the listener-relative
 *   euler decomposed via Audio3DBase, then re-cast into a forward
 *   vector by applying it to (0,0,-1). The up vector comes from
 *   `group.up`. This lets directional cones aim correctly relative to
 *   listener motion. Resonance does the binaural panning on top of
 *   this pose.
 *
 * Volume / gain split:
 *   `volume` controls the HTMLAudioElement's `volume` attribute
 *   directly (pre-Resonance), respecting mute and global volume. `gain`
 *   is a separate Resonance API call (`source.setGain`) that boosts
 *   beyond unity — multiplied by `max(1, globalVolume)` so the global
 *   volume can amplify the source but never attenuate it past the
 *   element-level cut.
 *
 * Directivity knobs (Resonance-specific):
 *   - `sourceWidth` — angular spread of the source (0 = point source).
 *   - `directivitySharpness` — how tightly the cone falls off.
 *   - `directivityAlpha` — interpolation between omnidirectional (1)
 *     and cardioid (0). Pattern is applied via setDirectivityPattern.
 *
 * `handleEnded`:
 *   Element `ended` event → unload + END event for listeners. Unload
 *   tears down the Resonance source via Audio3DResonance.unloadStream.
 *
 * Lifecycle methods (play/pause/stop/seek/load/unload):
 *   Mirror the WebAudio variants but operate on the
 *   Audio3DResonance-created `_stream` (which holds both the element
 *   source and the Resonance source). On load(), `createBuffer` calls
 *   `Audio3DResonance.createAudioInput(url)` and wires the ended event
 *   handler, re-applies every author-set property, and resolves on
 *   `onloadeddata`.
 *
 * Notable: `playbackRate` setter accepts a value but does not push it
 * down to the element (Resonance's source is fed by the element which
 * may handle rate independently in some browsers). The state is
 * captured for global UPDATE re-mixing, but applying it to the
 * element isn't wired here — likely an intentional limitation of
 * Resonance + media-element-source on some browsers.
 */
Class(function Audio3DResonanceAudio() {
  Inherit(this, Audio3DBase);
  const self = this;
  let _stream;
  const _options  = {};
  const _settings = { playing: false, loaded: false, loading: false };
  const _orientation = new Vector3();
  let _currentTime = 0;

  // Per-frame: push position + orientation into the Resonance source.
  function loop() {
    const pos = self.audioPosition();
    if (!pos || !_stream) return;
    _stream.source.setPosition(pos.x, pos.y, pos.z);
    const euler = self.audioOrientationInverse();
    _orientation.set(0, 0, -1).applyEuler(euler);
    _stream.source.setOrientation(
      _orientation.x || 0, _orientation.y || 0, _orientation.z || 0,
      self.group.up.x || 0, self.group.up.y || 0, self.group.up.z || 0,
    );
  }

  // Re-mix global state on UPDATE — retrigger setters so node values
  // recompute.
  function update(e) {
    _options.globalMuted        = GlobalAudio3D.muted;
    _options.globalVolume       = GlobalAudio3D.volume;
    _options.globalPlaybackRate = GlobalAudio3D.playbackRate;
    self.volume       = self.volume;
    self.gain         = self.gain;
    self.playbackRate = self.playbackRate;
  }

  function handleEnded() {
    self.unload();
    self.events.fire(Events.END);
  }

  // Async init: wait for engine, then seed defaults including Resonance
  // utils constants.
  (async function init() {
    if (!Audio3DResonance.initialized) await Audio3DResonance.resonance();

    (function initOptions() {
      _options.loop         = _options.loop         || false;
      _options.autoplay     = _options.autoplay     || false;
      _options.volume       = undefined === _options.volume ? 1 : _options.volume;
      _options.playbackRate = _options.playbackRate || 1;
      _options.preload      = _options.preload      || false;
      _options.muted        = _options.muted        || false;
      _options.rolloff      = _options.rolloff      || 1;
      _options.selfDestruct = _options.selfDestruct || false;
      _options.globalMuted        = GlobalAudio3D.muted;
      _options.globalVolume       = GlobalAudio3D.volume;
      _options.globalPlaybackRate = GlobalAudio3D.playbackRate;
      _options.gain =
        'number' === typeof _options.gain ? _options.gain : ResonanceAudio.Utils.DEFAULT_SOURCE_GAIN;
      _options.sourceWidth =
        'number' === typeof _options.sourceWidth
          ? _options.sourceWidth
          : ResonanceAudio.Utils.DEFAULT_SOURCE_WIDTH;
      _options.directivitySharpness =
        'number' === typeof _options.directivitySharpness
          ? _options.directivitySharpness
          : ResonanceAudio.Utils.DEFAULT_DIRECTIVITY_SHARPNESS;
      _options.directivityAlpha =
        'number' === typeof _options.directivityAlpha
          ? _options.directivityAlpha
          : ResonanceAudio.Utils.DEFAULT_DIRECTIVITY_ALPHA;
    })();

    self.events.sub(GlobalAudio3D, Events.UPDATE, update);
  })();

  // src change → stop + lazy reload on next tick.
  this.set('src', (src) => {
    self.stop();
    _settings.src = src;
    defer((_) => {
      if (_options.autoplay) return self.play();
      if (_options.preload)  self.load();
      self.volume = self.volume;
      self.gain   = self.gain;
    });
  });
  this.get('src', (_) => _settings.src);

  this.get('selfDestruct', (_) => _options.selfDestruct);
  this.set('selfDestruct', (d) => { _options.selfDestruct = d; });

  // Element volume = (any mute) ? 0 : v * globalVolume.
  this.set('volume', (v) => {
    _options.volume = v;
    if (_stream) {
      _stream.element.volume =
        (_options.muted || _options.globalMuted) ? 0 : v * Math.clamp(_options.globalVolume);
    }
    return _options.volume;
  });
  this.get('volume', (_) => _options.volume);

  // Resonance gain (post-element). Boost-only with globalVolume.
  this.get('gain', () => _options.gain);
  this.set('gain', (v) => {
    _options.gain = v;
    if (_stream) _stream.source.setGain(_options.gain * Math.max(1, _options.globalVolume));
  });

  this.set('loop', (l) => {
    l = !!l;
    if (_stream) _stream.element.loop = l;
    return (_options.loop = l);
  });
  this.get('loop', (_) => _options.loop);

  this.set('autoplay', (autoplay) => { _options.autoplay = autoplay; });
  this.get('autoplay', (_) => _options.autoplay);
  this.set('preload',  (preload)  => { _options.preload  = preload;  });
  this.get('preload',  (_) => _options.preload);

  this.get('ready',     (_) => self.ready);
  this.get('frequency', (_) => []);
  this.get('activity',  (_) => 0);
  this.get('playing',   (_) => _settings.playing);

  this.set('rolloff', (r) => { _options.rolloff = r; });
  this.get('rolloff', (_) => _options.rolloff);

  this.get('loaded',      (_) => _settings.loaded);
  this.get('currentTime', (_) => _currentTime);
  this.set('currentTime', (t) => { self.seek(t); });
  this.get('duration',    (_) => _stream ? _stream.element.duration : 0);
  this.get('progress',    (_) => self.currentTime / self.duration);

  // Visibility-driven mute with state preservation.
  this.get('visibilityMuted', (_) => _options.muted);
  this.set('visibilityMuted', (muted) => {
    if (true === muted) {
      _options.muteState = _options.muted;
    } else if (undefined !== _options.muteState) {
      muted = _options.muteState;
      delete _options.muteState;
    }
    if (_options.muted !== muted) {
      _options.muted = muted;
      self.volume = self.volume;
    }
  });

  this.get('muted', (_) => _options.muted);
  this.set('muted', (muted) => {
    _options.muted = muted;
    self.volume = self.volume;
  });

  this.set('playbackRate', (v) => { _options.playbackRate = v; });
  this.get('playbackRate', (_) => _options.playbackRate);

  // Directional cone knobs.
  this.get('sourceWidth', () => _options.sourceWidth);
  this.set('sourceWidth', (v) => {
    _options.sourceWidth = v;
    if (_stream) _stream.source.setSourceWidth(_options.sourceWidth);
  });

  this.get('directivitySharpness', () => _options.directivitySharpness);
  this.set('directivitySharpness', (v) => {
    _options.directivitySharpness = v;
    if (_stream) {
      _stream.source.setDirectivityPattern(_options.directivityAlpha, _options.directivitySharpness);
    }
  });

  this.get('directivityAlpha', () => _options.directivityAlpha);
  this.set('directivityAlpha', (v) => {
    _options.directivityAlpha = v;
    if (_stream) {
      _stream.source.setDirectivityPattern(_options.directivityAlpha, _options.directivitySharpness);
    }
  });

  /*
   * Lifecycle: lazy-load then start the element. The per-frame loop
   * pushes spatial pose into the Resonance source.
   */
  this.play = async function () {
    _settings.autoplay = true;
    if (!_settings.src) return;
    _settings.loadingPlay = true;
    if (_settings.loading || _settings.playing) return;
    if (!_settings.loaded) await self.load();

    _settings.playing = true;
    self.volume       = _options.volume;
    self.playbackRate = _options.playbackRate;
    self.startRender(loop);
    _stream.element.currentTime = _currentTime;
    _stream.element.play();
  };

  this.pause = function () {
    _settings.autoplay = false;
    if (!_settings.src || !_settings.loaded || !_settings.playing) return;
    _settings.loadingPlay = false;
    _settings.playing = false;
    if (_stream) _stream.element.pause();
    self.stopRender(loop);
  };

  this.stop = function () {
    _settings.autoplay = false;
    if (!_settings.loaded) return;
    _currentTime = 0;
    if (_stream) {
      _stream.element.pause();
      _stream.element.currentTime = 0;
    }
    _settings.playing = false;
    self.stopRender(loop);
  };

  this.seek = function (time) {
    if (!_settings.src) return;
    _settings.loadingPlay = false;
    const wasPlaying = _settings.playing;
    _currentTime = time;
    if (!_stream) return;
    _stream.element.seek(_currentTime);
    if (wasPlaying) _stream.element.play();
  };

  /*
   * Create the Resonance source via the engine and wire all author-set
   * knobs. Element `onloadeddata` resolves the promise.
   */
  this.load = async function () {
    if (!_settings.src) return;
    if (_settings.loading || _settings.loaded) return;
    _settings.loading = true;

    self.ready = await (async function createBuffer() {
      const promise = Promise.create();
      const url = _settings.src;

      _stream = await Audio3DResonance.createAudioInput(url);
      _stream.element.addEventListener('ended', handleEnded);

      // Re-apply every author-set property now that the source exists.
      self.loop                 = self.loop;
      self.volume               = self.volume;
      self.rolloff              = self.rolloff;
      self.muted                = self.muted;
      self.gain                 = self.gain;
      self.sourceWidth          = self.sourceWidth;
      self.directivitySharpness = self.directivitySharpness;
      self.directivityAlpha     = self.directivityAlpha;

      _stream.element.currentTime  = _currentTime;
      _stream.element.volume       = self.volume;
      _stream.element.onloadeddata = promise.resolve;
      _stream.element.load();
      if (_options.autoplay || _settings.autoplay) self.play();
      return promise;
    })();

    self.events.fire(Events.LOADED);
    _settings.loadingPlay = false;
    _settings.loading     = false;
    _settings.loaded      = true;
  };

  this.unload = function () {
    if (!_settings.src || !_settings.loaded) return;
    self.stop();
    if (!_stream) return;
    _settings.loaded = false;
    _stream.element.removeEventListener('ended', handleEnded);
    Audio3DResonance.unloadStream(_stream);
    _stream = null;
  };
});

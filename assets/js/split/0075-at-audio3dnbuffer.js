/*
 * Audio3DNBuffer — adapter that maps the Audio3D high-level API onto
 * one of three native-shell audio engines:
 *   • 'AVF'  AVFoundation (iOS native, head-relative coords).
 *   • 'MP'   MPAudio (native streaming player).
 *   • 'GVR'  Google VR / Ambisonic (uses world coords; head transform
 *            comes from Audio3DN's loop).
 *
 * Construction (`_backingType`):
 *   Chooses which native API to instantiate when `load()` runs. The
 *   actual backing instance is created lazily on load — that way
 *   `set src` followed by `play()` can pipeline the load behind the
 *   scenes without needing a separate `await load()` from the caller.
 *
 * Per-frame `loop`:
 *   Push position + (AVF only) orientation to the backing. Reference
 *   frame differs:
 *     AVF → listener-relative (audioPositionInverse +
 *           audioOrientationInverse). The native engine has the
 *           listener fixed at origin.
 *     GVR → world-relative (audioPosition). Audio3DN pushes the head
 *           transform separately; GVR computes the relative pose.
 *
 *   Orientation is sent with a fixed "up = (0,1,0)" reference (the
 *   last three args). Forward vector is the euler-decomposed x/y/z.
 *
 * Volume / global state:
 *   `update()` re-pushes globalMuted/volume/playbackRate on UPDATE,
 *   re-triggers the local setters so the backing recomputes.
 *
 * Setters mostly proxy to backing methods (`_backing.volume(v)`,
 * `.loop(l)`, `.setRate(v)`, `.seek(t)`). Backings that don't
 * implement a knob (e.g. AVF doesn't expose duration) leave the
 * getter returning 0.
 *
 * Visibility-mute:
 *   Same state-preservation pattern as Audio3DFallback —
 *   `visibilityMuted(true)` stashes the user mute state, and
 *   `visibilityMuted(false)` restores it.
 *
 * `selfDestruct`:
 *   When set, the END event triggers `self.parent.destroy()` — used
 *   for one-shot SFX where the wrapper should clean itself up after
 *   playback.
 *
 * Lifecycle:
 *   `play()`  — waits for load if necessary, starts the per-frame
 *               loop (so spatial position tracks the scene graph),
 *               seeks to last currentTime, then `_backing.play(loop)`.
 *   `pause()` — saves nothing extra (native preserves position),
 *               stops the loop.
 *   `stop()`  — zeros currentTime, stops loop, stops backing.
 *   `seek(t)` — captures wasPlaying, seeks; if previously playing,
 *               immediately resume (native backings often pause on
 *               seek).
 *   `load()`  — constructs the backing on first call. AVF/MP/GVR have
 *               separate constructors. Hooks onComplete/onUpdate/
 *               onReady. URL is prefixed with AURA.rootPath when not
 *               absolute (native shell relative-URL convention).
 *   `unload()`— stop + destroy the backing.
 *
 * `convolve()` is a stub here — native backings don't support
 * arbitrary convolution.
 */
Class(function Audio3DNBuffer(_backingType) {
  Inherit(this, Audio3DBase);
  const self = this;
  let _backing;
  const _options = {};
  const _settings = { playing: false, loaded: false, loading: false };
  let _currentTime = 0;

  /*
   * Per-frame transform push to the backing. Reference frame depends
   * on backing type. Up vector is hard-coded to (0,1,0).
   */
  function loop() {
    let pos, orientation;
    switch (_backingType) {
      case 'AVF':
        pos = self.audioPositionInverse();
        orientation = self.audioOrientationInverse();
        break;
      case 'GVR':
        pos = self.audioPosition();
    }
    if (!pos || !_backing) return;
    _backing.setPos(pos.x, pos.y, pos.z);
    if (orientation) {
      _backing.setOrientation(
        orientation.x || 0,
        orientation.y || 0,
        orientation.z || 0,
        0, 1, 0,
      );
    }
  }

  // Re-mix global flags into the local state.
  function update(e) {
    _options.globalMuted        = GlobalAudio3D.muted;
    _options.globalVolume       = GlobalAudio3D.volume;
    _options.globalPlaybackRate = GlobalAudio3D.playbackRate;
    self.volume       = self.volume;
    self.playbackRate = self.playbackRate;
  }

  Audio3DN.audioContext();

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
  })();

  (function addListeners() {
    self.events.sub(GlobalAudio3D, Events.UPDATE, update);
  })();

  // Changing src tears down + lazy-reloads on next tick (autoplay or
  // preload triggers immediate load).
  this.set('src', (src) => {
    self.stop();
    _settings.src = src;
    defer((_) => {
      if (_options.autoplay) return self.play();
      if (_options.preload)  self.load();
      self.volume = _options.volume;
    });
  });
  this.get('src', (_) => _settings.src);

  this.get('selfDestruct', (_) => _options.selfDestruct);
  this.set('selfDestruct', (d) => { _options.selfDestruct = d; });

  this.set('volume', (v) => {
    _options.volume = v;
    if (_backing) _backing.volume(v);
    return _options.volume;
  });
  this.get('volume', (_) => _options.volume);

  this.set('loop', (l) => {
    l = !!l;
    if (_backing) _backing.loop(l);
    return (_options.loop = l);
  });
  this.get('loop', (_) => _options.loop);

  this.set('autoplay', (autoplay) => { _options.autoplay = autoplay; });
  this.get('autoplay', (_) => _options.autoplay);

  this.set('preload', (preload) => { _options.preload = preload; });
  this.get('preload', (_) => _options.preload);

  this.get('ready',     (_) => self.ready);
  this.get('frequency', (_) => []);
  this.get('activity',  (_) => 0);
  this.get('playing',   (_) => _settings.playing);

  this.set('rolloff', (r) => { _options.rolloff = r; });
  this.get('rolloff', (_) => _options.rolloff);

  this.get('loaded',      (_) => _settings.loaded);
  this.get('currentTime', (_) => _currentTime);
  this.set('currentTime', (t) => { self.seek(t); });
  this.get('duration',    (_) => 0);
  this.get('progress',    (_) => self.currentTime / self.duration);

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

  this.set('playbackRate', (v) => {
    _options.playbackRate = v;
    if (_backing) _backing.setRate(v);
  });
  this.get('playbackRate', (_) => _options.playbackRate);

  /*
   * Play. Loads on first call. Starts the per-frame loop (so spatial
   * transform tracks the scene) and seeks to the last currentTime
   * before kicking the backing.
   */
  this.play = async function () {
    _settings.autoplay = true;
    if (!_settings.src) return;
    _settings.loadingPlay = true;
    if (_settings.loading || _settings.playing) return;
    if (!_settings.loaded) await self.load();

    _settings.playing  = true;
    self.volume        = _options.volume;
    self.playbackRate  = _options.playbackRate;
    self.startRender(loop);
    _backing.seek(_currentTime);
    _backing.play(_options.loop);
  };

  this.pause = function () {
    _settings.autoplay = false;
    if (!_settings.src || !_settings.loaded || !_settings.playing) return;
    _settings.loadingPlay = false;
    _settings.playing = false;
    if (_backing) _backing.pause();
    self.stopRender(loop);
  };

  this.stop = function () {
    _settings.autoplay = false;
    if (!_settings.loaded) return;
    _currentTime = 0;
    if (_backing) _backing.stop();
    _settings.playing = false;
    self.stopRender(loop);
  };

  this.seek = function (time) {
    if (!_settings.src) return;
    _settings.loadingPlay = false;
    const wasPlaying = _settings.playing;
    _currentTime = time;
    if (!_backing) return;
    _backing.seek(_currentTime);
    if (wasPlaying) _backing.play();
  };

  /*
   * Construct the native backing on first call. AURA's rootPath prefix
   * is applied for relative URLs (native shell convention).
   *
   * Wires:
   *   onComplete → END event (+ optional selfDestruct).
   *   onUpdate(t) → currentTime tracking.
   *   onReady → resolves the load promise.
   */
  this.load = async function () {
    if (!_settings.src) return;
    if (_settings.loading || _settings.loaded) return;
    _settings.loading = true;

    self.ready = await (function createBuffer() {
      const promise = Promise.create();
      let url = _settings.src;
      if (!url.includes('http')) url = AURA.rootPath + url;

      switch (_backingType) {
        case 'AVF': _backing = AVFSound.create(url); break;
        case 'MP':  _backing = new MPAudio(url);     break;
        case 'GVR': _backing = new GVRAudio(url);    break;
      }

      _backing.onComplete = (_) => {
        self.events.fire(Events.END);
        if (_options.selfDestruct) self.parent.destroy();
      };
      _backing.onUpdate = (t) => { _currentTime = t; };
      _backing.onReady  = promise.resolve;
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
    _backing.destroy();
  };

  // Native backings don't support arbitrary convolution.
  this.convolve = async function (src) {};
});

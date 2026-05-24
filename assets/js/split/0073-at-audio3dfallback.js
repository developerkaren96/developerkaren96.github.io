/*
 * Audio3DFallback — the lowest-common-denominator backend: a plain
 * HTMLAudioElement managed through Audio3DWA's stream helpers. Used
 * when WebAudio is unavailable or explicitly disabled (`options.fallback`,
 * `GlobalAudio3D.fallback`).
 *
 * State buckets:
 *   `_options`   — author-set knobs (volume, loop, autoplay, etc.) +
 *                   mirrored GlobalAudio3D values (globalMuted, etc.).
 *   `_settings`  — runtime state (src, playing/loaded/loading flags,
 *                   internal autoplay latch).
 *   `_currentTime` — preserved seek time across pause/stop cycles.
 *
 * Volume math:
 *   The element's actual volume is
 *     `(muted || globalMuted) ? 0 : v * clamp(globalVolume)`.
 *   So whenever any global flag changes (UPDATE event), or local mute
 *   toggles, we re-assign `self.volume = self.volume` to retrigger the
 *   setter, which recomputes the element volume.
 *
 * Setter quirks:
 *   `visibilityMuted(true)` records the prior mute state into
 *   `_options.muteState` so on `visibilityMuted(false)` we restore it
 *   exactly — important so a user-driven mute survives a tab-blur
 *   round-trip.
 *
 *   `playbackRate` setter mixes in `globalPlaybackRate` before writing
 *   to the element. Likewise re-mixed when global rate changes via
 *   the UPDATE listener.
 *
 * Stream lifecycle:
 *   On first play(), `Audio3DWA.loadStream(src)` returns a shared
 *   stream wrapper around an `<audio>` element. We hook `onended` to
 *   call unload() and republish END. Subsequent plays reuse the same
 *   stream. `unload` halts playback (the actual element teardown
 *   happens when no other consumer of the stream remains).
 *
 *   `set('src')` destroys the current stream (via `Audio3DWA.unloadStream`)
 *   then stashes the new src — actual element creation is lazy on play().
 *
 * Pause/stop:
 *   `pause` captures `currentTime` for resume. `stop` zeros it and
 *   tries `stop()` then `currentTime=0` (older browsers / Safari can
 *   throw when seeking on an unloaded element; we swallow).
 *
 * `ready` flag (from initOptions):
 *   When GlobalAudio3D fires READY we re-init defaults and respect
 *   the autoplay flag — sounds constructed before user interaction
 *   queue their autoplay this way.
 *
 * Audio3DFallback can't truly spatialize (no panner). It honors the
 * positional API surface for compatibility (rolloff setter accepts
 * but ignores values; getters return 0 / empty).
 */
Class(function Audio3DFallback() {
  Inherit(this, Audio3DBase);
  const self = this;
  let _stream;
  const _options = {};
  const _settings = { playing: false, loaded: false, loading: false };
  let _currentTime = 0;

  function initOptions() {
    _options.loop         = _options.loop         || false;
    _options.autoplay     = _options.autoplay     || false;
    _options.volume       = undefined === _options.volume ? 1 : _options.volume;
    _options.playbackRate = _options.playbackRate || 1;
    _options.preload      = _options.preload      || false;
    _options.muted        = _options.muted        || false;
    _options.rolloff      = _options.rolloff      || 1;
    _options.globalMuted        = GlobalAudio3D.muted;
    _options.globalVolume       = GlobalAudio3D.volume;
    _options.globalPlaybackRate = GlobalAudio3D.playbackRate;
  }

  // Re-mix global values into the local element on global UPDATE.
  function update(e) {
    _options.globalMuted        = GlobalAudio3D.muted;
    _options.globalVolume       = GlobalAudio3D.volume;
    _options.globalPlaybackRate = GlobalAudio3D.playbackRate;
    self.volume       = self.volume;        // re-trigger setter
    self.playbackRate = self.playbackRate;
  }

  // GlobalAudio3D became ready post-construction: honor autoplay now.
  function ready() {
    initOptions();
    if (_settings.autoplay || _options.autoplay) self.play();
  }

  initOptions();
  (function addListeners() {
    self.events.sub(GlobalAudio3D, Events.UPDATE, update);
    self.events.sub(GlobalAudio3D, Events.READY,  ready);
  })();

  this.set('src', (src) => {
    self.unload();
    (function destroyStream() {
      if (_stream && _stream.element) {
        Audio3DWA.unloadStream(_settings.src);
        _stream = null;
      }
    })();
    _settings.src = src;
  });
  this.get('src', (_) => _settings.src);

  // Volume math: clamp + apply mute + multiply by global volume.
  this.set('volume', (v) => {
    v = Math.clamp(v, 0, 1);
    _options.volume = v;
    if (_stream && _stream.element) {
      _stream.element.volume =
        (_options.muted || _options.globalMuted) ? 0 : v * Math.clamp(_options.globalVolume);
    }
    return _options.volume;
  });
  this.get('volume', (_) => _options.volume);

  this.set('loop', (l) => {
    l = !!l;
    if (_stream) _stream.element.loop = l;
    return (_options.loop = l);
  });
  this.get('loop', (_) => _options.loop);

  this.set('autoplay', (autoplay) => { _options.autoplay = autoplay; });
  this.get('autoplay', (_) => _options.autoplay);

  this.set('preload', (preload) => { _options.preload = preload; });
  this.get('preload', (_) => _options.preload);

  this.get('ready', (_) => self.ready);

  // Stubs for spatial fields the fallback can't do.
  this.get('frequency', (_) => 0);
  this.get('activity',  (_) => 0);
  this.get('playing',   (_) => _settings.playing);
  this.set('rolloff',   (r) => {});
  this.get('rolloff',   (_) => 0);
  this.get('loaded',    (_) => true);

  this.get('duration',    (_) => _stream ? _stream.element.duration    : 0);
  this.get('currentTime', (_) => _stream ? _stream.element.currentTime : 0);
  this.set('currentTime', (t) => { self.seek(t); });
  this.get('progress',    (_) => self.currentTime / self.duration);

  this.set('playbackRate', (v) => {
    _options.playbackRate = v;
    if (_stream && _stream.element) {
      _stream.element.playbackRate = v * _options.globalPlaybackRate;
    }
  });
  this.get('playbackRate', (_) => _options.playbackRate);

  // Visibility-driven mute with state preservation across blur/focus.
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

  /*
   * Play: lazy-build the stream on first call (gives time for src to
   * settle), wire onended → unload + END, apply current volume/loop/
   * mute, then start. Try to restore currentTime (older Safari can
   * throw before metadata loads — swallow).
   */
  this.play = function () {
    _settings.autoplay = true;
    if (!_settings.src || !GlobalAudio3D.initialized) return;

    (function createStream() {
      if (_stream) return;
      _stream = Audio3DWA.loadStream(_settings.src);
      _stream.element.onended = (_) => {
        self.unload();
        self.events.fire(Events.END);
      };
      self.loop    = self.loop;
      self.volume  = self.volume;
      self.rolloff = self.rolloff;
      self.muted   = self.muted;
      if (_options.autoplay || _settings.autoplay) self.play();
    })();

    if (true === _settings.playing) return;
    _settings.playing = true;
    self.volume = _options.volume;
    if (!_stream) return;

    _stream.element.playbackRate = _options.playbackRate;
    _stream.element.play();
    try { _stream.element.currentTime = _currentTime; } catch (e) {}
  };

  this.pause = function () {
    _settings.autoplay = false;
    if (!_stream || !GlobalAudio3D.initialized || !_settings.src || !_settings.playing) return;
    try { _currentTime = _stream.element.currentTime; } catch (e) {}
    _stream.element.pause();
    _settings.playing = false;
  };

  this.stop = function () {
    _settings.autoplay = false;
    if (!_settings.src || !GlobalAudio3D.initialized) return;
    _currentTime = 0;
    _settings.playing = false;
    if (!_stream || !_stream.element || !_stream.element.stop) return;
    _stream.element.stop();
    try { _stream.element.currentTime = 0; } catch (e) {}
  };

  this.seek = function (time) {
    if (!_settings.src) return;
    _currentTime = time;
    if (!_stream || !_stream.element) return;
    try { _stream.element.currentTime = time; } catch (e) {}
  };

  // Fallback doesn't pre-decode; load is a no-op declaring success.
  this.load   = function () { return true; };
  this.unload = function () {
    _settings.autoplay = false;
    if (_stream && _settings.src) self.stop();
  };

  this.convolve = function (src) {};
});

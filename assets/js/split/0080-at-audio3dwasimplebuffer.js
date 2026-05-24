/*
 * Audio3DWASimpleBuffer — WebAudio backend for non-spatial buffer
 * playback. Strips the panner / analyser / convolver / delay from the
 * full Audio3DWABuffer pipeline. Used by SFXController for one-shot
 * UI sounds where 3D positioning is wasted overhead.
 *
 * Audio graph:
 *
 *   bufferSource(_stream)
 *      → gain(_gain)                  // mute/volume
 *      → biquad lowpass(_filter)      // muffle effect (16 kHz cutoff)
 *      → destination
 *
 * `_filter` is a lowpass starting at 16 kHz cutoff — full bandwidth.
 * The MESSAGE event from GlobalAudio3D carries `{isMuffled}`; on
 * receipt, `muffle` tweens the cutoff between 16 kHz (clear) and
 * 500 Hz (muffled) over 500ms via `logLerp` — log interpolation so the
 * audible transition is perceptually linear.
 *
 * Per-instance handlers:
 *   UPDATE  → re-mix global mute/volume/playbackRate.
 *   READY   → context was rebuilt; tear down + recreate graph; autoplay
 *             if queued.
 *   MESSAGE → muffle/unmuffle the lowpass cutoff.
 *
 * Lifecycle is similar to WABuffer but with no per-frame loop because
 * there's no spatial source to update. Stream `onended` automatically
 * stops + (if selfDestruct) destroys.
 *
 * `destroyStream(fromPause)`:
 *   `fromPause=true` suppresses the END event (caller is just pausing,
 *   not finishing). Try/catch around `_stream.stop()` because stopping
 *   a never-started or already-stopped BufferSource throws.
 *
 * `seek(time)`:
 *   Note: clears `_stream.onended` before calling `stop()` so the
 *   onended → END event doesn't fire during a seek. Then resumes if
 *   was playing.
 *
 * `convolve()` is a no-op stub — SimpleBuffer doesn't expose the
 * convolver.
 */
Class(function Audio3DWASimpleBuffer() {
  Inherit(this, Audio3DBase);
  const self = this;
  let _context, _buffer, _stream, _gain, _filter;
  const _options  = {};
  const _settings = { playing: false, loaded: false, loading: false };
  let _currentTime = 0;

  // Build the simplified graph: gain → lowpass → destination.
  function initContext() {
    _context = Audio3DWA.audioContext();
    _filter  = _context.createBiquadFilter();
    _filter.type = 'lowpass';
    _filter.fValue = 16000;
    _filter.frequency.value = 16000;
    _filter.connect(_context.destination);
    _gain = _context.createGain ? _context.createGain() : _context.createGainNode();
    _gain.connect(_filter);
  }

  function initOptions() {
    _options.loop         = _options.loop         || false;
    _options.autoplay     = _options.autoplay     || false;
    _options.volume       = undefined === _options.volume ? 1 : _options.volume;
    _options.playbackRate = _options.playbackRate || 1;
    _options.preload      = _options.preload      || false;
    _options.muted        = _options.muted        || false;
    _options.selfDestruct = _options.selfDestruct || false;
    _options.globalMuted        = GlobalAudio3D.muted;
    _options.globalVolume       = GlobalAudio3D.volume;
    _options.globalPlaybackRate = GlobalAudio3D.playbackRate;
  }

  function destroyBuffer() {
    if (!_buffer || !_stream) return;
    _settings.loaded = false;
    _stream.disconnect(_gain);
    _gain.disconnect(_filter);
    _filter.disconnect(_context.destination);
    _buffer.stop();
    _buffer = null;
    Audio3DWA.unloadBuffer(_settings.src);
  }

  async function createStream() {
    if (_stream) return;
    _stream = _context.createBufferSource();
    _stream.buffer       = _buffer.buffer;
    _stream.loop         = _options.loop;
    _stream.playbackRate = _options.playbackRate;
    _stream.onended = (_) => {
      self.stop();
      if (_options.selfDestruct) self.parent.destroy();
    };
    self.volume  = self.volume;
    self.rolloff = self.rolloff;
    self.muted   = self.muted;
    _stream.connect(_gain);
    if (_settings.loadingPlay) _stream.start(0, _currentTime);
  }

  function destroyStream(fromPause = false) {
    if (!_stream) return;
    _stream.disconnect(_gain);
    try {
      _stream.stop();
      if (!fromPause) self.events.fire(Events.END);
    } catch (e) {}
    _stream = null;
  }

  /*
   * Muffle effect — log-lerp the lowpass cutoff between full
   * bandwidth (16 kHz) and muffled (500 Hz). 500ms tween. Triggered by
   * GlobalAudio3D MESSAGE with {isMuffled} payload, typically used for
   * underwater/portal/wall-occluded scenes.
   */
  function muffle({ isMuffled }) {
    const logLerp = (a, b, t) => Math.exp((1 - t) * Math.log(a) + t * Math.log(b));
    const obj = { value: 0 };
    tween(obj, { value: 1 }, 500, 'linear').onUpdate((_) => {
      const t = isMuffled ? 1 - obj.value : obj.value;
      _filter.fValue = logLerp(500, 16000, t);
      _filter.frequency.value = logLerp(500, 16000, t);
    });
  }

  function update(e) {
    _options.globalMuted        = GlobalAudio3D.muted;
    _options.globalVolume       = GlobalAudio3D.volume;
    _options.globalPlaybackRate = GlobalAudio3D.playbackRate;
    self.volume       = self.volume;
    self.playbackRate = self.playbackRate;
  }

  function ready() {
    destroyBuffer();
    destroyStream();
    _context = _gain = null;
    initContext();
    initOptions();
    if (_options.autoplay || _settings.autoplay) self.play();
  }

  initContext();
  initOptions();
  (function addListeners() {
    self.events.sub(GlobalAudio3D, Events.UPDATE,  update);
    self.events.sub(GlobalAudio3D, Events.READY,   ready);
    self.events.sub(GlobalAudio3D, Events.MESSAGE, muffle);
  })();

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
    if (_gain) {
      _gain.gain.value = (_options.muted || _options.globalMuted) ? 0 : v * _options.globalVolume;
    }
    return _options.volume;
  });
  this.get('volume', (_) => _options.volume);

  this.set('loop', (l) => {
    l = !!l;
    if (_stream) _stream.loop = l;
    return (_options.loop = l);
  });
  this.get('loop', (_) => _options.loop);

  this.set('autoplay', (autoplay) => { _options.autoplay = autoplay; });
  this.get('autoplay', (_) => _options.autoplay);
  this.set('preload',  (preload)  => { _options.preload  = preload;  });
  this.get('preload',  (_) => _options.preload);

  this.get('ready',   (_) => self.ready);
  this.get('playing', (_) => _settings.playing);
  this.get('loaded',  (_) => _settings.loaded);

  this.get('currentTime', (_) =>
    _context && _buffer ? _context.currentTime % _buffer.buffer.duration : 0,
  );
  this.set('currentTime', (t) => { self.seek(t); });

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
    if (_stream) _stream.playbackRate.value = v * _options.globalPlaybackRate;
  });
  this.get('playbackRate', (_) => _options.playbackRate);

  this.get('duration', (_) => _buffer ? _buffer.buffer.duration : 0);
  this.get('progress', (_) => self.currentTime / self.duration);
  this.get('context',  (_) => _context);
  this.get('stream',   (_) => _stream);
  this.get('buffer',   (_) => _buffer);

  this.play = async function () {
    _settings.autoplay = true;
    if (!_settings.src || !GlobalAudio3D.initialized) return;
    _settings.loadingPlay = true;
    if (_stream || _settings.loading || _settings.playing) return;
    if (!_settings.loaded) await self.load();
    await createStream();
    _settings.playing = true;
    self.volume = _options.volume;
  };

  this.pause = function () {
    _settings.autoplay = false;
    if (!_stream || !GlobalAudio3D.initialized || !_settings.src || !_settings.loaded || !_settings.playing) return;
    _currentTime = _context.currentTime;
    destroyStream(true); // fromPause: suppress END
    _settings.loadingPlay = false;
    _settings.playing = false;
  };

  this.stop = function () {
    _settings.autoplay = false;
    if (!_settings.src || !GlobalAudio3D.initialized || !_settings.loaded) return;
    _currentTime = 0;
    destroyStream();
    _settings.loading     = false;
    _settings.loaded      = false;
    _settings.loadingPlay = false;
    _settings.playing     = false;
  };

  this.seek = function (time) {
    if (!_settings.src) return;
    _settings.loadingPlay = false;
    const wasPlaying = _settings.playing;
    if (_stream) _stream.onended = null;  // suppress END during stop()
    self.stop();
    _currentTime = time;
    if (wasPlaying) self.play();
  };

  this.load = async function () {
    if (!_settings.src) return;
    if (_settings.loading || _settings.loaded) return;
    _settings.loading = true;

    self.ready = await (async function createBuffer() {
      _buffer = _context.createBufferSource();
      _buffer.buffer = await Audio3DWA.loadBuffer(_settings.src);
      _settings.loaded = true;
    })();
    await createStream();
    if (!_options.autoplay && !_settings.loadingPlay) {
      _stream.onended = null;
      destroyStream();
    }

    self.events.fire(Events.LOADED);
    _settings.loadingPlay = false;
    _settings.loading     = false;
    _settings.loaded      = true;
  };

  this.unload = function () {
    if (!_settings.src || !_settings.loaded) return;
    self.stop();
    destroyBuffer();
  };

  // SimpleBuffer doesn't expose convolver.
  this.convolve = async function (src) {};
});

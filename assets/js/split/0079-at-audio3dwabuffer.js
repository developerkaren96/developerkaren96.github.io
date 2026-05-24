/*
 * Audio3DWABuffer — WebAudio backend for fully-decoded buffer playback
 * (vs WA-Stream which streams a media element, and WA-SimpleBuffer
 * which omits the spatial panner). The "buffer" path gives the
 * tightest latency and most control because the audio is decoded once
 * and re-played from memory.
 *
 * Audio graph (signal flow):
 *
 *   bufferSource(_stream)
 *      → panner(_panner)          // 3D spatialization (position only)
 *      → gain(_gain)              // master/mute/volume
 *      → [convolver]              // optional impulse-response
 *      → biquad lowshelf(_filter) // tone shaping
 *      → delay(_delay)            // fixed-buffer delay (10s max)
 *      → analyser(_analyser)      // FFT for `frequency`/`activity`
 *      → destination
 *
 *   `_buffer` is a separate BufferSource that owns the decoded
 *   AudioBuffer (`_buffer.buffer`); it's split from `_stream` because
 *   BufferSources are one-shot (can only be started once) so a fresh
 *   `_stream` is created per play.
 *
 * Per-frame `loop`:
 *   For modern AudioListener interface (`listener.forwardX` exists),
 *   subtract listener position from source position to get
 *   listener-relative coords (panner moves in world space, but the
 *   listener is at origin in the new API). Legacy API gets raw world
 *   coords.
 *
 * `initContext`:
 *   Build the node graph. `lowshelf` filter starts neutral
 *   (frequency=0, gain=1); analyser fftSize=32 means
 *   frequencyBinCount=16 — small to keep `activity` cheap. Wire
 *   the graph: panner → gain → (convolver?) → filter → delay → analyser
 *   → destination.
 *
 * `destroyBuffer`:
 *   Tear down the buffer + disconnect every edge. Wrapped in try/catch
 *   because re-disconnecting an already-disconnected node throws.
 *
 * `createStream`:
 *   Create a fresh BufferSource fed by the cached _buffer.buffer.
 *   `_stream.start(0, _currentTime)` if loadingPlay was set (i.e.,
 *   user already called play() during load).
 *
 * `destroyStream`:
 *   Stop + disconnect. try/catch swallows re-stop errors.
 *
 * `update` listener (on GlobalAudio3D.UPDATE):
 *   Re-mix global mute/volume/playbackRate by retriggering setters.
 *
 * `ready` listener (on GlobalAudio3D.READY):
 *   The audio context may have been re-created (device change). Tear
 *   down + rebuild the entire node graph + re-apply convolution if it
 *   was set. Autoplay if it was queued.
 *
 * Volume math (same pattern as fallback/resonance):
 *   `_gain.gain.value = (muted || globalMuted) ? 0 : v * globalVolume`.
 *
 * `playbackRate` is an AudioParam — write `.value` directly so it
 * applies on the current playback without re-creating the stream.
 *
 * Lifecycle:
 *   play()    — lazy-load if needed, fresh createStream, set
 *               _settings.playing, start renderloop for spatial
 *               updates.
 *   pause()   — capture currentTime, destroy the stream (BufferSource
 *               can't be paused/resumed; we re-create on play).
 *   stop()    — zero out and destroy stream.
 *   seek(t)   — stop + recreate with offset.
 *   load()    — decode (via Audio3DWA.loadBuffer), create the BufferSource
 *               but if no autoplay was queued, immediately destroy so
 *               the source isn't held open.
 *   convolve(src) — load IR buffer, splice convolver into the chain
 *               between gain and filter. `false` removes the convolver.
 */
Class(function Audio3DWABuffer() {
  Inherit(this, Audio3DBase);
  const self = this;
  let _context, _buffer, _stream, _gain, _panner, _analyser, _filter, _delay, _convolver;
  let _position, _frequency, _convolution;
  const _options  = {};
  const _settings = { playing: false, loaded: false, loading: false };
  let _currentTime = 0;

  // Per-frame: push position into panner with API-version branching.
  function loop() {
    if (!_context) return;
    _position = _context.listener.forwardX
      ? self.audioPosition().sub(self.listenerPosition()) // new API: listener-relative
      : self.audioPosition();                              // legacy: world
    _panner.setPosition(_position.x, _position.y, _position.z);
  }

  // Build audio node graph: panner → gain → [convolver] → filter →
  // delay → analyser → destination.
  function initContext() {
    _context  = Audio3DWA.audioContext();
    _gain     = _context.createGain ? _context.createGain() : _context.createGainNode();
    _panner   = _context.createPanner();
    _filter   = _context.createBiquadFilter();
    _filter.type = 'lowshelf';
    _filter.frequency.value = 0;
    _filter.gain.value      = 1;
    _analyser = _context.createAnalyser();
    _delay    = _context.createDelay(10);
    _delay.delayTime.value  = 0;
    _analyser.fftSize       = 32;
    _frequency = new Uint8Array(_analyser.frequencyBinCount);

    _analyser.connect(_context.destination);
    _delay.connect(_analyser);
    _filter.connect(_delay);
    if (_convolver) {
      _convolver.connect(_filter);
      _gain.connect(_convolver);
    } else {
      _gain.connect(_filter);
    }
    _panner.connect(_gain);
  }

  function initOptions() {
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
  }

  function destroyBuffer() {
    if (!_buffer || !_stream) return;
    _settings.loaded = false;
    try {
      _stream.disconnect(_panner);
      if (_convolver) {
        _convolver.disconnect(_filter);
        _gain.disconnect(_convolver);
      } else {
        _gain.disconnect(_filter);
      }
      _analyser.disconnect(_context.destination);
      _buffer.stop();
      _buffer = null;
      Audio3DWA.unloadBuffer(_settings.src);
    } catch (e) {}
  }

  // Create a one-shot BufferSource for play. BufferSources can only be
  // started once; we recreate per play.
  async function createStream() {
    if (_stream) return;
    _stream = _context.createBufferSource();
    _stream.buffer       = _buffer.buffer;
    _stream.loop         = _options.loop;
    _stream.playbackRate = _options.playbackRate;
    _stream.onended = (_) => {
      if (self && self.stop) {
        self.stop();
        self.events.fire(Events.END);
        if (_options.selfDestruct) self.parent.destroy();
      }
    };
    self.volume  = self.volume;
    self.rolloff = self.rolloff;
    self.muted   = self.muted;
    _stream.connect(_panner);
    if (_settings.loadingPlay) _stream.start(0, _currentTime);
  }

  function destroyStream() {
    if (!_stream) return;
    try { _stream.disconnect(_panner); _stream.stop(); } catch (e) {}
    _stream = null;
  }

  function update(e) {
    _options.globalMuted        = GlobalAudio3D.muted;
    _options.globalVolume       = GlobalAudio3D.volume;
    _options.globalPlaybackRate = GlobalAudio3D.playbackRate;
    self.volume       = self.volume;
    self.playbackRate = self.playbackRate;
  }

  // Context was re-created (device change). Rebuild the graph.
  function ready() {
    destroyBuffer();
    destroyStream();
    _context = _gain = _panner = _analyser = _delay = _frequency = _filter = null;
    initContext();
    initOptions();
    if (_convolution) self.convolve(_convolution);
    if (_options.autoplay || _settings.autoplay) self.play();
  }

  (async function init() {
    initContext();
    initOptions();
    self.events.sub(GlobalAudio3D, Events.UPDATE, update);
    self.events.sub(GlobalAudio3D, Events.READY,  ready);
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

  this.get('ready', (_) => self.ready);

  // FFT readout. Sum bins 3..13 as a compact loudness metric.
  this.get('frequency', (_) => {
    if (!_analyser) return [];
    _analyser.getByteFrequencyData(_frequency);
    return _frequency;
  });
  this.get('activity', (_) => {
    if (!_analyser) return 0;
    _analyser.getByteFrequencyData(_frequency);
    return Math.clamp(_frequency.slice(3, 13).reduce((n1, n2) => n1 + n2, 0) / 2560, 0, 1);
  });
  this.get('playing', (_) => _settings.playing);

  this.set('rolloff', (r) => {
    _options.rolloff = r;
    if (_panner) _panner.rolloffFactor = r;
  });
  this.get('rolloff', (_) => _options.rolloff);
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

  // Direct access to audio graph nodes for advanced users.
  this.get('filter',   (_) => _filter);
  this.get('delay',    (_) => _delay);
  this.get('panner',   (_) => _panner);
  this.get('duration', (_) => _buffer ? _buffer.buffer.duration : 0);
  this.get('progress', (_) => self.currentTime / self.duration);
  this.get('context',  (_) => _context);
  this.get('stream',   (_) => _stream);
  this.get('buffer',   (_) => _buffer);

  /*
   * Play: lazy-load then create a fresh BufferSource. _settings.playing
   * flips before the per-frame loop starts pushing spatial updates.
   */
  this.play = async function () {
    _settings.autoplay = true;
    if (!_settings.src || !GlobalAudio3D.initialized) return;
    _settings.loadingPlay = true;
    if (_stream || _settings.loading || _settings.playing) return;
    if (!_settings.loaded) await self.load();
    await createStream();
    _settings.playing = true;
    self.volume = _options.volume;
    self.startRender(loop);
  };

  this.pause = function () {
    _settings.autoplay = false;
    if (!_stream || !GlobalAudio3D.initialized || !_settings.src || !_settings.loaded || !_settings.playing) return;
    _currentTime = _context.currentTime;
    destroyStream();
    _settings.loadingPlay = false;
    _settings.playing = false;
    self.stopRender(loop);
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
    self.stopRender(loop);
  };

  this.seek = function (time) {
    if (!_settings.src) return;
    _settings.loadingPlay = false;
    const wasPlaying = _settings.playing;
    self.stop();
    _currentTime = time;
    if (wasPlaying) self.play();
  };

  /*
   * Load: decode via Audio3DWA buffer cache. If no play was queued,
   * destroy the just-created stream so it doesn't sit open.
   */
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
    if (!_options.autoplay && !_settings.loadingPlay) destroyStream();

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

  /*
   * Splice/remove convolver between _gain and _filter. `false` removes
   * it. Otherwise loads the IR buffer (via the WA buffer cache) and
   * sets it on the convolver.
   */
  this.convolve = async function (src) {
    _convolution = src;
    if (false === src) {
      if (_convolver) {
        _convolver.disconnect();
        _gain.disconnect();
        _gain.connect(_filter);
        _convolver = null;
      }
      return;
    }
    const buffer = await Audio3DWA.loadBuffer(src);
    if (!_convolver) {
      _convolver = _context.createConvolver();
      _gain.disconnect();
      _convolver.connect(_filter);
      _gain.connect(_convolver);
    }
    _convolver.buffer = buffer;
  };
});

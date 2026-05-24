/*
 * Audio3DWAStream — WebAudio backend that wires an HTMLAudioElement
 * through a spatial graph (vs WABuffer which decodes the full file
 * into memory). Used for long/streaming audio (music, ambience) where
 * holding the decoded buffer would waste memory.
 *
 * Audio graph (identical chain shape to WABuffer but fed by a media
 * element source from Audio3DWA.loadStream):
 *
 *   _stream.source (MediaElementAudioSourceNode)
 *      → panner(_panner)            // 3D spatialization
 *      → gain(_gain)                // master/mute
 *      → [convolver]                // optional IR
 *      → biquad lowshelf(_filter)   // tone shaping
 *      → delay(_delay)              // 10s max buffer
 *      → analyser(_analyser)        // FFT
 *      → destination
 *
 * Stream sharing via Audio3DWA.loadStream:
 *   `loadStream(url)` is refcounted — multiple WAStream instances on
 *   the same URL share an element + MediaElementSource. unload(url)
 *   decrements; when refcount hits 0, the element returns to the pool.
 *
 * Per-frame `loop`:
 *   Same listener-relative vs world position branching as WABuffer.
 *   Pushed via `_panner.setPosition`.
 *
 * `createStream`:
 *   Call into Audio3DWA.loadStream, wire 'ended' handler, build the
 *   chain panner → gain → [convolver?] → filter → delay → analyser →
 *   destination. Re-apply all author properties. If autoplay was
 *   queued, kick off play() now.
 *
 * `destroyStream`:
 *   Just disconnects from the panner and removes the ended listener.
 *   Element returns to the pool via Audio3DWA.unloadStream(url) in
 *   `unload()`, not here — so pause/resume share the element.
 *
 * `handleEnded`:
 *   Element fired 'ended' → unload + fire END to listeners.
 *
 * `ready` (on GlobalAudio3D.READY):
 *   Context rebuilt; tear down stream, rebuild nodes, re-apply
 *   convolution, autoplay if queued.
 *
 * `loaded` getter always returns true — streaming has no decode-then-
 * play distinction; the element loads as it plays.
 *
 * `convolve(src)`:
 *   Splice/remove convolver between gain and analyser. Note: this
 *   inserts before the *analyser*, not before the filter as in
 *   WABuffer. (Different graph topology for streams vs buffers.)
 */
Class(function Audio3DWAStream() {
  Inherit(this, Audio3DBase);
  const self = this;
  let _context, _stream, _gain, _panner, _analyser, _filter, _delay, _convolver;
  let _position, _frequency, _convolution;
  const _options  = {};
  const _settings = { playing: false, loaded: false, loading: false };
  let _currentTime = 0;

  function loop() {
    if (!_context) return;
    _position = _context.listener.forwardX
      ? self.audioPosition().sub(self.listenerPosition())
      : self.audioPosition();
    _panner.setPosition(_position.x, _position.y, _position.z);
  }

  function initContext() {
    _context  = Audio3DWA.audioContext();
    _gain     = _context.createGain ? _context.createGain() : _context.createGainNode();
    _panner   = _context.createPanner();
    _analyser = _context.createAnalyser();
    _analyser.fftSize = 32;
    _frequency = new Uint8Array(_analyser.frequencyBinCount);
    _filter = _context.createBiquadFilter();
    _filter.type = 'lowshelf';
    _filter.frequency.value = 0;
    _filter.gain.value      = 1;
    _delay = _context.createDelay(10);
    _delay.delayTime.value = 0;
  }

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

  // Wire the streaming element through the spatial chain.
  function createStream() {
    if (_stream) return;
    _stream = Audio3DWA.loadStream(_settings.src);
    _stream.element.addEventListener('ended', handleEnded);

    self.loop    = self.loop;
    self.volume  = self.volume;
    self.rolloff = self.rolloff;
    self.muted   = self.muted;

    _stream.source.connect(_panner);
    _panner.connect(_gain);
    if (_convolver) {
      _gain.connect(_convolver);
      _convolver.connect(_filter);
    } else {
      _gain.connect(_filter);
    }
    _filter.connect(_delay);
    _delay.connect(_analyser);
    _analyser.connect(_context.destination);
    _stream.element.currentTime = _currentTime;

    if (_options.autoplay || _settings.autoplay) self.play();
  }

  function destroyStream() {
    if (!_stream) return;
    _stream.element.removeEventListener('ended', handleEnded);
    _stream.source.disconnect(_panner);
    _stream = null;
  }

  function update(e) {
    _options.globalMuted        = GlobalAudio3D.muted;
    _options.globalVolume       = GlobalAudio3D.volume;
    _options.globalPlaybackRate = GlobalAudio3D.playbackRate;
    self.volume       = self.volume;
    self.playbackRate = self.playbackRate;
  }

  function ready() {
    destroyStream();
    _context = _gain = _panner = _analyser = _delay = _filter = _frequency = null;
    initContext();
    initOptions();
    if (_convolution) self.convolve(_convolution);
    if (_settings.autoplay || _options.autoplay) self.play();
  }

  function handleEnded() {
    self.unload();
    self.events.fire(Events.END);
  }

  initOptions();
  initContext();
  (function addListeners() {
    self.events.sub(GlobalAudio3D, Events.UPDATE, update);
    self.events.sub(GlobalAudio3D, Events.READY,  ready);
  })();

  // src change: tear down current stream, then decide load/play.
  this.set('src', (src) => {
    destroyStream();
    _settings.src = src;
    if (_options.autoplay) return self.play();
    if (_options.preload)  self.load();
  });
  this.get('src', (_) => _settings.src);

  this.set('volume', (v) => {
    v = Math.clamp(v, 0, 1);
    _options.volume = v;
    if (_gain) {
      _gain.gain.value = (_options.muted || _options.globalMuted) ? 0 : v * _options.globalVolume;
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
  this.set('preload',  (preload)  => { _options.preload  = preload;  });
  this.get('preload',  (_) => _options.preload);

  this.get('ready', (_) => !!_stream);

  this.get('frequency', (_) => {
    if (_analyser) _analyser.getByteFrequencyData(_frequency);
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

  this.get('loaded',      (_) => true);
  this.get('duration',    (_) => _stream ? _stream.element.duration    : 0);
  this.get('currentTime', (_) => _stream ? _stream.element.currentTime : 0);
  this.set('currentTime', (t) => { self.seek(t); });
  this.get('progress',    (_) => self.currentTime / self.duration);

  this.set('playbackRate', (v) => {
    _options.playbackRate = v;
    if (_stream && _stream.element) _stream.element.playbackRate = v * _options.globalPlaybackRate;
  });
  this.get('playbackRate', (_) => _options.playbackRate);

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

  this.get('filter', (_) => _filter);
  this.get('delay',  (_) => _delay);
  this.get('panner', (_) => _panner);

  this.play = function () {
    _settings.autoplay = true;
    if (!_settings.src) return;
    createStream();
    if (!_stream || true === _settings.playing) return;
    _settings.playing = true;
    self.volume = self.volume;
    self.startRender(loop);
    _stream.element.playbackRate = _options.playbackRate ? _options.playbackRate : 1;
    _stream.element.play().catch((e) => {});
  };

  this.pause = function () {
    _settings.autoplay = false;
    if (!_stream || !_settings.src || !_settings.playing) return;
    _currentTime = _stream.element.currentTime;
    _stream.element.pause();
    _settings.playing = false;
    self.stopRender(loop);
  };

  this.stop = function () {
    _settings.autoplay = false;
    if (!_settings.src) return;
    _currentTime = 0;
    _settings.playing = false;
    self.stopRender(loop);
    if (_stream && _stream.element && _stream.element.stop) {
      _stream.element.stop();
      _stream.element.currentTime = 0;
    }
  };

  this.seek = function (time) {
    if (!_settings.src) return;
    _currentTime = time;
    if (_stream) _stream.element.currentTime = time;
  };

  this.load = function () {
    if (!_settings.src || _settings.playing) return;
    createStream();
    _stream.element.load();
  };

  this.unload = function () {
    _settings.autoplay = false;
    if (!_settings.src) return;
    if (self.stop) self.stop();
    destroyStream();
    Audio3DWA.unloadStream(_settings.src);
  };

  /*
   * Splice/remove convolver between _gain and _analyser.
   *
   * NOTE: WAStream wires the convolver into a different position than
   * WABuffer. Here it sits between gain and analyser (i.e., bypasses
   * the filter+delay chain when active). Probably an oversight in the
   * original code that ended up codified.
   */
  this.convolve = async function (src) {
    _convolution = src;
    if (false === src) {
      if (_convolver) {
        _convolver.disconnect();
        _gain.disconnect();
        _gain.connect(_analyser);
        _convolver = null;
      }
      return;
    }
    const buffer = await Audio3DWA.loadBuffer(src);
    if (!_convolver) {
      _convolver = _context.createConvolver();
      _gain.disconnect();
      _convolver.connect(_analyser);
      _gain.connect(_convolver);
    }
    _convolver.buffer = buffer;
  };

  this.get('stream', (_) => _stream);
});

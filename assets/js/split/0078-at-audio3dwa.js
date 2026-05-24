/*
 * Audio3DWA — static glue between the framework and the browser
 * WebAudio API. Owns the AudioContext, the pooled <audio> element
 * cache, decoded-buffer cache, stream cache, and the per-frame
 * listener-pose update loop.
 *
 * Component responsibilities:
 *   • One shared AudioContext (48 kHz mono-spec MediaStreamDestination
 *     for routing).
 *   • Pool of pre-primed <audio> elements (created via Audio3DSilence
 *     to satisfy the user-gesture-to-unlock policy on iOS/Safari, by
 *     calling .play() once before they're handed out).
 *   • Cache of decoded AudioBuffers per URL (`_buffers`).
 *   • Cache of stream wrappers per URL (`_streams`) — reference-counted
 *     so multiple consumers can share one element.
 *   • Per-frame loop that pushes camera orientation/position into
 *     `_context.listener` using whichever API the browser supports
 *     (Chrome's AudioParam-based forwardX/upX etc. vs the legacy
 *     setOrientation/setPosition).
 *   • Suspended-state listener that wires a click/mouseup handler to
 *     auto-resume on next interaction (required after browser
 *     auto-suspend).
 *
 * `loop`:
 *   Quaternion-transform (0,0,-1) into the listener forward vector,
 *   then push that + the camera's `up` and `position` into the listener
 *   node. Branches on whether the new AudioParam interface
 *   (`listener.forwardX`) is available — if so, schedule with
 *   `setValueAtTime(_, currentTime)`; otherwise fall back to the
 *   legacy `setOrientation`/`setPosition`/`setVelocity` calls.
 *
 * `createAudioElement`:
 *   Builds a fresh <audio> element seeded with the silence MP3 (so
 *   .play() always succeeds the first call). Fallback path uses a
 *   visible-hidden <audio controls> appended to DOM (some platforms
 *   need this); non-fallback uses `new Audio()` directly.
 *
 * `handleContextStateChange`:
 *   When the context suspends (browser-imposed inactivity, autoplay
 *   blocker), attach a one-shot click/mouseup listener to re-resume.
 *   `interactHandlerActive` flag prevents double-registration.
 *
 * Caches:
 *   `loadBuffer(url)` — fetch+arraybuffer+decode, memoize on URL. Each
 *     entry holds {loaded: Promise, data: AudioBuffer}.
 *   `loadStream(url)` — pool an <audio> element, wire it through a
 *     MediaElementSource (or MediaStreamSource if `url` is a MediaStream
 *     element), and return {element, source}. Refcounted; multiple
 *     callers share. Special case: caller can pass an HTMLAudioElement
 *     directly (e.g., a <video>'s audio output) — we extract the src.
 *
 * `unloadStream(url)`:
 *   Refcount-down. When count hits 0, reset the element's src to
 *   silence, return it to the pool, and `defer`-delete the cache slot
 *   (deferred so any synchronous reload-on-same-url path doesn't
 *   re-fetch needlessly).
 *
 * `getElement` / `putElement`:
 *   ObjectPool API surface for external consumers (e.g., the Resonance
 *   backend). On `putElement`, reset src to silence so the element is
 *   safe to reuse.
 *
 * Camera override:
 *   `useCamera`/`getCamera` — most callers want the world camera, but
 *   non-default viewers (e.g., portal-style mini-views) can substitute
 *   their own.
 *
 * `resume`:
 *   Called from the interaction handler. Builds the context if missing,
 *   then `await _context.resume()` if suspended.
 */
Class(function Audio3DWA() {
  Inherit(this, Component);
  const self = this;
  const _silence = require('Audio3DSilence');

  let _context, _orientation, _cam, _pool;
  const _streams = {};
  const _buffers = {};

  // Per-frame listener-pose push. Browser-API-switching for old vs new
  // AudioListener interfaces.
  function loop() {
    _cam = self.getCamera();
    if (!_cam || !_cam.getWorldQuaternion || !_context || !_context.listener) return;
    _orientation.set(0, 0, -1).applyQuaternion(_cam.getWorldQuaternion());

    if (_context.listener.forwardX) {
      // AudioParam-based API (Chrome/modern).
      _context.listener.forwardX.setValueAtTime(_orientation.x, _context.currentTime);
      _context.listener.forwardY.setValueAtTime(_orientation.y, _context.currentTime);
      _context.listener.forwardZ.setValueAtTime(_orientation.z, _context.currentTime);
      _context.listener.upX.setValueAtTime(_cam.up.x, _context.currentTime);
      _context.listener.upY.setValueAtTime(_cam.up.y, _context.currentTime);
      _context.listener.upZ.setValueAtTime(_cam.up.z, _context.currentTime);
    } else {
      // Legacy API.
      if (_context.listener.setOrientation) {
        _context.listener.setOrientation(
          _orientation.x || 0, _orientation.y || 0, _orientation.z || 0,
          _cam.up.x       || 0, _cam.up.y       || 0, _cam.up.z       || 0,
        );
      }
      if (_context.listener.setPosition) {
        _context.listener.setPosition(
          _cam.position.x || 0, _cam.position.y || 0, _cam.position.z || 0,
        );
      }
      if (_context.listener.setVelocity) _context.listener.setVelocity(0, 0, 0);
    }
  }

  // Pool factory — every element is pre-primed by .play()ing silence
  // so subsequent real play() calls survive autoplay restrictions.
  function createAudioElement() {
    let audio;
    if (GlobalAudio3D.fallback) {
      audio = document.createElement('audio');
      audio.style.visibility = 'hidden';
      document.body.appendChild(audio);
      audio.source = document.createElement('source');
      audio.appendChild(audio.source);
      audio.setAttribute('controls', '');
      audio.source.setAttribute('src',  _silence);
      audio.source.setAttribute('type', 'audio/mp3');
      audio.play();
    } else {
      audio = new Audio();
      audio.src = _silence;
      audio.play().catch((e) => {});
    }
    return audio;
  }

  // Re-arm or remove the resume-on-interaction listener whenever the
  // context state changes.
  function handleContextStateChange() {
    if (self.suspended === self.flag('interactHandlerActive')) return;

    if (self.suspended) {
      if (Device.mobile) self.events.sub(Mouse.input, Interaction.CLICK, self.resume);
      else document.addEventListener('mouseup', self.resume, { passive: false });
      self.flag('interactHandlerActive', true);
    } else {
      if (Device.mobile) self.events.unsub(Mouse.input, Interaction.CLICK, self.resume);
      else document.removeEventListener('mouseup', self.resume, { passive: false });
      self.flag('interactHandlerActive', false);
    }
  }

  this.createPool = function (n = 10) {
    _pool = self.initClass(ObjectPool, createAudioElement, n);
    self.flag('init', true);
  };

  /*
   * Build (or rebuild on refresh) the AudioContext. First-call cookie:
   * if GlobalAudio3D isn't yet interacted, await the interacted promise
   * before resuming.
   */
  this.audioContext = function (refresh) {
    const firstTime = !_context;
    if (_context && !refresh) return _context;

    if (_context) {
      _context.close();
      _context.removeEventListener('statechange', handleContextStateChange);
      _context = null;
    }
    _orientation = new Vector3();
    _context = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
    _context.dest = _context.createMediaStreamDestination();
    _context.addEventListener('statechange', handleContextStateChange);
    Render.start(loop);

    if (firstTime) {
      if (GlobalAudio3D.initialized) {
        if (self.suspended) handleContextStateChange();
      } else {
        GlobalAudio3D.interacted.then(self.resume);
      }
    }
    return _context;
  };

  // --- Buffer cache --------------------------------------------------
  this.unloadBuffer = function (url) {
    if (_buffers[url]) delete _buffers[url];
  };

  this.loadBuffer = async function (url) {
    if (!_buffers[url]) {
      _buffers[url] = { loaded: Promise.create(), data: null };
      const response = await fetch(url);
      const buffer   = await response.arrayBuffer();
      self.audioContext().decodeAudioData(buffer, (data) => {
        _buffers[url].data = data;
        _buffers[url].loaded.resolve();
      });
    }
    await _buffers[url].loaded;
    return _buffers[url].data;
  };

  // --- Stream cache (refcounted) ------------------------------------
  this.unloadStream = function (url) {
    if (!_streams[url]) return;
    _streams[url].stream.element.src = _silence;
    _streams[url].stream.element.load();
    _streams[url].count--;
    _pool.put(_streams[url].stream.element);
    if (0 === _streams[url].count) {
      defer((_) => { delete _streams[url]; });
    }
  };

  /*
   * Build a shared stream wrapper. Caller may pass either a URL or an
   * existing HTMLMediaElement (the latter is muted because we route
   * its audio via the AudioContext graph, not through the element
   * itself).
   */
  this.loadStream = function (url) {
    const isElement = 'string' !== typeof url && undefined !== url;
    let element = null;

    if (isElement) {
      element = url;
      url = element.src ? element.src : element.srcObject ? element.srcObject.id : '';
    }

    if (!_streams[url]) {
      const stream = {};
      _streams[url] = { stream: null, count: 0 };

      if (isElement) {
        stream.element = element;
        element.setAttribute('muted', true);
        element.muted = true;
      } else {
        stream.element = self.getElement();
        stream.element.crossOrigin = 'anonymous';
        stream.element.src = url;
      }

      if (GlobalAudio3D.fallback) {
        stream.element.setAttribute('src', url);
      } else if (stream.element.mediaSrc) {
        // Element already has a MediaElementSource attached — reuse it.
        stream.source = stream.element.mediaSrc;
      } else if (stream.element.srcObject) {
        stream.source = self.audioContext().createMediaStreamSource(stream.element.srcObject);
        // Re-attach srcObject to a fresh Audio so the element can still
        // play if we tear ours down.
        new Audio().srcObject = element.srcObject;
      } else {
        stream.source = self.audioContext().createMediaElementSource(stream.element);
        stream.element.mediaSrc = stream.source;
      }

      if (!isElement) stream.element.load();
      _streams[url].stream = stream;
    }
    _streams[url].count++;
    return _streams[url].stream;
  };

  // Diagnostic: how many consumers does this stream have?
  this.getActiveStreamCount = function (stream) {
    for (const key in _streams) if (_streams[key].stream === stream) return _streams[key].count;
    return -1;
  };

  this.purge = function () {
    for (const stream in _streams) self.unloadStream(stream);
    for (const buffer in _buffers) self.unloadBuffer(buffer);
  };

  this.getElement = function () {
    if (!_pool) self.createPool();
    return _pool.get();
  };

  this.putElement = function (audio) {
    audio.src = _silence;
    audio.load();
    _pool.put(audio);
  };

  this.useCamera = function (camera) { self.CAMERA = camera; };
  this.getCamera = function () {
    if (!self.CAMERA) self.CAMERA = World.CAMERA;
    return self.CAMERA;
  };

  this.get('suspended',
    () => !_context || 'interrupted' === _context.state || 'suspended' === _context.state,
  );

  this.resume = async function () {
    if (!_context) self.audioContext();
    if (self.suspended) await _context.resume();
  };
}, 'static');

/*
 * Audio3DResonance — static glue between Hydra and Google Resonance
 * Audio (a browser-side ambisonic spatialization library). Owns the
 * shared AudioContext, ResonanceAudio engine, and the per-frame loop
 * that pushes camera pose into the engine. Per-source state lives in
 * Audio3DResonanceAudio (the per-instance backend); this class is the
 * singleton glue everything else routes through.
 *
 * `Audio3DSilence` is `require`'d at module init so the silence MP3
 * data URL is registered before anyone needs it (Audio3DWAStream uses
 * it as a fallback element source).
 *
 * `createAudioInput(url)`:
 *   Build a Resonance source for a given URL. Steps:
 *     1. Ensure the context+engine exist (`await self.resonance()`).
 *     2. Grab a pooled <audio> element via Audio3DWA.getElement(),
 *        set crossOrigin (cross-origin streaming needs CORS).
 *     3. Set src.
 *     4. createMediaElementSource — but if a previous element already
 *        has a MediaElementSource attached (`element.mediaSrc`), reuse
 *        it. WebAudio forbids creating two MediaElementSources for the
 *        same element.
 *     5. Stamp the source on the element for future reuse.
 *     6. resonance.createSource() yields a positional source node; we
 *        wire the element source into it. Returned `stream` carries
 *        both ends so the caller can disconnect later.
 *
 * `unloadStream(stream)`:
 *   Disconnect the element source from the Resonance source input and
 *   return the <audio> element to the pool. Resonance's source node
 *   is retained — Resonance handles its own cleanup.
 *
 * `resonance(refresh)`:
 *   Lazy/recreate the engine. Steps:
 *     1. Wait for ResonanceAudio to be loaded (AssetLoader resolves
 *        when the library script has finished loading).
 *     2. Wait for GlobalAudio3D to be ready (post-gesture).
 *     3. If `_context` exists and refresh is false, no-op.
 *     4. Otherwise tear down any prior context, build a fresh
 *        Vector3 scratch, ensure the AudioContext is running
 *        (`.resume()` is sometimes required after construction in
 *        Safari).
 *     5. Build the ResonanceAudio instance, connect its `output` node
 *        to the context destination, start the per-frame loop.
 *   Returns the engine handle for direct API access if needed.
 *
 * `loop` (per-frame):
 *   Push camera forward (default -Z transformed by camera quaternion)
 *   and up vectors into Resonance as the listener orientation; push
 *   camera position as the listener position. Both are required for
 *   correct binaural rendering.
 *
 * `setRoomProperties(dimensions, materials)`:
 *   Pass-through to Resonance for room reverb modeling. `materials`
 *   uses the integer IDs declared on GlobalAudio3D (BRICK_BARE etc.).
 *
 * `initialized` getter is a non-throwing readiness probe (`!!_context`)
 * so callers can branch on engine state without awaiting.
 */
Class(function Audio3DResonance() {
  Inherit(this, Component);
  const self = this;
  require('Audio3DSilence');     // pre-register the silence MP3.

  let _context, _resonance, _orientation, _cam;

  // Per-frame: push listener pose into Resonance.
  function loop() {
    _cam = Audio3DWA.getCamera();
    if (!_cam || !_context || !_context.listener) return;
    _orientation.set(0, 0, -1).applyQuaternion(_cam.quaternion);
    _resonance.setListenerOrientation(
      _orientation.x, _orientation.y, _orientation.z,
      _cam.up.x,      _cam.up.y,      _cam.up.z,
    );
    _resonance.setListenerPosition(_cam.position.x, _cam.position.y, _cam.position.z);
  }

  /*
   * Build a Resonance source for `url`. Reuses an existing
   * MediaElementSource if the pooled element already has one (WebAudio
   * forbids creating two for the same element).
   */
  this.createAudioInput = async function (url) {
    if (!_context) await self.resonance();
    const stream = {};
    stream.element = Audio3DWA.getElement();
    stream.element.crossOrigin = 'anonymous';
    stream.element.src = url;

    const audioElementSource = stream.element.mediaSrc
      ? stream.element.mediaSrc
      : _context.createMediaElementSource(stream.element);
    stream.element.mediaSrc = audioElementSource;

    const source = _resonance.createSource();
    audioElementSource.connect(source.input);
    stream.source = source;
    return stream;
  };

  this.unloadStream = function (stream) {
    stream.element.mediaSrc.disconnect(stream.source.input);
    Audio3DWA.putElement(stream.element);
  };

  /*
   * Lazy engine init or refresh. Re-creates context+engine if
   * `refresh=true` (used after audio device changes).
   */
  this.resonance = async function (refresh) {
    if (!window.ResonanceAudio) await AssetLoader.waitForLib('ResonanceAudio');
    await GlobalAudio3D.ready();

    if (_context && !refresh) return _resonance;

    if (_context) { _context.close(); _context = null; }
    _orientation = new Vector3();
    _context = Audio3DWA.audioContext();
    if ('running' !== _context.state) _context.resume();
    _resonance = new ResonanceAudio(_context);
    _resonance.output.connect(_context.destination);
    Render.start(loop);
    return _resonance;
  };

  this.setRoomProperties = function (dimensions, materials) {
    _resonance.setRoomProperties(dimensions, materials);
  };

  this.get('initialized', () => !!_context);
}, 'static');

/*
 * SFXController — singleton sound-effect pool. Sits in front of
 * Audio3D's `simpleBuffer` mode (lowest-latency WebAudio path) and
 * adds a name-keyed lookup, preload cache, and an ObjectPool that
 * recycles Audio3D instances across play() calls.
 *
 * Why pool?
 *   Creating an Audio3D involves WebAudio node allocation + DataView
 *   wiring; doing that for every SFX click would hitch. The pool
 *   keeps a small number of fully-built instances warm and reuses
 *   them. `POOL_SIZE = 1` is the default starting size — the pool
 *   grows on demand when `_pool.get()` returns null and `generate()`
 *   builds a fresh instance.
 *
 * Event channels (statics):
 *   AUDIO_MUTED / AUDIO_UNMUTED  — fired after a state transition.
 *   TOGGLE_AUDIO / PLAY_SFX / STOP_SFX — incoming requests, fired by
 *     UI controls or other systems on the global event bus. The
 *     controller subscribes to these so callers don't need to import it.
 *
 * Init:
 *   Restore mute state from `Storage.get('muted')` (cookie/localStorage)
 *   so the page boots in the right state. Wait for GlobalAudio3D.READY
 *   (i.e. first user gesture has run) before building the pool —
 *   creating Audio3D before that would just queue WebAudio errors.
 *
 *   `defer()` after pool fill: deferred so `wasMuted !== self.muted`
 *   check happens once the constructor has fully populated `self.muted`
 *   (which is set via the surrounding class definition machinery).
 *
 * `registerSounds(srcMap)` / `registerSound(name, src)`:
 *   Build the name→URL table the controller plays against. Also
 *   initializes the active-sound list for each name (used by `stop`
 *   to find a running instance to halt).
 *
 * `preload(name)`:
 *   Build a dedicated, non-pooled Audio3D for `name`, set its src, and
 *   call load(). Stashed in `_preloaded` so subsequent play()s of the
 *   same name reuse it (so the buffer is decoded once). The next play
 *   will check `_activeSounds[name].includes(preloaded)` — if the
 *   preloaded copy is already busy, we fall through to the pool path.
 *
 * `play(name, options)`:
 *   1. If not yet initialized (no user gesture), schedule a flag flip
 *      after 1s and return. The caller's await resolves with undefined.
 *   2. Try to reuse the preloaded instance for this name. If it's
 *      already playing, fall through to the pool.
 *   3. `_pool.get()` returns an idle Audio3D or null (pool empty). If
 *      null, `generate()` builds a fresh one (pool grows).
 *   4. Set src, optionally call `options.onBeforePlay(sound)` — if it
 *      returns false, put the sound back and abort.
 *   5. Subscribe a one-shot END handler that puts the sound back into
 *      the pool (unless it was preloaded), removes it from
 *      `_activeSounds`, and resolves the play promise. Resolves are
 *      what callers `await` to know the sound has finished.
 *
 * `stop(name)`:
 *   Halts the first currently-playing instance of `name`. The END
 *   handler above will then return the instance to the pool.
 *
 * `handleToggle`:
 *   Flip GlobalAudio3D.muted (and re-broadcast the resulting state).
 *   Before init, force the next state to false so the user doesn't
 *   start muted by accident on a fresh session.
 */
Class(function SFXController() {
  Inherit(this, Component);
  const self = this;
  const POOL_SIZE = 1;

  let _pool;
  let _srcMap        = {};
  const _preloaded   = {};
  const _activeSounds = {};

  function init() {
    (function initPool() {
      _pool = self.initClass(ObjectPool);
      const sfx = [];
      while (sfx.length < POOL_SIZE) sfx.push(generate());
      _pool.insert(sfx);
    })();
    defer(() => {
      const wasMuted = self.muted;
      self.initialized = true;
      if (wasMuted !== self.muted) {
        self.events.fire(self.muted ? SFXController.AUDIO_MUTED : SFXController.AUDIO_UNMUTED);
      }
    });
  }

  // Lowest-overhead Audio3D variant — AudioBufferSourceNode-based.
  function generate() {
    return self.initClass(Audio3D, { simpleBuffer: true });
  }

  // Toggle hook. Before init we don't actually mute (would orphan
  // queued sounds); broadcast happens only after init.
  function handleToggle() {
    let nextMuted = !GlobalAudio3D.muted;
    if (!self.initialized) nextMuted = false;
    if (nextMuted !== GlobalAudio3D.muted) GlobalAudio3D.muted = nextMuted;
    if (self.initialized) {
      self.events.fire(nextMuted ? SFXController.AUDIO_MUTED : SFXController.AUDIO_UNMUTED);
    }
  }

  function handlePlayRequest({ name, ...options }) { self.play(name, options); }
  function handleStopRequest({ name, ...options }) { self.stop(name, options); }

  // Restore persisted mute state, wait for global audio readiness,
  // wire the event channels.
  (async function () {
    const muted = true === Storage.get('muted');
    if (muted !== GlobalAudio3D.muted) GlobalAudio3D.muted = muted;
    if (GlobalAudio3D.initialized) init();
    else self.events.sub(GlobalAudio3D, Events.READY, init);

    (function addListeners() {
      self.events.sub(SFXController.TOGGLE_AUDIO, handleToggle);
      self.events.sub(SFXController.PLAY_SFX,     handlePlayRequest);
      self.events.sub(SFXController.STOP_SFX,     handleStopRequest);
    })();
  })();

  // Bulk-register name→URL pairs. Initializes the active list for each.
  this.registerSounds = function (srcMap) {
    _srcMap = { ..._srcMap, ...srcMap };
    Object.keys(_srcMap).forEach((name) => { _activeSounds[name] = []; });
  };

  this.registerSound = function (name, src) {
    _srcMap[name] = src;
    _activeSounds[name] = [];
  };

  // Build a dedicated (non-pooled) Audio3D for `name`, prime its buffer.
  this.preload = async function (name) {
    const src = _srcMap[name];
    if (!src) return console.warn(`missing sound '${name}'`);
    let sound = _preloaded[name];
    if (!sound) sound = _preloaded[name] = generate();
    sound.src = src;
    return sound.load();
  };

  /*
   * Play `name`. Returns a Promise resolved when playback ends — useful
   * for sequencing UI animations to sound completion.
   *   options.onBeforePlay(sound)  — last-chance hook (false aborts).
   */
  this.play = async function (name, options = {}) {
    if (!self.initialized) {
      // Pre-init: stall a moment and flip the flag so subsequent
      // requests land. The current call doesn't actually play — by
      // design we don't queue audio before the user gesture has fired.
      return void self.delayedCall((_) => { self.initialized = true; }, 1e3);
    }

    let sound;
    let preloaded = _preloaded[name];
    if (preloaded) {
      // Preloaded copy busy → fall through to pool.
      if (_activeSounds[name].includes(preloaded)) preloaded = undefined;
      else                                          sound = preloaded;
    }

    if (!sound) {
      const src = _srcMap[name];
      if (!src) return console.warn(`missing sound '${name}'`);
      sound = _pool.get();
      if (null === sound) sound = generate();   // pool empty → grow.
      sound.src = src;
    }

    if (options.onBeforePlay) {
      if (false === (await options.onBeforePlay(sound))) {
        // Return the sound to the pool if it came from there.
        return void (preloaded || _pool.put(sound));
      }
    }

    _activeSounds[name].push(sound);
    const promise = Promise.create();

    self.events.sub(sound, Events.END, function onSoundEnd() {
      self.events.unsub(sound, Events.END, onSoundEnd);
      if (!preloaded) _pool.put(sound);
      _activeSounds[name].remove(sound);
      promise.resolve();
    });
    sound.play();
    return promise;
  };

  self.stop = function (name) {
    const sound = _activeSounds[name][0];
    if (sound) sound.stop();
  };

  self.muted = false;
  self.get('preloaded',    () => _preloaded);
  self.get('activeSounds', () => _activeSounds);
}, 'singleton', () => {
  // Event names the rest of the app fires/listens to.
  SFXController.AUDIO_MUTED   = 'sfx_muted';
  SFXController.AUDIO_UNMUTED = 'sfx_unmuted';
  SFXController.TOGGLE_AUDIO  = 'sfx_toggle_mute';
  SFXController.PLAY_SFX      = 'SFXAssetsController.PLAY_SFX';
  SFXController.STOP_SFX      = 'SFXAssetsController.STOP_SFX';
});

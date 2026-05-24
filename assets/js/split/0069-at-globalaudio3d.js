/*
 * GlobalAudio3D — process-wide audio state. Holds the master volume,
 * mute, blur-pause flag, playback rate, and the WebAudio pool size.
 * Also enumerates the Resonance Audio material constants and quality
 * presets so authors can author rooms in Hydra terms without importing
 * Resonance directly.
 *
 * Interaction gate (`_interacted` Promise, `initInteraction`):
 *   WebAudio contexts can only be created/resumed after a user
 *   gesture. We listen for the first touchend/mouseup (and XR
 *   SESSION_START in XR scenes) and:
 *     1. Drop the listeners (so we don't re-init).
 *     2. Build the Audio3DWA pool sized to `_poolSize`.
 *     3. Flag `initialized=true`, fire Events.READY, resolve
 *        `_interacted` so any pending `await GlobalAudio3D.interacted`
 *        unblocks.
 *
 * Native shells (`initNative` on `window.AURA`):
 *   When running inside the AT native shell (AURA), audio is already
 *   running — no gesture required. Mark native=true and resolve
 *   `_interacted` immediately. `window._al` further selects the AL
 *   backend (Audio3DAL).
 *
 * Audio debug (`initDebug`, Hydra.LOCAL + ?audioDebug):
 *   Monkeypatches `AudioNode.prototype.connect` to record the audio
 *   graph topology (`.outputs` / `.inputs` cross-links). Used by an
 *   inspector tool to visualize the live WebAudio graph.
 *
 * Setters/getters as event broadcast:
 *   volume/muted/blurs/playbackRate setters fire Events.UPDATE on the
 *   instance with the changed key. Per-context implementations
 *   (Audio3DFallback/Audio3DNBuffer/etc.) subscribe to UPDATE to mix
 *   global mute/volume into their local volume.
 *
 * Pool size:
 *   `pool` is the size of the simple-buffer pool (small SFX with low
 *   latency). Default 1, callers configure via `GlobalAudio3D.pool = N`
 *   before setup.
 *
 * Room API (Native GVR only):
 *   `enableRoom`, `setRoomProperties` (dimensions+absorption material
 *   IDs), `setRoomReverbAdjustments` (gain/time/brightness) all guard
 *   on `window.GVRAudio` so they're safe no-ops in non-native builds.
 *
 * Label-mute system:
 *   `_labelStates[name]` is a lazy-built AppState bag. Sounds that
 *   pass `label: 'X'` to their Audio3D bind to `_labelStates.X.mute`,
 *   so calling `GlobalAudio3D.muteLabel('music')` mutes every audio
 *   in the 'music' label simultaneously without iterating the sound
 *   pool. `getLabelState` is the lookup primitive.
 *
 * Setup (`setup(type)`):
 *   Entry point called by the app once during boot. Honors
 *   `?muted=1` query in LOCAL builds (handy for dev work). Picks the
 *   right interaction listener (touchend on mobile, mouseup desktop)
 *   and subscribes to XR session start. When `type='resonance_audio'`
 *   (and we're in-browser and not in fallback), pre-load the Resonance
 *   library so it's ready when the first positional sound is built.
 */
Class(function GlobalAudio3D() {
  Inherit(this, Component);
  const self = this;
  let _volume = 1;
  let _muted  = false;
  let _blurs  = true;
  let _playbackRate = 1;
  let _poolSize = 1;
  const _interacted   = Promise.create();
  const _labelStates  = {};

  // First gesture unlocks WebAudio. Drops the listeners, builds the
  // pool, fires READY, resolves the interacted promise.
  function initInteraction(e) {
    if (self.initialized) return;
    if (e && e.preventDefault) e.preventDefault();
    document.removeEventListener(
      Device.mobile ? 'touchend' : 'mouseup',
      initInteraction,
      { passive: false },
    );
    if ('undefined' != typeof XRDeviceManager) {
      self.events.unsub(XRDeviceManager.SESSION_START, initInteraction);
    }
    Audio3DWA.createPool(_poolSize);
    self.initialized = true;
    self.events.fire(Events.READY);
    _interacted.resolve();
  }

  this.native = false;

  // Resonance Audio material IDs — author-facing names.
  this.TRANSPARENT               = 0;
  this.ACOUSTIC_CEILING_TILES    = 1;
  this.BRICK_BARE                = 2;
  this.BRICK_PAINTED             = 3;
  this.CONCRETE_BLOCK_COARSE     = 4;
  this.CONCRETE_BLOCK_PAINTED    = 5;
  this.CURTAIN_HEAVY             = 6;
  this.FIBER_GLASS_INSULATION    = 7;
  this.GLASS_THICK               = 8;
  this.GLASS_THIN                = 9;
  this.GRASS                     = 10;
  this.LINOLEUM_ON_CONCRETE      = 11;
  this.MARBLE                    = 12;
  this.METAL                     = 13;
  this.PARQUET_ON_CONCRETE       = 14;
  this.PLASTER_ROUGH             = 15;
  this.PLASTER_SMOOTH            = 16;
  this.PLYWOOD_PANEL             = 17;
  this.POLISHED_CONCRETE_OR_TILE = 18;
  this.SHEET_ROCK                = 19;
  this.WATER_OR_ICE_SURFACE      = 20;
  this.WOOD_CEILING              = 21;
  this.WOOD_PANEL                = 22;

  // Quality presets.
  this.LOW  = 0;
  this.MED  = 1;
  this.HIGH = 2;

  this.RESONANCE_AUDIO = 'resonance_audio';
  this.quality = this.HIGH;

  // Native + debug bootstrap (next tick to let consumers configure first).
  (async function () {
    await defer();
    if (window.AURA) {
      (function initNative() {
        self.native = true;
        if (window._al) Audio3DAL.init();
        self.initialized = true;
        _interacted.resolve();
      })();
    }

    (function initDebug() {
      if (!Hydra.LOCAL || !Utils.query('audioDebug')) return;
      let func;
      AudioNode.prototype.connect = (
        (func = AudioNode.prototype.connect),
        function () {
          const target = arguments[0];
          if (!this.outputs)   this.outputs   = [];
          if (!target.inputs)  target.inputs  = [];
          this.outputs.push(arguments[0]);
          target.inputs.push(this);
          return func.apply(this, arguments);
        }
      );
    })();
  })();

  // Setters that broadcast UPDATE — concrete backends listen for these
  // and mix the global values into their per-instance volume math.
  this.set('volume', (v) => { _volume = v; self.events.fire(Events.UPDATE, { volume: _volume }); });
  this.get('volume', (_) => _volume);

  this.set('muted',  (v) => { _muted  = v; self.events.fire(Events.UPDATE, { muted:  _muted  }); });
  this.get('muted',  (_) => _muted);

  this.set('blurs',  (v) => { _blurs  = v; self.events.fire(Events.UPDATE, { blurs:  _blurs  }); });
  this.get('blurs',  (_) => _blurs);

  this.set('playbackRate', (v) => { _playbackRate = v; self.events.fire(Events.UPDATE, { playbackRate: _playbackRate }); });
  this.get('playbackRate', (_) => _playbackRate);

  this.get('pool', (_) => _poolSize);
  this.set('pool', (n) => { _poolSize = n; });

  this.get('interacted', (_) => _interacted);
  this.get('fallback',   (_) => false);

  /*
   * Boot. Picks the interaction unlocker based on device type, hooks
   * XR session start, and optionally preloads ResonanceAudio.
   */
  this.setup = function (type = 'default') {
    if (Utils.query('muted') && Hydra.LOCAL) _muted = true;
    if (Device.mobile) {
      self.events.sub(Mouse.input, Interaction.CLICK, initInteraction);
    } else {
      document.addEventListener(
        Device.mobile ? 'touchend' : 'mouseup',
        initInteraction,
        { passive: false },
      );
    }
    if ('undefined' != typeof XRDeviceManager) {
      self.events.sub(XRDeviceManager.SESSION_START, initInteraction);
    }
    if ('resonance_audio' == type && !self.native && !self.fallback) {
      self.resonanceAudio = true;
      AssetLoader.loadAssets(['assets/js/lib/_resonance/resonance-audio.min.js']);
    }
  };

  this.ready = function () { return self.wait(self, 'initialized'); };

  // Native-shell room API (no-ops in browser).
  this.enableRoom = function (bool) {
    if (window.GVRAudio) GVRAudio.enableRoom(bool);
  };
  this.setRoomProperties = function (x, y, z, wall, ceiling, floor) {
    if (window.GVRAudio) GVRAudio.setRoomProperties(x, y, z, wall, ceiling, floor);
  };
  this.setRoomReverbAdjustments = function (gain, time, brightness) {
    if (window.GVRAudio) GVRAudio.setRoomReverbAdjustments(gain, time, brightness);
  };

  // Label-mute helpers — lazy-build the AppState bag and toggle `mute`.
  this.muteLabel   = function (label) { self.getLabelState(label).set('mute', true);  };
  this.unmuteLabel = function (label) { self.getLabelState(label).set('mute', false); };
  this.getLabelState = function (label) {
    if (!_labelStates[label]) _labelStates[label] = AppState.createLocal();
    return _labelStates[label];
  };
}, 'static');

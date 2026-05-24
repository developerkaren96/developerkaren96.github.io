/*
 * Audio3DLayer — UIL-driven audio author surface. Wraps an Audio3D
 * instance with a live-edit panel (path, volume, fade times, captions
 * toggle, etc.) and tween-based fade-in/fade-out behavior. Designed to
 * be attached to a Mesh so authors can drop a sound onto a 3D object
 * via the UIL panel and have it auto-fade based on visibility.
 *
 * Construction (`parseArgs`):
 *   The variadic constructor accepts an InputUILConfig (the parent
 *   visibility/state binding), a UILFolder (the live-edit group), and
 *   optionally a Mesh (the 3D parent). When a mesh is attached:
 *     • `_mesh.audioCount` counter ensures unique UIL prefixes when
 *       multiple sounds hang off the same mesh.
 *     • `_mesh.findSound(key)` is installed once so callers can look
 *       up scripts attached to the mesh — `scriptClass` may be a single
 *       instance or an array; resolves Promise-shaped `.key` first.
 *     • Mesh's visible shader flag is hidden (sounds don't need a
 *       visual placeholder).
 *
 * UIL config (`initConfig`):
 *   Declares every authorable knob: path, key, label (groups for
 *   global mute), autoplay/loop/stream/positional toggles, volume +
 *   rolloff + fadeIn/fadeOut times + delay, gain. The Preview button
 *   surfaces Play/Stop callbacks so authors can audition without
 *   triggering the visibility lifecycle. Captions toggle appears only
 *   when CaptionsController is loaded.
 *
 *   `onUpdate(key)` is the live-edit hook — only certain keys map
 *   directly to backend properties (autoplay/loop are flags;
 *   volume/rolloff/gain are numbers). Other keys (path, label, etc.)
 *   require a full Audio3D rebuild and are intentionally ignored
 *   during a session.
 *
 * Init (`initAudio`, async):
 *   Wait for first user interaction (audio contexts can only start
 *   after a gesture). Resolve the path through Assets.getPath and
 *   instantiate Audio3D with the merged options. Apply `gain` from
 *   string-or-number (UIL stores text); attach the audio's group to
 *   the mesh's scene graph so positional audio tracks the mesh.
 *
 * Visibility lifecycle:
 *   `onVisible`:  if autoplay is set, fade in.
 *   `onInvisible`: fade out always (we never leave audio playing on
 *     hidden meshes).
 *   `onDestroy`:  fade out (best-effort; the parent will tear down
 *     state before the fade completes, which is intentional —
 *     completing a fade on a destroyed object is fine).
 *
 * Fade in/out:
 *   Both wait for `init` first (a sound being faded in before its
 *   Audio3D is ready would no-op). FadeIn loads captions (if the
 *   captions module is present and the path is set), waits the
 *   configured delay, starts playback, tweens `_volume.value` from 0
 *   to target volume with easeOutExpo, mirrors that into
 *   `_audio3D.volume` on every tween tick.
 *
 *   FadeOut tweens from target volume to 0 with easeOutExpo, then
 *   pauses — *unless* the underlying stream is shared (multiple
 *   Audio3D instances using the same MediaElement). The stream
 *   reference-count check via `Audio3DWA.getActiveStreamCount` avoids
 *   pausing a stream that another live sound still needs.
 *
 *   FadeTime=0 short-circuits the tween path.
 *
 * `startRender(() => {})` keeps the component in the render loop so
 * visibility tracking ticks every frame — the empty callback is just
 * a registration token.
 *
 * Exposed handles:
 *   `audio` — the underlying Audio3D
 *   `key`   — author-supplied key, resolves after init
 *   volume/rolloff setters proxy through to the Audio3D
 *   play/stop — public fade-in/fade-out entry points
 */
Class(function Audio3DLayer(...args) {
  Inherit(this, Component);
  const self = this;
  let _group, _input, _mesh, _audio3D, _config, _key, _autoplay;
  const _volume = { value: 0 };
  const _captionsSetup = 'undefined' != typeof CaptionsController;

  // Fade volume from 0 to configured target. Loads captions and waits
  // `delay` first (both are author-controlled via UIL).
  async function fadeIn() {
    if (!self.flag('init')) await self.wait('init');

    const captionsPath = _config.get('captions');
    if (_captionsSetup && captionsPath && _config.get('enableCaptions')) {
      await (async function loadCaptions(path) {
        await CaptionsController.instance().load(path);
      })(captionsPath);
    }

    const delay = _config.getNumber('delay');
    if (delay) await self.wait(delay);

    _audio3D.play();
    if (_captionsSetup && captionsPath && _config.get('enableCaptions')) toggleCaptions(true);

    if (0 == _config.getNumber('fadeInTime')) return;

    _volume.value   = 0;
    _audio3D.volume = 0;
    const volumeTween = tween(
      _volume,
      { value: _config.getNumber('volume') },
      _config.getNumber('fadeInTime'),
      'easeOutExpo',
    );
    volumeTween.onUpdate(() => { _audio3D.volume = _volume.value; });
    await volumeTween.promise();
  }

  /*
   * Fade to zero and pause. Skip the pause if the underlying stream
   * is shared with another live Audio3D (refcount > 1).
   */
  async function fadeOut() {
    if (!self.flag('init')) await self.wait('init');

    if (_captionsSetup && _config.get('captions') && _config.get('enableCaptions')) {
      toggleCaptions(false);
    }

    if (0 != _config.getNumber('fadeOutTime')) {
      _volume.value = _config.getNumber('volume');
      const volumeTween = tween(
        _volume,
        { value: 0 },
        _config.getNumber('fadeOutTime'),
        'easeOutExpo',
        0,
      );
      volumeTween.onUpdate(() => { _audio3D.volume = _volume.value; });
      volumeTween.onComplete(() => {
        const sharedStream =
          _audio3D.context && _audio3D.context.stream &&
          Audio3DWA.getActiveStreamCount(_audio3D.context.stream) > 1;
        if (!sharedStream) _audio3D.pause();
      });
      await volumeTween.promise();
    } else {
      const sharedStream =
        _audio3D.context && _audio3D.context.stream &&
        Audio3DWA.getActiveStreamCount(_audio3D.context.stream) > 1;
      if (sharedStream) return;
      _audio3D.pause();
    }
  }

  function toggleCaptions(bool = false) {
    if (bool) CaptionsController.instance().start();
    else      CaptionsController.instance().stop();
  }

  // Sort positional args by constructor name. A Mesh arg installs the
  // shared `findSound` helper on the mesh, used by other systems to
  // resolve scripts by key.
  (function parseArgs() {
    args.forEach((arg) => {
      switch (Utils.getConstructorName(arg)) {
        case 'InputUILConfig':
          _input = arg;
          break;
        case 'UILFolder':
          _group = arg;
          break;
        case 'Mesh':
          _mesh = arg;
          self.parent = _mesh;
          if (_mesh.audioCount) _mesh.audioCount++;
          else                  _mesh.audioCount = 1;
          if (!_mesh.findSound) {
            _mesh.shader.visible = false;
            _mesh.findSound = async function (key) {
              if (!Array.isArray(_mesh.scriptClass)) return _mesh.scriptClass;
              for (const scriptClass of _mesh.scriptClass) {
                if ((await scriptClass.key) == key) return scriptClass;
              }
            };
          }
      }
    });
    self.visible = _input.get('visible');
  })();

  /*
   * Declare the live-edit panel. Live-mutable keys forward through
   * onUpdate; other keys require a fresh instance to take effect.
   */
  (function initConfig() {
    const config = InputUIL.create(
      _input.prefix + 'audio3dLayer' + (_mesh ? _mesh.audioCount : ''),
      _group,
    );
    config
      .add('path')
      .add('key')
      .add('label')
      .addToggle('autoplay',   false)
      .addToggle('loop',       false)
      .addToggle('stream',     false)
      .addToggle('positional', false)
      .addNumber('volume',      1)
      .addNumber('rolloff',     1)
      .addNumber('fadeInTime',  0)
      .addNumber('fadeOutTime', 0)
      .addNumber('delay',       0)
      .addNumber('gain',        1)
      .setLabel('Audio');
    config.addButton('preview', {
      label: 'Preview',
      actions: [
        { title: 'Play', callback: fadeIn  },
        { title: 'Stop', callback: fadeOut },
      ],
    });
    if (_captionsSetup) config.add('captions').addToggle('enableCaptions', false);

    config.onUpdate = (key) => {
      if (!_audio3D) return;
      switch (key) {
        case 'autoplay':
        case 'loop':
          _audio3D[key] = _config.get(key);
          break;
        case 'volume':
        case 'rolloff':
        case 'gain':
          _audio3D[key] = _config.getNumber(key);
      }
    };
    _config = config;
  })();

  // Wait for the global interaction unlock, then build the Audio3D and
  // attach to mesh scene graph for positional spatialization.
  (async function initAudio() {
    if (!GlobalAudio3D.initialized) await GlobalAudio3D.interacted;
    _key      = _config.get('key');
    _autoplay = _config.get('autoplay');
    const path = Assets.getPath(_config.get('path'));
    if (!path) return;

    _audio3D = self.initClass(Audio3D, {
      src:        path,
      autoplay:   false,
      volume:     _config.getNumber('volume'),
      loop:       _config.get('loop'),
      stream:     _config.get('stream'),
      positional: _config.get('positional'),
      label:      _config.get('label'),
      rolloff:    _config.getNumber('rolloff'),
    });

    let gain = _config.get('gain');
    if ('string' == typeof gain) gain = Number(gain);
    if (isFinite(gain)) _audio3D.gain = gain;

    if (_mesh) _mesh.add(_audio3D.group);
    self.flag('init', true);
  })();

  // Empty callback just to register in the render loop (visibility
  // tracking lives on Component).
  self.startRender(() => {});

  this.get('audio', () => _audio3D);

  this.play = async function () { await fadeIn();  };
  this.stop = async function () { await fadeOut(); };

  this.get('key', async () => (await self.wait('init'), _key));

  self.set('volume',  (volume)  => { _audio3D.volume  = volume;  });
  self.set('rolloff', (rolloff) => { _audio3D.rolloff = rolloff; });

  // Visibility hooks (autoplay-only fade-in; always fade-out).
  this.onVisible = async function () {
    if (!self.flag('init')) await self.wait('init');
    if (_audio3D && _autoplay) await fadeIn();
  };
  this.onInvisible = async function () {
    if (!self.flag('init')) await self.wait('init');
    if (_audio3D) await fadeOut();
  };
  this.onDestroy = function () { if (_audio3D) fadeOut(); };
});

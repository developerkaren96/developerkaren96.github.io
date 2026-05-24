/*
 * Video — wrapper around HTMLVideoElement standardising playback
 * control, lifecycle, and event surface so downstream consumers
 * (VideoTexture 0362, UI layers) don't touch the raw element.
 *
 * Construction (`new Video(_params)`):
 *   - If `_params.toJSON` exists, the param object is a UIL
 *     config — converted via `toJSON()`, with `autoPlay` →
 *     `autoplay` and a comma-string `events` field split into
 *     an array.
 *   - Defaults: muted true, loop false, autoplay false, inline
 *     true, controls false, currentTime 0, playback 1, preload
 *     false, 640×360, no extra events, `disableRemotePlayback`
 *     true (block AirPlay/Cast hijack of the element).
 *   - Source: `src` is either a string or an existing
 *     HTMLVideoElement. Strings missing a recognised extension
 *     (webm/mp4/ogv/blob/?) get appended with
 *     `Device.media.video` so the build can ship per-codec files
 *     and let Hydra pick the matching one (e.g. `clip.webm` vs
 *     `clip.mp4`). Element source → `_sharedVideo = true` and
 *     readyState bridging into the ready/loaded promises.
 *   - Auto-pipeline: autoplay → immediate `startPlayback()`,
 *     else preload → `startPreload()` (`_loadingState` flag is
 *     used to swallow a spurious `play` event fired during
 *     `load()`).
 *
 * Event surface (constants in the static-init block):
 *   PLAY, CANPLAY, LOADEDMETADATA, PAUSE, PROGRESS, UPDATE,
 *   PLAYING, BUFFERING, ENDED, WAITING, ERROR. Each handler
 *   forwards to `self.events.fire(...)`. `LOADEDMETADATA` also
 *   stamps `self.dimensions.{width,height}` from
 *   `videoWidth/videoHeight`.
 *   `onwaiting` / `onplaying` drive a `_buffering` flag that
 *   emits a `BUFFERING` event with `{isBuffering}`.
 *
 * Promises:
 *   - `ready()` resolves when `readyState >= 2` (HAVE_CURRENT_DATA).
 *   - `loaded()` resolves when `readyState >= 4` (HAVE_ENOUGH_DATA).
 *   Setting `src` recreates both promises.
 *
 * Properties (`set/get` reactive accessors):
 *   - loop / src / volume (mutes if v<0.001) / muted / controls.
 *   - duration, ended, playback (playbackRate), time, error,
 *     canRender (rs≥2), canPlayThrough (rs≥4), paused, buffering,
 *     bufferedSeconds, element / object ($video alias), video.
 *
 * Methods:
 *   - load() / play() / pause() / stop() (pause + seek(0)).
 *   - seek(t): uses `fastSeek` if available, else
 *     `currentTime`; `seekExact` always uses `currentTime`.
 *   - setSize(w, h) updates both attributes and dimensions.
 *   - onDestroy: stop, blank src (unless shared), remove all
 *     listeners and waiting/playing handlers, drop reference.
 */
Class(
  function Video(_params) {
    Inherit(this, Component);
    const self = this;
    let $video,
      _video,
      _loadingState,
      _handlers,
      _sharedVideo = false,
      _ready = Promise.create(),
      _loaded = Promise.create(),
      _initialPlay = true,
      _buffering = true;
    function startPreload() {
      return ((_loadingState = true), _video.load(), _ready);
    }
    async function startPlayback() {
      if (
        !self.playing &&
        ((_loadingState = false),
        _video.readyState < 2 && (_video.load(), await _ready),
        !self.playing)
      ) {
        _initialPlay &&
          ((_initialPlay = false),
          _params.currentTime && (_video.currentTime = _params.currentTime));
        self.playing = true;
        try {
          return await _video.play();
        } catch (error) {
          throw ((self.playing = false), error);
        }
      }
    }
    function getSource(src = '') {
      return (
        src &&
          !src.includes(['webm', 'mp4', 'ogv', 'blob', '?']) &&
          (src += '.' + Device.media.video),
        src
      );
    }
    function progress(e) {
      self.events.fire(Video.PROGRESS, e);
    }
    function timeupdate(e) {
      self.events.fire(Video.UPDATE, e);
    }
    function play(e) {
      if (_loadingState) return (_loadingState = false);
      self.events.fire(Video.PLAY, e);
    }
    function pause(e) {
      self.events.fire(Video.PAUSE, e);
    }
    function playing(e) {
      self.events.fire(Video.PLAYING, e);
    }
    function buffering(state) {
      self.events.fire(Video.BUFFERING, {
        isBuffering: state,
      });
    }
    function ended(e) {
      self.events.fire(Video.ENDED, e);
    }
    function waiting(e) {
      self.events.fire(Video.WAITING, e);
    }
    function canplay(e) {
      loadeddata();
      self.events.fire(Video.CANPLAY, e);
    }
    function loadedmetadata(e) {
      self.dimensions.width = _video.videoWidth;
      self.dimensions.height = _video.videoHeight;
      self.events.fire(Video.LOADEDMETADATA, e);
    }
    function loadeddata(e) {
      _video.readyState >= 2 && _ready.resolve();
      _video.readyState >= 4 && _loaded.resolve();
    }
    function error() {
      self.playing && (self.playing = false);
      self.events.fire(Video.ERROR, _video.error);
    }
    _params.toJSON &&
      (((_params = _params.toJSON()).autoplay = _params.autoPlay),
      'string' == typeof _params.events && (_params.events = _params.events.split(',')));
    (function initParam() {
      let defaults = {
        muted: true,
        loop: false,
        autoplay: false,
        inline: true,
        controls: false,
        currentTime: 0,
        playback: 1,
        preload: false,
        width: 640,
        height: 360,
        events: [],
        disableRemotePlayback: true,
      };
      _params = Object.assign(defaults, _params);
    })();
    (function init() {
      return (
        _params.src instanceof HTMLVideoElement
          ? ((_video = _params.src), (_sharedVideo = true))
          : ((_video = document.createElement('video')),
            _params.src && (_video.src = getSource(_params.src)),
            _video.setAttribute('crossorigin', 'anonymous'),
            (_video.disableRemotePlayback = _params.disableRemotePlayback),
            (_video.autoplay = _params.autoplay),
            (_video.loop = _params.loop),
            (_video.controls = _params.controls),
            (_video.height = _params.height),
            (_video.width = _params.width),
            (_video.defaultMuted = _params.muted),
            (_video.defaultPlaybackRate = _params.playback),
            (_video.preload =
              'string' == typeof _params.preload
                ? _params.preload
                : _params.preload
                  ? 'auto'
                  : 'none'),
            (_video.muted = _params.autoplay || _params.muted),
            _video.setAttribute('webkit-playsinline', _params.inline),
            _video.setAttribute('playsinline', _params.inline),
            _video.autoplay && _video.setAttribute('autoplay', _params.autoplay),
            _video.setAttribute('muted', _params.muted),
            _params.loop && _video.setAttribute('loop', _params.loop)),
        (self.dimensions = {
          width: _params.width,
          height: _params.height,
        }),
        (self.div = _video),
        ($video = $(_video)),
        _params.autoplay ? startPlayback() : _params.preload ? startPreload() : undefined
      );
    })();
    (function addHandlers() {
      ['loadedmetadata', 'loadeddata', 'error'].forEach((ev) => {
        _params.events.includes(ev) || _params.events.push(ev);
      });
      _handlers = {
        play: play,
        pause: pause,
        ended: ended,
        playing: playing,
        progress: progress,
        waiting: waiting,
        timeupdate: timeupdate,
        loadedmetadata: loadedmetadata,
        loadeddata: loadeddata,
        canplay: canplay,
        error: error,
      };
      _params.events.forEach((ev) => _video.addEventListener(ev, _handlers[ev], true));
      _video.onwaiting = (e) => {
        _buffering = true;
        buffering(_buffering);
      };
      _video.onplaying = (e) => {
        _buffering = false;
        buffering(_buffering);
      };
    })();
    (function initSharedVideo() {
      _sharedVideo &&
        (_video.readyState >= 1 &&
          ((self.dimensions.width = _video.videoWidth),
          (self.dimensions.height = _video.videoHeight)),
        _video.readyState >= 2 && _ready.resolve(),
        _video.readyState >= 4 && _loaded.resolve());
    })();
    this.set('loop', (bool) => (_video.loop = bool));
    this.get('loop', () => _video.loop);
    this.set('src', (src) => {
      (src = getSource(src)) !== _video.src &&
        ((_ready = Promise.create()),
        (_loaded = Promise.create()),
        (_video.src = src),
        self.playing
          ? ((self.playing = false), startPlayback())
          : _params.preload && startPreload());
    });
    this.get('src', () => _video.currentSrc);
    this.set('volume', (v) => {
      v < 0.001 && (_video.muted = true);
      _video.volume = v;
    });
    this.get('volume', () => _video.volume);
    this.set('muted', (bool) => (_video.muted = bool));
    this.get('muted', () => _video.muted);
    this.set('controls', (bool) => (_video.controls = bool));
    this.get('controls', () => _video.controls);
    this.get('duration', () => _video.duration);
    this.get('ended', () => _video.ended);
    this.get('playback', () => _video.playbackRate);
    this.get('time', () => _video.currentTime);
    this.get('error', () => _video.error);
    this.get('canRender', () => _video.readyState >= 2);
    this.get('canPlayThrough', () => _video.readyState >= 4);
    this.get('paused', () => _video.paused);
    this.get('buffering', () => _buffering);
    this.get('element', () => $video);
    this.get('object', () => $video);
    this.get('video', () => _video);
    this.get('bufferedSeconds', (_) =>
      _video.readyState < 2 ? 0 : _video.buffered.end(0) - _video.buffered.start(0),
    );
    this.load = async function () {
      return startPreload();
    };
    this.play = async function () {
      return startPlayback();
    };
    this.pause = function () {
      self.playing = false;
      _video.pause();
    };
    this.stop = function () {
      self.playing = false;
      _video.pause();
      self.seek(0);
    };
    this.seek = function (t) {
      if (_video.fastSeek) return _video.fastSeek(t);
      _video.currentTime = t;
    };
    this.seekExact = function (t) {
      _video.currentTime = t;
    };
    this.ready = function () {
      return _ready;
    };
    this.loaded = function () {
      return _loaded;
    };
    this.onDestroy = function () {
      self.stop();
      _sharedVideo || (_video.src = '');
      (function removeListeners() {
        _params.events.forEach((ev) => _video.removeEventListener(ev, _handlers[ev], true));
        _video.onwaiting = () => {};
        _video.onplaying = () => {};
      })();
      _video = null;
    };
    this.setSize = function (width, height) {
      _video.width = width;
      _video.height = height;
      self.dimensions.width = width;
      self.dimensions.height = height;
    };
  },
  () => {
    Video.PLAY = 'hydra_video_play';
    Video.CANPLAY = 'hydra_video_can_play';
    Video.LOADEDMETADATA = 'hydra_video_loaded_metadata';
    Video.PAUSE = 'hydra_video_pause';
    Video.PROGRESS = 'hydra_video_progress';
    Video.UPDATE = 'hydra_video_update';
    Video.PLAYING = 'hydra_video_playing';
    Video.BUFFERING = 'hydra_video_buffering';
    Video.ENDED = 'hydra_video_ended';
    Video.WAITING = 'hydra_video_waiting';
    Video.ERROR = 'hydra_video_error';
  },
);

/*
 * VideoTexture — adapter that turns a Video (0361) into a GL
 * Texture for use as a shader uniform. Hosts the Video element
 * inside a hidden DOM container (`VideoTexture.element()` —
 * absolute, pointer-events none, size 0×0, z-index -10) so the
 * browser will actually decode frames.
 *
 * Construction forms:
 *   - `new VideoTexture('clip.mp4')` — basic.
 *   - `new VideoTexture({path:'clip.mp4', loop, preload, ...})` —
 *     options-object form (path is stripped before passing
 *     remaining props to Video).
 *   - `new VideoTexture(htmlVideoElement, props)` — share an
 *     existing element (sets `_sharedVideo` true, disables
 *     autoplay/preload, subscribes to its PLAY/PAUSE to mirror
 *     the active state).
 *   - Image fallback: if path ends in jpg/png, skips Video and
 *     loads a plain texture (so a single VideoTexture call site
 *     can accept either media type at config time).
 *
 * Defaults: loop true, preload true, autoplay true, muted true,
 * fps 30, firstFrame false, parseColor false.
 *
 * Per-frame update path (`update`):
 *   - First-frame promotion: if `firstFrame` is set, the
 *     texture starts as a JPG poster (`Utils3D.getTexture(firstFrame)`)
 *     and only swaps to the video texture once Video fires
 *     PLAYING.
 *   - Uploads the HTMLVideoElement into the GL texture
 *     (RGBFormat, LINEAR min/mag, no mipmaps) and flags
 *     `loaded`/`needsUpdate` so the renderer re-uploads next
 *     draw.
 *   - Optional `colorParser` (VideoTextureColorParser, 0363) is
 *     ticked per frame.
 *
 * Frame scheduling:
 *   - Prefers `requestVideoFrameCallback` (per-decoded-frame
 *     update — avoids redundant uploads on idle frames). Safari
 *     is force-disabled because its implementation is buggy/
 *     non-spec.
 *   - Falls back to a standard render slot at `fps` Hz in
 *     `BEFORE_RENDER`.
 *
 * Public surface:
 *   - reactive `loop` / `muted` / `src` setters.
 *   - `start()` / `stop()` / `seek(t)` (no-op for shared video).
 *   - `onInvisible()` / `onVisible()` — pause/resume + detach/
 *     reattach the video element to the hidden container (saves
 *     decode cost when the consumer is off-screen).
 *   - `uniform` — `{value: texture}` object that shader code can
 *     reference directly.
 */
Class(
  function VideoTexture(_path, _props = {}) {
    Inherit(this, Component);
    const self = this;
    let _video,
      _requestId,
      _hasRequestCallback = false,
      _sharedVideo = false;
    if (
      ((self.canUpdate = true), 'object' == typeof _path && !(_path instanceof HTMLVideoElement))
    ) {
      let path = _path.path;
      _props = _path;
      _path = path;
      delete _props.path;
    }
    let {
      loop: loop,
      preload: preload,
      autoplay: autoplay,
      muted: muted,
      firstFrame: firstFrame,
      parseColor: parseColor,
      fps: fps,
      events = [],
    } = _props;
    function update() {
      if (((_requestId = null), !self.destroy || !_video.destroy)) return;
      let updateTex = _video.canRender && self.canUpdate;
      firstFrame && updateTex && (updateTex = _video.time > 0);
      updateTex &&
        (self.videoTexture &&
          (self.texture.destroy(), (self.texture = self.videoTexture), delete self.videoTexture),
        self.texture.image || ((self.texture.image = _video.video), self.texture.upload()),
        self.colorParser && self.colorParser.update(_video.time),
        (self.texture.loaded = self.texture.needsUpdate = true),
        (self.uniform.value = self.texture));
      _hasRequestCallback && (_requestId = _video.element.div.requestVideoFrameCallback(update));
    }
    function noop() {}
    function handleSharedVideoPlaying() {
      start();
    }
    function handleSharedVideoPause() {
      stop();
    }
    function start() {
      self.active = true;
      _requestId && (_video.element.div.cancelVideoFrameCallback(_requestId), (_requestId = null));
      _hasRequestCallback
        ? self.startRender(noop)
        : self.startRender(update, fps, RenderManager.BEFORE_RENDER);
      update();
    }
    function stop() {
      self.active = false;
      _hasRequestCallback
        ? _requestId && _video.element.div.cancelVideoFrameCallback(_requestId)
        : self.stopRender(update);
    }
    undefined === loop && (loop = true);
    undefined === preload && (preload = true);
    undefined === autoplay && (autoplay = true);
    undefined === muted && (muted = true);
    undefined === firstFrame && (firstFrame = false);
    undefined === parseColor && (parseColor = false);
    undefined === events && (events = []);
    undefined === fps && (fps = 30);
    self.uniform = {
      value: null,
    };
    (function () {
      let src;
      if (
        (_props.start && defer((_) => self.start()),
        _path instanceof HTMLVideoElement
          ? ((_sharedVideo = true),
            (src = _path),
            (autoplay = false),
            (preload = false),
            (events = [...events, 'pause']))
          : (src = _path.includes('blob') ? _path : Assets.getPath(_path)),
        !_sharedVideo && _path.includes(['jpg', 'png']))
      ) {
        let noop = (_) => {};
        self.texture = Utils3D.getTexture(src);
        self.video = {
          play: noop,
          pause: noop,
        };
        parseColor && (self.colorParser = self.initClass(VideoTextureColorParser, src, true));
      } else {
        let videoEvents = ['timeupdate', 'playing', 'ended'];
        if (
          (events.forEach((ev) => {
            videoEvents.includes(ev) || videoEvents.push(ev);
          }),
          (_video = self.initClass(Video, {
            src: src,
            loop: loop,
            preload: preload,
            autoplay: autoplay,
            muted: muted,
            events: videoEvents,
          })),
          (self.texture = new Texture()),
          (self.texture.format = Texture.RGBFormat),
          (self.texture.minFilter = self.texture.magFilter = Texture.LINEAR),
          (self.texture.generateMipmaps = false),
          (self.texture.loaded = false),
          (self.video = _video),
          (self.dimensions = _video.dimensions),
          (self.texture.dimensions = self.dimensions),
          self.events.bubble(_video, Video.PLAYING),
          parseColor && (self.colorParser = self.initClass(VideoTextureColorParser, src, false)),
          firstFrame)
        ) {
          self.videoTexture = self.texture;
          self.texture = Utils3D.getTexture(firstFrame);
          const update = (_) => {
            self.texture = self.videoTexture;
            self.events.unsub(_video, Video.PLAYING, update);
          };
          self.events.sub(_video, Video.PLAYING, update);
        }
      }
      self.uniform.value = self.texture;
      _hasRequestCallback = 'requestVideoFrameCallback' in HTMLVideoElement.prototype;
      'safari' === Device.system.browser && (_hasRequestCallback = false);
      _sharedVideo &&
        (function initSharedVideo() {
          self.events.sub(_video, Video.PLAYING, handleSharedVideoPlaying);
          self.events.sub(_video, Video.PAUSE, handleSharedVideoPause);
          !_video.paused && _video.video.readyState >= 2 && handleSharedVideoPlaying();
        })();
    })();
    this.set('loop', (loop) => (_video.loop = loop));
    this.set('muted', (muted) => (_video.muted = muted));
    this.set('src', (src) => {
      _requestId && (_video.element.div.cancelVideoFrameCallback(_requestId), (_requestId = null));
      _video.src = src.includes('blob') ? src : Assets.getPath(src);
      _hasRequestCallback && (_requestId = _video.element.div.requestVideoFrameCallback(update));
    });
    this.start = async function () {
      _sharedVideo || (_video && (start(), await _video.play()));
    };
    this.stop = function () {
      _sharedVideo || (_video && (stop(), _video.pause()));
    };
    this.seek = function (time) {
      _sharedVideo || (_video && _video.seek(time));
    };
    this.onInvisible = function () {
      _sharedVideo ||
        (self.active && _video.pause(),
        VideoTexture.element().removeChild(self.video.object, true));
    };
    this.onVisible = function () {
      _sharedVideo || (self.active && _video.play(), VideoTexture.element().add(self.video.object));
    };
    this.onDestroy = function () {
      self.texture.destroy();
      _sharedVideo || VideoTexture.element().removeChild(self.video.object, true);
    };
  },
  (_) => {
    var $element;
    VideoTexture.element = function () {
      return (
        $element ||
          (($element = Stage.create('VideoTextures')).css({
            position: 'absolute',
            pointerEvents: 'none',
            left: 0,
            top: 0,
            overflow: 'hidden',
          }),
          $element.size(0, 0).setZ(-10),
          Stage.add($element)),
        $element
      );
    };
  },
);

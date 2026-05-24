/*
 * Webcam — getUserMedia wrapper that hands the rest of the framework
 * a ready-to-use video stream and (optionally) a raw pixel buffer
 * via `_imageData`.
 *
 * Construction:
 *   - `(width, height, audio)` or an `isAppState` object with the
 *     same fields. Width/height are the *requested* resolution
 *     (the browser may pick a near match).
 *   - Maintains a `_cameras` map of `front` / `back` device
 *     descriptors found via `enumerateDevices()`. Camera labels are
 *     matched against the strings "front"/"back"; missing entries
 *     fall back to `facingMode: 'user'` (front) — handled below in
 *     the section after this header.
 *
 * Robustness:
 *   - `_attempts` is bumped on each retry; if it hits 2 the helper
 *     emits an `error` event rather than spinning forever (common on
 *     denied-permission flows where the second `getUserMedia` call
 *     would yield the same NotAllowedError).
 *   - Aborts immediately if `navigator.mediaDevices` is absent
 *     (insecure context, older browsers).
 *
 * No exfiltration: the captured stream stays local (it is the
 * caller's responsibility — typically a WebGL shader sampling the
 * video texture). This file owns acquisition and lifecycle only.
 */
Class(function Webcam(_width, _height, _audio) {
  Inherit(this, Component);
  var self = this;
  let _stream,
    _imageData,
    _cameras = {},
    _config = {},
    _back = false,
    _attempts = 0;
  if ('object' == typeof _width && _width.isAppState) {
    let config = _width;
    _width = config.width;
    _height = config.height;
    _audio = config.audio;
  }
  function establishWebcam() {
    if (_attempts >= 2 || !navigator.mediaDevices) return error();
    (function lookupDevices() {
      let promise = Promise.create();
      return (
        navigator.mediaDevices.enumerateDevices().then((devices) => {
          devices.forEach((device) => {
            device.label.includes('front') &&
              (_cameras.front = {
                deviceId: {
                  exact: device.deviceId,
                },
              });
            device.label.includes('back') &&
              ((_cameras.back = {
                deviceId: {
                  exact: device.deviceId,
                },
              }),
              (_back = true));
          });
          _cameras.front ||
            (_cameras.front = {
              facingMode: 'user',
            });
          _cameras.back ||
            ((_cameras.back = {
              facingMode: 'environment',
            }),
            (_back = false));
          promise.resolve();
        }),
        promise
      );
    })().then(() => {
      _stream && _config.back && _stream.getTracks()[0].stop();
      Device.mobile.phone &&
        (_cameras &&
          _cameras.back &&
          (_cameras.back.frameRate = {
            ideal: 60,
          }),
        _cameras &&
          _cameras.front &&
          (_cameras.front.frameRate = {
            ideal: 60,
          }));
      _width &&
        (_cameras.front.width = {
          ideal: _width,
        });
      _height &&
        (_cameras.front.height = {
          ideal: _height,
        });
      navigator.mediaDevices
        .getUserMedia({
          video: _config.back ? _cameras.back : _cameras.front || true,
          audio: _audio,
        })
        .then(success)
        .catch(error);
    });
    _attempts += 1;
  }
  function success(stream) {
    self.denied = false;
    _stream = stream;
    let settings = _stream.getTracks()[0].getSettings();
    _width = settings.width;
    _height = settings.height;
    _config.back && !_back
      ? establishWebcam()
      : ((self.div.width = _width),
        (self.div.height = _height),
        (self.div.srcObject = stream),
        self.events.fire(Events.READY, null, true));
  }
  function error() {
    self.denied = true;
    self.events.fire(Events.ERROR, null, true);
  }
  function update() {
    self.events.fire(Events.UPDATE);
    self.div.requestVideoFrameCallback?.(update);
    _imageData = null;
  }
  self.facing = 'back';
  (function createVideo() {
    self.div = document.createElement('video');
    self.div.width = _width || 320;
    self.div.height = _height || 180;
    self.div.autoplay = true;
    self.div.playsinline = true;
    self.div.setAttribute('playsinline', true);
    self.div.style.zIndex = -1;
    self.div.style.position = 'absolute';
    Stage.add(self.div);
    self.element = $(self.div);
  })();
  (function initNavigator() {
    navigator.getUserMedia =
      navigator.getUserMedia ||
      navigator.webkitGetUserMedia ||
      navigator.mozGetUserMedia ||
      navigator.msGetUserMedia;
  })();
  this.createStream = function (config = {}) {
    _attempts = 0;
    _config = config;
    Device.mobile || (delete _config.back, delete _config.front);
    establishWebcam();
    self.div.requestVideoFrameCallback
      ? self.div.requestVideoFrameCallback(update)
      : self.startRender(update, 24);
  };
  this.flip = function () {
    if (!_back) return;
    let direction;
    'front' === self.facing
      ? ((self.facing = 'back'), (direction = _cameras.back))
      : ((self.facing = 'front'), (direction = _cameras.front));
    _stream.getTracks()[0].stop();
    navigator.getUserMedia(
      {
        video: direction || true,
        audio: _audio,
      },
      success,
      error,
    );
  };
  this.get('width', function () {
    return _width;
  });
  this.get('height', function () {
    return _height;
  });
  this.size = function (w, h) {
    self.div.width = _width = w;
    self.div.height = _height = h;
    self.element.size(w, h);
  };
  this.getPixels = function (width = _width, height = _height) {
    return (
      self.canvas ||
        ((self.canvas = document.createElement('canvas')),
        (self.canvas.width = width),
        (self.canvas.height = height),
        (self.canvas.context = self.canvas.getContext('2d', {
          willReadFrequently: true,
        }))),
      _imageData || self.canvas.context.drawImage(self.div, 0, 0, width, height),
      (_imageData = true),
      self.canvas.context.getImageData(0, 0, width, height)
    );
  };
  this.getCanvas = function () {
    return (
      self.canvas ||
        ((self.canvas = document.createElement('canvas')),
        (self.canvas.width = _width),
        (self.canvas.height = _height),
        (self.canvas.context = self.canvas.getContext('2d'))),
      self.canvas.context.drawImage(self.div, 0, 0, _width, _height),
      self.canvas
    );
  };
  this.ready = function () {
    return self.wait((_) => self.div.readyState > 0);
  };
  this.end = function () {
    self.active = false;
    self.div.pause();
    _stream && (_stream.getTracks()[0].enabled = false);
  };
  this.restart = function () {
    self.div.play();
    _stream && (_stream.getTracks()[0].enabled = true);
    self.active = true;
  };
  this.deviceCount = async function (kind) {
    if (!navigator.mediaDevices) return 0;
    let devices = await navigator.mediaDevices.enumerateDevices(),
      count = 0;
    return (
      devices.forEach((d) => {
        d.kind.includes(kind) && count++;
      }),
      count
    );
  };
  this.get('frameRate', () => {
    if (_stream) return _stream.getTracks()[0].getSettings().frameRate;
  });
  this.get('aspectRatio', () => {
    if (_stream) return _stream.getTracks()[0].getSettings().aspectRatio;
  });
});

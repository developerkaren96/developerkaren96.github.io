/*
 * VideoTextureColorParser — companion to VideoTexture (0362)
 * that exposes a synchronised "dominant colour" track for a
 * video. Lets UI/scene lighting tint along with the playing
 * clip without having to read pixels from the video each frame.
 *
 * Data format: a sibling JSON file next to the video (same
 * basename, `.json` extension) of shape:
 *   `{ "<timeInSec>": "rrggbb", ... }`
 * The JSON is fetched on construction (`get(path)`).
 *
 * Per-tick (`update(time)` called from VideoTexture.update):
 *   - Walks keys in order; first key with `time <= key` defines
 *     the target colour for the current segment.
 *   - Lerps `self.color` toward that target by `self.lerp`
 *     (default 1 = snap). Setting `lerp` to a small value gives
 *     a smoothed colour track.
 *
 * Note: iteration order relies on numeric-string keys staying
 * sorted in the JSON (the producer writes them in chronological
 * order). The `_static` constructor arg is accepted but unused
 * here — relevant only to the still-image path in 0362.
 */
Class(function VideoTextureColorParser(_path, _static) {
  Inherit(this, Component);
  const self = this;
  var _colorData,
    _color = new Color();
  this.color = new Color();
  this.lerp = 1;
  (async function () {
    let path = _path.split('.')[0] + '.json';
    _colorData = await get(path);
  })();
  this.update = function (time) {
    if (_colorData)
      for (let key in _colorData)
        if (time <= key) {
          _color.set('#' + _colorData[key]);
          self.color.lerp(_color, self.lerp);
          break;
        }
  };
});

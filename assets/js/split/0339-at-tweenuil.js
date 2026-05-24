/*
 * TweenUIL — static singleton: registry + scheduler for tweens
 * authored through the editor. Each named tween is a wrapped
 * Theatre.js sequence (`TweenUILConfig`, sibling file).
 *
 * Folders / cache:
 *   - `_activeFolder` (default "Tweens") groups newly-created
 *     tweens under a UILFolder in `UIL.global`. `setFolder(name)`
 *     switches the bucket for subsequent `create()` calls.
 *   - `_cache[name]` memoises per-name tweens. `nocache` mode
 *     (passing `'nocache'` as the group) creates a fresh tween
 *     and bumps `_counters[name]` so the UIL prefix doesn't
 *     collide with the cached one (used for transient one-shot
 *     tweens that shouldn't share storage with the original).
 *
 * Theatre RAF override:
 *   - `Theatre.core.setCoreRafDriver(no-op)` disables Theatre's
 *     built-in animation loop; we drive tweens manually via the
 *     Hydra render manager so they respect HZ_MULTIPLIER and
 *     pause cleanly with the scene.
 *
 * Server-synced playback:
 *   - `setServerTimeGetter(fn)` registers the canonical time
 *     source (multiplayer / GameCenter).
 *   - `playSynchronized(tween)` preloads, flips `manualRender`,
 *     and prepends to `_synchronizedTweens`. The per-frame
 *     `synchronizedPlaybackLoop` then computes
 *     `(serverTime % duration) / duration` and calls
 *     `tween.seekImmediate(progress)`. Tweens missing
 *     `seekImmediate` (destroyed) are spliced out; when the list
 *     empties, the render loop stops itself.
 *
 * Events:
 *   - `TOGGLE = 'tweenuil_toggle'` is the editor's expand/play
 *     channel (other code subscribes to it to react to user
 *     toggling a tween on/off).
 */
Class(function TweenUIL() {
  Inherit(this, Component);
  const self = this;
  var _getServerTime,
    _folders = {},
    _activeFolder = 'Tweens',
    _cache = {},
    _counters = {},
    _synchronizedTweens = [];
  function synchronizedPlaybackLoop() {
    let i = _synchronizedTweens.length - 1;
    if (i < 0) return;
    let serverTime = _getServerTime();
    for (; i >= 0; ) {
      let tween = _synchronizedTweens[i];
      if (tween.seekImmediate) {
        let duration = 1e3 * tween.duration,
          progress = (serverTime % duration) / duration;
        tween.seekImmediate(progress);
        i -= 1;
      } else if ((_synchronizedTweens.splice(i, 1), 0 === _synchronizedTweens.length)) {
        self.stopRender(synchronizedPlaybackLoop);
        break;
      }
    }
  }
  self.jsons = {};
  this.TOGGLE = 'tweenuil_toggle';
  Theatre.core.setCoreRafDriver(
    Theatre.core.createRafDriver({
      name: 'no-op driver',
    }),
  );
  self.startRender(synchronizedPlaybackLoop);
  this.create = function (name, config, group) {
    'boolean' == typeof group && (group = undefined);
    let noCache = false;
    'nocache' == group &&
      ((_counters[name] = (_counters[name] || 0) + 1), (noCache = true), (group = undefined));
    let folderName = _activeFolder;
    if (
      ('string' == typeof group && ((folderName = group), (group = null)),
      _folders[folderName] ||
        (function initFolder() {
          if (UIL.global) {
            let folder = new UILFolder(_activeFolder, {
              label: _activeFolder,
              closed: true,
            });
            _folders[_activeFolder] = folder;
            UIL.global.add(folder);
          }
        })(),
      !_cache[name] || noCache)
    ) {
      let tween = new TweenUILConfig(name, config, group || _folders[folderName], _counters[name]);
      tween._bindOnDestroy((_) => {
        delete _cache[name];
      });
      _cache[name] = tween;
    }
    return _cache[name];
  };
  this.setFolder = function (name) {
    _activeFolder = name;
  };
  this.setServerTimeGetter = function (getServerTime) {
    _getServerTime = getServerTime;
  };
  this.playSynchronized = async function (tween) {
    _getServerTime
      ? (await tween.preload(),
        tween.progress,
        (tween.manualRender = true),
        _synchronizedTweens.unshift(tween))
      : console.error(
          'Need to call TweenUIL.setServerTimeGetter(() => time) before using TweenUIL.playSynchronized()',
        );
  };
  this.stopSynchronized = function (tween) {
    _synchronizedTweens.remove(tween);
  };
}, 'static');

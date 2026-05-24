/*
 * UILExternalFilePicker — pops out a separate browser window
 * (`localhost/hydra/editor/filepicker/index.html`, 800×700)
 * showing thumbnails/file-list for a given asset bucket. Used
 * by image- and geometry-typed UIL controls so authors can
 * browse the full asset catalogue without cramming it into the
 * sidebar.
 *
 * Buckets (`type`):
 *   - `'textures'`   → `assets/images`,    `window.UIL_ASSETS_TEXTURES`.
 *   - `'geometries'` → `assets/geometry`,  `window.UIL_ASSETS_GEOMETRIES`.
 * Both globals are populated by sourcing
 * `assets/js/app/config/UILAssetsConfig.js` (loaded with
 * `Dev.execUILScript('assetsconfig')` and then `eval`-ed inside
 * `init()` to define the lists in the editor frame).
 *
 * Lifecycle:
 *   - On load, opens the popup and calls
 *     `initPicker(self, basePath, list)` inside its scope.
 *   - On selection, the popup calls `self.update(value)` which
 *     invokes the constructor's `callback`.
 *   - `refresh()` closes & re-opens the popup to reload the
 *     asset list (useful after the user adds files on disk).
 *   - `beforeunload` on the host page triggers `onDestroy`,
 *     closing the popup.
 */
Class(function UILExternalFilePicker(callback, type = 'textures') {
  Inherit(this, Component);
  const self = this;
  var _window;
  async function init() {
    const assets = await get(Assets.getPath('assets/js/app/config/UILAssetsConfig.js'));
    let basePath, list;
    eval(assets);
    'textures' === type &&
      ((basePath = `${document.location.pathname}/assets/images`),
      (list = window.UIL_ASSETS_TEXTURES));
    'geometries' === type &&
      ((basePath = `${document.location.pathname}/assets/geometry`),
      (list = window.UIL_ASSETS_GEOMETRIES));
    _window = window.open(
      `${location.protocol}//localhost/hydra/editor/filepicker/index.html`,
      'pick file',
      'width=800,height=700',
    );
    self.events.sub(Events.UNLOAD, (_) => _window.close());
    _window.window.onload = (_) => {
      _window.window.initPicker(self, basePath, list);
    };
    window.addEventListener('beforeunload', onReload);
  }
  function onReload() {
    self.onDestroy();
  }
  !(async function () {
    await Dev.execUILScript('assetsconfig');
    await init();
  })();
  this.refresh = function () {
    _window && _window.window && _window.window.close();
    init();
  };
  this.update = function (value) {
    callback && callback(value);
  };
  this.onDestroy = function () {
    window.removeEventListener('beforeunload', onReload);
    _window && _window.window && _window.window.close();
  };
});

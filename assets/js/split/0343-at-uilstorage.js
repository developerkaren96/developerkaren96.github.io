/*
 * UILStorage — singleton key/value store backing every UIL
 * panel. Acts as the persistence layer + reactive state for
 * editor data. Values are namespaced under `_id` (from
 * `window.UIL_ID`, sanitised to `[a-zA-Z0-9 _-]`).
 *
 * Persistence backends:
 *   - `UILFile`    — disk JSON file (default `assets/data/uil.json`),
 *     used in production and editor-static builds.
 *   - `UILRemote`  — Firebase-backed live storage, used during
 *     active editing sessions.
 *   - The choice is made by `uilFile()` which inspects build /
 *     query flags (`editMode`, `Config.PLATFORM_CONFIG`, `uil`,
 *     mobile vs desktop, `_BUILT_`, `AURA`, `_UIL_FILE_`, etc.).
 *
 * Boot flow (`init()`):
 *   - Loads either the file or remote backend.
 *   - If the file returned `null` (corrupt / merge conflicts),
 *     prompts the user to pull from Firebase, then reloads.
 *   - Populates `self.state` (AppState) so consumers can
 *     subscribe reactively, and assigns into `_data[_id]`.
 *   - Offline → online sync: if `Storage.get('uil_update_partial')`
 *     is set, asks the user before merging `uil-partial.json`
 *     into the live remote and clearing the partial.
 *
 * `write(direct, silent)`:
 *   - Fires `SAVE` event so other systems can defer or veto
 *     (via `e.wait()` + `e.prevent()`).
 *   - Hands `_dataSession` (changed keys only) + the full
 *     `_data[_id]` to the backend.
 *   - Briefly hides `<body>` so DOM flicker from re-init is
 *     invisible (100ms blink).
 *
 * Public API (later in file): `get/set`, `bind` on `state`,
 * `write()`, `SAVE` event, etc. The headerd block above
 * documents the boot/persistence portion; the rest is the
 * standard key/value surface.
 */
Class(function UILStorage() {
  Inherit(this, Component);
  const self = this;
  var _storage,
    _platform,
    _fs,
    _keys,
    _storeIds = [],
    _data = {},
    _dataSession = {},
    _id = window.UIL_ID || 'default',
    _remote = window.UIL_REMOTE || false;
  window.UIL_ID = _id = _id.replaceAll(/[^a-zA-Z0-9 _-]/g, '');
  this.SAVE = 'uil_save';
  this.state = AppState.createLocal();
  const OFFLINE_FIREBASE = Utils.query('offlineFB');
  function clearOfflineData() {
    Storage.set('uil_update_partial', false);
    Dev.writeFile('assets/data/uil-partial.json', {});
  }
  async function init() {
    _fs && _fs.destroy();
    _fs = self.initClass(uilFile() ? UILFile : UILRemote, OFFLINE_FIREBASE);
    let data = await _fs.load();
    if (null === data) {
      let remoteFs = self.initClass(UILRemote),
        remoteData = await remoteFs.load();
      confirm(
        'Looks like the local uil.json has merge conflicts, do you want to sync from Firebase and resolve it?',
      )
        ? ((_data[_id] = remoteData), await write(), window.location.reload())
        : (data = {});
    }
    for (let key in data) self.state.set(key, data[key]);
    if (
      ((_data[_id] = data),
      (self.loaded = true),
      !OFFLINE_FIREBASE && Storage.get('uil_update_partial') && !uilFile())
    ) {
      if (
        !confirm(
          'Looks like you have UIL data captured offline, do you want to sync it to Firebase?',
        )
      )
        return clearOfflineData();
      let data = await get('assets/data/uil-partial.json');
      for (let key in data) self.set(key, data[key]);
      write(true, true);
      clearOfflineData();
    }
  }
  async function write(direct, silent) {
    let prevent = false,
      e = {
        prevent: (_) => (prevent = true),
      };
    self.events.fire(self.SAVE, e);
    (!direct && (e.wait && (await e.wait()), prevent)) ||
      (_fs.save(_dataSession, _data[_id]),
      (_dataSession = {}),
      silent ||
        (__body.css({
          display: 'none',
        }),
        self.delayedCall(() => {
          __body.css({
            display: 'block',
          });
        }, 100)));
  }
  function uilFile() {
    return (
      !Utils.query('editMode') &&
      (!Hydra.LOCAL ||
        (!(window.Config && Config.PLATFORM_CONFIG && Utils.query('uil')) &&
          (!!Device.mobile ||
            !!OFFLINE_FIREBASE ||
            !(!window._BUILT_ || Hydra.LOCAL) ||
            !!window.AURA ||
            !!window._UIL_FILE_ ||
            (!window._FIREBASE_UIL_ && !window.UIL_ID) ||
            (!Device.detect('hydra') && !Utils.query('uil')))))
    );
  }
  Hydra.ready(async (_) => {
    window.Platform && Platform.isDreamPlatform && Config.PLATFORM_CONFIG
      ? (async function initLocalCached() {
          _fs = self.initClass(UILFile);
          _data[_id] = await _fs.load();
          self.loaded = true;
        })()
      : (Hydra.LOCAL && window.Platform && window.Platform.isPlatform) || init();
    (Utils.query('editMode') ||
      (Hydra.LOCAL && window.Platform && window.Platform.isDreamPlatform && Utils.query('uil')) ||
      (Hydra.LOCAL &&
        !Device.mobile &&
        !window._BUILT_ &&
        (Utils.query('uil') || Device.detect('hydra')))) &&
      __window.bind('keydown', (e) => {
        (e.ctrlKey || e.metaKey) && 83 == e.keyCode && (e.preventDefault(), write());
      });
  });
  this.reload = function (id, path, persist) {
    self.loaded = false;
    _platform || (_platform = _id);
    persist && _storeIds.push(id);
    _id = id;
    window.UIL_ID = id;
    window.UIL_STATIC_PATH = path;
    init();
  };
  this.set = function (key, value) {
    if (undefined === value)
      return console.warn(`Trying to set UILStorage with an undefined value for ${key}`);
    self.state.set(key, value);
    null === value
      ? (delete _data[_id][key], (_dataSession[key] = value))
      : ((_data[_id][key] = value), (_dataSession[key] = value));
  };
  this.setWrite = function (key, value) {
    this.set(key, value);
    write(true);
  };
  this.clearMatch = function (string) {
    for (let key in _data[_id]) key.includes(string) && delete _data[_id][key];
    write(true);
  };
  this.write = function (silent) {
    write(true, silent);
  };
  this.get = function (key) {
    let val = _data[_id] && _data[_id][key];
    if (
      (undefined === val && _platform && (val = _data[_platform][key]),
      undefined === val && _storeIds)
    )
      for (let i = 0; i < _storeIds.length; i++)
        try {
          val = _data[_storeIds[i]][key];
        } catch (e) {
          val = undefined;
        }
    return val;
  };
  this.ready = function () {
    return self.wait(self, 'loaded');
  };
  this.getKeys = function () {
    return (_keys || (_keys = Object.keys(_data[_id])), _keys);
  };
  this.hasData = function () {
    return !!_data[_id];
  };
  self.uploadFileToRemoteBucket = async function ({ file: file, progress: progress }) {
    if (!_remote) return;
    _storage || (await Services.ready(), (_storage = Services.app().storage()));
    let filename = file.name.replace(/ /g, '_');
    const ref = _storage.ref(`_tmp/${filename}`),
      path =
        `https://storage.googleapis.com/${ref.bucket}/uploads/${_id}/${filename}`.toLowerCase(),
      metadata = {
        customMetadata: {
          id: _id,
          path: path,
          contentType: file.type,
        },
      },
      result = ref.put(file, metadata);
    let exists;
    for (
      progress &&
      result.on(
        'state_changed',
        (snapshot) => {
          let _progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 95;
          progress.css({
            width: _progress + '%',
          });
        },
        (error) => {
          err && console.log(error);
          progress.css({
            width: 0,
          });
        },
        () => {
          progress.css({
            width: 0,
          });
        },
      );
      !exists;
    )
      try {
        (await fetch(path).then((r) => r.ok)) && (exists = true);
      } catch (err) {
        exists = false;
      }
    return metadata;
  };
  this.parse = function (key, hint) {
    let data = _data[_id][key];
    if (undefined === data) return null;
    if (Array.isArray(data)) {
      if (hint instanceof Vector2)
        return {
          value: new Vector2().fromArray(data),
        };
      if (hint instanceof Vector3)
        return {
          value: new Vector3().fromArray(data),
        };
      if (hint instanceof Vector4)
        return {
          value: new Vector4().fromArray(data),
        };
    } else if ('string' == typeof data) {
      if ('#' === data.charAt(0))
        return {
          value: new Color(data),
        };
      if (!isNaN(data))
        return {
          value: Number(data),
        };
    }
    return {
      value: data,
    };
  };
}, 'static');

/*
 * UILFile — disk persistence layer for `UILStorage`. In editor
 * builds the storage tree round-trips through a single JSON file
 * (default `assets/data/uil.json`, overridable via
 * `window.UIL_STATIC_PATH`).
 *
 * `load()`:
 *   - Fetches the path via `get()`. If the request returns a
 *     string (server fell back to HTML error/index page), treat
 *     it as "no UIL data": return `null` when local (force
 *     editor first-run), else `{}`.
 *   - Any thrown error → `{}` (empty storage, editor starts
 *     fresh).
 *
 * `save(sessionData, data)`:
 *   - Writes the full `data` blob to the same path via
 *     `Dev.writeFile` (dev-only file-write proxy).
 *   - When `_offline` mode is set, also maintains a
 *     `assets/data/uil-partial.json` containing only the keys
 *     modified during the current session (sessionData); merges
 *     with whatever partial exists on disk. Sets
 *     `Storage.set('uil_update_partial', true)` so a later sync
 *     can apply the partial to a remote/origin copy of the data.
 *
 * Constructor args (`_offline`, `_path`) are stored but only
 * `_offline` is used today — `_path` is read from
 * `window.UIL_STATIC_PATH` instead of the constructor arg, so
 * the path can be set globally before this is instantiated.
 */
Class(function UILFile(_offline, _path) {
  Inherit(this, Component);
  this.load = async function () {
    let path = window.UIL_STATIC_PATH || 'assets/data/uil.json';
    try {
      let data = await get(path);
      return 'string' == typeof data ? (Hydra.LOCAL ? null : {}) : data;
    } catch (e) {
      return {};
    }
  };
  this.save = async function (sessionData, data) {
    if ((Dev.writeFile(window.UIL_STATIC_PATH || 'assets/data/uil.json', data), _offline)) {
      let partial = {};
      try {
        partial = await get('assets/data/uil-partial.json', data);
        for (let key in sessionData) partial[key] = sessionData[key];
      } catch (e) {
        partial = sessionData;
      }
      Dev.writeFile('assets/data/uil-partial.json', partial);
      Storage.set('uil_update_partial', true);
    }
  };
});

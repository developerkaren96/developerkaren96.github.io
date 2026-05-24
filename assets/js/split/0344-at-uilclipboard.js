/*
 * UILClipboard — static singleton: in-memory clipboard for
 * UILFolder values. Lets the editor copy a folder's children
 * verbatim and paste them onto another folder with the same
 * label structure (e.g. duplicate a shader's uniform set across
 * meshes).
 *
 * `copy(folders)`:
 *   - Stashes a `{label → value}` snapshot of every entry in
 *     `folders`. Labels are intentionally used instead of keys
 *     so the paste destination can rename keys and still match.
 *
 * `paste(folders)`:
 *   - For each destination folder, if a matching label exists in
 *     the clipboard, `force(value, true)` followed by `finish()`
 *     writes the value and commits storage. Keys containing
 *     `name` or `shader` are skipped — identity / shader-source
 *     fields are not safe to bulk-overwrite (would clobber the
 *     paste target's identity).
 *
 * `get('store')` returns the raw clipboard map for inspection
 * by tooling.
 */
Class(function UILClipboard() {
  Inherit(this, Component);
  var _store = {};
  this.copy = function (folders) {
    _store = {};
    for (let key in folders) {
      let folder = folders[key];
      _store[folder.label] = folder.value;
    }
  };
  this.paste = function (folders) {
    for (let key in folders) {
      let folder = folders[key];
      folder &&
        null != _store[folder.label] &&
        (key.includes('name') ||
          key.includes('shader') ||
          (folder.force(_store[folder.label], true), folder.finish()));
    }
  };
  this.get('store', (_) => _store);
}, 'static');

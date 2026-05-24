/*
 * UILExternalEditor — pops out a separate browser window
 * (`localhost/hydra/editor/code/index.html`) hosting a full-
 * featured code editor (Monaco or similar). Used for shader
 * source, JS snippets (e.g. dynamic FOV expressions), and long
 * config blobs that don't fit comfortably in a textarea.
 *
 * Wiring:
 *   - Opens the window at `_width × _height` (defaults 700×500).
 *   - On `Events.UNLOAD` of the main page, closes the popup.
 *   - On the popup's load, `initEditor(title, code, language,
 *     self)` is called in its scope. The caller seeds `_code` /
 *     `_language` via `setCode(code, language)` before opening,
 *     then the popup will pull those when ready.
 *   - When the popup saves, it calls `self.saved(code)` which
 *     fires `self.onSave(code)` (caller-set callback) and then
 *     `UILStorage.write()` to persist any other pending edits.
 *
 * The `await defer()` between `onSave` and `UILStorage.write()`
 * gives `onSave` callbacks a microtask to mutate storage before
 * flushing.
 */
Class(function UILExternalEditor(_title, _height = 500, _width = 700) {
  Inherit(this, Component);
  const self = this;
  var _window, _code, _language;
  _window = window.open(
    location.protocol + '//localhost/hydra/editor/code/index.html',
    '_blank',
    `width=${_width},height=${_height},left=200,top=100`,
  );
  self.events.sub(Events.UNLOAD, (_) => _window.close());
  _window.window.onload = (_) => {
    _window.window.initEditor(_title, _code, _language, self);
  };
  this.setCode = function (code, language) {
    _code = code;
    _language = language;
  };
  this.saved = async function (code) {
    self.onSave && self.onSave(code);
    await defer();
    UILStorage.write();
  };
});

/*
 * UILExternalColor — pops out a separate browser window
 * (`localhost/hydra/editor/color/index.html`, 480×220) hosting a
 * standalone color-picker UI. Used so the editor can keep a
 * persistent picker visible while the main canvas continues to
 * render full-screen.
 *
 * Wiring:
 *   - Opens the window with a stable name `hydra_color_${title}`
 *     so re-opening the same control reuses the existing window.
 *   - On the popup's load, calls `initPicker(title, value, self)`
 *     in its window scope; the popup then calls back via
 *     `self.update(value)` which fires `Events.UPDATE` here.
 *   - `beforeunload` on the main window fires `onDestroy`, which
 *     also closes the popup so it doesn't outlive its host.
 *
 * Caller subscribes to `Events.UPDATE` to receive live colour
 * changes (no commit/finish split — the popup streams every
 * change because the picker UI is HSL-style with hue/sat sliders
 * users expect to scrub).
 */
Class(function UILExternalColor(_title, _value) {
  Inherit(this, Component);
  const self = this;
  var _window;
  function onReload() {
    self.onDestroy();
  }
  (_window = window.open(
    location.protocol + '//localhost/hydra/editor/color/index.html',
    `hydra_color_${_title}`,
    'width=480,height=220,left=200,top=100,location=no',
  )).window.onload = (_) => {
    _window.window.initPicker(_title, _value, self);
  };
  window.addEventListener('beforeunload', onReload);
  this.update = function (value) {
    self.events.fire(Events.UPDATE, {
      value: value,
    });
  };
  this.onDestroy = function () {
    window.removeEventListener('beforeunload', onReload);
    _window && _window.window && _window.window.close();
  };
});

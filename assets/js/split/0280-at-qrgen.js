/*
 * QRGen — lazily-loaded wrapper around the QRious library.
 * Returns a 2D canvas with the QR code drawn at the requested
 * size; consumers (like QRCode in 0279) blit it into their own
 * canvas / texture.
 *
 * Lazy lib load:
 *   - First call triggers `AssetLoader.loadAssets(['assets/js/lib/qrious.js'])`
 *     and guards re-entry via `self.flag('loadLib')`.
 *   - All callers await `AssetLoader.waitForLib('QRious')` so even
 *     parallel first-callers serialise on the same load.
 *
 * Usage: `await QRGen.create(url, size, configOverrides)`. Extra
 * `config` is merged on top of `{element, value, size}` so callers
 * can override foreground/background colour, error correction,
 * padding, etc. Declared `'static'`.
 */
Class(function QRGen() {
  Inherit(this, Component);
  const self = this;
  this.create = async function (url, size, config = {}) {
    self.flag('loadLib') ||
      (function loadLib() {
        self.flag('loadLib', true);
        AssetLoader.loadAssets(['assets/js/lib/qrious.js']);
      })();
    await AssetLoader.waitForLib('QRious');
    let canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    new QRious(
      Utils.mergeObject(config, {
        element: canvas,
        value: url,
        size: size,
      }),
    );
    return canvas;
  };
}, 'static');

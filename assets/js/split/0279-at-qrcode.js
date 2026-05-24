/*
 * QRCode — renders a QR code into an offscreen canvas suitable for
 * use as a WebGL texture (via `$gl(size, size, new Texture(canvas))`,
 * stored on `self.glui` so a UI element can sample it).
 *
 * Encoded URL = current page URL (hash stripped) + a `roomqr`
 * query param (so a second device scanning the code joins the
 * specified room) + a `workids` list pulled from the
 * `WorkItems/items` AppState (per-app extra identifiers, e.g. the
 * currently-displayed pieces in a gallery).
 *
 * Params:
 *   - `size` (default 512) — canvas + texture dimension in pixels.
 *   - `key`  (default 'qrkey') — value placed in `roomqr`.
 *
 * Generation is delegated to `QRGen.create(url, size)` (0280). The
 * resulting bitmap is drawn into `_context` with
 * `ctx.filter = 'invert(1)'` so the QR renders white-on-dark
 * (matches the framework's typical dark UI). Inherits both
 * Component and XComponent.
 */
Class(function QRCode(
  _params = {
    size: 512,
    key: 'qrkey',
  },
) {
  Inherit(this, Component);
  Inherit(this, XComponent);
  const self = this;
  var _context;
  !(async function () {
    self.canvas = document.createElement('canvas');
    self.canvas.width = self.canvas.height = _params.size;
    _context = self.canvas.getContext('2d');
    self.glui = $gl(_params.size, _params.size, new Texture(self.canvas));
    let url = location.href;
    url = url.split('#')[0];
    url += url.includes('?') ? '&' : '?';
    url += `roomqr=${encodeURIComponent(_params.key)}`;
    const items = await self.get('WorkItems/items'),
      ids = [];
    items.toJSON().forEach((item) => ids.push(item.index));
    url += `&workids=${encodeURIComponent(ids.join(','))}`;
    console.log('url ', url);
    let qrCode = await QRGen.create(url, _params.size);
    _context.filter = 'invert(1)';
    _context.drawImage(qrCode, 0, 0);
  })();
});

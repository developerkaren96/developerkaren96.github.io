/*
 * GLUICornerPin — per-corner positioning for a GLUI quad. Replaces
 * the standard scaled rectangle with a non-indexed two-triangle
 * mesh whose four corner vertices can be moved independently
 * (think CSS perspective transform / image-warp).
 *
 * The two triangles of the quad share three vertex slots in the
 * underlying buffer, so writing each corner requires touching two
 * indices into the position array:
 *   - top-left:  slots 0       (idx 0,1)
 *   - bottom-left: slots 1, 3  (idx 3,4 + 9,10)
 *   - top-right:   slots 2, 5  (idx 6,7 + 15,16)
 *   - bottom-right: slot 4     (idx 12,13)
 * Y is negated because GLUI's 2D layout has Y growing downward.
 *
 * Per-frame `loop()`:
 *   - Writes the four `tl`/`tr`/`bl`/`br` Vector2 corners into the
 *     position array.
 *   - Compares against the previous frame's snapshot (`_last`); if
 *     any element changed, sets `position.needsUpdate = true`.
 *   - Then copies the new array into `_last`.
 *
 * Setup (IIFE `initGeometry()`):
 *   - Converts the object's existing indexed geometry into a
 *     non-indexed clone so vertices can be edited freely without
 *     side-effects on shared geometries.
 *   - Calls `$obj.useGeometry(_geom)` to swap the new geometry in,
 *     and resets `mesh.scale` to (1,1,1) — the corners encode size
 *     directly, so the mesh scale would just double-multiply.
 *
 * API:
 *   - `tl`/`tr`/`bl`/`br`            — Vector2 corners (read/write).
 *   - `update()`                     — reset corners to the object's
 *                                       current width/height (call
 *                                       after a `size()` change).
 *   - `tween(type, val, time, ease, delay)` — tween one corner. `type`
 *     is `'tl' | 'tr' | 'bl' | 'br'`. Accepts either a Vector2 or
 *     `{x, y}`; non-Vector2 inputs are wrapped before tweening.
 */
Class(function GLUICornerPin($obj) {
  Inherit(this, Component);
  const self = this;
  var _geom, _vertices, _last;
  function loop() {
    _vertices[0] = self.tl.x;
    _vertices[1] = -self.tl.y;
    _vertices[3] = _vertices[9] = self.bl.x;
    _vertices[4] = _vertices[10] = -self.bl.y;
    _vertices[6] = _vertices[15] = self.tr.x;
    _vertices[7] = _vertices[16] = -self.tr.y;
    _vertices[12] = self.br.x;
    _vertices[13] = -self.br.y;
    (function dirty() {
      let a = _vertices,
        b = _last;
      for (let i = a.length - 1; i > -1; i--) if (a[i] != b[i]) return true;
      return false;
    })() && (_geom.attributes.position.needsUpdate = true);
    _last.set(_vertices);
  }
  this.tl = new Vector2(0, 0);
  this.tr = new Vector2($obj.width, 0);
  this.bl = new Vector2(0, $obj.height);
  this.br = new Vector2($obj.width, $obj.height);
  (function initGeometry() {
    _geom = $obj.mesh.geometry.toNonIndexed();
    $obj.useGeometry(_geom);
    $obj.mesh.scale.set(1, 1, 1);
    _vertices = _geom.attributes.position.array;
    _last = new Float32Array(_vertices);
  })();
  self.startRender(loop);
  this.update = function () {
    this.tl.set(0, 0);
    this.tr.set($obj.width, 0);
    this.bl.set(0, $obj.height);
    this.br.set($obj.width, $obj.height);
  };
  this.tween = function (type, val, time, ease, delay) {
    return (
      (val = val instanceof Vector2 ? val : new Vector2(val.x, val.y)),
      tween(self[type], val, time, ease, delay)
    );
  };
});

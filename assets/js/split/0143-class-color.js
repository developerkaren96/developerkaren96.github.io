/*
 * Color — linear-RGB triplet with conversions to/from hex, HSL, gamma-encoded
 * sRGB, and CSS-friendly strings.
 *
 * Constructor is overloaded:
 *   new Color()             — white (1,1,1).
 *   new Color(0xff8800)     — packed hex.
 *   new Color("#ff8800")    — CSS hex string.
 *   new Color(otherColor)   — copy.
 *   new Color(r, g, b)      — explicit linear floats (0..1).
 *
 * Gamma helpers (`convertGammaToLinear` / `convertLinearToGamma`) are the
 * cheap power-curve approximation (gamma ≈ 2) used by the renderer when it
 * needs to convert between display-encoded textures and the linear space
 * the lighting math runs in.
 *
 * HSL conversion is lazy — the `target` slot caches one `ColorHSL` per
 * Color instance so `getHSL` / `offsetHSL` / `setHSL` don't allocate.
 *
 * `tween` animates the color towards another over `time` using
 * TweenManager — it clones the start color and lerps each frame so the
 * tween is stateless w.r.t. the running color.
 */
class Color {
  constructor(_r, g, b) {
    // No args  → white.
    // One arg  → set() dispatches on type (Color/number/string).
    // Three    → explicit r,g,b.
    if (null == _r && null == g && null == b)                 return this.setRGB(1, 1, 1);
    if (undefined === g && undefined === b)                    return this.set(_r);
    this.setRGB(_r, g, b);
  }

  // Type-dispatched set: another Color → copy, number → hex, string → CSS hex.
  set(value) {
    if (value && value instanceof Color) this.copy(value);
    else if ('number' === typeof value)  this.setHex(value);
    else if ('string' === typeof value)  this.setStyle(value);
    return this;
  }

  setScalar(scalar) { this.r = scalar; this.g = scalar; this.b = scalar; return this; }

  // Truncate fractional bits, unpack bytes.
  setHex(hex) {
    hex = Math.floor(hex);
    this.r = ((hex >> 16) & 0xff) / 255;
    this.g = ((hex >>  8) & 0xff) / 255;
    this.b = ( hex        & 0xff) / 255;
    return this;
  }
  setStyle(style) { return this.setHex(Number(style.replace('#', '0x'))); }
  setRGB(r, g, b) { this.r = r; this.g = g; this.b = b; return this; }

  /*
   * HSL is delegated to a cached ColorHSL.
   *   - new Color().setHSL(hsl)        — copy from an existing ColorHSL
   *   - new Color().setHSL(h, s, l)    — set + apply (creates the cache
   *                                       lazily on first call).
   */
  setHSL(h, s, l) {
    if (h instanceof ColorHSL) return h.getRGB(this);
    if (this.target) return void this.target.setHSL(h, s, l).getRGB(this);
    this.target = new ColorHSL(h, s, l);
  }

  clone() { return new Color(this.r, this.g, this.b); }
  copy(c) { this.r = c.r; this.g = c.g; this.b = c.b; return this; }

  // Cheap power-curve gamma encode/decode. The default factor of 2 isn't
  // strict sRGB (which uses 2.2 and a small-value linear toe) but matches
  // the rest of the engine.
  copyGammaToLinear(color, gammaFactor) {
    if (undefined === gammaFactor) gammaFactor = 2;
    this.r = Math.pow(color.r, gammaFactor);
    this.g = Math.pow(color.g, gammaFactor);
    this.b = Math.pow(color.b, gammaFactor);
    return this;
  }
  copyLinearToGamma(color, gammaFactor) {
    if (undefined === gammaFactor) gammaFactor = 2;
    const inv = gammaFactor > 0 ? 1 / gammaFactor : 1;
    this.r = Math.pow(color.r, inv);
    this.g = Math.pow(color.g, inv);
    this.b = Math.pow(color.b, inv);
    return this;
  }
  convertGammaToLinear(g) { this.copyGammaToLinear(this, g); return this; }
  convertLinearToGamma(g) { this.copyLinearToGamma(this, g); return this; }

  getHex()       { return ((255 * this.r) << 16) ^ ((255 * this.g) << 8) ^ ((255 * this.b) << 0); }
  getHexString() { return '#' + ('000000' + this.getHex().toString(16)).slice(-6); }

  // Lazy-init the HSL cache; if already present, just refresh it.
  getHSL() {
    if (this.target) return this.target.setRGB(this.r, this.g, this.b);
    return (this.target = new ColorHSL(this));
  }

  /*
   * Tween towards `color` over `time`. The implementation lerps a clone of
   * the starting color towards the target as a 0→1 progress runs on a
   * shared `tweenObj` — so re-tweening always interpolates from the value
   * at the moment the tween was kicked off.
   */
  tween(color, time, ease, delay) {
    const self = this;
    if (!self.tweenObj) self.tweenObj = { v: 0 };
    self.tweenObj.v = 0;
    const start = this.clone();
    return TweenManager.tween(self.tweenObj, { v: 1 }, time, ease, delay).onUpdate((_) => {
      self.copy(start).lerp(color, self.tweenObj.v);
    });
  }

  // Shift HSL by (h, s, l) deltas. Same cache as getHSL.
  offsetHSL(h, s, l) {
    if (this.target) this.target.setRGB(this.r, this.g, this.b);
    else             this.target = new ColorHSL(this);
    this.target.h += h;
    this.target.s += s;
    this.target.l += l;
    return this.target.getRGB(this);
  }

  // ── Arithmetic ───────────────────────────────────────────────────────────
  add(color)            { this.r += color.r; this.g += color.g; this.b += color.b; return this; }
  addColors(c1, c2)     { this.r = c1.r + c2.r; this.g = c1.g + c2.g; this.b = c1.b + c2.b; return this; }
  addScalar(s)          { this.r += s; this.g += s; this.b += s; return this; }
  // Clamped subtraction — colors can't go negative.
  sub(color)            {
    this.r = Math.max(0, this.r - color.r);
    this.g = Math.max(0, this.g - color.g);
    this.b = Math.max(0, this.b - color.b);
    return this;
  }
  multiply(color)       { this.r *= color.r; this.g *= color.g; this.b *= color.b; return this; }
  multiplyScalar(s)     { this.r *= s; this.g *= s; this.b *= s; return this; }
  invert()              { this.r = 1 - this.r; this.g = 1 - this.g; this.b = 1 - this.b; return this; }

  // Frame-rate-aware lerp (see Math.lerp polyfill).
  lerp(color, alpha, hz) {
    this.r = Math.lerp(color.r, this.r, alpha, hz);
    this.g = Math.lerp(color.g, this.g, alpha, hz);
    this.b = Math.lerp(color.b, this.b, alpha, hz);
    return this;
  }

  equals(c) { return c.r === this.r && c.g === this.g && c.b === this.b; }

  // Array I/O — packed (r, g, b) triples.
  fromArray(array, offset) {
    if (undefined === offset) offset = 0;
    this.r = array[offset];
    this.g = array[offset + 1];
    this.b = array[offset + 2];
    return this;
  }
  toArray(array, offset) {
    if (undefined === array)  array = [];
    if (undefined === offset) offset = 0;
    array[offset]     = this.r;
    array[offset + 1] = this.g;
    array[offset + 2] = this.b;
    return array;
  }

  /* CSS-friendly output, e.g. "rgba(255, 128, 0, 1)". Alpha defaults to 1. */
  toRGBA(alpha = 1) {
    return `rgba(${Math.floor(255 * this.r)}, ${Math.floor(255 * this.g)}, ${Math.floor(255 * this.b)}, ${alpha})`;
  }
}

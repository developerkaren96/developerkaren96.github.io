/*
 * ColorHSL — hue/saturation/lightness triplet, with conversions to and
 * from Color (linear RGB), packed hex, and CSS hex strings.
 *
 *   h ∈ [0, 1)   hue, wrapped by euclideanModulo(h, 1).
 *   s ∈ [0, 1]   saturation, clamped.
 *   l ∈ [0, 1]   lightness, clamped.
 *
 * Constructor overloads:
 *   new ColorHSL()              — white (0, 0, 1).
 *   new ColorHSL(color)         — copy / convert from a Color or another
 *                                 ColorHSL, hex number, or "#rrggbb" string.
 *   new ColorHSL(h, s, l)       — explicit components.
 *
 * Used by Color as a lazy `target` cache (one ColorHSL per Color) so
 * offsetHSL/getHSL/setHSL on a Color don't allocate. Conversions follow
 * the standard HSL ↔ RGB formulas (Smith 1978):
 *
 *   q = l ≤ 0.5 ? l(1+s) : l+s-ls
 *   p = 2l − q
 *   R = hue2rgb(p, q, h + 1/3)
 *   G = hue2rgb(p, q, h)
 *   B = hue2rgb(p, q, h - 1/3)
 *
 * `setRGB` performs the inverse — finds (h, s, l) given (r, g, b) using
 * the max/min-channel formula.
 */
class ColorHSL {
  constructor(h, s, l) {
    if (undefined === h && undefined === s && undefined === l) return this.setHSL(0, 0, 1);
    if (undefined === s && undefined === l)                    return this.set(h);
    return void this.setHSL(h, s, l);
  }

  copy(colorHSL) {
    this.h = colorHSL.h;
    this.s = colorHSL.s;
    this.l = colorHSL.l;
    return this;
  }

  /*
   * Convert HSL → RGB into `target` (default a fresh Color). For
   * saturation 0 the colour is achromatic — all channels = l. Otherwise
   * apply the Smith piecewise-linear hue→channel function.
   */
  getRGB(target = new Color()) {
    function hue2rgb(p, q, t) {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + 6 * (q - p) * t;
      if (t < 0.5)   return q;
      if (t < 2 / 3) return p + 6 * (q - p) * (2 / 3 - t);
      return p;
    }

    const h = Math.euclideanModulo(this.h, 1);
    const s = Math.clamp(this.s, 0, 1);
    const l = Math.clamp(this.l, 0, 1);

    if (0 === s) {
      target.r = target.g = target.b = l;
    } else {
      const p = l <= 0.5 ? l * (1 + s) : l + s - l * s;
      const q = 2 * l - p;
      target.r = hue2rgb(q, p, h + 1 / 3);
      target.g = hue2rgb(q, p, h);
      target.b = hue2rgb(q, p, h - 1 / 3);
    }
    return target;
  }

  // Type-dispatched setter, mirrors Color.set.
  set(value) {
    if      (value && value instanceof ColorHSL) this.copy(value);
    else if (value && value instanceof Color)    this.setRGB(value.r, value.g, value.b);
    else if ('number' == typeof value)           this.setHex(value);
    else if ('string' == typeof value)           this.setStyle(value);
    return this;
  }

  setHex(hex) {
    hex = Math.floor(hex);
    const r = ((hex >> 16) & 255) / 255;
    const g = ((hex >>  8) & 255) / 255;
    const b = ( hex        & 255) / 255;
    return this.setRGB(r, g, b);
  }
  setStyle(string) { return this.setHex(Number(string.replace('#', '0x'))); }

  /*
   * Inverse conversion: RGB → HSL. Uses the standard
   *   l = (max+min)/2
   *   s = l ≤ 0.5 ? Δ/(max+min) : Δ/(2-max-min)
   * and a 6-sector hue extraction based on which channel is the max.
   */
  setRGB(r, g, b) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const lightness = (min + max) / 2;
    let hue, saturation;

    if (min === max) {
      hue        = 0;
      saturation = 0;
    } else {
      const delta = max - min;
      saturation  = lightness <= 0.5 ? delta / (max + min) : delta / (2 - max - min);
      switch (max) {
        case r: hue = (g - b) / delta + (g < b ? 6 : 0); break;
        case g: hue = (b - r) / delta + 2;               break;
        case b: hue = (r - g) / delta + 4;               break;
      }
      hue /= 6;
    }
    this.h = hue;
    this.s = saturation;
    this.l = lightness;
    return this;
  }

  setHSL(h, s, l) { this.h = h; this.s = s; this.l = l; return this; }
}

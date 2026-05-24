/*
 * ColorLAB — perceptually-uniform CIE L*a*b* colour triplet, with
 * conversions to and from Color (linear RGB), hex, and CSS strings.
 *
 *   l ∈ [0, 100]   lightness.
 *   a              green↔red axis (negative = green, positive = red).
 *   b              blue↔yellow axis.
 *
 * Constructor overloads:
 *   new ColorLAB()            — white (100, 0, 0).
 *   new ColorLAB(value)       — copy / convert from ColorLAB, Color,
 *                               hex number, or "#rrggbb" string.
 *   new ColorLAB(l, a, b)     — explicit components.
 *
 * Conversions go RGB ↔ linear sRGB ↔ XYZ (D65) ↔ L*a*b*. The forward
 * (RGB → LAB) path:
 *
 *   1. sRGB → linear with the standard piecewise approx.
 *   2. linear sRGB → XYZ via the M_RGB→XYZ matrix.
 *   3. Normalize against D65 white (X / 0.95047, Z / 1.08883).
 *   4. f(t) = t > ε ? ∛t : 7.787 t + 16/116  (ε = 0.008856).
 *   5. L = 116 fy − 16,  a = 500 (fx − fy),  b = 200 (fy − fz).
 *
 * Reverse direction mirrors. `clamp` at the end of getRGB ensures
 * out-of-gamut values are saturated rather than producing negative
 * channels.
 *
 * `deltaECIE94` returns the CIE94 perceptual colour-difference metric
 * (graphic-arts default — kL = 1, K1 = 0.045, K2 = 0.015). Smaller is
 * more similar; ΔE < ~2.3 is roughly imperceptible.
 */
class ColorLAB {
  constructor(l, a, b) {
    if (undefined === l && undefined === a && undefined === b) return this.setLAB(100, 0, 0);
    if (undefined === a && undefined === b)                    return this.set(l);
    return void this.setLAB(l, a, b);
  }

  copy(colorLAB) {
    this.l = colorLAB.l;
    this.a = colorLAB.a;
    this.b = colorLAB.b;
    return this;
  }

  /*
   * CIE94 perceptual difference (graphic-arts variant). The weights
   * kL = 1, K1 = 0.045, K2 = 0.015 are the standard graphic-arts
   * constants. Returns 0 if the discriminant goes negative due to
   * floating-point round-off.
   */
  deltaECIE94(colorLAB) {
    const deltaL = this.l - colorLAB.l;
    const deltaA = this.a - colorLAB.a;
    const deltaB = this.b - colorLAB.b;
    const c1     = Math.sqrt(this.a * this.a + this.b * this.b);
    const deltaC = c1 - Math.sqrt(colorLAB.a * colorLAB.a + colorLAB.b * colorLAB.b);
    let   deltaH = deltaA * deltaA + deltaB * deltaB - deltaC * deltaC;
    const deltaLKlsl = deltaL / 1;
    const deltaCkcsc = deltaC / (1 + 0.045 * c1);
    deltaH = deltaH < 0 ? 0 : Math.sqrt(deltaH);
    const deltaHkhsh = deltaH / (1 + 0.015 * c1);
    const sum = deltaLKlsl * deltaLKlsl + deltaCkcsc * deltaCkcsc + deltaHkhsh * deltaHkhsh;
    return sum < 0 ? 0 : Math.sqrt(sum);
  }

  /*
   * LAB → RGB. Inverse f(): cube the f-value if above ε, otherwise
   * un-shear the linear toe. Then XYZ → linear sRGB via the inverse
   * M matrix, then sRGB gamma. Channels are clamped at the end.
   */
  getRGB(target = new Color()) {
    let y = (this.l + 16) / 116;
    let x = this.a / 500 + y;
    let z = y - this.b / 200;

    x = 0.95047  * (x * x * x > 0.008856 ? x * x * x : (x - 16 / 116) / 7.787);
    y =            y * y * y > 0.008856 ? y * y * y : (y - 16 / 116) / 7.787;
    z = 1.08883  * (z * z * z > 0.008856 ? z * z * z : (z - 16 / 116) / 7.787);

    target.r =  3.2406 * x + -1.5372 * y + -0.4986 * z;
    target.g = -0.9689 * x +  1.8758 * y +  0.0415 * z;
    target.b =  0.0557 * x + -0.2040 * y +  1.0570 * z;

    // Linear sRGB → gamma sRGB (standard piecewise approx).
    target.r = Math.clamp(target.r > 0.0031308 ? 1.055 * Math.pow(target.r, 1 / 2.4) - 0.055 : 12.92 * target.r);
    target.g = Math.clamp(target.g > 0.0031308 ? 1.055 * Math.pow(target.g, 1 / 2.4) - 0.055 : 12.92 * target.g);
    target.b = Math.clamp(target.b > 0.0031308 ? 1.055 * Math.pow(target.b, 1 / 2.4) - 0.055 : 12.92 * target.b);
    return target;
  }

  set(value) {
    if      (value && value instanceof ColorLAB) this.copy(value);
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
   * RGB → LAB. sRGB-gamma decode, then linear sRGB → XYZ → LAB.
   * Channel formulas use the D65 reference white (X = 0.95047,
   * Z = 1.08883, Y = 1).
   */
  setRGB(r, g, b) {
    r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
    g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
    b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;

    let x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
    let y =  0.2126 * r + 0.7152 * g + 0.0722 * b;
    let z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;

    // f(t) — cube root above ε, linear toe below.
    x = x > 0.008856 ? Math.pow(x, 1 / 3) : 7.787 * x + 16 / 116;
    y = y > 0.008856 ? Math.pow(y, 1 / 3) : 7.787 * y + 16 / 116;
    z = z > 0.008856 ? Math.pow(z, 1 / 3) : 7.787 * z + 16 / 116;

    this.l = 116 * y - 16;
    this.a = 500 * (x - y);
    this.b = 200 * (y - z);
    return this;
  }

  setLAB(l, a, b) { this.l = l; this.a = a; this.b = b; return this; }
}

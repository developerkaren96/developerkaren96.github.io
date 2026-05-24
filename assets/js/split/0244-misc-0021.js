/*
 * FirefoxGPUFixer — narrow GPU-string workaround. On macOS or any
 * device with `pixelRatio > 1`, if `GPU.detect` reports a "radeon r9
 * 200" series adapter, overwrite `Device.graphics.webgl.gpu` to
 * "radeon pro 455". The Firefox WebGL driver mis-reports certain Pro
 * 4xx silicon as the older R9 200 family; the tiering logic in
 * `GPU` (0245) keys off that string, so the rewrite restores the
 * correct tier bucket.
 */
Module(function FirefoxGPUFixer() {
  this.exports = function () {
    GPU.detect('radeon r9 200') &&
      ('mac' == Device.system.os || Device.pixelRatio > 1) &&
      (Device.graphics.webgl.gpu = 'radeon pro 455');
  };
});

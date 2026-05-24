/*
 * Initialization — thin facade over Initializer3D for GPU pre-warming.
 *
 * `Initializer3D.uploadAll(obj)` walks a 3D group, force-compiles every
 * shader and uploads every texture/geometry so the first frame can render
 * without per-object compile stalls. `uploadAllAsync` does the same but
 * yields between objects to keep the main thread responsive.
 *
 * The two methods on this class are just sugar with the right name and
 * the explicit async signature.
 */
Class(function Initialization() {
  this.initSync = async function (obj) {
    await Initializer3D.uploadAll(obj);
  };

  this.initAsync = async function (obj) {
    await Initializer3D.uploadAllAsync(obj);
  };
});

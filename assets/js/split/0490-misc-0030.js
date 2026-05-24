/*
 * Misc 0030 — final build-flag pair appended to the
 * concatenated bundle.
 *
 *   window._MINIFIED_ = true;   build was passed through the
 *                               AT minifier (skip dev-only
 *                               source-map / warning paths).
 *   window._BUILT_   = true;    this is a production build,
 *                               not a `nuxt dev`/Hydra-IDE
 *                               live-edit run (used by Dev
 *                               and HydraServer to disable
 *                               hot-reload hooks).
 *
 * Read by Dev, Hydra, ShaderUIL and the loader as a runtime
 * mode switch.
 */
window._MINIFIED_ = true;
window._BUILT_ = true;

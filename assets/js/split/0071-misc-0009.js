/*
 * Audio3D module config + silence asset.
 *
 * `Audio3DConfig`
 *   Declares the union of getters/setters/commands every Audio3D
 *   backend may implement. Audio3D (see 0067) consumes this list at
 *   construction time to wire property proxies from the high-level
 *   instance onto whichever backend (WA buffer / WA stream / fallback
 *   / native / resonance) is in play. Backends that don't support a
 *   given property just leave it undefined — the proxy returns
 *   undefined or no-ops without throwing.
 *
 *   Three categories:
 *     getters  — read-only (computed or status fields)
 *                + properties also listed in setters (read/write).
 *     setters  — writable knobs proxied through `self.set(...)`.
 *     commands — verb-style methods forwarded directly (no proxy).
 *
 *   Note: `gain` / `sourceWidth` / `directivitySharpness` /
 *   `directivityAlpha` are Resonance-specific positional knobs; the
 *   non-positional backends simply ignore writes to them.
 *
 * `Audio3DSilence`
 *   Embedded base64 MP3 of silence used by Audio3DWAStream as a
 *   placeholder when a stream needs an `<audio>` element to keep
 *   itself "live" with no source loaded yet. Loading a real source
 *   later replaces the silence; meanwhile the element's media graph
 *   stays connected so the analyser/visualiser hooks don't have to
 *   reconnect. Persisting this in a Module keeps the data URL out of
 *   user code.
 */
Module(function Audio3DConfig() {
  this.exports = {
    getters: [
      'playbackRate', 'loop', 'autoplay', 'volume', 'rolloff', 'preload',
      'visibilityMuted', 'selfDestruct', 'src', 'frequency', 'group',
      'duration', 'currentTime', 'activity', 'playing', 'filter', 'panner',
      'delay', 'progress', 'reverb', 'gain', 'sourceWidth',
      'directivitySharpness', 'directivityAlpha',
    ],
    setters: [
      'playbackRate', 'loop', 'autoplay', 'volume', 'rolloff', 'preload',
      'visibilityMuted', 'selfDestruct', 'src', 'gain', 'sourceWidth',
      'directivitySharpness', 'directivityAlpha',
    ],
    commands: ['play', 'pause', 'stop', 'seek', 'load', 'unload', 'convolve'],
  };
});

Module(function Audio3DSilence() {
  // Inline silence MP3 used as a placeholder source for WAStream.
  this.exports =
    'data:audio/mpeg;base64,//uQxAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAADAAAGhgBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVWqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr///////////////////////////////////////////8AAAA5TEFNRTMuOThyAc0AAAAAAAAAABSAJAiqQgAAgAAABobxtI73AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//uQxAACFEII9ACZ/sJZwWEoEb8w/////N//////JcxjHjf+7/v/H2PzCCFAiDtGeyBCIx7bJJ1mmEEMy6g8mm2c8nrGABB4h2Mkmn//4z/73u773R5qHHu/j/w7Kxkzh5lWRWdsifCkNAnY9Zc1HvDAhjhSHdFkHFzLmabt/AQxSg2wwzLhHIJOBnAWwVY4zrhIYhhc2kvhYDfQ4hDi2Gmh5KyFn8EcGIrHAngNgIwVIEMf5bzbAiTRoAD///8z/KVhkkWEle6IX+d/z4fvH3BShK1e5kmjkCMoxVmXhd4ROlTKo3iipasvTilY21q19ta30/v/0/idPX1v8PNxJL6ramnOVsdvMv2akO0iSYIzdJFirtzWXCZicS9vHqvSKyqm5XJBdqBwPxyfJdykhWTZ0G0ZyTZGpLKxsNwwoRhsx3tZfhwmeOBVISm3impAC/IT/8hP/EKEM1KMdVdVKM2rHV4x7HVXZvbVVKN/qq8CiV9VL9jjH/6l6qf7MBCjZmOqsAibjcP+qqqv0oxqpa/NVW286hPo1nz2L/h8+jXt//uSxCmDU2IK/ECN98KKtE5IYzNoCfbw+u9i5r8PoadUMFPKqWL4LK3T/LCraMSHGkW4bpLXR/E6LlHOVQxmslKVJ8IULktMN06N0FKCpHCoYsjC4F+Z0NVqdNFoGSTjSiyjzLdnZ2fNqTi2eHKONONKLMPMKLONKLMPQRJGlFxZRoKcJFAYEeIFiRQkUWUeYfef//Ko04soswso40UJAgMw8wosososy0EalnZyjQUGBRQGIFggOWUacWUeYmuadrZziQKKEgQsQLAhQkUJAgMQDghltLO1onp0cpkNInSFMqlYeSEJ5AHsqFdOwy1DA2sRmRJKxdKRfLhfLw5BzUxBTUUzLjk4LjJVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjk4LjJVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7ksRRA8AAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVU=';
});

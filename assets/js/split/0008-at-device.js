/*
 * Device — browser / OS / GPU / codec capability detection.
 *
 * Static singleton — runs at script-load time, populating `Device.system`,
 * `Device.media`, `Device.graphics`, `Device.styles`, `Device.tween`,
 * `Device.mobile`, `Device.social`.
 *
 * Used downstream by:
 *   - Renderer selection (WebGL vs WebGL2 vs Metal vs canvas fallback).
 *   - Media format selection (mp4 vs webm; mp3 vs ogg).
 *   - Mobile-specific code paths (touch, PWA, native shell).
 *   - Browser-specific workarounds (Safari quirks, iOS social embeds).
 *
 * Notable techniques:
 *   - User-agent matching for OS / browser / version, with fallback rules
 *     (e.g. an "intel mac" UA + touch + 4:3 aspect = iPadOS in desktop mode).
 *   - `WEBGL_debug_renderer_info` extension for GPU string.
 *   - A tiny base64-encoded MP4 video is played muted to detect codec
 *     support and "low-power mode" (iOS Safari refuses autoplay in LPM).
 *   - Vendor-prefixed CSS property probes for transition/transform/etc.
 */
Class(function Device() {
  const self = this;

  this.agent = navigator.userAgent.toLowerCase();
  this.detect = function (match) { return this.agent.includes(match); };

  this.touchCapable = !!navigator.maxTouchPoints;
  this.pixelRatio = window.devicePixelRatio;

  // ─── 1. System capabilities ──────────────────────────────────────────────
  this.system = {};
  this.system.retina = window.devicePixelRatio > 1;
  this.system.webworker = window.Worker !== undefined;
  if (!window._NODE_) {
    this.system.geolocation = navigator.geolocation !== undefined;
    this.system.pushstate = window.history.pushState !== undefined;
  }
  this.system.webcam = !!(
    navigator.getUserMedia ||
    navigator.webkitGetUserMedia ||
    navigator.mozGetUserMedia ||
    navigator.mediaDevices
  );
  this.system.language = window.navigator.userLanguage || window.navigator.language;
  this.system.webaudio = window.AudioContext !== undefined;
  this.system.xr = {};

  /** Probe WebXR support; sets `system.xr.vr` and `system.xr.ar`. */
  this.system.detectXR = async function () {
    // AURA editor mocks XR.
    if (window.AURA) { self.system.xr.vr = true; self.system.xr.ar = true; return; }
    if (!navigator.xr) { self.system.xr.vr = false; self.system.xr.ar = false; return; }
    try {
      [self.system.xr.vr, self.system.xr.ar] = await Promise.all([
        navigator.xr.isSessionSupported('immersive-vr'),
        navigator.xr.isSessionSupported('immersive-ar'),
      ]);
    } catch (_e) { /* swallow — leave flags as previously assigned */ }
    // Android Chrome reports VR true but only Oculus has actual headsets.
    if (self.system.os === 'android' && !self.detect('oculus')) self.system.xr.vr = false;
  };

  // localStorage probe can throw in private mode.
  try { this.system.localStorage = window.localStorage !== undefined; }
  catch (_e) { this.system.localStorage = false; }

  this.system.fullscreen =
    document.fullscreenEnabled ||
    document.webkitFullscreenEnabled ||
    document.mozFullScreenEnabled ||
    document.msFullscreenEnabled;

  // ─── 2. OS detection ────────────────────────────────────────────────────
  // iPadOS reports as "Mac" but with touch + 4:3 aspect — detect that case.
  function looksLikeIpadInDesktopMode() {
    const aspect = Math.max(screen.width, screen.height) / Math.min(screen.width, screen.height);
    return self.detect('mac') && self.touchCapable && Math.abs(aspect - 4 / 3) < Math.abs(aspect - 1.6);
  }

  if (self.detect(['ipad', 'iphone', 'ios']) || looksLikeIpadInDesktopMode())  this.system.os = 'ios';
  else if (self.detect(['android', 'kindle']))                                 this.system.os = 'android';
  else if (self.detect(['blackberry']))                                        this.system.os = 'blackberry';
  else if (self.detect(['mac os']))                                            this.system.os = 'mac';
  else if (self.detect(['windows', 'iemobile']))                               this.system.os = 'windows';
  else if (self.detect(['linux']))                                             this.system.os = 'linux';
  else                                                                         this.system.os = 'unknown';

  // ─── 3. OS version parsing ──────────────────────────────────────────────
  this.system.version = (function () {
    try {
      if (self.system.os === 'ios') {
        // iPadOS-in-desktop-mode: version follows "Version/" in UA.
        if (self.agent.includes('intel mac')) {
          const parts = self.agent.split('version/')[1].split(' ')[0].split('.');
          return Number(parts[0] + '.' + parts[1]);
        }
        // Standard iOS: "OS 14_2 like Mac OS X".
        const num = self.agent.split('os ')[1].split('_');
        const major = num[0];
        const minor = num[1].split(' ')[0];
        return Number(major + '.' + minor);
      }
      if (self.system.os === 'android') {
        let version = self.agent.split('android ')[1].split(';')[0];
        // Strip past major.minor (e.g. "10.1.0" → "10.1").
        if (version.length > 3) version = version.slice(0, -2);
        if (version.charAt(version.length - 1) === '.') version = version.slice(0, -1);
        return Number(version);
      }
      if (self.system.os === 'windows') {
        if (self.agent.includes('rv:11')) return 11;
        return Number(self.agent.split('windows phone ')[1].split(';')[0]);
      }
    } catch (_e) { /* fallthrough */ }
    return -1;
  })();

  // ─── 4. Browser detection ───────────────────────────────────────────────
  this.system.browser = (function () {
    if (self.system.os === 'ios') {
      if (self.detect(['twitter', 'fbios', 'instagram'])) return 'social';
      if (self.detect(['crios']))   return 'chrome';
      if (self.detect(['fxios']))   return 'firefox';
      if (self.detect(['safari']))  return 'safari';
      return 'unknown';
    }
    if (self.system.os === 'android') {
      if (self.detect(['twitter', 'fb', 'facebook', 'instagram'])) return 'social';
      if (self.detect(['chrome']))  return 'chrome';
      if (self.detect(['firefox'])) return 'firefox';
      return 'browser';
    }
    // Desktop
    if (self.detect(['msie']) ||
        (self.detect(['trident']) && self.detect(['rv:'])) ||
        (self.detect(['windows']) && self.detect(['edge']))) return 'ie';
    if (self.detect(['chrome']))  return 'chrome';
    if (self.detect(['safari']))  return 'safari';
    if (self.detect(['firefox'])) return 'firefox';
    return 'unknown';
  })();

  this.system.browserVersion = (function () {
    try {
      if (self.system.browser === 'chrome') {
        return self.detect('crios')
          ? Number(self.agent.split('crios/')[1].split('.')[0])
          : Number(self.agent.split('chrome/')[1].split('.')[0]);
      }
      if (self.system.browser === 'firefox') {
        return Number(self.agent.split('firefox/')[1].split('.')[0]);
      }
      if (self.system.browser === 'safari') {
        return Number(self.agent.split('version/')[1].split('.')[0].split('.')[0]);
      }
      if (self.system.browser === 'ie') {
        if (self.detect(['msie'])) return Number(self.agent.split('msie ')[1].split('.')[0]);
        if (self.detect(['rv:']))  return Number(self.agent.split('rv:')[1].split('.')[0]);
        return Number(self.agent.split('edge/')[1].split('.')[0]); // Edge legacy
      }
    } catch (_e) { return -1; }
  })();

  // ─── 5. Mobile flags ────────────────────────────────────────────────────
  // `this.mobile` is either `false` or an object with sub-flags.
  this.mobile = (function () {
    if (window._NODE_) return false;
    const hasTouch = ('ontouchstart' in window) || ('onpointerdown' in window);
    if (!hasTouch) return false;
    if (!self.system.os.includes(['ios', 'android', 'magicleap'])) return false;
    return {};
  })();
  if (self.detect('oculusbrowser')) this.mobile = true;
  if (self.detect('quest'))         this.mobile = true;
  // Windows tablets without touch flag aren't really "mobile".
  if (this.mobile && this.detect(['windows']) && !this.detect(['touch'])) this.mobile = false;

  if (this.mobile) {
    const screenLong = Math.max(
      window.screen ? screen.width  : window.innerWidth,
      window.screen ? screen.height : window.innerHeight,
    );
    this.mobile.tablet = screenLong > 1000;
    this.mobile.phone = !this.mobile.tablet;
    this.mobile.pwa = (!!window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
                      || !!window.navigator.standalone;
    Hydra.ready(() => {
      self.mobile.native = !!(Mobile.NativeCore && Mobile.NativeCore.active) || !!window._AURA_;
    });
  }

  // ─── 6. Audio codec preference ──────────────────────────────────────────
  this.media = {};
  this.media.audio = !!document.createElement('audio').canPlayType
    && (self.detect(['firefox', 'opera']) ? 'ogg' : 'mp3');

  // ─── 7. Video codec preference + low-power-mode probe ───────────────────
  // A 1×1 H.264 blob that should autoplay anywhere. If it doesn't actually
  // start playing within `canplaythrough`, the device is in low-power mode
  // (iOS) and we should avoid background-video effects.
  this.media.video = (function () {
    const vid = document.createElement('video');
    vid.setAttribute('muted', true);
    vid.setAttribute('loop', true);
    vid.setAttribute('autoplay', true);
    vid.setAttribute('preload', true);
    vid.setAttribute('playsinline', true);
    vid.setAttribute('webkit-playsinline', true);
    vid.autoplay = true;
    vid.muted = true;
    vid.src = 'data:video/mp4;base64,AAAAIGZ0eXBtcDQyAAACAG1wNDJpc28yYXZjMW1wNDEAAANObW9vdgAAAGxtdmhkAAAAAOA5QnjgOUJ4AAAD6AAAAEMAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAmt0cmFrAAAAXHRraGQAAAAD4DlCeOA5QngAAAABAAAAAAAAAEMAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAACAAAAAgAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAABDAAAAAAABAAAAAAHjbWRpYQAAACBtZGhkAAAAAOA5QnjgOUJ4AAFfkAAAF3BVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABjm1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAU5zdGJsAAAAznN0c2QAAAAAAAAAAQAAAL5hdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAACAAIABIAAAASAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGP//AAAAMWF2Y0MBTUAo/+EAGWdNQCjspLYC1BgYGQAAAwABAAK/IA8YMZYBAAVo6uEyyAAAABNjb2xybmNseAAGAAYABgAAAAAQcGFzcAAAAAEAAAABAAAAFGJ0cnQAAAAAAAF1IAABdSAAAAAYc3R0cwAAAAAAAAABAAAAAgAAC7gAAAAUc3RzcwAAAAAAAAABAAAAAQAAABxzdHNjAAAAAAAAAAEAAAABAAAAAgAAAAEAAAAcc3RzegAAAAAAAAAAAAAAAgAAAxAAAAAMAAAAFHN0Y28AAAAAAAAAAQAAA34AAABvdWR0YQAAAGdtZXRhAAAAAAAAACFoZGxyAAAAAAAAAABtZGlyYXBwbAAAAAAAAAAAAAAAADppbHN0AAAAMql0b28AAAAqZGF0YQAAAAEAAAAASGFuZEJyYWtlIDEuNi4xIDIwMjMwMTIyMDAAAAAIZnJlZQAAAyRtZGF0AAAC9AYF///w3EXpvebZSLeWLNgg2SPu73gyNjQgLSBjb3JlIDE2NCByMzEwMCBlZDBmN2E2IC0gSC4yNjQvTVBFRy00IEFWQyBjb2RlYyAtIENvcHlsZWZ0IDIwMDMtMjAyMiAtIGh0dHA6Ly93d3cudmlkZW9sYW4ub3JnL3gyNjQuaHRtbCAtIG9wdGlvbnM6IGNhYmFjPTEgcmVmPTIgZGVibG9jaz0xOjA6MCBhbmFseXNlPTB4MToweDExMSBtZT1oZXggc3VibWU9NiBwc3k9MSBwc3lfcmQ9MS4wMDowLjAwIG1peGVkX3JlZj0xIG1lX3JhbmdlPTE2IGNocm9tYV9tZT0xIHRyZWxsaXM9MSA4eDhkY3Q9MCBjcW09MCBkZWFkem9uZT0yMSwxMSBmYXN0X3Bza2lwPTEgY2hyb21hX3FwX29mZnNldD0tMiB0aHJlYWRzPTEgbG9va2FoZWFkX3RocmVhZHM9MSBzbGljZWRfdGhyZWFkcz0wIG5yPTAgZGVjaW1hdGU9MSBpbnRlcmxhY2VkPTAgYmx1cmF5X2NvbXBhdD0wIGNvbnN0cmFpbmVkX2ludHJhPTAgYmZyYW1lcz0zIGJfcHlyYW1pZD0yIGJfYWRhcHQ9MSBiX2JpYXM9MCBkaXJlY3Q9MSB3ZWlnaHRiPTEgb3Blbl9nb3A9MCB3ZWlnaHRwPTEga2V5aW50PTMwMCBrZXlpbnRfbWluPTMwIHNjZW5lY3V0PTQwIGludHJhX3JlZnJlc2g9MCByY19sb29rYWhlYWQ9MzAgcmM9Y3JmIG1idHJlZT0xIGNyZj0yMi4wIHFjb21wPTAuNjAgcXBtaW49MCBxcG1heD02OSBxcHN0ZXA9NCB2YnZfbWF4cmF0ZT0yMDAwMCB2YnZfYnVmc2l6ZT0yNTAwMCBjcmZfbWF4PTAuMCBuYWxfaHJkPW5vbmUgZmlsbGVyPTAgaXBfcmF0aW89MS40MCBhcT0xOjEuMDAAgAAAABRliIQAK//+9q78yyt0fpUs1YVPgQAAAAhBmiFsQn/+Vg==';
    vid.play();
    vid.addEventListener('canplaythrough', () => {
      // If autoplay wasn't allowed, we're in low-power mode.
      if (vid.paused && self.mobile) self.mobile.lowPowerMode = true;
      setTimeout(() => vid.pause(), 500);
    });
    if (!vid.canPlayType) return false;
    return vid.canPlayType('video/webm;') ? 'webm' : 'mp4';
  })();

  this.media.webrtc = !!(
    window.webkitRTCPeerConnection ||
    window.mozRTCPeerConnection ||
    window.msRTCPeerConnection ||
    window.oRTCPeerConnection ||
    window.RTCPeerConnection
  );

  // ─── 8. Graphics: WebGL / Metal / canvas ────────────────────────────────
  this.graphics = {};

  // `Device.graphics.webgl` is a *lazy getter*. The first access creates a
  // probe canvas, picks the best WebGL context (webgl2 → webgl → exp.),
  // pulls renderer/version/glsl/extensions, and caches the result.
  //
  // Setting `Device.graphics.webgl = false` permanently disables WebGL for
  // this session (used by force-fallback code paths).
  this.graphics.webgl = (function () {
    let DISABLED = false;
    Object.defineProperty(self.graphics, 'webgl', {
      get: () => {
        if (DISABLED) return false;
        if (self.graphics._webglContext) return self.graphics._webglContext;
        try {
          const names = ['webgl2', 'webgl', 'experimental-webgl'];
          const canvas = document.createElement('canvas');
          canvas.addEventListener(
            'webglcontextlost',
            () => Events.emitter._fireEvent(Events.WEBGL_CONTEXT_LOSS),
            false,
          );
          let gl;
          for (let i = 0; i < names.length; i++) {
            // `?compat=1` URL flag forces a downgrade to WebGL1 for testing.
            if (names[i] === 'webgl2' && Utils.query('compat')) continue;
            gl = canvas.getContext(names[i]);
            if (gl) break;
          }
          if (gl.isContextLost()) {
            window.__WEBGL_CONTEXT_LOSS = true;
            DISABLED = true;
            return false;
          }

          const out = { gpu: 'unknown' };
          out.renderer = gl.getParameter(gl.RENDERER).toLowerCase();
          out.version  = gl.getParameter(gl.VERSION).toLowerCase();
          out.glsl     = gl.getParameter(gl.SHADING_LANGUAGE_VERSION).toLowerCase();
          out.extensions = gl.getSupportedExtensions();
          out.webgl2   = out.version.includes(['webgl 2', 'webgl2']);
          out.canvas   = canvas;
          out.context  = gl;

          // Firefox 92+ exposes RENDERER directly (no debug ext needed).
          if (self.system.browser === 'firefox' && self.system.browserVersion >= 92) {
            out.gpu = out.renderer;
          } else {
            const info = gl.getExtension('WEBGL_debug_renderer_info');
            if (info) {
              out.gpu = gl.getParameter(info.UNMASKED_RENDERER_WEBGL).toLowerCase();
            }
          }

          /** Substring/array-of-substrings match across GPU, version, extensions. */
          out.detect = function (matches) {
            if (out.gpu && out.gpu.toLowerCase().includes(matches)) return true;
            if (out.version && out.version.toLowerCase().includes(matches)) return true;
            for (let i = 0; i < out.extensions.length; i++) {
              if (out.extensions[i].toLowerCase().includes(matches)) return true;
            }
            return false;
          };

          // WebGL1 without instanced-arrays is too limited — disable.
          // AURA editor always gets WebGL even if probes say otherwise.
          if (!out.webgl2 && !out.detect('instance') && !window.AURA) DISABLED = true;

          self.graphics._webglContext = out;
          return out;
        } catch (_e) {
          return false;
        }
      },
      set: (v) => { if (v === false) DISABLED = true; },
    });
  })();

  // Metal is exposed only by the AURA native shell.
  this.graphics.metal = (function () {
    if (!window.Metal) return false;
    const out = {};
    out.gpu = Metal.device.getName().toLowerCase();
    out.detect = function (matches) { return out.gpu.includes(matches); };
    return out;
  })();

  // Unified `Device.graphics.gpu` — proxies to whichever graphics API is live.
  this.graphics.gpu = (function () {
    if (!self.graphics.webgl && !self.graphics.metal) return false;
    const out = {};
    for (const name of ['metal', 'webgl']) {
      if (self.graphics[name] && !out.identifier) {
        out.detect = self.graphics[name].detect;
        out.identifier = self.graphics[name].gpu;
      }
    }
    return out;
  })();

  this.graphics.canvas = !!document.createElement('canvas').getContext;

  // ─── 9. CSS style support probes ────────────────────────────────────────
  // Closure over a single throwaway `<div>` — its `.style` enumerates all
  // supported properties (with and without vendor prefixes).
  const checkForStyle = (function () {
    let probeDiv;
    return function (prop) {
      probeDiv = probeDiv || document.createElement('div');
      const vendors = ['Khtml', 'ms', 'O', 'Moz', 'Webkit'];
      if (prop in probeDiv.style) return true;
      prop = prop.replace(/^[a-z]/, (val) => val.toUpperCase());
      for (let i = vendors.length - 1; i >= 0; i--) {
        if (vendors[i] + prop in probeDiv.style) return true;
      }
      return false;
    };
  })();

  this.styles = {};
  this.styles.filter = checkForStyle('filter');
  this.styles.blendMode = checkForStyle('mix-blend-mode');

  this.tween = {};
  this.tween.transition = checkForStyle('transition');
  this.tween.css2d = checkForStyle('transform');
  this.tween.css3d = checkForStyle('perspective');

  // ─── 10. Social embed detection (used to apply browser-specific hacks) ──
  this.social =
    self.agent.includes('instagram') ? 'instagram'
    : (self.agent.includes('fban') || self.agent.includes('fbav') || self.agent.includes('fbios')) ? 'facebook'
    : (self.agent.includes('twitter') || (document.referrer && document.referrer.includes('//t.co/'))) ? 'twitter'
    : false;
}, 'Static');

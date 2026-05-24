/*
 * Dev — static helpers active only during local development:
 *
 *   emulator           — true when running mobile build on desktop browser
 *                        (a "phone emulator" tab during dev). The check
 *                        looks at platform name for 'mac' / 'windows' while
 *                        Device.mobile is true.
 *   expose(name, val)  — assigns `window[name] = val` in LOCAL builds (or
 *                        any build when forced). Used to publish handles
 *                        for poking in the console.
 *   unsupported(alert) — optional banner shown on devices the build hasn't
 *                        been validated for.
 *   checkForLeaks      — periodic sweep of the `window` object looking for
 *                        engine-style names that escaped to global. A name
 *                        is flagged when:
 *                          • starts with `_` or `$`
 *                          • second char is lowercase
 *                          • not on the exception list (analytics, polyfills,
 *                            and HYDRA_LEAKS_EXCEPTIONS).
 *                        Throws + console.log of the offending value. Off
 *                        unless AURA (the analytics global) is loaded.
 *   startTimer/stopTimer
 *                      — wraps console.time, falls back to performance.now
 *                        on node (`_NODE_`).
 *   writeFile / execUILScript
 *                      — POSTs to the local dev tooling on port 8017
 *                        (8018 over HTTPS). The dev server writes the file
 *                        or runs the named UIL script and returns plaintext
 *                        OK or a JSON response.
 *   auditCompressedTextures
 *                      — scans `UILStorage` for texture entries that mix
 *                        compressed (ktx2) and uncompressed instances of
 *                        the same asset, rewrites them all to compressed,
 *                        and emits UILControlImage.AUDIT for live UIL
 *                        panels to reflect the change.
 *
 * The render-callback error hook (`handleRenderCallbackError`) is wired
 * once on init: if a callback registered with `Render.start` throws, the
 * error is logged here. With `RemoteLogger` present, the event is removed
 * so RemoteLogger owns the channel exclusively.
 */
Class(function Dev() {
  const self = this;
  let _inter, _timerName, _timer;

  function handleRenderCallbackError(info) {
    // RemoteLogger captures these — defer to it if present.
    if (window.RemoteLogger) {
      return void Events.emitter._removeEvent(Render.RENDER_CALLBACK_ERROR, handleRenderCallbackError);
    }
    const { callback, error } = info;
    console.error('Error in render callback', callback, error);
  }
  Events.emitter._addEvent(Render.RENDER_CALLBACK_ERROR, handleRenderCallbackError);

  // Mobile build running on a desktop browser = emulator session.
  this.emulator =
    Device.mobile &&
    navigator.platform &&
    navigator.platform.toLowerCase().includes(['mac', 'windows']);

  this.expose = function (name, val, force) {
    if (Hydra.LOCAL || force) window[name] = val;
  };

  this.unsupported = function (needsAlert) {
    if (needsAlert) {
      alert(
        'Hi! This build is not yet ready for this device, things may not work as expected. Refer to build schedule for when this device will be supported.',
      );
    }
  };

  /*
   * Periodic global-scope sweep. Anything that looks like an engine-private
   * name (lower-case first letter after _ or $) is treated as a leak —
   * the convention is that public globals start with an uppercase letter
   * (`Hydra`, `Render`, `Component`), so `_foo` or `$bar` on `window` is
   * almost always accidental.
   *
   * `array` is an optional extra deny-list; `exceptions` is the static
   * allow-list, augmented by user-supplied `window.HYDRA_LEAKS_EXCEPTIONS`.
   */
  this.checkForLeaks = function (flag, array) {
    if (window.AURA) return;
    let exceptions = ['_ga', '_typeface_js', '_xdc_', '_babelPolyfill', '$jscomp', '_sentryDebugIds', '_injected'];
    if (window.HYDRA_LEAKS_EXCEPTIONS) exceptions = exceptions.concat(window.HYDRA_LEAKS_EXCEPTIONS);

    const matchArray = function (prop) {
      if (!array) return false;
      for (let i = 0; i < array.length; i++) if (prop.includes(array[i])) return true;
      return false;
    };

    clearInterval(_inter);
    if (!flag) return;
    _inter = setInterval(function () {
      for (const prop in window) {
        if (prop.includes('webkit')) continue;
        let obj;
        try { obj = window[prop]; } catch (e) {}
        if (obj && 'function' != typeof obj && prop.length > 2) {
          if (prop.includes(exceptions) || matchArray(prop)) continue;
          const char1 = prop.charAt(0);
          const char2 = prop.charAt(1);
          if (('_' == char1 || '$' == char1) && char2 !== char2.toUpperCase()) {
            console.log(window[prop]);
            throw 'Hydra Warning:: ' + prop + ' leaking into global scope';
          }
        }
      }
    }, 1e3);
  };

  // console.time-backed timer; falls back to performance.now in Node.
  this.startTimer = function (name) {
    _timerName = name || 'Timer';
    if (console.time && !window._NODE_) console.time(_timerName);
    else _timer = performance.now();
  };
  this.stopTimer = function () {
    if (console.time && !window._NODE_) console.timeEnd(_timerName);
    else console.log('Render ' + _timerName + ': ' + (performance.now() - _timer));
  };

  /*
   * Dev-server file write. The local tool listens on port 8017 (HTTP) /
   * 8018 (HTTPS) and accepts a POST whose path matches the file path on
   * disk; "OK" body indicates success.
   */
  this.writeFile = function (file, data) {
    const promise  = Promise.create();
    const protocol = location.protocol;
    const port     = 'https:' === protocol ? ':8018' : ':8017';
    const url      = protocol + '//' + location.hostname + port + (self.filesPath || location.pathname) + file;
    post(url, data, { headers: { 'content-type': 'text/plain' } }).then((e) => {
      if ('OK' != e) { console.warn(`Unable to write to ${file}`); promise.reject(); }
      else { promise.resolve(); }
    });
    return promise;
  };

  // Invoke a named server-side UIL script via the dev tooling.
  this.execUILScript = async function (name, data) {
    if (!Hydra.LOCAL) return;
    const url = `${location.protocol}//${location.hostname}:8017${self.pathName || location.pathname}/uil/${name}`;
    const response = await post(url, data, { headers: { 'Content-Type': 'text/plain' } });
    if ('ERROR' === response || false === response.success) throw response;
    return response;
  };

  /*
   * Walk UILStorage for texture records. First pass: build a list of
   * already-compressed (ktx2) entries; warn on legacy ktx1.
   * Second pass: any uncompressed entry whose `.src` matches a compressed
   * one is rewritten to ktx2 (so all uses of the same asset converge on
   * compression).
   *
   * UIL doesn't persist via the live-edit path — the user must Cmd/Ctrl+S
   * to commit. AUDIT event tells open panels to redraw.
   */
  this.auditCompressedTextures = function () {
    const compressedKeys = [];
    let changes = 0;
    UILStorage.getKeys().forEach((key) => {
      const element = UILStorage.get(key);
      if ('string' != typeof element) return;
      try {
        const json = JSON.parse(element);
        if (!json.src) return;
        if (true === json.compressed) {
          console.warn(`The texture ${json.src} is a ktx1 asset. Please convert it to ktx2.`);
        } else if ('ktx2' === json.compressed) {
          compressedKeys.push({ key, src: json.src.split('?')[0] });
        }
      } catch (e) {}
    });
    UILStorage.getKeys().forEach((key) => {
      const element = UILStorage.get(key);
      if ('string' != typeof element) return;
      try {
        const json = JSON.parse(element);
        if (!json.src) return;
        const match = compressedKeys.find((el) => json.src.split('?')[0] === el.src.split('?')[0]);
        if (match && 'ktx2' !== json.compressed) {
          changes++;
          console.log(`Changed ${json.src.split('?')[0]} in ${key} to use ktx2 compression.`);
          UILStorage.set(key, JSON.stringify({ ...json, src: json.src.split('?')[0], compressed: 'ktx2' }));
          self.events.fire(UILControlImage.AUDIT);
        }
      } catch (e) {}
    });
    if (changes) {
      console.warn('Changes to UIL from auditCompressedTextures will not be saved until saving UIL and refreshing. Use Cmd+S or Ctrl+S to save and refresh any open SceneLayouts.');
    } else {
      console.log('auditCompressedTextures did not find any textures that had instances using both uncompressed and compressed versions.');
    }
  };

  // Always-on leak check during local dev.
  if (Hydra.LOCAL) self.checkForLeaks(true);
}, 'static');

/*
 * Hydra — root namespace + DOM-ready coordinator.
 *
 * Static singleton (via `Class(..., 'Static')`), so the file ends with the
 * instance already living on `window.Hydra`. Other modules read
 * `Hydra.ready(cb)` to defer work until the document has finished loading
 * (and, when in the AURA editor environment, until `Main` is defined).
 *
 * Responsibilities:
 *   - Detect dev environments (`Hydra.LOCAL`) — localhost, RFC1918 hostnames,
 *     `*.atdev.online`, port 3000 or default.
 *   - Wait for document load and any `window._HYDRA_BEFORE_READY` promise.
 *   - Fan out queued `ready(cb)` callbacks once load completes.
 *   - On load, if `window.Main` is defined, instantiate it (this is the
 *     hand-off into the actual application).
 *   - Provide `absolutePath(rel)` — resolves a path against any `<base>`
 *     tag, falling back to `location`.
 */
Class(function Hydra() {
  const self = this;
  const readyPromise = Promise.create();
  let basePath;
  let pendingCallbacks = [];

  /**
   * Poll until `document` and `window` both exist, then either:
   *   - in Node SSR (`_NODE_`) — fast-path to `loaded()`,
   *   - in AURA editor (`_AURA_`) — wait for `Main` to be defined,
   *   - in browser — wait for `document.readyState === 'complete'` or the
   *     `load` event.
   */
  function initLoad() {
    if (!(document && window)) return setTimeout(initLoad, 1);

    if (window._NODE_) return setTimeout(loaded, 1);

    if (window._AURA_) {
      return window.Main ? setTimeout(loaded, 1) : setTimeout(initLoad, 1);
    }

    if (document.readyState === 'complete') setTimeout(loaded, 1);
    else window.addEventListener('load', loaded, false);
  }

  function loaded() {
    window.removeEventListener('load', loaded, false);

    // If someone (e.g. a CMS bootstrap) installed a barrier promise,
    // wait for it before continuing.
    if (window._HYDRA_BEFORE_READY) {
      const barrier = window._HYDRA_BEFORE_READY;
      delete window._HYDRA_BEFORE_READY;
      return barrier.then(loaded);
    }

    self.LOCAL = isLocalEnvironment(/* postBuildAware = */ true);

    pendingCallbacks.forEach((cb) => cb());
    pendingCallbacks = null;
    readyPromise.resolve();

    // Hand off to the application.
    if (window.Main) readyPromise.then(() => (Hydra.Main = new window.Main()));
  }

  function isLocalEnvironment(postBuildAware) {
    // After a production build, the `_BUILT_` flag is set. We still treat
    // the `/platform` editor page as local even in that case.
    const builtButOnPlatform =
      window._BUILT_ && location.pathname.toLowerCase().includes('platform');
    const builtCheck = postBuildAware ? (!window._BUILT_ || builtButOnPlatform) : !window._BUILT_;

    const host = location.hostname;
    const firstOctet = host.split('.')[0];
    const hostnameIsLocal =
      host.indexOf('local') > -1 ||
      firstOctet === '10' ||
      firstOctet === '192' ||
      /atdev.online$/.test(host);
    const portIsLocal = location.port === '' || location.port === '3000';

    return builtCheck && hostnameIsLocal && portIsLocal;
  }

  this.HASH = window.location.hash.slice(1);
  // First-pass LOCAL flag (without the post-build awareness). Refined in `loaded()`.
  this.LOCAL = isLocalEnvironment(false);

  initLoad();

  // Allow Hydra-internal modules to force-trigger the ready path without
  // a real load event (used by the AURA editor).
  this.__triggerReady = function () {
    if (pendingCallbacks) loaded();
  };

  /**
   * Hydra.ready()           → Promise that resolves when ready.
   * Hydra.ready(callback)   → run callback now if already ready, else queue.
   */
  this.ready = function (callback) {
    if (!callback) return readyPromise;
    if (pendingCallbacks) pendingCallbacks.push(callback);
    else callback();
  };

  /**
   * Resolve a relative path against the document's `<base>` tag (if any),
   * else against `location`. Absolute URLs (containing `http`) pass through.
   *
   * Honors `window.HYDRA_BASE_PATH` as the highest-priority override.
   * In the AURA editor (`window.AURA`), paths are passed through unchanged.
   */
  this.absolutePath = function (path) {
    if (window.AURA) return path;

    let base = window.HYDRA_BASE_PATH ?? basePath;
    if (base === undefined) {
      try {
        const baseTags = document.getElementsByTagName('base');
        if (baseTags.length > 0) {
          const anchor = document.createElement('a');
          anchor.href = baseTags[0].href;
          base = anchor.pathname;
          basePath = base;
        }
      } catch (_e) {
        basePath = null;
      }
    }

    let pathname = base ?? location.pathname;
    if (pathname.includes('/index.html')) pathname = pathname.replace('/index.html', '');

    const port = Number(location.port) > 1000 ? `:${location.port}` : '';
    if (path.includes('http')) return path;

    const protocol = location.protocol.length ? location.protocol + '//' : '';
    return (protocol + (location.hostname + port + pathname + '/' + path).replace('//', '/'));
  };
}, 'Static');

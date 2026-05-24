/*
 * Service — thin wrapper around the Service Worker registration and the
 * postMessage bridge to `sw.js`. The actual cache work happens in the SW;
 * this class is the front-end that registers it and surfaces a typed
 * post()/cache()/ready() surface.
 *
 *   Service.init()
 *     Registers `sw.js` (optionally under `window._SW_PATH_`). Skipped on
 *     LOCAL builds served from `file:` (no port), inside Node, when the
 *     environment lacks `serviceWorker`, or when explicitly `disabled`.
 *
 *   Service.cache(assets)
 *     Once the SW is ready, posts `{ fn: 'upload', assets, cdn, hostname,
 *     sw: <getSWAssets()>, offline }` to the worker so it can pre-fetch
 *     those URLs into its cache. The current `_CACHE_` value is also
 *     persisted in `Storage` so the next page load can detect a stale
 *     cache version.
 *
 *   Service.post(fn, data)
 *     Generic worker IPC: wraps the message in `data.fn = fn` and sends
 *     via `postMessage` on the active controller, with a fresh
 *     MessageChannel for replies (the worker can post back on `port2`).
 *
 * `getSWAssets()` returns the list of SW-specific assets (`window.ASSETS.SW`)
 * but rewrites `.js` filenames to suffix `?_CACHE_` so a new build's
 * service worker actually fetches the *new* JS rather than getting a
 * conditional 304.
 *
 * Cache-version check on ready: if persisted `service_cache` doesn't match
 * the current `_CACHE_`, we send `{ fn: 'clearCache' }` so the worker
 * discards the old version before re-uploading.
 *
 * Worker → host event bridge (`handleMessage`):
 *   The worker can fire arbitrary engine events on the page by posting
 *   `{ evt: 'eventName', ...rest }`; we forward them through
 *   `self.events.fire`.
 */
Class(function Service() {
  Inherit(this, Component);
  const self = this;
  let _sw;

  // Build the asset list with cache-busting query strings on .js files.
  function getSWAssets() {
    if (!window.ASSETS.SW || self.cached) return [];
    const assets = window.ASSETS.SW;
    assets.forEach((asset, i) => {
      if (asset.includes('.js')) assets[i] = assets[i].replace('.js', '.js?' + window._CACHE_);
    });
    return assets;
  }

  function handleRegistration() {}

  function handleReady(e) {
    self.isReady = true;
    self.events.fire(Events.READY, e, true);
    _sw = navigator.serviceWorker.controller;
    // Drop stale caches if the build's _CACHE_ has changed.
    (function checkCache() {
      if (Storage.get('service_cache') != window._CACHE_) self.post('clearCache');
    })();
  }

  function handleError(e) {
    if (!e) return;
    self.events.fire(Events.ERROR, e, true);
    self.active = false;
  }

  // Worker → host event bridge.
  function handleMessage(e) {
    const data = e.data;
    if (data.evt) self.events.fire(data.evt, data);
  }

  this.active   = false;
  this.ready    = false;
  this.cached   = false;
  this.offline  = false;
  this.disabled = false;

  this.ready = function () { return this.wait(this, 'isReady'); };

  this.init = function () {
    Hydra.ready(() => {
      // Skip registration in non-supporting environments.
      if (!('serviceWorker' in navigator)) return;
      if (Hydra.LOCAL && '' == location.port) return;
      if (window.process) return; // node
      if (self.disabled) return;
      (function initWorker() {
        self.active = true;
        navigator.serviceWorker
          .register(`${window._SW_PATH_ ? window._SW_PATH_ : ''}sw.js`)
          .then(handleRegistration)
          .then(handleReady)
          .then(handleError);
      })();
    });
  };

  this.cache = function (assets = []) {
    assets = Array.from(assets);
    if (!self.active) return;
    self.wait(self, 'ready', function () {
      self.post('upload', {
        assets,
        cdn:      Assets.CDN,
        hostname: location.hostname,
        sw:       getSWAssets(),
        offline:  self.offline,
      });
      Storage.set('service_cache', window._CACHE_);
      self.cached = true;
    });
  };

  /*
   * IPC envelope. Uses a fresh MessageChannel for each call so the worker
   * can reply on `port2` and we receive on `port1.onmessage`. The reply
   * routes back through `handleMessage` which surfaces it on `self.events`.
   */
  this.post = function (fn, data = {}) {
    if (!self.active) return;
    self.wait(self, 'ready', function () {
      const mc = new MessageChannel();
      mc.port1.onmessage = handleMessage;
      data.fn = fn;
      if (_sw) _sw.postMessage(data, [mc.port2]);
    });
  };
}, 'static');

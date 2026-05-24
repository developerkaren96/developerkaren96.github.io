/*
 * UnsupportedRedirect — static singleton: browser-capability
 * gate that bounces unsupported clients to a fallback page
 * (default `./fallback`). Apps call `UnsupportedRedirect.test()`
 * early in boot.
 *
 * Pass criteria (`unsupported()` returns true → redirect):
 *   - User-agent NOT in `BOTS` (search/social crawlers see the
 *     real page so SEO/preview cards still work).
 *   - Any caller-supplied custom test (`custom(fn, ...)`) returns
 *     truthy.
 *   - `requiresWebGL` (default true) and either WebGL is absent
 *     or `GPU.BLOCKLIST` flags the GPU (matched against a known
 *     bad-list of integrated/old GPUs).
 *   - Browser version below the per-vendor floors:
 *       Chrome 55, Firefox 51, Safari 8, IE 13. Edge / unknown
 *       browsers are not gated by version.
 *   - `?unsupported` query param forces the redirect (manual
 *     debug switch).
 *
 * `BOTS` list covers Google's various crawlers, Bing, Facebook
 * preview, Yahoo Slurp, DuckDuckGo, Baidu, Yandex, Sogou,
 * Exabot — i.e. the common indexers worth showing real content.
 *
 * `custom(...fns)` lets the app register additional gating
 * predicates (e.g. mobile-only sites can refuse desktop).
 */
Class(function UnsupportedRedirect() {
  Inherit(this, Component);
  var self = this,
    _tests = [];
  this.BOTS = [
    'google',
    'apis-google',
    'mediapartners-google',
    'adsbot-google',
    'googlebot',
    'feedfetcher-google',
    'google-read-aloud',
    'storebot-google',
    'bingbot',
    'facebot',
    'facebookexternalhit',
    'slurp',
    'duckduckbot',
    'baiduspider',
    'yandexbot',
    'sogou',
    'exabot',
  ];
  this.chrome = 55;
  this.firefox = 51;
  this.safari = 8;
  this.ie = 13;
  this.requiresWebGL = true;
  this.url = './fallback';
  this.test = function () {
    self.unsupported() &&
      (function redirect() {
        window.location = self.url;
      })();
  };
  this.unsupported = function () {
    return (
      !self.BOTS.find((bot) => Device.detect(bot)) &&
      (!!_tests.find((test) => test()) ||
        !(!self.requiresWebGL || (Device.graphics.webgl && !GPU.BLOCKLIST)) ||
        ('chrome' === Device.system.browser && Device.system.browserVersion < self.chrome) ||
        ('firefox' === Device.system.browser && Device.system.browserVersion < self.firefox) ||
        ('safari' === Device.system.browser && Device.system.browserVersion < self.safari) ||
        ('ie' === Device.system.browser && Device.system.browserVersion < self.ie) ||
        !!Utils.query('unsupported'))
    );
  };
  this.custom = function (...tests) {
    _tests.push(...tests);
  };
}, 'static');

/*
 * GPU — adapter detection & performance-tier classifier. Singleton
 * Component (lifted from `Hydra.ready`) that takes the raw GPU
 * identifier off `Device.graphics.gpu.identifier` and bins it into
 * desktop tiers T0..T5 (T0 = worst, T5 = best) and mobile tiers
 * MT0..MT5. The rest of the codebase reads these booleans to gate
 * postprocessing passes, shadow quality, particle counts, etc.
 *
 * Detection helpers (all string-lowered against the identifier):
 *   - `detect(s | [s,…])`       — substring match (any/all depending
 *     on call sites; underlying Device.graphics.gpu.detect handles).
 *   - `detectAll(...)`          — every arg must match.
 *   - `matchGPU(prefix,min,max)` — extracts the numeric suffix after
 *     `prefix` (e.g. `"hd graphics 4000"` → 4000), tests range.
 *     Memoised in `_split`.
 *
 * Apple-specific bootstrap (because Apple WebGL reports the generic
 * "apple gpu" string for every M-series part):
 *   - Mobile: runs `iOSGPUTest` (timed render benchmark) to derive
 *     the real tier.
 *   - Desktop: runs `MacOSPerformanceTest` for the same reason.
 *
 * Firefox quirk: if Device.system.browser === 'firefox', applies
 * `FirefoxGPUFixer` (0244) to rewrite mis-reported R9 200 → Pro 455.
 *
 * `BLOCKLIST` — driver/adapter combos known to crash or render
 * incorrectly; sourced from `GPUBlocklist.match()`. Forces T0/MT0.
 *
 * Tier bands (top-of-file fragment shown):
 *   - T0 set true if mobile OR blocklisted OR matched against any of
 *     the "low-end Intel / weak Radeon" patterns (`radeon r5`,
 *     `radeon r9 200`, `hd graphics family`, low-numbered `hd
 *     graphics NNNN` ranges, `intel iris` at >1800px, etc.).
 *   - T1..T5 escalate from there (`nvidia gtx 9xx/10xx/16xx/20xx/
 *     30xx`, `amd rx 5xx/Vega/6xxx`, Apple M-series buckets).
 *   - MT0..MT5 mirror the structure for mobile GPUs (Adreno,
 *     Mali, Apple A-series).
 *
 * Consumers read these as plain booleans (`if (GPU.T2) { ... }`)
 * during world / postFX init so the cost of detection is one-shot.
 */
Class(function GPU() {
  Inherit(this, Component);
  var self = this,
    _split = {};
  Hydra.ready(async () => {
    for (var key in ((self.detect = function (match) {
      if (Device.graphics.gpu) return Device.graphics.gpu.detect(match);
    }),
    (self.detectAll = function () {
      if (Device.graphics.gpu) {
        for (var match = true, i = 0; i < arguments.length; i++)
          Device.graphics.gpu.detect(arguments[i]) || (match = false);
        return match;
      }
    }),
    (self.matchGPU = function (str, min, max = 99999) {
      let num = (function splitGPU(string) {
        if (_split[string]) return _split[string];
        if (!self.detect(string)) return -1;
        try {
          var num = Number(
            self.gpu
              .split(string)[1]
              .split(' ')[0]
              .replace(/[^a-zA-Z0-9]/g, '')
              .trim(),
          );
          return ((_split[string] = num), num);
        } catch (e) {
          return -1;
        }
      })(str);
      return num >= min && num < max;
    }),
    (self.gpu = Device.graphics.gpu ? Device.graphics.gpu.identifier : ''),
    'apple gpu' == self.gpu &&
      (Device.mobile ? await require('iOSGPUTest')() : require('MacOSPerformanceTest')()),
    'firefox' === Device.system.browser && require('FirefoxGPUFixer')(),
    (self.BLOCKLIST = require('GPUBlocklist').match()),
    (self.T0 = !(
      Device.mobile ||
      (!self.BLOCKLIST &&
        !self.detect('radeon(tm) r5') &&
        !self.detect('radeon r9 200') &&
        !self.detect('hd graphics family') &&
        !self.detect('intel(r) uhd graphics direct') &&
        !self.matchGPU('hd graphics ', 1e3, 5001) &&
        !(self.matchGPU('hd graphics ', 0, 618) && Device.pixelRatio > 1) &&
        !(self.detect(['hd graphics', 'iris']) && Math.max(Stage.width, Stage.height) > 1800) &&
        !self.detect(['intel iris opengl engine']) &&
        !self.matchGPU('iris(tm) graphics ', 1e3))
    )),
    (self.T1 = !(
      self.BLOCKLIST ||
      Device.mobile ||
      self.T0 ||
      (!self.matchGPU('iris(tm) graphics ', 540, 1e3) &&
        !self.matchGPU('hd graphics ', 514, 1e3) &&
        !self.matchGPU('intel(r) uhd graphics ', 600, 1e3) &&
        self.detect(['nvidia', 'amd', 'radeon', 'geforce']) &&
        !self.detect(['vega 8']))
    )),
    (self.T2 =
      !self.BLOCKLIST &&
      !Device.mobile &&
      !(!self.detect(['nvidia', 'amd', 'radeon', 'geforce']) || self.T1 || self.T0)),
    (self.T3 = !(
      self.BLOCKLIST ||
      Device.mobile ||
      (!self.detect(['titan', 'amd radeon pro', 'quadro']) &&
        !self.matchGPU('gtx ', 940) &&
        !self.matchGPU('radeon (tm) rx ', 400) &&
        !self.detect('amd radeon(tm) graphics direct3d11 vs_5_0') &&
        !self.matchGPU('radeon rx ', 400) &&
        !self.matchGPU('radeon pro ', 420))
    )),
    (self.T4 = !(
      self.BLOCKLIST ||
      Device.mobile ||
      (!self.detect(['titan', 'quadro', 'radeon vii', 'apple m']) &&
        !self.matchGPU('gtx ', 1060) &&
        !self.matchGPU('rtx') &&
        !self.matchGPU('radeon rx ', 500) &&
        !self.matchGPU('vega ', 50) &&
        !self.detect([
          'radeon pro 5300m',
          'radeon pro 5500m',
          'radeon pro 5600m',
          'amd radeon unknown prototype',
        ]))
    )),
    (self.T5 = !(
      self.BLOCKLIST ||
      Device.mobile ||
      (!self.detect(['titan', 'radeon vii']) &&
        !self.matchGPU('gtx ', 1080) &&
        !self.matchGPU('rtx ', 2060) &&
        !self.matchGPU('radeon rx ', 5500) &&
        (!self.detect('apple m') || !self.detect('max')))
    )),
    (self.MT0 =
      !!Device.mobile &&
      (!!self.BLOCKLIST ||
        !('ios' != Device.system.os || !self.detect('a7')) ||
        !('android' != Device.system.os || !self.detect('sgx')) ||
        (self.detect('adreno')
          ? self.matchGPU('adreno (tm) ', 0, 415)
          : self.detect('mali')
            ? self.matchGPU('mali-t', 0, 628)
            : !('ios' != Device.system.os || !self.detect(['a8', 'a9'])) ||
              !!self.detect('mali-g') ||
              !!self.matchGPU('adreno (tm) ', 420)))),
    (self.MT1 = (function () {
      if (!Device.mobile) return false;
      if (self.BLOCKLIST) return false;
      if ('ios' == Device.system.os && self.detect('a10')) return true;
      if ('android' == Device.system.os && !self.MT0) return true;
      if (self.detect('nvidia tegra') && Device.detect('pixel c')) return true;
      if (self.detect('mali-g')) return self.matchGPU('mali-g', 73);
      if (self.detect('adreno')) {
        if (self.matchGPU('adreno (tm) ', 600, 616)) return true;
        if (self.matchGPU('adreno (tm) ', 530, 600)) return true;
      }
      return false;
    })()),
    (self.MT2 =
      !!Device.mobile &&
      !self.BLOCKLIST &&
      (!('ios' != Device.system.os || !self.detect(['a11', 'a12'])) ||
        (self.detect('adreno')
          ? self.matchGPU('adreno (tm) ', 630)
          : self.detect('mali-g')
            ? self.matchGPU('mali-g', 74)
            : !(
                !navigator.platform.toLowerCase().includes(['mac', 'windows']) ||
                'chrome' != Device.system.browser
              )))),
    (self.MT3 =
      !!Device.mobile &&
      !self.BLOCKLIST &&
      (!(
        'ios' != Device.system.os || !self.detect(['a12', 'a13', 'a14', 'a15', 'a16', 'a17', 'a18'])
      ) ||
        (self.detect('adreno')
          ? self.matchGPU('adreno (tm) ', 640)
          : self.detect('mali-g')
            ? self.matchGPU('mali-g', 76)
            : !(
                !navigator.platform.toLowerCase().includes(['mac', 'windows']) ||
                'chrome' != Device.system.browser
              )))),
    (self.MT4 =
      !!Device.mobile &&
      !self.BLOCKLIST &&
      (!(
        'ios' != Device.system.os ||
        !self.detect(['a14', 'a15', 'a16', 'a17', 'a18', 'a19', 'a20', 'apple m'])
      ) ||
        (self.detect('adreno')
          ? self.matchGPU('adreno (tm) ', 650)
          : self.detect('mali-g')
            ? self.detect('mali-g710') || self.matchGPU('mali-g', 78)
            : !(
                !navigator.platform.toLowerCase().includes(['mac', 'windows']) ||
                'chrome' != Device.system.browser
              )))),
    (self.MT5 =
      !!Device.mobile &&
      !self.BLOCKLIST &&
      (!(
        'ios' != Device.system.os ||
        !self.detect([
          'a16',
          'a17',
          'a18',
          'a19',
          'a20',
          'a21',
          'a22',
          'a23',
          'a24',
          'a25',
          'apple m',
        ])
      ) ||
        (self.detect('adreno')
          ? self.matchGPU('adreno (tm) ', 740)
          : !(
              !navigator.platform.toLowerCase().includes(['mac', 'windows']) ||
              'chrome' != Device.system.browser
            )))),
    (self.lt = function (num) {
      return self.TIER > -1 && self.TIER <= num;
    }),
    (self.gt = function (num) {
      return self.TIER > -1 && self.TIER >= num;
    }),
    (self.eq = function (num) {
      return self.TIER > -1 && self.TIER == num;
    }),
    (self.mobileEq = function (num) {
      return self.M_TIER > -1 && self.M_TIER == num;
    }),
    (self.mobileLT = function (num) {
      return self.M_TIER > -1 && self.M_TIER <= num;
    }),
    (self.mobileGT = function (num) {
      return self.M_TIER > -1 && self.M_TIER >= num;
    }),
    self)) {
      'T' == key.charAt(0) && true === self[key] && (self.TIER = Number(key.charAt(1)));
      'MT' == key.slice(0, 2) && true === self[key] && (self.M_TIER = Number(key.charAt(2)));
    }
    false !== Utils.query('gpu') &&
      (Device.mobile || Utils.query('gpu').toString().includes('m')
        ? ((self.TIER = -1), (self.M_TIER = Number(Utils.query('gpu').slice(1))))
        : (self.TIER = Number(Utils.query('gpu'))));
    'ios' == Device.system.os && Render.REFRESH_RATE < 40 && (self.M_TIER -= 1);
    self.OVERSIZED =
      (!Device.mobile &&
        self.TIER <= 0 &&
        Math.max(window.innerWidth, window.innerHeight) > 1400) ||
      (!Device.mobile &&
        self.TIER <= 1 &&
        Device.pixelRatio < 2 &&
        Math.max(window.innerWidth, window.innerHeight) > 1600);
    'ie' == Device.system.browser && (self.OVERSIZED = true);
    self.initialized = true;
  });
  this.ready = function () {
    return this.wait('initialized');
  };
}, 'static');

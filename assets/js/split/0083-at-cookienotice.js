/*
 * CookieNotice — geo-aware consent gate. Decides whether the cookie
 * prompt should be shown, persists the user's choice across visits,
 * and forwards consent to gtag (Google Consent Mode v2).
 *
 * Why geo-aware?
 *   GDPR (EEA) + UK GDPR require explicit consent before any analytics
 *   or ads storage. Outside the EEA/UK, the prompt is suppressed and
 *   gtag defaults to granted. `EEA_COUNTRIES` is the static list of
 *   ISO-3166 alpha-2 codes for the EEA + UK ('GB').
 *
 * Init flow (async IIFE):
 *   1. Wait for Hydra.ready() so Storage / Model machinery is up.
 *   2. Short-circuit: previously accepted → flag granted, dataReady.
 *   3. Short-circuit: previously declined → flag denied, dataReady.
 *   4. Otherwise hit the geo endpoint
 *      (at-services.cloudfunctions.net/geo) for the visitor's country
 *      code, set `_isInEEA = EEA list includes the code`.
 *   5. If in EEA: push gtag('consent','update', {denied,denied}) so the
 *      page boots in a compliant default state until the user opts in,
 *      then mark dataReady + 'ready' flag.
 *
 *   Note: outside EEA the function returns without marking
 *   `flag('ready', true)` — `displayNotice()` will see `dataReady`
 *   true but `_isInEEA` falsy and decide not to display. The 'ready'
 *   flag is only set when we actually need the prompt, so UI code
 *   waiting on `CookieNotice.ready()` only resolves when there's
 *   something to show.
 *
 * `displayNotice()`:
 *   Returns true if the prompt should be shown. Honors a `?cookies=`
 *   query string (force-show, for QA) regardless of EEA status.
 *   Otherwise: never previously decided AND in EEA.
 *
 * `accept()` / `decline()`:
 *   Forward to gtag consent + persist the decision. Note the asymmetry
 *   in storage keys: `accept` writes `cookies_allow=true` but the
 *   load-path reads `cookies_accepted` (line 41). This is a real bug
 *   in the original — preserved verbatim. Probably explains why some
 *   users see the prompt twice.
 *
 * `clear()`:
 *   QA helper — wipe both stored decisions so the prompt re-displays
 *   on next reload.
 *
 * DEBUG (?debug=1) logs every branch decision to console; safe to
 * leave on in production since gated by Utils.query.
 */
Class(function CookieNotice() {
  Inherit(this, Model);
  const self = this;
  const DEBUG = Utils.query('debug');
  const EEA_COUNTRIES = [
    'AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT',
    'LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE','IS','LI','NO','GB',
  ];

  let _isInEEA, _allowCookies;

  (async function init() {
    await Hydra.ready();

    if (Storage.get('cookies_accepted')) {
      if (DEBUG) console.log('[CookieNotice] cookies were previously accepted');
      _allowCookies = true;
      self.dataReady = true;
      return;
    }

    if (Storage.get('cookies_declined')) {
      if (DEBUG) console.log('[CookieNotice] cookies were previously declined');
      _allowCookies = false;
      self.dataReady = true;
      return;
    }

    // Geo lookup: locate the visitor by IP.
    const geo = await get('https://us-central1-at-services.cloudfunctions.net/geo');
    _isInEEA = EEA_COUNTRIES.includes(geo.location?.countryCode);

    if (DEBUG) {
      console.log('[CookieNotice] geo lookup, country detected: ', geo.location?.countryCode);
      console.log('[CookieNotice] in user in EEA or UK? ', _isInEEA);
    }

    if (_isInEEA) {
      if (window.gtag) {
        gtag('consent', 'update', { analytics_storage: 'denied', ads_storage: 'denied' });
      }
      if (DEBUG) console.log('[CookieNotice] gtag consent set to denied');
      self.dataReady = true;
      self.flag('ready', true);
    }
  })();

  // True iff the consent prompt should currently be shown.
  self.displayNotice = function () {
    if (!self.dataReady) {
      console.warn('CookieNotice not ready. wait for `await CookieNotice.ready()` before calling.');
    }
    return !!Utils.query('cookies') ||
      (false !== _allowCookies && true !== _allowCookies && !!_isInEEA);
  };

  self.accept = function () {
    if (window.gtag) {
      gtag('consent', 'update', { analytics_storage: 'granted', ads_storage: 'granted' });
    }
    if (DEBUG) console.log('[CookieNotice] gtag consent set to granted');
    // Note original bug preserved: stores under 'cookies_allow' but the
    // init path checks 'cookies_accepted'.
    Storage.set('cookies_allow', true);
  };

  self.decline = function () {
    if (window.gtag) {
      gtag('consent', 'update', { analytics_storage: 'denied', ads_storage: 'denied' });
    }
    if (DEBUG) console.log('[CookieNotice] gtag consent set to denied');
    Storage.set('cookies_declined', true);
  };

  // QA helper: wipe both stored decisions.
  self.clear = function () {
    if (DEBUG) console.log('[CookieNotice] cookie settings cleared');
    Storage.set('cookies_allow',    null);
    Storage.set('cookies_declined', null);
  };

  self.ready = function () {
    return self.wait(self, 'ready');
  };
}, 'Static');

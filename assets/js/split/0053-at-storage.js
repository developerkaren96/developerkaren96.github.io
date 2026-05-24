/*
 * Storage — thin uniform API over `localStorage` with cookie fallback (for
 * browsers/environments where localStorage is unavailable or forbidden,
 * e.g. Safari private mode in older versions, sandboxed iframes).
 *
 *   Storage.set(key, value)
 *   Storage.get(key)
 *   Storage.setCookie(key, value, expires)
 *   Storage.getCookie(key)
 *
 * Storage path selection (`testStorage` IIFE): a write/read probe on
 * `window.localStorage.test`. Throws are caught into `_storage = false`,
 * triggering the cookie fallback.
 *
 * Value coercion in `get`:
 *   • leading `{` or `[`  → JSON.parse                (objects/arrays)
 *   • exact 'true'/'false' → boolean
 *   • otherwise the raw string is returned.
 *   Setter mirrors: non-null objects are JSON.stringified before write.
 *
 * No-tracking mode (`noTracking = true`):
 *   Switches the backing store to an in-memory `_sessionData` map so
 *   nothing persists across navigation. Useful when the user has opted out
 *   of analytics/persistence.
 *
 * Cookie helper:
 *   `cookie(key)`               — read.
 *   `cookie(key, value, days)`  — write with default 1-day expiry; `null`
 *                                 value sets expires=-1 (deletion).
 *   path is hard-coded to `/`. URL-encodes both key and value unless the
 *   call passes `{ raw: true }` (the read side mirrors that via `options.raw`).
 */
Class(function Storage() {
  const self = this;
  let _storage;
  const _sessionData = {};

  /*
   * Two-mode cookie helper. With >1 args we're writing; otherwise reading.
   * The reader runs a regex `(?:^|; )key=([^;]*)` against `document.cookie`.
   * The writer URL-encodes (unless raw), formats expires/path/domain/secure
   * sub-options, and assigns to `document.cookie`.
   */
  function cookie(key, value, expires) {
    let options;
    if (arguments.length > 1 && (null === value || 'object' != typeof value)) {
      options = {};
      options.path    = '/';
      options.expires = expires || 1;
      if (null === value) options.expires = -1;
      if ('number' == typeof options.expires) {
        const days = options.expires;
        const t = (options.expires = new Date());
        t.setDate(t.getDate() + days);
      }
      return (document.cookie = [
        encodeURIComponent(key),
        '=',
        options.raw ? String(value) : encodeURIComponent(String(value)),
        options.expires ? '; expires=' + options.expires.toUTCString() : '',
        options.path    ? '; path='    + options.path                   : '',
        options.domain  ? '; domain='  + options.domain                 : '',
        options.secure  ? '; secure'   : '',
      ].join(''));
    }
    options = value || {};
    const decode = options.raw ? function (s) { return s; } : decodeURIComponent;
    const result = new RegExp('(?:^|; )' + encodeURIComponent(key) + '=([^;]*)').exec(document.cookie);
    return result ? decode(result[1]) : null;
  }

  this.noTracking = false;

  // Feature-probe localStorage. Browsers that disable it throw on access or
  // assignment — we catch both into `_storage = false`.
  (function testStorage() {
    try {
      if (window.localStorage) {
        try {
          window.localStorage.test = 1;
          window.localStorage.removeItem('test');
          _storage = true;
        } catch (e) {
          _storage = false;
        }
      } else _storage = false;
    } catch (e) {
      _storage = false;
    }
  })();

  this.setCookie = function (key, value, expires) { cookie(key, value, expires); };
  this.getCookie = function (key) { return cookie(key); };

  /*
   * Write. No-tracking → ephemeral map. Else: stringify objects, store as
   * localStorage or cookie. `null` deletes the entry.
   */
  this.set = function (key, value) {
    if (self.noTracking) { _sessionData[key] = value; return; }
    if (null != value && 'object' == typeof value) value = JSON.stringify(value);
    if (_storage) {
      if (null === value) window.localStorage.removeItem(key);
      else                window.localStorage[key] = value;
    } else {
      cookie(key, value, 365);
    }
  };

  /*
   * Read with type coercion: JSON-looking strings are parsed; 'true'/'false'
   * are coerced to booleans. Other values pass through as strings.
   */
  this.get = function (key) {
    if (self.noTracking) return _sessionData[key];
    let val = _storage ? window.localStorage[key] : cookie(key);
    if (val) {
      const char0 = val.charAt ? val.charAt(0) : undefined;
      if ('{' == char0 || '[' == char0) val = JSON.parse(val);
      if ('true' == val || 'false' == val) val = 'true' == val;
    }
    return val;
  };
}, 'Static');

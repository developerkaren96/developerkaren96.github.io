/*
 * Utils — grab-bag of helpers used across the framework.
 *
 * Static singleton — exposed as `window.Utils`. Most methods are pure
 * utilities (string formatting, URL query manipulation, debounce, etc.).
 * The only stateful pieces are `_queries` (memoized parsed query params)
 * and `_searchParams` (re-synced whenever the URL is mutated through
 * `addQuery`/`removeQuery`).
 */
Class(function Utils() {
  const queryCache = {};
  let searchParams = new URLSearchParams(window.location.search);

  /**
   * Read or write a query-string parameter.
   *
   *   Utils.query('debug')          → cached value, or parse from URL.
   *   Utils.query('debug', true)    → memoize without touching the URL.
   *
   * Type coercion: 'false'/null → false, '' → true, '0' → 0, else string.
   * Values set via the second arg short-circuit the cache.
   *
   * `queryParams` is an alias kept for backwards compatibility.
   */
  this.query = this.queryParams = function (key, value) {
    if (value !== undefined) queryCache[key] = value;
    if (queryCache[key] !== undefined) return queryCache[key];

    if (searchParams) {
      value = searchParams.get(key);
      if (value === '0') value = 0;
      else if (value === 'false' || value === null) value = false;
      else if (value === '') value = true;
    } else {
      // Fallback regex parse for environments without URLSearchParams.
      const escapedKey = encodeURIComponent(key).replace(/[\.\+\*]/g, '\\$&');
      value = decodeURIComponent(
        window.location.search.replace(
          new RegExp(`^(?:.*?[&?]${escapedKey}(?:=([^&]*)|[&$]))?.*$`, 'i'),
          '$1',
        ),
      );
      if (value === '0') value = 0;
      else if (value === 'false') value = false;
      else if (!value.length) {
        // No value but the key is present → treat as boolean flag.
        value = new RegExp(`[&?]${escapedKey}(?:[&=]|$)`, 'i').test(window.location.search);
      }
    }

    queryCache[key] = value;
    return value;
  };

  /** Set `?key=value` on the current URL via `history.replaceState`. */
  this.addQuery = function (key, value) {
    if (queryCache[key] === value) return queryCache[key];
    const url = new URL(location.href);
    url.searchParams.set(key, value);
    searchParams = url.searchParams;
    window.history.replaceState({}, document.title, url.toString());
    queryCache[key] = value;
    return value;
  };

  /** Remove `?key` from the URL. */
  this.removeQuery = function (key) {
    const url = new URL(location.href);
    url.searchParams.delete(key);
    searchParams = url.searchParams;
    window.history.replaceState({}, document.title, url.toString());
    delete queryCache[key];
  };

  /** Re-attach the current query string (and optional `hash`) to a given path. */
  this.addQueryToPath = function (path, hash) {
    return [
      [path, searchParams.toString()].filter(Boolean).join('?'),
      hash,
    ].filter(Boolean).join('#');
  };

  /** Append `?param=value` to a URL string (does not deduplicate). */
  this.addParam = function (url, param, value) {
    const queryIdx = url.indexOf('?');
    const prefix = url.substring(0, queryIdx + 1);
    const suffix = url.substring(queryIdx + 1);
    const params = new URLSearchParams(suffix);
    params.append(param, value);
    return prefix + params.toString();
  };

  /** Strip `?param` (all values) from a URL string. */
  this.removeParam = function (url, param) {
    const queryIdx = url.indexOf('?');
    const prefix = url.substring(0, queryIdx + 1);
    const suffix = url.substring(queryIdx + 1);
    const params = new URLSearchParams(suffix);
    params.delete(param);
    return prefix + params.toString();
  };

  /**
   * Reflect the class/function name for an instance, memoized on the
   * object itself. Falls back to parsing the function source when
   * `.name` isn't enough (older browsers / minified code).
   */
  this.getConstructorName = function (obj) {
    if (!obj) return obj;
    if (obj.___constructorName) return obj.___constructorName;
    if (typeof obj === 'function') {
      obj.___constructorName = obj.toString().match(/function ([^\(]+)/)?.[1];
    } else {
      obj.___constructorName =
        obj.constructor.name || obj.constructor.toString().match(/function ([^\(]+)/)?.[1];
    }
    return obj.___constructorName;
  };

  /**
   * Null-out every property of an object that already has a `destroy`
   * or `div` (i.e. owns DOM / lifecycle resources). Leaves the special
   * `deleted` boolean alone so it can survive a tear-down.
   */
  this.nullObject = function (object) {
    if (object && (object.destroy || object.div)) {
      for (const key in object) {
        const isDeletedFlag = typeof object[key] === 'boolean' && key === 'deleted';
        if (!isDeletedFlag && object[key] !== undefined) object[key] = null;
      }
    }
    return null;
  };

  /** Deep-clone a JSON-serializable object. */
  this.cloneObject = function (obj) {
    return JSON.parse(JSON.stringify(obj));
  };

  /** Coin flip — returns one of the two arguments. */
  this.headsTails = function (n0, n1) {
    return Math.random(0, 1) ? n1 : n0;
  };

  /** Shallow-merge any number of source objects into a fresh object. */
  this.mergeObject = function () {
    const out = {};
    for (let i = 0; i < arguments.length; i++) {
      const src = arguments[i];
      for (const key in src) out[key] = src[key];
    }
    return out;
  };

  /**
   * Generate a pseudo-UUID (NOT crypto-strength; for cache-busting / DOM ids).
   * Format: `<epoch-ms>xx-4xx-yxx-xxx` where x→random hex, y→8/9/a/b.
   */
  this.timestamp = this.uuid = function () {
    return (
      Date.now() +
      'xx-4xx-yxx-xxx'.replace(/[xy]/g, (c) => {
        const r = (16 * Math.random()) | 0;
        const v = c === 'x' ? r : (r & 3) | 8;
        return v.toString(16);
      })
    );
  };

  /** Random `#RRGGBB`. Retries if the string lands shorter than 7 chars. */
  this.randomColor = function () {
    let color = '#' + Math.floor(16777215 * Math.random()).toString(16);
    if (color.length < 7) color = this.randomColor();
    return color;
  };

  /** `1234567` → `"1,234,567"`. */
  this.numberWithCommas = function (num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };

  /** Zero-pad `num` to `digits` digits. `isLimit` caps at `10^digits - 1`. */
  this.padInt = function (num, digits, isLimit) {
    if (isLimit) num = Math.min(num, Math.pow(10, digits) - 1);
    const str = Math.floor(num).toString();
    return Math.pow(10, Math.max(0, digits - str.length)).toString().slice(1) + str;
  };

  /**
   * Copy a string to the clipboard using a hidden `<textarea>` + execCommand.
   * Returns true on success, false on any DOM/exec failure.
   * (Intentionally NOT using the async clipboard API — works in more contexts.)
   */
  this.copyToClipboard = function (string) {
    try {
      const el = document.createElement('textarea');
      const range = document.createRange();
      el.contentEditable = true;
      el.readOnly = true;
      el.value = string;
      document.body.appendChild(el);
      el.select();
      range.selectNodeContents(el);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      el.setSelectionRange(0, string.length);
      document.execCommand('copy');
      document.body.removeChild(el);
      return true;
    } catch (_e) {
      return false;
    }
  };

  /**
   * Format an array as a human-readable list:
   *   ['a','b','c']              → "a, b & c"
   *   ['a','b','c','d'], 2       → "a, b & 2 more"
   *   options: { oxford, more, and, comma, limit }
   *
   * Note: mutates `items` (uses `.shift()`).
   */
  this.stringList = function (items = [], limit = 0, options = {}) {
    if (items.length === 0) return '';

    // Allow `stringList(items, options)` shorthand.
    if (typeof limit === 'object') { options = limit; limit = 0; }
    options.oxford = options.oxford === true;
    options.more = options.more !== false && (options.more ? options.more : 'more');
    options.and = options.and || '&';
    options.comma = options.comma || ',';
    if (!isNaN(options.limit)) limit = options.limit;
    if (limit === 0) limit = items.length;

    let output = '';
    let printed = 0;
    do {
      output = `${output}${items.shift()}${options.comma} `;
      printed++;
    } while (items.length > 1 && printed + 1 < limit);

    output = output.trim();
    output = output.slice(0, output.length - 1); // drop trailing comma

    if (items.length === 1) {
      const oxfordComma = options.oxford && printed > 1 ? options.comma : '';
      output = `${output}${oxfordComma} ${options.and} ${items.shift()}`;
    } else if (items.length > 1 && options.more) {
      const oxfordComma = options.oxford && printed > 1 ? options.comma : '';
      output = `${output}${oxfordComma} ${options.and} ${items.length} ${options.more}`;
    }
    return output;
  };

  /**
   * Standard debounce. Stashes the timer handle on `callback.__interval`,
   * so calling `debounce(sameFn, ...)` again cancels the previous pending
   * call. Uses Hydra's `Timer` instead of native `setTimeout` so it can
   * be cleared via the wrapped `clearTimeout` from 0002.
   */
  this.debounce = function (callback, time = 100, data) {
    clearTimeout(callback.__interval);
    callback.__interval = Timer.create(() => callback(data), time);
  };
}, 'Static');

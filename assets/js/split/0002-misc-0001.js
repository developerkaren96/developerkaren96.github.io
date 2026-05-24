/*
 * Bootstrap polyfills + global Class/Inherit/Namespace shim.
 *
 * Runs as a classic script (no module scope), so top-level declarations
 * with `let`/`const` are *not* visible to subsequent split files unless
 * we attach them to `window`. Function declarations and assignments to
 * `Math.*`, `Array.prototype.*`, etc. are visible globally, which is
 * the whole point of this file.
 *
 * Three responsibilities here:
 *   1. Polyfill missing browser APIs (rAF, Float32Array, WeakRef, fetch).
 *   2. Extend Math / Array.prototype / String.prototype / Promise with
 *      project-specific helpers used throughout Hydra.
 *   3. Install `Class`, `Inherit`, `Namespace` — Active Theory's tiny
 *      OOP shim. Almost every `0xxx-class-*.js` and `0xxx-at-*.js` split
 *      relies on these three being on `window`.
 */

// ─── 1. Console / time / animation polyfills ────────────────────────────

if (typeof console === 'undefined') {
  window.console = {};
  const noop = function () {};
  console.log = console.error = console.info = console.debug = console.warn = console.trace = noop;
}

window.performance = window.performance && window.performance.now ? window.performance : Date;

Date.now = Date.now || function () { return +new Date(); };

if (!window.requestAnimationFrame) {
  window.requestAnimationFrame =
    window.webkitRequestAnimationFrame ||
    window.mozRequestAnimationFrame ||
    window.oRequestAnimationFrame ||
    window.msRequestAnimationFrame ||
    (function () {
      const start = Date.now();
      return function (callback) {
        window.setTimeout(() => callback(Date.now() - start), 1000 / 60);
      };
    })();
}
window.defer = window.requestAnimationFrame;

// `clearTimeout` is wrapped so handles minted by Hydra's `Timer` (which
// uses its own scheduler) can be released too. If Timer doesn't recognize
// the handle, fall back to the native clearTimeout.
window.clearTimeout = (function () {
  const nativeClearTimeout = window.clearTimeout;
  return function (handle) {
    return (window.Timer && Timer.__clearTimeout(handle)) || nativeClearTimeout(handle);
  };
})();

// `requestIdleCallback` shim — fall back to `defer` (≈ rAF) when the
// browser doesn't have it (Safari historically).
window.requestIdleCallback = (function () {
  const native = window.requestIdleCallback;
  return function (callback, maxTimeout) {
    if (native) {
      return native(callback, maxTimeout ? { timeout: maxTimeout } : null);
    }
    return defer(() => callback({ didTimeout: false }), 0);
  };
})();
window.onIdle = window.requestIdleCallback;

if (typeof Float32Array === 'undefined') Float32Array = Array;

// ─── 2. Math helpers ────────────────────────────────────────────────────

Math.sign = function (x) {
  x = +x;
  if (x === 0 || isNaN(x)) return Number(x);
  return x > 0 ? 1 : -1;
};

// Override Math.round to accept an optional precision (decimal places).
// Original Math.round is preserved as Math._round.
Math._round = Math.round;
Math.round = function (value, precision = 0) {
  const factor = Math.pow(10, precision);
  return Math._round(value * factor) / factor;
};

// `Math.random()` is overloaded:
//   ()                       → original 0..1
//   (max)                    → integer in [0..max]    (note: min defaults to 0, precision 0 → integer)
//   (min, max)               → integer in [min..max]
//   (min, max, precision)    → float in [min..max] rounded to `precision` decimals
// Original Math.random is preserved as Math._random and aliased to Math.rand.
Math._random = Math.random;
Math.rand = Math.random = function (min = 0, max = 1, precision = 0) {
  if (arguments.length === 0) return Math._random();
  if (min === max) return min;
  if (precision === 0) {
    return Math.floor(Math._random() * (max + 1 - min) + min);
  }
  return Math.round(min + Math._random() * (max - min), precision);
};

// Fill in the prototype for `RNG` declared in 0001-func-rng.js.
RNG.prototype.nextFloat = function () {
  this.state = (this.a * this.state + this.c) % this.m;
  return this.state / (this.m - 1);
};

// `Math.randomSeed` mirrors the new `Math.random` overloads, but uses a
// deterministic RNG seeded with 1337 so visuals can be reproduced.
Math._randomSeed = new RNG(1337);
Math.randomSeed = function (min = 0, max = 1, precision = 0) {
  if (arguments.length === 0) return Math._randomSeed.nextFloat();
  if (min === max) return min;
  if (precision === 0) {
    return Math.floor(Math._randomSeed.nextFloat() * (max + 1 - min) + min);
  }
  return Math.round(min + Math._randomSeed.nextFloat() * (max - min), precision);
};

Math.degrees = function (radians) { return radians * (180 / Math.PI); };
Math.radians = function (degrees) { return degrees * (Math.PI / 180); };

Math.clamp = function (value, min = 0, max = 1) {
  return Math.min(Math.max(value, Math.min(min, max)), Math.max(min, max));
};

// Linear remap from [oldMin..oldMax] to [newMin..newMax].
// When `isClamp` is truthy the result is clamped into the output range.
Math.map = Math.range = function (value, oldMin = -1, oldMax = 1, newMin = 0, newMax = 1, isClamp) {
  const mapped = ((value - oldMin) * (newMax - newMin)) / (oldMax - oldMin) + newMin;
  if (!isClamp) return mapped;
  return Math.clamp(mapped, Math.min(newMin, newMax), Math.max(newMin, newMax));
};

Math.mix = function (a, b, alpha) { return a * (1 - alpha) + b * alpha; };
Math.step = function (edge, value) { return value < edge ? 0 : 1; };
Math.smoothStep = function (min, max, value) {
  const x = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return x * x * (3 - 2 * x);
};
Math.fract = function (value) { return value - Math.floor(value); };

// Frame-rate-independent lerp. When `calcHz` is true (default), alpha is
// remapped through `framerateNormalizeLerpAlpha` so the same alpha gives
// the same perceived ease regardless of actual frame rate.
Math.lerp = function (target, value, alpha, calcHz = true) {
  alpha = calcHz ? Math.framerateNormalizeLerpAlpha(alpha) : Math.clamp(alpha);
  return value + (target - value) * alpha;
};

// IIFE just to scope the `mainThread` capture — worker threads skip the
// frame-rate normalization (no Render module there).
{
  const mainThread = !!window.document;
  Math.framerateNormalizeLerpAlpha = function (alpha) {
    alpha = Math.clamp(alpha);
    if (!mainThread) return alpha;
    return 1 - Math.exp(Math.log(1 - alpha) * Render.FRAME_HZ_MULTIPLIER);
  };
}

// Modulo that always returns a positive result.
Math.mod = function (value, n) { return ((value % n) + n) % n; };

// ─── 3. Array helpers ───────────────────────────────────────────────────

Object.defineProperty(Array.prototype, 'shuffle', {
  writable: true,
  value: function () {
    let currentIndex = this.length;
    let randomIndex;
    while (currentIndex !== 0) {
      randomIndex = Math.floor(Math.random() * currentIndex);
      currentIndex--;
      [this[currentIndex], this[randomIndex]] = [this[randomIndex], this[currentIndex]];
    }
    return this;
  },
});

// Mark an array as "no-repeat random": with `Array.storeRandom(arr)` the
// next N `.random()` calls won't repeat the same index until the store fills.
Array.storeRandom = function (arr) { arr.randomStore = []; };

Object.defineProperty(Array.prototype, 'random', {
  writable: true,
  value: function (range) {
    let value = Math.random(0, this.length - 1);
    if (arguments.length && !this.randomStore) Array.storeRandom(this);
    if (!this.randomStore) return this[value];
    if (range > this.length - 1) range = this.length;
    if (range > 1) {
      // Skip indices already in the store, wrapping at end-of-array.
      while (~this.randomStore.indexOf(value)) {
        value += 1;
        if (value > this.length - 1) value = 0;
      }
      this.randomStore.push(value);
      if (this.randomStore.length >= range) this.randomStore.shift();
    }
    return this[value];
  },
});

Object.defineProperty(Array.prototype, 'remove', {
  writable: true,
  value: function (element) {
    if (!this.indexOf) return;
    const index = this.indexOf(element);
    return ~index ? this.splice(index, 1) : undefined;
  },
});

Object.defineProperty(Array.prototype, 'last', {
  writable: true,
  value: function () { return this[this.length - 1]; },
});

// `Array.prototype.flat` polyfill for old engines.
window.Promise = window.Promise || {};
if (!Array.prototype.flat) {
  Object.defineProperty(Array.prototype, 'flat', {
    configurable: true,
    writable: true,
    value: function flat() {
      const depth = isNaN(arguments[0]) ? 1 : Number(arguments[0]);
      if (!depth) return Array.prototype.slice.call(this);
      return Array.prototype.reduce.call(this, (acc, cur) => {
        if (Array.isArray(cur)) acc.push.apply(acc, flat.call(cur, depth - 1));
        else acc.push(cur);
        return acc;
      }, []);
    },
  });
}

// ─── 4. Promise helpers ─────────────────────────────────────────────────

// Externally-resolvable promise. `p = Promise.create(); p.resolve(x);`
Promise.create = function () {
  const promise = new Promise((resolve, reject) => {
    this.temp_resolve = resolve;
    this.temp_reject = reject;
  });
  promise.resolve = this.temp_resolve;
  promise.reject = this.temp_reject;
  delete this.temp_resolve;
  delete this.temp_reject;
  return promise;
};

// `Promise.all` where individual rejections don't short-circuit.
Promise.catchAll = function (array) {
  return Promise.all(
    array.map((promise) =>
      promise && typeof promise.catch === 'function'
        ? promise.catch((error) => { Promise.reject(error); })
        : promise,
    ),
  );
};

// Race a promise against a timer. Resolves as soon as either finishes.
Promise.timeout = function (promise, timeout) {
  if (Array.isArray(promise)) promise = Promise.all(promise);
  const timeoutPromise = Promise.create();
  const handle = Timer.create(timeoutPromise.resolve, timeout);
  return Promise.race([promise, timeoutPromise]).finally(() => {
    Timer.__clearTimeout(handle);
  });
};

// ─── 5. String helpers ──────────────────────────────────────────────────

(function () {
  // `String.prototype.includes` polyfill that mirrors the spec's regex check
  // *and* extends with array-of-substrings support used throughout Hydra.
  function notRegExp(it) {
    function isRegExp(it) {
      if (!(typeof it === 'object' ? it !== null : typeof it === 'function')) return false;
      const match = it[typeof Symbol !== 'undefined' ? Symbol.match : 'match'];
      if (match !== undefined) return !!match;
      return Object.prototype.toString.call(it).slice(8, -1) === 'RegExp';
    }
    if (isRegExp(it)) {
      throw new Error('First argument to String.prototype.includes must not be a regular expression');
    }
    return it;
  }
  Object.defineProperty(String.prototype, 'includes', {
    writable: true,
    value: function (str) {
      if (!Array.isArray(str)) return !!~this.indexOf(notRegExp(str));
      for (let i = str.length - 1; i >= 0; i--) {
        if (~this.indexOf(notRegExp(str[i]))) return true;
      }
      return false;
    },
  });
})();

Object.defineProperty(String.prototype, 'equals', {
  writable: true,
  value: function (str) {
    const self = String(this);
    if (!Array.isArray(str)) return str === self;
    for (let i = str.length - 1; i >= 0; i--) if (str[i] === self) return true;
    return false;
  },
});

Object.defineProperty(String.prototype, 'strpos', {
  writable: true,
  value: function (str) {
    console.warn('strpos deprecated: use .includes()');
    return this.includes(str);
  },
});

// Truncate to `num` characters, optionally appending `end` (e.g. "…").
Object.defineProperty(String.prototype, 'clip', {
  writable: true,
  value: function (num, end = '') {
    if (this.length <= num) return this.slice();
    return this.slice(0, Math.max(0, num - end.length)).trim() + end;
  },
});

Object.defineProperty(String.prototype, 'capitalize', {
  writable: true,
  value: function () { return this.charAt(0).toUpperCase() + this.slice(1); },
});

Object.defineProperty(String.prototype, 'replaceAll', {
  writable: true,
  value: function (find, replace) { return this.split(find).join(replace); },
});

Object.defineProperty(String.prototype, 'replaceAt', {
  writable: true,
  value: function (index, replacement) {
    return this.substr(0, index) + replacement + this.substr(index + replacement.length);
  },
});

// ─── 6. fetch / get / post / put ────────────────────────────────────────

// XHR-based `fetch` polyfill, used for `file://` protocol and old browsers.
if (!window.fetch || (!window.AURA && location.protocol.includes('file'))) {
  window.fetch = function (url, options) {
    options = options || {};
    const promise = Promise.create();
    const request = new XMLHttpRequest();
    request.open(options.method || 'get', url);
    if (url.includes('.ktx')) request.responseType = 'arraybuffer';
    for (const header in options.headers) request.setRequestHeader(header, options.headers[header]);

    function response() {
      const keys = [];
      const all = [];
      const headers = {};
      request.getAllResponseHeaders().replace(/^(.*?):\s*([\s\S]*?)$/gm, (_match, key, value) => {
        key = key.toLowerCase();
        keys.push(key);
        all.push([key, value]);
        const existing = headers[key];
        headers[key] = existing ? `${existing},${value}` : value;
      });
      return {
        ok: ((request.status / 200) | 0) === 1,
        status: request.status,
        statusText: request.statusText,
        url: request.responseURL,
        clone: response,
        text: () => Promise.resolve(request.responseText),
        json: () => Promise.resolve(request.responseText).then(JSON.parse),
        xml: () => Promise.resolve(request.responseXML),
        blob: () => Promise.resolve(new Blob([request.response])),
        arrayBuffer: () => Promise.resolve(request.response),
        headers: {
          keys: () => keys,
          entries: () => all,
          get: (n) => headers[n.toLowerCase()],
          has: (n) => n.toLowerCase() in headers,
        },
      };
    }

    request.onload = () => { promise.resolve(response()); };
    request.onerror = promise.reject;
    request.send(options.body);
    return promise;
  };
}

// Convenience wrappers — auto-parse JSON, single-promise return.
function _autoParseTextResponse(response, promise) {
  if (!response.ok) return promise.reject(response);
  response.text().then((text) => {
    const first = text.charAt(0);
    // Try JSON parse only if the body looks like an object/array literal.
    if (first === '[' || first === '{') {
      try { promise.resolve(JSON.parse(text)); }
      catch (_err) { promise.resolve(text); }
    } else {
      promise.resolve(text);
    }
  });
}

window.get = function (url, options = { credentials: 'same-origin' }) {
  const promise = Promise.create();
  options.method = 'GET';
  fetch(url, options)
    .then((res) => _autoParseTextResponse(res, promise))
    .catch(promise.reject);
  return promise;
};

window.post = function (url, body = {}, options = {}) {
  const promise = Promise.create();
  options.method = 'POST';
  if (body) {
    options.body = (typeof body === 'object' || Array.isArray(body)) ? JSON.stringify(body) : body;
  }
  if (!options.headers) options.headers = { 'content-type': 'application/json' };
  fetch(url, options)
    .then((res) => _autoParseTextResponse(res, promise))
    .catch(promise.reject);
  return promise;
};

window.put = function (url, body, options = {}) {
  const promise = Promise.create();
  options.method = 'PUT';
  if (body) {
    options.body = (typeof body === 'object' || Array.isArray(body)) ? JSON.stringify(body) : body;
  }
  fetch(url, options)
    .then((res) => _autoParseTextResponse(res, promise))
    .catch(promise.reject);
  return promise;
};

// ─── 7. WeakRef polyfill ────────────────────────────────────────────────

if (typeof WeakRef === 'undefined') {
  (function () {
    const targetProp = typeof Symbol !== 'undefined' ? Symbol('WeakRefTarget') : '@@WeakRefTarget';
    function WeakRef(target) { this[targetProp] = target; }
    WeakRef.prototype.deref = function () { return this[targetProp]; };
    window.WeakRef = WeakRef;
  })();
}

// ─── 8. Class / Inherit / Namespace — Active Theory's OOP shim ──────────

/*
 * `Class(fn[, type[, staticInit]])`
 *
 *   Registers `fn` as a class on `window` (or on the current namespace if
 *   called as `MyNs.Class(...)`). `fn` must be a *named* function expression
 *   — the name is parsed out and used as the property key.
 *
 *   `type`:
 *     undefined  → register the constructor as-is.
 *     'static'   → instantiate immediately, expose the instance.
 *     'singleton'→ keep the constructor, add a lazy `.instance()` getter.
 *
 *   `staticInit` (only for non-static): a function called once after the
 *   class is registered, useful for setting up module-level state.
 */
window.Class = function (ctor, type, staticInit) {
  const target = this || window;
  const name = ctor.name || ctor.toString().match(/function ?([^\(]+)/)[1];

  // Allow `Class(fn, staticInit)` shorthand when `type` is omitted.
  if (typeof type === 'function') {
    staticInit = type;
    type = null;
  }
  type = (type || '').toLowerCase();

  if (type === 'static') {
    target[name] = new ctor();
  } else if (type === 'singleton') {
    target[name] = ctor;
    (function () {
      let instance;
      target[name].instance = function () {
        if (!instance) instance = new ctor(...arguments);
        return instance;
      };
    })();
    if (staticInit) staticInit();
  } else {
    target[name] = ctor;
    if (staticInit) staticInit();
  }

  // Tag the new class with its namespace name (used by debug/introspection).
  if (this && this !== window) this[name]._namespace = this.__namespace;
};

/*
 * `Inherit(child, Parent, ...args)`
 *
 *   Multiple-inheritance-ish helper. Calls `Parent.apply(child, args)` to
 *   pour Parent's instance fields onto `child`, then — once the child's
 *   own constructor has finished — wraps any methods the child overrode
 *   so they can call up via `_methodName` (preserved super reference).
 *
 *   Refuses to override `destroy` directly: must use `onDestroy` instead.
 */
window.Inherit = function (child, Parent, ...args) {
  Parent.apply(child, args);

  // Snapshot the parent's method set as it stood right after super-apply.
  const inherited = {};
  for (const method in child) inherited[method] = child[method];

  const installSuperMethods = () => {
    for (const method in inherited) {
      if (child[method] && child[method] !== inherited[method]) {
        if (method === 'destroy' && !child.__element) {
          throw 'Do not override destroy directly, use onDestroy :: ' + child.constructor.toString();
        }
        // Find an unused `_method` slot and stash the parent's version there.
        let aliasName = method;
        do { aliasName = `_${aliasName}`; } while (child[aliasName]);
        child[aliasName] = inherited[method];
      }
    }
  };

  // If the class has an init queue (set up by some Component-style classes),
  // append; otherwise defer to next frame so the child constructor finishes first.
  if (child.__afterInitClass) child.__afterInitClass.push(installSuperMethods);
  else defer(installSuperMethods);
};

/*
 * `Namespace('Name')` or `Namespace(instance)`
 *
 *   String form: ensures `window.Name = { Class, __namespace: 'Name' }`.
 *   Object form: attaches `.Class` and `.__namespace` to the given instance,
 *   making `instance.Class(...)` valid (used inside Hydra modules).
 */
window.Namespace = function (obj) {
  if (typeof obj === 'string') {
    if (!window[obj]) {
      window[obj] = { Class: Class, __namespace: obj };
    }
  } else {
    obj.Class = Class;
    obj.__namespace = obj.constructor.name || obj.constructor.toString().match(/function ([^\(]+)/)[1];
  }
};

window.Global = {};
window.THREAD = false;

/*
 * Assets — global asset registry + path resolution.
 *
 * Static singleton. Houses:
 *   - Per-type bags: IMAGES, VIDEOS, AUDIOS, SDF, JSON, SVG.
 *     (Loaded objects can be stashed under any string key for later
 *      retrieval via `Assets.IMAGES[key]` etc.)
 *   - CDN/base-path config + an `ASSETS.RES` retina-variant map.
 *   - Path-replacement and path-dictionary tables for build-time renames.
 *   - `loadImage` / `decodeImage` helpers (used by AssetLoader).
 *   - WebP capability probe + `perfImage()` swap-to-WebP convenience.
 *
 * AssetList is a tiny Array subclass returned by `Assets.list()` so call
 * sites can do `Assets.list().filter('hero/').prepend('cdn/')` chain-style.
 */
Class(function Assets() {
  const self = this;

  // Array subclass for fluent filter/prepend/append chains over `window.ASSETS`.
  function AssetList(arr) {
    arr.__proto__ = AssetList.prototype;
    return arr;
  }
  AssetList.prototype = new Array();
  AssetList.prototype.filter = function (items) {
    for (let i = this.length - 1; i >= 0; i--) if (!this[i].includes(items)) this.splice(i, 1);
    return this;
  };
  AssetList.prototype.exclude = function (items) {
    for (let i = this.length - 1; i >= 0; i--) if (this[i].includes(items)) this.splice(i, 1);
    return this;
  };
  AssetList.prototype.prepend = function (prefix) {
    for (let i = this.length - 1; i >= 0; i--) this[i] = prefix + this[i];
    return this;
  };
  AssetList.prototype.append = function (suffix) {
    for (let i = this.length - 1; i >= 0; i--) this[i] = this[i] + suffix;
    return this;
  };

  // ─── Storage bags + config ──────────────────────────────────────────────
  this.__loaded = [];
  this.FLIPY = true;
  this.CDN = window.HYDRA_ASSETS_CDN ?? '';
  this.CORS = 'anonymous';

  this.IMAGES = {};
  this.VIDEOS = {};
  this.AUDIOS = {};
  this.SDF = {};
  // JSON bag has a `push(key, value)` method that *clones-on-read* so
  // multiple consumers can mutate their copy without affecting others.
  this.JSON = {
    push: function (prop, value) {
      this[prop] = value;
      Object.defineProperty(this, prop, {
        get: () => JSON.parse(JSON.stringify(value)),
      });
    },
  };
  Object.defineProperty(this.JSON, 'push', { enumerable: false, writable: true });
  this.SVG = {};

  this.BASE_PATH = window.HYDRA_ASSETS_BASE_PATH || '';

  /** Get a `new AssetList(window.ASSETS.slice())` — fluent over the manifest. */
  this.list = function () {
    if (!window.ASSETS) console.warn('ASSETS list not available');
    return new AssetList(window.ASSETS.slice(0) || []);
  };

  /**
   * Resolve a path through the asset rewriting pipeline:
   *
   *   1. `~` prefix → expanded to BASE_PATH.
   *   2. `//` in path → already absolute, return as-is.
   *   3. Look up retina variant from ASSETS.RES table:
   *        ASSETS.RES['path/to/img.jpg'] = { x2: true, x3: true }
   *      becomes `path/to/img-2x.jpg` on a Retina device.
   *   4. Apply any `registerPathReplacement(prefix, newPrefix)` rules.
   *   5. Apply any `registerPath(prefix, [pathsToPrefix])` dictionary rules.
   *   6. Prepend CDN if not already present.
   */
  this.getPath = function (path) {
    if (path.includes('~')) return self.BASE_PATH + path.replace('~', '');
    if (path.includes('//')) return path;

    path = parseResolution(path);

    if (self.replacementPaths) {
      for (const prefix in self.replacementPaths) {
        if (path.startsWith(prefix)) {
          return path.replace(prefix, self.replacementPaths[prefix]);
        }
      }
    }

    if (self.dictionary) {
      for (const cdnPrefix in self.dictionary) {
        if (self.dictionary[cdnPrefix].includes(path.split('?')[0])) {
          return cdnPrefix + path;
        }
      }
    }

    if (this.CDN && !~path.indexOf(this.CDN)) path = this.CDN + path;
    return path;
  };

  /** Pick the highest available retina variant for a path. */
  function parseResolution(path) {
    if (!window.ASSETS || !ASSETS.RES) return path;
    const variants = ASSETS.RES[path];
    if (!variants) return path;
    const ratio = Math.min(Device.pixelRatio, 3);
    if (!variants['x' + ratio]) return path;
    const split = path.split('/');
    const file = split[split.length - 1];
    const [name, ext] = file.split('.');
    return path.replace(file, `${name}-${ratio}x.${ext}`);
  }

  this.registerPathReplacement = function (prefix, replacedPrefix) {
    if (!self.replacementPaths) self.replacementPaths = {};
    self.replacementPaths[prefix] = replacedPrefix;
  };

  this.registerPath = function (prefix, paths) {
    if (!self.dictionary) self.dictionary = {};
    self.dictionary[prefix] = paths;
  };

  /**
   * Synchronous-ish image load. Returns the Image element immediately with
   * `src` already set; call `img.loadPromise()` to await `onload`.
   * `isStore=true` also caches the loaded image in `Assets.IMAGES`.
   */
  this.loadImage = function (path, isStore) {
    const img = new Image();
    img.crossOrigin = this.CORS;
    img.src = self.getPath(path);
    img.loadPromise = function () {
      const promise = Promise.create();
      img.onload = promise.resolve;
      return promise;
    };
    if (isStore) this.IMAGES[path] = img;
    return img;
  };

  /**
   * Promise-based image load with a UV fallback texture. If the path fails,
   * loads `assets/images/_scenelayout/uv.jpg` instead so calling code can
   * keep going (debug visual rather than a missing-texture crash).
   */
  this.decodeImage = function (path, params, promise) {
    if (!promise) promise = Promise.create();
    const img = self.loadImage(path);
    img.onload = () => promise.resolve(img);
    img.onerror = () => self.decodeImage('assets/images/_scenelayout/uv.jpg', params, promise);
    return promise;
  };

  // ─── WebP capability + convenience ──────────────────────────────────────
  const supportsWebP = (function () {
    try {
      return document.createElement('canvas').toDataURL('image/webp').indexOf('data:image/webp') === 0;
    } catch (_e) { return false; }
  })();

  this.supportsWebP = function () { return !!supportsWebP; };

  /** Swap `.jpg`/`.png` for `.webp` when supported. */
  this.perfImage = function (path) {
    if (!self.supportsWebP()) return path;
    if (!path.includes(['.jpg', '.png'])) return path;
    return `${path.substring(0, path.lastIndexOf('.'))}.webp`;
  };
}, 'static');

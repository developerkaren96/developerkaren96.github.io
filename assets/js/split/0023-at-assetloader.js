/*
 * AssetLoader — parallel batched asset loader with progress events.
 *
 *   new AssetLoader(['a.jpg', 'b.json', 'c.mp4'], onComplete);
 *
 * Fires `Events.PROGRESS { percent }` as items finish and `Events.COMPLETE`
 * when the queue drains. Errors are logged but don't block progress (broken
 * asset → counted as done so loading bars don't get stuck).
 *
 * Concurrency: `AssetLoader.SPLIT` items load in parallel; a per-item
 * `AssetLoader.TIMEOUT` (default 5s) warns if anything stalls.
 *
 * Per-extension handling:
 *   jpg/jpeg/png/gif → `<img>` decode (loaded into `Assets.IMAGES` indirectly).
 *   mp4/webm         → fetch as blob → `URL.createObjectURL` → `Assets.VIDEOS`.
 *   mp3              → same blob trick into `Assets.AUDIOS`.
 *   json             → `Assets.JSON.push(name, parsed)` (clone-on-read).
 *   svg              → raw text into `Assets.SVG[name]`.
 *   fnt              → raw text into `Assets.SDF[name]` (SDF font atlas data).
 *   js               → `window.eval` — used for pre-bundled framework modules
 *                       (e.g. `assets/js/modules.js`). Same-origin only via
 *                       the asset path resolver; not arbitrary remote code.
 *   fs/vs/glsl       → handed to `Shaders.parse(data, path)`.
 */
Class(
  function AssetLoader(assets, onComplete, AssetsAPI = Assets) {
    Inherit(this, Events);
    const self = this;

    let totalCount = assets.length;
    let doneCount = 0;
    let lastFiredPercent = 0;

    function loadOne() {
      const path = assets.splice(assets.length - 1, 1)[0];
      const name = path.split('assets/').last().split('.')[0];
      const ext = path.split('.').last().split('?')[0].toLowerCase();
      const timeoutHandle = Timer.create(timedOut, AssetLoader.TIMEOUT, path);

      function done() {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        increment();
        if (assets.length) loadOne();
      }

      // Cached — skip the network entirely.
      if (!Assets.preventCache && ~Assets.__loaded.indexOf(path)) return done();

      // Image branch — `<img>` element drives loading.
      if (ext.includes(['jpg', 'jpeg', 'png', 'gif'])) {
        const image = AssetsAPI.loadImage(path);
        if (image.complete) return done();
        image.onload = done;
        image.onerror = done;
        return;
      }

      // Video / audio branch — fetch as blob, create object URL.
      if (ext.includes(['mp4', 'webm'])) {
        fetch(path)
          .then(async (response) => {
            const blob = await response.blob();
            Assets.VIDEOS[name] = URL.createObjectURL(blob);
            done();
          })
          .catch((e) => { console.warn(e); done(); });
        return;
      }
      if (ext.includes(['mp3'])) {
        fetch(path)
          .then(async (response) => {
            const blob = await response.blob();
            Assets.AUDIOS[name] = URL.createObjectURL(blob);
            done();
          })
          .catch((e) => { console.warn(e); done(); });
        return;
      }

      // Text branch — dispatched by extension.
      get(Assets.getPath(path), Assets.HEADERS)
        .then((data) => {
          Assets.__loaded.push(path);
          if (ext === 'json') AssetsAPI.JSON.push(name, data);
          if (ext === 'svg')  AssetsAPI.SVG[name] = data;
          // `fnt` files are namespaced under their parent folder name.
          if (ext === 'fnt')  AssetsAPI.SDF[name.split('/')[1]] = data;
          if (ext === 'js')   window.eval(data);
          if (ext.includes(['fs', 'vs', 'glsl']) && window.Shaders) Shaders.parse(data, path);
          done();
        })
        .catch((e) => { console.warn(e); done(); });
    }

    /** Bump counter, fire PROGRESS, finalize when at 100%. */
    function increment() {
      const percent = Math.max(lastFiredPercent, Math.min(1, ++doneCount / totalCount));
      self.events.fire(Events.PROGRESS, { percent });
      lastFiredPercent = percent;
      if (doneCount >= totalCount) defer(complete);
    }

    function complete() {
      if (self.completed) return;
      self.completed = true;
      defer(() => {
        if (onComplete) onComplete();
        self.events.fire(Events.COMPLETE);
      });
    }

    function timedOut(path) {
      console.warn('Asset timed out', path);
    }

    // ─── Init: kick off SPLIT parallel loaders ────────────────────────────
    (function () {
      if (!Array.isArray(assets)) throw 'AssetLoader requires array of assets to load';
      assets = assets.slice(0).reverse(); // LIFO so `splice(length-1)` reads in order

      if (!assets.length) return complete();
      for (let i = 0; i < AssetLoader.SPLIT; i++) {
        if (assets.length) loadOne();
      }
    })();

    /**
     * Late-load the framework's prebuilt module bundle (production builds
     * only). Adds 1 to the expected total, injects the `<link rel=preload>`
     * + `<script>` tags, and resolves the slot once `window._MODULES_` flips.
     */
    this.loadModules = function () {
      if (!window._BUILT_) return;
      this.add(1);

      const moduleFile = window._ES5_ ? 'es5-modules' : 'modules';
      const src = Assets.getPath(window._CACHE_
        ? `assets/js/${moduleFile}.${window._CACHE_}.js`
        : `assets/js/${moduleFile}.js`);

      // Preload hint, then the actual script.
      const preload = document.createElement('link');
      preload.href = src;
      preload.rel = 'preload';
      preload.as = 'script';
      document.head.appendChild(preload);

      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      document.head.appendChild(script);

      return AssetLoader.waitForLib('_MODULES_').then(() => self.trigger(1));
    };

    /** Reserve `num` extra slots in the progress counter. */
    this.add = function (num) { totalCount += num || 1; };

    /** Manually mark `num` slots as done (counterpart to `add`). */
    this.trigger = function (num) {
      for (let i = 0; i < (num || 1); i++) increment();
    };
  },

  // ─── Statics ────────────────────────────────────────────────────────────
  () => {
    /** Parallel load fan-out. */
    AssetLoader.SPLIT = 2;
    /** Per-item warn-after threshold (ms). */
    AssetLoader.TIMEOUT = 5000;

    /** Load every asset in the global `ASSETS` manifest. */
    AssetLoader.loadAllAssets = function (callback) {
      const promise = Promise.create();
      if (!callback) callback = promise.resolve;
      promise.loader = new AssetLoader(Assets.list(), () => {
        if (callback) callback();
        if (promise.loader && promise.loader.destroy) {
          promise.loader = promise.loader.destroy();
        }
      });
      return promise;
    };

    /** Load an explicit list. */
    AssetLoader.loadAssets = function (list, callback) {
      const promise = Promise.create();
      if (!callback) callback = promise.resolve;
      promise.loader = new AssetLoader(list, () => {
        if (callback) callback();
        if (promise.loader && promise.loader.destroy) {
          promise.loader = promise.loader.destroy();
        }
      });
      return promise;
    };

    /** Poll until `window[name]` is defined. */
    AssetLoader.waitForLib = function (name, callback) {
      const promise = Promise.create();
      if (!callback) callback = promise.resolve;
      Render.start(function check() {
        if (window[name]) { Render.stop(check); if (callback) callback(); }
      });
      return promise;
    };

    /**
     * Wait for the module bundle in production, or for `zUtils3D` (which
     * indicates the math/3D layer has loaded) in dev.
     */
    AssetLoader.waitForModules = function () {
      return AssetLoader.waitForLib(window._BUILT_ ? '_MODULES_' : 'zUtils3D');
    };
  },
);

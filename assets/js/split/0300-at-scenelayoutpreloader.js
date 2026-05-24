/*
 * SceneLayoutPreloader — scans `UILStorage` for asset paths
 * referenced by a SceneLayout, then issues prefetches for every
 * one so the first scene render isn't blocked on network. Returns
 * a promise that resolves once all prefetches complete.
 *
 * Algorithm (`load(name)`):
 *   1. Snapshot `UILStorage.getKeys()` and iterate via a
 *      `Render.Worker` so the scan is spread across frames (one
 *      key per tick) instead of monopolising the main thread.
 *   2. For each key that contains the layout name, decode the
 *      stored value:
 *        - Geometry keys (`includes('geometry')`): unwrap JSON
 *          envelopes (`{src}` shape), default the extension to
 *          `.json`, normalise to `assets/geometry/...`, and if
 *          the file appears in the static `UIL_ASSETS_GEOMETRIES`
 *          manifest, kick off `GeomThread.loadGeometry` (the
 *          `true` third arg keeps the result in the cache).
 *        - JSON / .bin payloads: prefetched as plain `fetch()` so
 *          the browser cache is warm.
 *        - Texture payloads (`includes('src')`): parse the JSON
 *          envelope; if `compressed` is set, pick the right
 *          GPU-compressed variant — `ktx2` if available, else
 *          ASTC / PVRTC / ASTC / DXT based on the active WebGL
 *          extensions. Validate against `UIL_ASSETS_TEXTURES`
 *          before issuing the fetch.
 *   3. `findMatch(src, arr)` skips empty / relative paths and
 *      tolerates leading slash, then looks up the candidate in the
 *      static manifest. Fetches are gated on a match so we don't
 *      churn the network on stale storage entries.
 *   4. When the worker exhausts keys, awaits `Promise.all(array)`
 *      and resolves the outer promise.
 *
 * Each `fetch` has a `.catch((e) => {})` so a missing CDN file
 * doesn't reject the bundle promise — the actual loader will
 * surface the error when the real load happens at draw time.
 *
 * Declared `'static'` — `SceneLayoutPreloader.load(name)` is the
 * only entry point and callers don't keep instances around.
 */
Class(function SceneLayoutPreloader(_name) {
  Inherit(this, Component);
  function findMatch(src, arr) {
    return (
      !(!src || src.startsWith('.')) &&
      ((src = src.trim()).startsWith('/') && (src = src.slice(1)),
      arr.find(({ filename: filename }) => filename.includes(src)))
    );
  }
  this.load = function (name) {
    let promise = Promise.create(),
      array = [],
      keys = UILStorage.getKeys(),
      i = 0,
      worker = new Render.Worker((_) => {
        let key = keys[i];
        if (!key) return (worker.stop(), void Promise.all(array).then(promise.resolve));
        if (key.includes(name)) {
          let val = UILStorage.get(key);
          if (!val || !val.includes) return i++;
          if (
            (key.includes('geometry') &&
              ('{' == val.charAt(0) && (val = JSON.parse(val).src),
              val.includes('.json') || val.includes('.bin') || (val += '.json'),
              val.includes('assets/') || (val = 'assets/geometry/' + val),
              findMatch(val.split('assets/geometry/')[1], UIL_ASSETS_GEOMETRIES) &&
                array.push(GeomThread.loadGeometry(Assets.getPath(val), null, true))),
            val.includes('.json') || val.includes('.bin'))
          ) {
            val.includes('assets/') || (val = 'assets/geometry/' + val);
            findMatch(val.split('assets/geometry/')[1], UIL_ASSETS_GEOMETRIES) &&
              array.push(fetch(Assets.getPath(val)).catch((e) => {}));
          } else if (val.includes('src')) {
            let obj = JSON.parse(val),
              src = obj.src;
            if (obj.compressed)
              if ('ktx2' === obj.compressed) {
                let src0 = src.split('.')[0];
                src = src0 + '.ktx2';
              } else {
                let ext,
                  src0 = src.split('.')[0],
                  src1 = src0.split('/');
                ext = Renderer.extensions.etc1
                  ? 'astc'
                  : Renderer.extensions.pvrtc
                    ? 'pvrtc'
                    : Renderer.extensions.astc
                      ? 'astc'
                      : 'dxt';
                src = src0 + '/' + src1[src1.length - 1] + '-' + ext + '.ktx';
              }
            findMatch(src.split('assets/images/')[1], UIL_ASSETS_TEXTURES) &&
              array.push(fetch(Assets.getPath(src)).catch((e) => {}));
          }
        }
        i++;
      }, 1);
    return promise;
  };
}, 'static');

/*
 * SplineLoader — static singleton that loads spline JSON files
 * baked by SplineGen (0311) and produces GPU-ready data.
 *
 * Two products, both worker-side to avoid main-thread stalls:
 *   - `packSplineInTexture` — packs all curves into a single
 *     square Float32 RGB DataTexture. Picks the smallest power-of-2
 *     side whose squared count fits all `splines * perSpline` xyz
 *     samples. Each pixel holds one position (3 floats). Main
 *     thread wraps the returned `array` in a `DataTexture` of size
 *     `textureSize × textureSize` with `Texture.RGBFormat / FLOAT`.
 *   - `loadStaticSpline` — samples `particleCount` random points
 *     along the curves (weighted by per-curve sample density),
 *     lerping between adjacent vertices. Output is a flat Float32
 *     buffer of `vec4` per particle (xyz used, w = 0) sized to the
 *     next square that fits `particleCount`. Consumers (e.g.
 *     SplineParticlesStatic 0314) bufferData this into an
 *     antimatter vertices attribute.
 *
 * Path normalisation: leading `/` stripped, `assets/geometry/`
 * prefix added if missing, `.json` suffix added if missing, then
 * resolved through `Hydra.absolutePath(Assets.getPath(...))`. Each
 * (path → Promise) pair is memoised in `_promises` so concurrent
 * callers share the load.
 */
Class(function SplineLoader() {
  Inherit(this, Component);
  var _promises = {};
  function packSplineInTexture({ path: path }, id) {
    (async (_) => {
      let json = await get(path),
        splines = json.length,
        count = splines * json[0].length,
        textureSize = ((num) => {
          let values = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096];
          for (let i = 0; i < values.length; i++) {
            var p2 = values[i];
            if (p2 * p2 >= num) return p2;
          }
        })(count),
        flat = json.flat(),
        perSpline = json[0].length / 3,
        array = new Float32Array(textureSize * textureSize * 3);
      for (let i = 0; i < count; i++) array[i] = flat[i];
      resolve(
        {
          array: array,
          splines: splines,
          perSpline: perSpline,
          textureSize: textureSize,
        },
        id,
        [array.buffer],
      );
    })();
  }
  function loadStaticSpline({ path: path, particleCount: particleCount }, id) {
    (async (_) => {
      let output = new Float32Array(
          4 *
            Math.pow(
              ((num) => {
                let values = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096];
                for (let i = 0; i < values.length; i++) {
                  var p2 = values[i];
                  if (p2 * p2 >= num) return p2;
                }
              })(particleCount),
              2,
            ),
        ),
        json = await get(path);
      json = json.curves;
      let v3 = new Vector3(),
        v30 = new Vector3(),
        v31 = new Vector3(),
        total = 0;
      for (let i = 0; i < json.length; i++) total += json[i].length / 3;
      let index = 0;
      for (let i = 0; i < json.length; i++) {
        let data = json[i],
          jsonCount = data.length / 3,
          weight = jsonCount / total,
          count = Math.round(weight * particleCount);
        for (let j = 0; j < count; j++) {
          let i0 = Math.random(0, jsonCount - 2),
            i1 = i0 + 1;
          v30.set(data[3 * i0 + 0], data[3 * i0 + 1], data[3 * i0 + 2]);
          v31.set(data[3 * i1 + 0], data[3 * i1 + 1], data[3 * i1 + 2]);
          v3.copy(v30).lerp(v31, Math.random());
          output[4 * index + 0] = v3.x;
          output[4 * index + 1] = v3.y;
          output[4 * index + 2] = v3.z;
          index++;
        }
      }
      resolve(
        {
          array: output,
        },
        id,
        [output.buffer],
      );
    })();
  }
  !(async function () {
    await Hydra.ready();
    Thread.upload(packSplineInTexture);
    Thread.upload(loadStaticSpline);
  })();
  this.load = function (path) {
    if (_promises[path]) return _promises[path];
    let promise = (_promises[path] = Promise.create());
    return (
      '/' == path.charAt(0) && (path = path.slice(1)),
      path.includes('assets/geometry') || (path = 'assets/geometry/' + path),
      path.includes('.json') || (path += '.json'),
      (path = Hydra.absolutePath(Assets.getPath(path))),
      Thread.shared()
        .packSplineInTexture({
          path: path,
        })
        .then((data) => {
          data.texture = new DataTexture(
            data.array,
            data.textureSize,
            data.textureSize,
            Texture.RGBFormat,
            Texture.FLOAT,
          );
          promise.resolve(data);
        }),
      promise
    );
  };
  this.loadStatic = function (path, particleCount) {
    if (_promises[path]) return _promises[path];
    let promise = (_promises[path] = Promise.create());
    return (
      '/' == path.charAt(0) && (path = path.slice(1)),
      path.includes('assets/geometry') || (path = 'assets/geometry/' + path),
      path.includes('.json') || (path += '.json'),
      (path = Hydra.absolutePath(Assets.getPath(path))),
      Thread.shared()
        .loadStaticSpline({
          path: path,
          particleCount: particleCount,
        })
        .then((data) => {
          promise.resolve(data.array);
        }),
      promise
    );
  };
}, 'static');

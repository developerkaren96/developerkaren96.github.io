/*
 * GeomThread — host-side façade around the Web Worker that decodes
 * standalone Active Theory geometry files (either raw JSON bundles
 * or Draco-compressed `.bin` files).
 *
 * State:
 *   - `_cache`       : finished geometries keyed by path so repeat
 *                      requests return the same Geometry instance.
 *   - `_cacheWait`   : in-flight promises so concurrent requests for
 *                      the same path coalesce.
 *   - `_receive`     : per-path callback registry (for fire-and-forget
 *                      receivers that don't await the promise).
 *   - `_dracoLoaded` : Promise of the Draco library load — null until
 *                      the first compressed file is requested.
 *
 * The Thread side (`Thread.upload(function loadGeometry…)` later in
 * the file) does:
 *   1. Fetch the JSON / binary bundle via the worker-side `get()`.
 *   2. Reconstruct typed arrays per attribute (`Geometry.TYPED_ARRAYS`
 *      maps numeric type IDs to TypedArray constructors).
 *   3. Run `computeBounding` against the decoded position attribute
 *      so the host receives bounding box + sphere alongside the
 *      attributes.
 *   4. `resolve(bufferList, id, [buffers])` — the buffer list is the
 *      transferable list, so all ArrayBuffers move across the worker
 *      boundary zero-copy.
 *
 * Files using the legacy `{ data, metadata: { type } }` envelope go
 * through one branch; raw `{ key: { buffer, components } }` files
 * go through the other.
 *
 * `loadDracoLib` is the gate that Draco-bin paths await before
 * decoding.
 */
Class(function GeomThread() {
  Inherit(this, Component);
  const self = this;
  var _cache = {},
    _cacheWait = {},
    _receive = {},
    _dracoLoaded = null;
  function computeBounding(data) {
    let geom = new Geometry();
    geom.addAttribute('position', new GeometryAttribute(data.position, 3));
    data.index && geom.setIndex(data.index);
    geom.computeBoundingBox();
    geom.computeBoundingSphere();
    data.boundingBox = geom.boundingBox;
    data.boundingSphere = geom.boundingSphere;
  }
  function loadGeometry(e, id) {
    get(e.path)
      .then((data) => {
        let buffers = [];
        if (data.data && data.metadata?.type) {
          let bufferList = {
              _type: data.metadata.type,
            },
            jsonData = data.data;
          jsonData.index &&
            ((bufferList.index = new Geometry.TYPED_ARRAYS[jsonData.index.type](
              jsonData.index.array,
            )),
            buffers.push(bufferList.index.buffer));
          for (let key in jsonData.attributes) {
            let attrib = jsonData.attributes[key];
            bufferList[key] = new Geometry.TYPED_ARRAYS[attrib.type](attrib.array);
            bufferList[`${key}ItemSize`] = attrib.itemSize;
            buffers.push(bufferList[key].buffer);
          }
          bufferList.position && computeBounding(bufferList);
          data.userData && (bufferList.userData = data.userData);
          resolve(bufferList, id, buffers);
        } else {
          for (let key in data)
            if ('bones' != key)
              if (Array.isArray(data[key])) {
                const ArrayType =
                  'index' == key
                    ? Geometry.arrayNeedsUint32(data[key])
                      ? Uint32Array
                      : Uint16Array
                    : Float32Array;
                data[key] = new ArrayType(data[key]);
                buffers.push(data[key].buffer);
              } else data[key].length > 0 && buffers.push(data[key].buffer);
          computeBounding(data);
          e.custom && self[e.custom](data);
          resolve(data, id, buffers);
        }
      })
      .catch((er) => {
        e.preloading || console.error(er);
        let plane = new PlaneGeometry(1, 1).toNonIndexed(),
          buffers = [],
          data = {};
        for (let key in plane.attributes) {
          data[key] = plane.attributes[key].array;
          buffers.push(data[key].buffer);
        }
        computeBounding(data);
        resolve(data, id, buffers);
      });
  }
  function geom_useFn(e) {
    Global.FNS || (Global.FNS = []);
    Global.FNS.push(e.name);
  }
  function loadDracoLib() {
    _dracoLoaded = Promise.create();
    const useJS = 'object' != typeof WebAssembly,
      libFolder = '~assets/js/lib/_draco/',
      libs = useJS
        ? [`${libFolder}draco_decoder.js`]
        : [`${libFolder}draco_wasm_wrapper.js`, `${libFolder}draco_decoder.wasm`];
    Promise.all(
      libs.map((url, i) =>
        fetch(Assets.getPath(url)).then((res) => {
          if (!res.ok) throw new Error();
          return 0 === i ? res.text() : res.arrayBuffer();
        }),
      ),
    )
      .then(async (loadedLibs) => {
        Thread.upload(
          [
            'function loadDraco() {',
            '/* draco decoder */',
            loadedLibs[0],
            '',
            '/* worker */',
            '',
            'let decoderConfig, decoderPending;',
            '',
            DracoThread.onError.toString(),
            DracoThread.decodeGeometry.toString(),
            DracoThread.decodeIndex.toString(),
            DracoThread.decodeAttribute.toString(),
            DracoThread.getDracoDataType.toString(),
            '',
            'return ' + DracoThread.loadDraco.toString(),
            '};',
          ].join('\n'),
        );
        const pool = Thread.shared(true).array,
          decoderConfig = useJS
            ? {}
            : {
                wasmBinary: loadedLibs[1],
              };
        pool.forEach((t) => t.importCode('self.loadDraco = loadDraco();'));
        await Promise.all(
          pool.map((t) =>
            t.loadDraco({
              type: 'init',
              decoderConfig: decoderConfig,
            }),
          ),
        );
        _dracoLoaded.resolve();
      })
      .catch(() => {
        console.warn('Draco libs could not be loaded. Fallback to .json');
        _dracoLoaded.reject();
      });
  }
  function parseGeometry(data, path, custom) {
    let geometry;
    if (custom && _receive[custom]) geometry = _receive[custom](data);
    else {
      let geom = new Geometry();
      if (data._type) {
        for (key in data)
          if ('_type' !== key && !key.endsWith('ItemSize'))
            switch (key) {
              case 'userData':
                geom.userData = data.userData;
                break;
              case 'boundingBox':
                geom.boundingBox = new Box3(
                  new Vector3().set(
                    data.boundingBox.min.x,
                    data.boundingBox.min.y,
                    data.boundingBox.min.z,
                  ),
                  new Vector3().set(
                    data.boundingBox.max.x,
                    data.boundingBox.max.y,
                    data.boundingBox.max.z,
                  ),
                );
                break;
              case 'boundingSphere':
                geom.boundingSphere = new Sphere(
                  new Vector3().set(
                    data.boundingSphere.center.x,
                    data.boundingSphere.center.y,
                    data.boundingSphere.center.z,
                  ),
                  data.boundingSphere.radius,
                );
                break;
              case 'index':
                geom.setIndex(data.index);
                break;
              default:
                data[`${key}ItemSize`] &&
                  geom.addAttribute(key, new GeometryAttribute(data[key], data[`${key}ItemSize`]));
            }
      } else {
        geom.addAttribute('position', new GeometryAttribute(data.position, 3));
        geom.addAttribute('normal', new GeometryAttribute(data.normal || data.position.length, 3));
        geom.addAttribute(
          'uv',
          new GeometryAttribute(data.uv || (data.position.length / 3) * 2, 2),
        );
        data.uv2 && geom.addAttribute('uv2', new GeometryAttribute(data.uv2, 2));
        data.vdata && geom.addAttribute('vdata', new GeometryAttribute(data.vdata, 3));
        data.index && geom.setIndex(data.index);
        data.skinIndex && geom.addAttribute('skinIndex', new GeometryAttribute(data.skinIndex, 4));
        data.skinWeight &&
          geom.addAttribute('skinWeight', new GeometryAttribute(data.skinWeight, 4));
        (data.rig || data.bones) &&
          (geom.bones = (data.rig ? data.rig.bones : data.bones).slice(0));
        geom.boundingBox = new Box3(
          new Vector3().set(data.boundingBox.min.x, data.boundingBox.min.y, data.boundingBox.min.z),
          new Vector3().set(data.boundingBox.max.x, data.boundingBox.max.y, data.boundingBox.max.z),
        );
        geom.boundingSphere = new Sphere(
          new Vector3().set(
            data.boundingSphere.center.x,
            data.boundingSphere.center.y,
            data.boundingSphere.center.z,
          ),
          data.boundingSphere.radius,
        );
      }
      geometry = geom;
      geom._src = path;
    }
    if (!geometry.attributes.position)
      throw `GeomThread :: Malformed geometry is missing position data. ${path}`;
    self.caching && (_cache[path] = geometry);
    _cacheWait[path]?.resolve(geometry);
  }
  this.caching = true;
  (async function () {
    await Hydra.ready();
    Thread.upload(loadGeometry, geom_useFn, computeBounding);
  })();
  this.loadGeometry = function (path, custom, preloading) {
    if (!Device.graphics.gpu) return Promise.resolve(new PlaneGeometry(1, 1));
    if (_cache[path]) return Promise.resolve(_cache[path]);
    let cacheBust = false;
    path.includes('?') && ((path = path.split('?')[0]), (cacheBust = '?' + Utils.timestamp()));
    let isBinary = path.endsWith('.bin');
    if (
      (path.includes('http') ||
        (Hydra.LOCAL || (cacheBust = false),
        path.includes('assets/geometry/') || (path = 'assets/geometry/' + path),
        path.includes('.') || (path += '.json'),
        cacheBust && (path += cacheBust)),
      (path = Thread.absolutePath(Assets.getPath(path))),
      self.caching)
    ) {
      if (_cacheWait[path]) return _cacheWait[path];
      _cacheWait[path] = Promise.create();
    }
    return (
      isBinary
        ? (_dracoLoaded || loadDracoLib(),
          _dracoLoaded
            .then(() => {
              Thread.shared()
                .loadDraco({
                  type: 'decode',
                  path: path,
                  custom: custom,
                  preloading: preloading,
                })
                .then((data) => parseGeometry(data, path, custom));
            })
            .catch(() => {
              path = path.replace('.bin', '.json');
              Thread.shared()
                .loadGeometry({
                  path: path,
                  custom: custom,
                  preloading: preloading,
                })
                .then((data) => parseGeometry(data, path, custom));
            }))
        : Thread.shared()
            .loadGeometry({
              path: path,
              custom: custom,
              preloading: preloading,
            })
            .then((data) => parseGeometry(data, path, custom)),
      _cacheWait[path]
    );
  };
  this.removeFromCache = function (path) {
    path.includes('assets/geometry/') || (path = 'assets/geometry/' + path);
    path.includes('.') || (path += '.json');
    path = Thread.absolutePath(Assets.getPath(path));
    delete _cache[path];
    delete _cacheWait[path];
  };
  this.loadDracoLib = function () {
    return (_dracoLoaded || loadDracoLib(), _dracoLoaded);
  };
  this.loadSkinnedGeometry = function (path, custom, preloading) {
    return this.loadGeometry(path, custom, preloading);
  };
  this.customFunction = function (fn, receive) {
    let name = Thread.upload(fn);
    name = name[0];
    t.geom_useFn({
      name: name,
    });
    _receive[name] = receive;
  };
}, 'static');

/*
 * Utils3D — the kitchen-sink module of the Hydra engine: texture
 * caching/recycling, render-target factory, compressed-texture support
 * detection (KTX1/KTX2), shader helpers, sampler creation, and a
 * grab-bag of math/geometry helpers.
 *
 * Texture cache strategy:
 *   - `_textures[key]` holds the live Texture with a refcount
 *     (`texture.exists`).
 *   - On `destroy()`, the refcount is decremented; when it hits 0 the
 *     texture moves into `_restorable[key]` as a `WeakRef` so a quick
 *     re-request can recover it without re-downloading. If the GC
 *     reclaims the weakref before re-request, the texture is
 *     re-loaded from source.
 *   - `_dominantColors[key]` caches the per-texture average colour
 *     used for SSR-side placeholders.
 *   - `params.forcePersist` opts a texture out of the refcounted
 *     destroy path.
 *
 * Headless / SSR fallback: when `!Device.graphics.webgl && !window.AURA`
 * (no GL context and not in Aura's headless harness), `getTexture`
 * returns a pure-data Texture stub with zeroed dimensions and a
 * pre-resolved promise so consumers don't hang.
 *
 * `getTexture(key, params, loadTexture)`:
 *   The single entry-point for the rest of the engine. `loadTexture`
 *   is a `(texture) => Promise<void>` callback that performs the
 *   actual decode (image, ktx2 transcode, video frame, etc.); this
 *   module handles the lifecycle and cache.
 *
 * The rest of the file builds out:
 *   - RT factories (`createRT`, `createMultiRT`) with
 *     multisample / draw-buffer attachments.
 *   - Compressed-texture format probing.
 *   - Common reusable scratch vectors / quaternions / matrices used
 *     across the engine, lazily created on first use.
 *   - Helpers for shader cloning, screen-quad meshes, fullscreen
 *     materials, etc.
 *
 * Class is marked `static` so a single instance services the whole
 * page; all helper state lives in this closure.
 */
Class(function Utils3D() {
  const self = this;
  var _emptyTexture,
    _q,
    _v3,
    _v3b,
    _v3c,
    _m4,
    _v4,
    _supportsKtx1,
    _textures = {},
    _restorable = {},
    _dominantColors = {};
  function getTexture(key, params, loadTexture) {
    if (!Device.graphics.webgl && !window.AURA) {
      let texture = params.isTexture3D ? new Texture3D() : new Texture();
      return (
        (texture.promise = Promise.resolve()),
        (texture.dimensions = params.isTexture3D
          ? {
              width: 0,
              height: 0,
              depth: 0,
            }
          : {
              width: 0,
              height: 0,
            }),
        texture
      );
    }
    let restorable = _restorable[key];
    if ((restorable && ((restorable = restorable.deref()), delete _restorable[key]), restorable))
      restorable.restore();
    else if (_textures[key]) _textures[key].exists++;
    else {
      let texture = params.isTexture3D ? new Texture3D() : new Texture();
      params.isCubeLUT && (texture.isCubeLUT = true);
      texture.exists = 1;
      texture.loaded = false;
      texture.promise = Promise.create();
      texture._destroy = texture.destroy;
      texture.destroy = function (force) {
        (!force && (texture.forcePersist || --texture.exists > 0)) ||
          ((texture.exists || texture._image || texture._gl || _textures[key]) &&
            (delete _textures[key],
            delete _dominantColors[key],
            RenderCount.remove(`tex_${texture?.dimensions?.width}_${texture?.dimensions?.height}`),
            RenderCount.remove('tex_' + (texture.compressed ? 'compressed' : 'uncompressed')),
            (_restorable[key] = new WeakRef(this)),
            this._destroy()));
      };
      _textures[key] = texture;
      false === params.premultiplyAlpha && (texture.premultiplyAlpha = false);
      self.onTextureCreated && self.onTextureCreated(texture);
      let doLoadTexture = async () => {
        try {
          await loadTexture(texture);
          texture.loaded = true;
          texture.needsReupload = true;
          RenderCount.add(`tex_${texture.dimensions.width}_${texture.dimensions.height}`);
          RenderCount.add('tex_' + (texture.compressed ? 'compressed' : 'uncompressed'));
          texture.onload && (texture.onload(), (texture.onload = null));
          texture.promise.resolve();
        } catch (e) {
          texture.promise.reject(e);
        }
      };
      doLoadTexture(texture);
      texture.restore = function () {
        delete _restorable[key];
        texture.exists++;
        _textures[key] ||
          ((texture.promise = Promise.create()),
          (texture.loaded = texture.needsReupload = false),
          (_textures[key] = texture),
          texture.dominantColors &&
            !_dominantColors[key] &&
            (_dominantColors[key] = texture.dominantColors),
          doLoadTexture(texture));
      };
    }
    return _textures[key];
  }
  function loadTextureSource(texture, path, params) {
    let promise = Promise.create();
    return (
      ImageDecoder.decode(path, params)
        .then((imgBmp) => {
          imgBmp.crossOrigin = 'anonymous';
          texture.dimensions = {
            width: imgBmp.width,
            height: imgBmp.height,
          };
          texture.loaded = true;
          texture.needsReupload = true;
          texture.compressed && !imgBmp.compressedData && (texture.compressed = false);
          World.RENDERER.type === Renderer.WEBGL2 ||
            Math.isPowerOf2(imgBmp.width, imgBmp.height) ||
            ((texture.minFilter = Texture.LINEAR), (texture.generateMipmaps = false));
          promise.resolve(imgBmp);
        })
        .catch((e) => {
          promise.reject(e);
        }),
      promise
    );
  }
  function parseTexturePath(path) {
    if (path.includes('://')) {
      let guard = path.split('://');
      guard[1] = guard[1].replace(/\/\//g, '/');
      path = guard.join('://');
    } else path = path.replace(/\/\//g, '/');
    let compressed, compressedIdentifier, cacheBust;
    if (
      (({
        compressed: compressed,
        compressedIdentifier: compressedIdentifier,
        path: path,
      } = parseCompressed(path)),
      window.URLSearchParams)
    ) {
      if (path.includes('?')) {
        let [withoutQuery, query] = path.split('?'),
          params = new URLSearchParams(query);
        for (const [key, value] of params.entries()) {
          let check = key;
          key.includes('-compressedKtx') &&
            (check = key.substring(0, key.indexOf('-compressedKtx')));
          Number.isInteger(Number(check)) &&
            Number(check) > 0 &&
            '' === value &&
            (params.delete(key),
            check !== key && compressed && (withoutQuery += compressedIdentifier),
            (cacheBust = true));
        }
        cacheBust &&
          ((path = withoutQuery), (query = params.toString()), query && (path += '?' + query));
      }
    } else path.includes('?') && ((cacheBust = true), (path = path.split('?')[0]));
    Hydra.LOCAL || (cacheBust = false);
    let imgPath = path;
    return (
      cacheBust && (imgPath += (imgPath.includes('?') ? '&' : '?') + Date.now()),
      compressed && !imgPath.includes('compressed') && (imgPath += compressedIdentifier),
      {
        plainPath: path,
        imgPath: imgPath,
        compressed: compressed,
      }
    );
  }
  function parseCompressed(path) {
    let compressedIdentifier = /-compressedKtx2?/.exec(path)?.[0],
      compressed = false;
    compressedIdentifier &&
      (Utils.query('noKtx') ||
        (compressedIdentifier.endsWith('2')
          ? 'undefined' != typeof Ktx2Transcoder && (compressed = 'ktx2')
          : (compressed = 'ktx1')),
      (path = path.replace(compressedIdentifier, '')));
    let requiresKtx = false;
    return (
      /\.ktx2(?:\?|#|$)/.test(path) &&
        ((compressed = 'ktx2'), (compressedIdentifier = ''), (requiresKtx = true)),
      {
        compressed: compressed,
        compressedIdentifier: compressedIdentifier,
        path: path,
        requiresKtx: requiresKtx,
      }
    );
  }
  function splitCubemapPath(url) {
    let path = url.replace(/-compressedKtx2?/, '').split(/[#?]/)[0],
      match = /(\d+)(?!.*\d+)/.exec(path);
    if (!match) throw new Error('Cubemap texture path must include a numeric pattern');
    let prefix = url.substring(0, match.index),
      pattern = match[1];
    return {
      prefix: prefix,
      pattern: pattern,
      suffix: url.substring(match.index + pattern.length),
      start: +pattern,
    };
  }
  function getCubemapFacePaths(pathinfo) {
    let padChar,
      { prefix: prefix, pattern: pattern, suffix: suffix, start: start } = pathinfo;
    return (
      pattern.length > String(start).length && (padChar = pattern.charAt(0)),
      Array.from(Array(6).keys(), (i) => {
        let n = String(start + i);
        return (padChar && (n = n.padStart(pattern.length, padChar)), `${prefix}${n}${suffix}`);
      })
    );
  }
  async function doFindDominantColors(texOrImageOrPath, numColors) {
    let image;
    if (texOrImageOrPath.isTexture)
      if (texOrImageOrPath.image) {
        if (
          texOrImageOrPath.image.compressedData &&
          0 === texOrImageOrPath.image.compressedData.length
        ) {
          let { path: path, ...params } = texOrImageOrPath.decodeParams;
          params.hintUsingPixelData = true;
          image = await ImageDecoder.decode(path, params);
        }
      } else image = texOrImageOrPath.src;
    return (
      (image = image || texOrImageOrPath.image || texOrImageOrPath),
      'string' == typeof image && (image = await Assets.decodeImage(image)),
      ImageDecoder.parseColors(image, numColors)
    );
  }
  window.Vec2 = window.Vector2;
  window.Vec3 = window.Vector3;
  this.localDebug = window.Hydra && Hydra.LOCAL;
  (async function () {
    await Hydra.ready();
    let threads = Thread.shared(true);
    for (let i = 0; i < threads.array.length; i++) self.loadEngineOnThread(threads.array[i]);
  })();
  this.decompose = function (local, world) {
    local.decomposeCache ||
      (local.decomposeCache = {
        position: new Vector3(),
        quaternion: new Quaternion(),
        scale: new Vector3(),
      });
    local.decomposeDirty &&
      (local.matrixWorld.decompose(
        local.decomposeCache.position,
        local.decomposeCache.quaternion,
        local.decomposeCache.scale,
      ),
      (local.decomposeDirty = false));
    world.position.copy(local.decomposeCache.position);
    world.quaternion.copy(local.decomposeCache.quaternion);
    world.scale.copy(local.decomposeCache.scale);
  };
  this.createDebug = function (size = 1, color) {
    return new Mesh(new IcosahedronGeometry(size, 1), self.getTestShader(color));
  };
  this.getTestShader = function (color) {
    return color
      ? new Shader('ColorMaterial', {
          color: {
            value: color instanceof Color ? color : new Color(color),
          },
          alpha: {
            value: 1,
          },
        })
      : new Shader('TestMaterial');
  };
  this.createMultiRT = function (
    width,
    height,
    type,
    format,
    multisample = false,
    samplesAmount = 4,
  ) {
    let rt = new MultiRenderTarget(width, height, {
      minFilter: Texture.LINEAR,
      magFilter: Texture.LINEAR,
      format: format || Texture.RGBFormat,
      type: type,
      multisample: multisample,
      samplesAmount: samplesAmount,
    });
    return ((rt.texture.generateMipmaps = false), rt);
  };
  this.createRT = function (width, height, type, format, multisample = false, samplesAmount = 4) {
    let rt = new RenderTarget(width, height, {
      minFilter: Texture.LINEAR,
      magFilter: Texture.LINEAR,
      format: format || Texture.RGBFormat,
      type: type,
      multisample: multisample,
      samplesAmount: samplesAmount,
    });
    return ((rt.texture.generateMipmaps = false), rt);
  };
  this.getFloatType = function () {
    return 'android' == Device.system.os ? Texture.FLOAT : Texture.HALF_FLOAT;
  };
  this.findNuke = function (obj) {
    if (!obj) return;
    let p = obj.parent;
    for (; p; ) {
      if (p.nuke) return p.nuke;
      p = p.parent;
    }
    for (p = obj.parent; p; ) {
      if (p.nuke) return p.nuke;
      p = p.group ? p.group._parent : p.parent || p._parent;
    }
    for (p = obj._parent; p; ) {
      if (p.nuke) return p.nuke;
      p = p._parent;
    }
    return World.NUKE;
  };
  this.getTexture = function (path, params = {}) {
    let { imgPath: imgPath, plainPath: plainPath, compressed: compressed } = parseTexturePath(path),
      texture = getTexture(plainPath, params, async (texture) => {
        texture.compressed = compressed;
        texture.format = plainPath.match(/\.jpe?g/) ? Texture.RGBFormat : Texture.RGBAFormat;
        texture.src = plainPath;
        texture.decodeParams = {
          path: imgPath,
          ...params,
        };
        let imgBmp = await loadTextureSource(texture, imgPath, params);
        texture.image = imgBmp;
        imgBmp.sizes && 1 === imgBmp.sizes.length && (texture.minFilter = Texture.LINEAR);
        texture.onUpdate = function () {
          !params.preserveData && imgBmp.close && (imgBmp.close(), (texture.image = null));
          texture.onUpdate = null;
        };
      });
    return (
      texture.promise.then(
        (_) => {
          params.findDominantColors &&
            'number' === (params.findDominantColors, false) &&
            (params.findDominantColors = 4);
          params.findDominantColors && self.findDominantColors(texture, params.findDominantColors);
        },
        () => {},
      ),
      texture
    );
  };
  this.getCubeLUT = function (path, params) {
    let { imgPath: imgPath, plainPath: plainPath } = parseTexturePath(path);
    return (
      (params = {
        ...params,
        isTexture3D: true,
        isCubeLUT: true,
      }),
      getTexture(plainPath, params, async (texture) => {
        let { imgBmp: imgBmp, cubesize: cubesize } = await (function loadCubeLUTSource(
          path,
          params,
        ) {
          let promise = Promise.create(),
            {
              compressed: compressed,
              compressedIdentifier: compressedIdentifier,
              newpath: newpath,
              requiresKtx: requiresKtx,
            } = parseCompressed(path);
          return (
            compressed
              ? ImageDecoder.decode(path, params)
                  .then((result) => {
                    promise.resolve({
                      imgBmp: result.compressedData[0],
                      cubesize: result.width,
                    });
                  })
                  .catch((e) => {
                    promise.reject(e);
                  })
              : ImageDecoder.decodeCubeLUT(path, params).then((result) => {
                  promise.resolve({
                    imgBmp: result.imgBmp,
                    cubesize: result.cubesize,
                  });
                }),
            promise
          );
        })(imgPath, params);
        texture.format = Texture.RGBAFormat;
        texture.image = imgBmp;
        texture.src = plainPath;
        texture.minFilter = texture.magFilter = Texture.LINEAR;
        texture.type = Texture.UNSIGNED_BYTE;
        texture.width = texture.height = texture.depth = cubesize;
        texture.dimensions = {
          width: cubesize,
          height: cubesize,
          depth: cubesize,
        };
        texture.generateMipmaps = false;
        texture.onUpdate = function () {
          !params.preserveData && imgBmp.close && (imgBmp.close(), (texture.image = null));
          texture.onUpdate = null;
        };
      })
    );
  };
  this.getCubeTexture = function (paths, params = {}) {
    let parsed = (paths = (function getCubePaths(url) {
      if (Array.isArray(url)) return url;
      let {
        compressed: compressed,
        compressedIdentifier: compressedIdentifier,
        path: path,
        requiresKtx: requiresKtx,
      } = parseCompressed(url);
      if (requiresKtx) return [path];
      'ktx1' === compressed &&
        (undefined === _supportsKtx1 &&
          (_supportsKtx1 = !!(
            Renderer.extensions.s3tc ||
            Renderer.extensions.etc1 ||
            Renderer.extensions.pvrtc ||
            Renderer.extensions.astc
          )),
        _supportsKtx1 || (compressed = false));
      !compressed && compressedIdentifier && (url = url.replace(compressedIdentifier, ''));
      let info = splitCubemapPath(url);
      if (compressed) return [`${info.prefix}${info.suffix}`];
      return getCubemapFacePaths(info);
    })(paths)).map(parseTexturePath);
    return getTexture(
      `cube:${parsed.map(({ plainPath: plainPath }) => plainPath).join('|')}`,
      params,
      async (texture) => {
        texture.cube = await Promise.all(
          parsed.map(
            ({ imgPath: imgPath, compressed: compressed }) => (
              (texture.compressed = compressed),
              (texture.format = imgPath.match(/\.jpe?g/) ? Texture.RGBFormat : Texture.RGBAFormat),
              loadTextureSource(texture, imgPath, params)
            ),
          ),
        );
        texture.compressed ||
          1 !== texture.cube.length ||
          (texture.cube = [...Array(6).keys()].map((_) => texture.cube[0]));
        texture.compressed &&
          1 === texture.cube[0].sizes.length &&
          (texture.minFilter = Texture.LINEAR);
        texture.onUpdate = function () {
          params.preserveData ||
            texture.cube.forEach((imgBmp, i) => {
              imgBmp.close && (imgBmp.close(), (texture.cube[i] = null));
            });
          texture.onUpdate = null;
        };
      },
    );
  };
  this.splitCubemapPath = splitCubemapPath;
  this.getCubemapFacePaths = getCubemapFacePaths;
  this.getLookupTexture = function (path) {
    let texture = self.getTexture(path);
    return (
      (texture.minFilter = texture.magFilter = Texture.NEAREST),
      (texture.generateMipmaps = false),
      texture
    );
  };
  this.clearTextureCache = function (path, force) {
    if (path) {
      let key = parseTexturePath(path).plainPath,
        cached = _textures[key];
      cached
        ? (cached.destroy(force), delete _textures[key], delete _restorable[key])
        : _restorable[key] && delete _restorable[key];
      delete _dominantColors[key];
    } else {
      for (let key in _textures) _textures[key].destroy(force);
      _textures = {};
      _dominantColors = {};
    }
  };
  this.makeDataTexturePowerOf2 = function (texture, itemSize) {
    let [maxDimension, minDimension] = [texture.width, texture.height].sort();
    maxDimension = Math.ceilPowerOf2(maxDimension);
    const totalLength = maxDimension * maxDimension * itemSize,
      remainder = [];
    let j;
    for (let i = 0; i < totalLength - texture.data.length; i++) {
      j = i % texture.data.length;
      remainder.push(texture.data[j]);
    }
    const totalData = new Float32Array(totalLength);
    totalData.set(texture.data);
    totalData.set(remainder, texture.data.length);
    texture.data = totalData;
    texture.width = texture.height = maxDimension;
    texture.powerOfTwoScale = minDimension / maxDimension;
  };
  this.loadCurve = function (obj) {
    'string' == typeof obj && ((obj = Assets.JSON[obj]).curves = obj.curves[0]);
    let data = obj.curves,
      points = [];
    for (let j = 0; j < data.length; j += 3)
      points.push(new Vector3(data[j + 0], data[j + 1], data[j + 2]));
    if ('undefined' == typeof CatmullRomCurve) throw 'loadCurve requires curve3d module';
    return new CatmullRomCurve(points);
  };
  this.getEmptyTexture = function () {
    return (_emptyTexture || (_emptyTexture = new Texture()), _emptyTexture);
  };
  this.getRepeatTexture = function (src, scale) {
    let texture = self.getTexture(src, scale);
    return (
      texture.promise.then((_) => {
        Math.isPowerOf2(texture.dimensions.width, texture.dimensions.height) ||
          console.warn(`getRepeatTexture :: ${src} not power of two!`);
      }),
      (texture.wrapS = texture.wrapT = Texture.REPEAT),
      texture
    );
  };
  this.findTexturesByPath = function (path) {
    let array = [];
    for (let key in _textures) key.includes(path) && array.push(_textures[key]);
    return array;
  };
  this.getHeightFromCamera = function (camera, dist) {
    camera = camera.camera || camera;
    dist || (dist = camera.position.length());
    let fov = camera.fov;
    return 2 * dist * Math.tan(0.5 * Math.radians(fov));
  };
  this.getWidthFromCamera = function (camera, dist) {
    camera = camera.camera || camera;
    return self.getHeightFromCamera(camera, dist) * camera.aspect;
  };
  this.getPositionFromCameraSize = function (camera, size) {
    camera = camera.camera || camera;
    let fov = Math.radians(camera.fov);
    return Math.abs(size / Math.sin(fov / 2));
  };
  this.loadEngineOnThread = function (thread) {
    [
      'Base3D',
      'CameraBase3D',
      'Mesh',
      'OrthographicCamera',
      'PerspectiveCamera',
      'Geometry',
      'GeometryAttribute',
      'Points',
      'Scene',
      'BoxGeometry',
      'CylinderGeometry',
      'PlaneGeometry',
      'PolyhedronGeometry',
      'IcosahedronGeometry',
      'SphereGeometry',
      'Box2',
      'Box3',
      'Face3',
      'Color',
      'ColorLAB',
      'ColorHSL',
      'Cylindrical',
      'Euler',
      'Frustum',
      'Line3',
      'Matrix3',
      'Matrix4',
      'Plane',
      'Quaternion',
      'Ray',
      'Sphere',
      'Spherical',
      'Triangle',
      'Vector2',
      'Vector3',
      'Vector4',
      'RayManager',
      'Vector3D',
      'Group',
    ].forEach((name) => {
      thread.importES6Class(name);
    });
    thread.importCode(`Class(${zUtils3D.constructor.toString()}, 'static')`);
  };
  this.billboard = function (mesh, camera = World.CAMERA) {
    _q || (_q = new Quaternion());
    _q.copy(camera.quaternion);
    mesh.customRotation && mesh.quaternion.multiply(mesh.customRotation);
    mesh._parent && _q.premultiply(mesh._parent.getWorldQuaternion().inverse());
    mesh.quaternion.copy(_q);
  };
  this.billboardYAxis = function (mesh, camera = World.CAMERA) {
    _q || (_q = new Quaternion());
    _q.copy(camera.quaternion);
    let angle = Math.atan2(_q.y, _q.w) + Math.PI;
    angle = -angle;
    _q.set(0, Math.sin(angle), 0, Math.cos(angle));
    mesh.customRotation && mesh.quaternion.multiply(mesh.customRotation);
    mesh._parent && _q.premultiply(mesh._parent.getWorldQuaternion().inverse());
    mesh.quaternion.copy(_q);
  };
  this.positionInFrontOfCamera = function (object, distance, alpha = 1, camera = World.CAMERA) {
    _v3 || (_v3 = new Vector3());
    _v3b || (_v3b = new Vector3());
    _m4 || (_m4 = new Matrix4());
    _q || (_q = new Quaternion());
    let cameraPosition = _v3b,
      cameraQuaternion = _q;
    camera.updateMatrixWorld();
    camera.matrixWorld.decompose(cameraPosition, cameraQuaternion, _v3);
    _v3.set(0, 0, -distance).applyQuaternion(cameraQuaternion).add(cameraPosition);
    _m4.lookAt(cameraPosition, _v3, object.up);
    _q.setFromRotationMatrix(_m4);
    object.position.lerp(_v3, alpha);
    object.quaternion.slerp(_q, alpha);
  };
  this.getSignedQuaternionAngleToPlane = function (quaternion, direction, planeNormal, axis) {
    _v3c || (_v3c = new Vector3());
    let vector = _v3c.copy(direction).applyQuaternion(quaternion);
    return self.getSignedAngleToPlane(vector, planeNormal, axis);
  };
  this.getSignedAngleToPlane = function (vector, planeNormal, axis) {
    _v3 || (_v3 = new Vector3());
    _v3b || (_v3b = new Vector3());
    let projected = _v3.copy(vector).projectOnPlane(planeNormal).normalize();
    if (0 === projected.length()) return Math.PI / 2;
    axis
      ? (vector = _v3b.copy(vector).projectOnPlane(axis).normalize())
      : (axis = _v3b.crossVectors(projected, planeNormal));
    let dot = vector.dot(projected),
      det = axis.dot(projected.cross(vector));
    return Math.atan2(det, dot);
  };
  this.getQuad = function () {
    let geom = new Geometry(),
      position = new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]),
      uv = new Float32Array([0, 0, 2, 0, 0, 2]);
    return (
      geom.addAttribute('position', new GeometryAttribute(position, 3)),
      geom.addAttribute('uv', new GeometryAttribute(uv, 2)),
      geom
    );
  };
  this.findParentCamera = function (group) {
    let parent = group.parent;
    for (; parent; ) {
      if (parent.nuke) return parent.nuke.camera;
      parent = parent.parent;
    }
    return World.CAMERA;
  };
  this.cameraIntrinsicsToObject = function (camera, object) {
    object.fov = camera.fov;
    object.aspect = camera.aspect;
    object.near = camera.near;
    object.far = camera.far;
    object.p || ((object.p = []), (object.q = []), (object.projectionMatrix = []));
    camera.getWorldPosition().toArray(object.p);
    camera.getWorldQuaternion().toArray(object.q);
    camera.projectionMatrix.toArray(object.projectionMatrix);
    object.width = Stage.width;
    object.height = Stage.height;
  };
  this.createFXLayer = function (name, nuke = World.NUKE, options) {
    let layer = new FXLayer(nuke, options);
    return ((layer.name = name), layer);
  };
  this.ensureAttributes = function (mesh) {
    const vs = Shaders.getShader(mesh.shader.vsName + '.vs'),
      attrib_regex = /attribute (\w+) (\w+);/g,
      attribs = mesh.geometry.attributes,
      firstCount = attribs[Object.keys(attribs)[0]].count;
    let attrib;
    for (; null !== (attrib = attrib_regex.exec(vs)); ) {
      const name = attrib[2];
      if (name && !attribs[name]) {
        const size = parseInt(attrib[1][attrib[1].length - 1]) || 1;
        mesh.geometry.addAttribute(
          name,
          new GeometryAttribute(new Float32Array(size * firstCount), size),
        );
        mesh.geometry.needsUpdate = true;
      }
    }
  };
  this.findDominantColors = function (texOrImageOrPath, numColors = 4) {
    let path;
    if (
      ((path =
        'string' == typeof texOrImageOrPath
          ? texOrImageOrPath
          : texOrImageOrPath.src ||
            texOrImageOrPath.path ||
            texOrImageOrPath.image?.src ||
            texOrImageOrPath.image?.path),
      !path)
    )
      throw new Error('Couldn’t find image asset path');
    let { plainPath: plainPath } = parseTexturePath(path),
      colors = _dominantColors[plainPath];
    if (colors)
      if (colors.promise) {
        if (colors.numColors >= numColors) return colors.promise;
      } else if (colors.length >= numColors) return colors;
    return (
      (colors = {
        promise: doFindDominantColors(texOrImageOrPath, numColors),
        numColors: numColors,
      }),
      (_dominantColors[plainPath] = colors),
      (async () => {
        try {
          let result = await colors.promise;
          _dominantColors[plainPath] === colors &&
            ((_dominantColors[plainPath] = result),
            texOrImageOrPath.isTexture && (texOrImageOrPath.dominantColors = result),
            _textures[plainPath] && (_textures[plainPath].dominantColors = result));
        } catch (e) {
          _dominantColors[plainPath] === colors && delete _dominantColors[plainPath];
        }
      })(),
      colors.promise
    );
  };
  this.renderToTexture3D = function (texture, shader) {
    if (undefined === texture._renderTargets) {
      let depth = texture.depth / 4;
      texture._renderTargets = [];
      let offset = 0;
      for (let i = 0; i < depth; i++) {
        offset = 4 * i;
        let renderTarget = new RenderTarget(texture.width, texture.height);
        renderTarget.texture = texture;
        renderTarget.indices = [offset, offset + 1, offset + 2, offset + 3];
        texture._renderTargets.push(renderTarget);
      }
      let mesh = new Mesh(World.QUAD, shader);
      texture._meshFor3D = mesh;
    }
    try {
      _v4 || (_v4 = new Vector4());
      texture._renderTargets.forEach((rt) => {
        shader.set('indices', _v4.set(...rt.indices));
        World.RENDERER.renderSingle(texture._meshFor3D, World.CAMERA, rt);
      });
    } catch (e) {
      console.warn(
        'the 3d texture can not be updated correctly, the shader requires the indices uniform to be declared',
      );
    }
  };
  this.cloneTransform = function (object, target = new Base3D()) {
    if (!target || !target.position || !target.position.copy)
      throw new Error('Target of cloneTransform must be a Base3D.');
    let group = object.group || object;
    return (
      target.position.copy(group.position),
      target.scale.copy(group.scale),
      target.quaternion.copy(group.quaternion),
      target
    );
  };
  this.cloneUniforms = function (object, target = {}) {
    let shader = object.shader || object,
      uniforms = shader.uniforms || shader;
    if (uniforms && !uniforms.group) {
      let origin = {};
      for (let key in uniforms) {
        let value = uniforms[key].value,
          ignoreUIL = uniforms[key].ignoreUIL || null === value;
        !ignoreUIL && value.clone && (value = value.clone());
        origin[key] = {
          type: uniforms[key].type,
          value: value,
          ignoreUIL: ignoreUIL,
        };
      }
      return Object.assign(target.shader || target, origin);
    }
  };
}, 'static');

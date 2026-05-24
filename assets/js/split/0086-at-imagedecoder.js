/*
 * ImageDecoder — static façade for all image-decoding paths the
 * framework supports. Routes a single `decode(path, params)` call to
 * whichever pipeline fits:
 *
 *   • Native JPEG/PNG/WebP/AVIF →
 *       createImageBitmap on a worker thread (Thread.shared)
 *       OR Assets.decodeImage if createImageBitmap is unavailable
 *       (older Safari).
 *   • .ktx1 (legacy hardware-compressed) →
 *       decodeKtx1CompressedImage running in the worker thread.
 *   • .ktx2 (Basis-Universal supercompressed) →
 *       Ktx2Transcoder.transcode on the worker thread.
 *   • .cube (LUT) →
 *       decodeCubeLUT — parses ASCII cube file, expands into RGBA8.
 *
 * Plus three side jobs:
 *   • `parseColors(image)` — k-means in LAB color space to extract
 *     dominant palette, optionally via WebGL on compressed input.
 *   • `decodeCubeLUT(path)` — wraps the ASCII parser with fallback.
 *   • Internal `renderOnQuad` — decompresses a KTX1 face into a 128×128
 *     RGBA8 texture by uploading and immediately reading back from an
 *     OffscreenCanvas WebGL context. Used as the "give me pixel data"
 *     bridge between compressed textures and the kmeans color extractor.
 *
 * Worker bootstrapping:
 *   In the init IIFE (after Hydra.ready), `Thread.upload` ships
 *   decodeImage/decodeCubeLUT/etc. into every worker so they can be
 *   invoked via `Thread.shared().decodeImage(...)`.
 *
 * Capability cache:
 *   `_offscreen` lazily probes for OffscreenCanvas 2D / WebGL contexts.
 *   `_offscreen.compressionExtensions` is the intersection of WEBGL
 *   compressed-texture extensions advertised by the GPU and a fixed
 *   prefix list ('compressed_texture', 'texture_compression') — used to
 *   tell the kmeans worker which formats it can decode itself.
 *
 * KTX1 settings (`_ktx1Settings`):
 *   Probes Renderer extensions once on first decode. If none of dxt/etc1/
 *   pvrtc/astc are present, KTX1 paths are disabled (set to null) and any
 *   path tagged `-compressedKtx` falls back to its uncompressed twin.
 *
 * `decode(path, params)`:
 *   1. Resolve absolute path via Assets.getPath + Thread.absolutePath.
 *   2. Detect `-compressedKtx`/`-compressedKtx2` suffix or `.ktx2` ext.
 *   3. Strip the suffix and decode normally if (?noKtx query) or
 *      (KTX1 unsupported and tagged ktx1).
 *   4. If `hintUsingPixelData` and no offscreen WebGL → fall back to
 *      uncompressed (KTX2) or strip suffix (KTX1).
 *   5. For compressed: dispatch to Thread.decodeKtx1CompressedImage or
 *      Ktx2Transcoder.transcode. On any thrown error, fall back to the
 *      reference fallback bitmap.
 *   6. For uncompressed: `doDecodeImage`, fallback bitmap on failure.
 *      Then post-process: if `params.scale * self.scale !== 1`, draw
 *      into a Canvas at the scaled size; if original was power-of-two
 *      and we're scaling down, also clamp to the nearest power-of-two
 *      square.
 *
 * Thread-call protocol:
 *   The worker callbacks use the framework's `resolve({...}, id)` /
 *   `self.postMessage({post:true, id, message}, [transferables])`
 *   patterns. The third arg to `resolve()` is the list of buffers to
 *   transfer zero-copy back to the main thread (KTX1 mip arrays, k-means
 *   palette buffer).
 *
 * `findNumberAfterString` / `removeCubeHeader`:
 *   Tiny ASCII-cube-file helpers. The `.cube` format prefixes each
 *   metadata declaration with a name like `LUT_3D_SIZE 32` followed by
 *   the value, so regex-and-strip extracts the integers and trims the
 *   header out of the body before parsing the float grid.
 *
 * `renderOnQuad(image, compressionExtensions)`:
 *   Given a KTX1 image descriptor + list of available compression
 *   extension names, build an OffscreenCanvas WebGL1, upload the
 *   smallest mip that's ≤128px, run a fullscreen triangle with a
 *   passthrough shader, and readPixels back. Returns a 128×128×4
 *   Uint8Array. Used downstream by `findDominantColors` when the only
 *   data we have is a compressed blob and we need pixels for k-means.
 *
 * `findDominantColors(e, id)`:
 *   1. Get RGBA pixels: from compressed KTX (renderOnQuad), from a
 *      bitmap/HTMLImageElement (OffscreenCanvas 2D draw), or from
 *      already-decoded raw data.
 *   2. Skip alpha<25 pixels (transparent fringe noise). Build ColorLAB
 *      instances per pixel (perceptual color space — CIE94 ΔE metric
 *      gives perceptually-meaningful clustering).
 *   3. k-means:
 *        a. Seed centroids by sorting all colors by L+a+b sum, then
 *           splitting into k equal shards and averaging each shard.
 *           Dedupe identical centroids (collapses fewer-than-k clusters).
 *        b. Repeat (up to 50 iters or until max centroid drift <
 *           minDiff = 1/255): assign each color to the nearest centroid
 *           by ΔE94, then recompute centroids as average of their
 *           cluster.
 *   4. Sort clusters by population, return top centroid RGB values.
 *
 * `parseColors(image, numColors)`:
 *   Routing for the k-means stage based on input shape:
 *     - Compressed KTX `image.sizes` array → either run kmeans in worker
 *       (if WebGL offscreen) or decode the smallest mip uncompressed,
 *       then kmeans on raw bytes.
 *     - HTMLImageElement / ImageBitmap → if OffscreenCanvas 2D
 *       available, kmeans in worker (transfer the bitmap); else CPU
 *       canvas downsample then kmeans on bytes.
 *   Returns an array of `Color` (RGB) instances.
 */
Class(function ImageDecoder() {
  Inherit(this, Component);
  const self = this;
  let _ktx1Settings;
  this.scale = 1;
  this.disableFallbackImage = false;

  const _offscreen = {};

  // Branch native-decode pipeline once at module init: prefer worker
  // createImageBitmap path; fall back to Assets if missing.
  const doDecodeImage =
    'createImageBitmap' in window
      ? (path, params) => Thread.shared().decodeImage({ path, params })
      : (path, params) => Assets.decodeImage(path, params);

  /*
   * Worker-side: fetch URL → blob → createImageBitmap, post bitmap back
   * (transferable). Honors crossOrigin/flipY/premultiplyAlpha from
   * params. Failures are reported via resolve({fail}).
   */
  function decodeImage(data, id) {
    (async (_) => {
      try {
        const response = await fetch(data.path, { mode: 'cors' });
        if (200 !== response.status) throw `Image not found: ${data.path}`;
        const blob = await response.blob();
        const obj  = { imageOrientation: 'flipY', crossOrigin: 'anonymous' };
        if (data.params && false === data.params.premultiplyAlpha) obj.premultiplyAlpha = 'none';
        obj.imageOrientation = data.params && false === data.params.flipY ? undefined : 'flipY';
        const bitmap = await createImageBitmap(blob, obj);
        const message = { post: true, id, message: bitmap };
        self.postMessage(message, [bitmap]);
      } catch (e) {
        resolve({ fail: `${data.path} could not be decoded: ${e.message || e}` }, id);
      }
    })();
  }

  /*
   * Worker-side: parse a .cube LUT file. Strip comment/empty lines,
   * extract LUT_3D_SIZE and optional DOMAIN_MIN/MAX, parse the flat
   * RGB grid, pad to RGBA8 (alpha=255 inserted every 3 floats), remap
   * to the requested domain, validate count = size^3 * 4.
   */
  function decodeCubeLUT(data, id) {
    (async (_) => {
      try {
        let cube = await get(data.path, { mode: 'cors' });
        cube = cube
          .replace(/^#.*?(\n|\r)/gm, '')   // comments
          .replace(/^\s*?(\n|\r)/gm, '')   // blank lines
          .trim();

        const cubesize   = findNumberAfterString(cube, 'LUT_3D_SIZE', true);
        const domain_min = findNumberAfterString(cube, 'DOMAIN_MIN');
        const domain_max = findNumberAfterString(cube, 'DOMAIN_MAX');
        cube = removeCubeHeader(cube, 'TITLE');
        cube = removeCubeHeader(cube, 'LUT_3D_SIZE');
        cube = removeCubeHeader(cube, 'DOMAIN_MIN');
        cube = removeCubeHeader(cube, 'DOMAIN_MAX');

        const rgba = [];
        cube
          .split(/\s+/)
          .filter((substr) => substr.length > 0)
          .forEach((element, index) => {
            rgba.push(+element);
            // Insert alpha=1 (later → 255) after every 3rd value,
            // except after the very last triplet (avoid stray padding).
            if ((index + 1) % 3 === 0 && index !== 4 * Math.pow(cubesize, 3) - 1) rgba.push(1);
          });
        rgba.forEach((e, i) => {
          if (domain_min && domain_max) rgba[i] = Math.map(rgba[i], domain_min, domain_max, 0, 1);
          rgba[i] = Math.clamp(Math.round(255 * rgba[i]), 0, 255);
        });
        if (rgba.length !== cubesize ** 3 * 4) {
          throw `LUT .cube at ${data.path} has length mismatch: claims cube size of ${cubesize} but has ${rgba.length} elements.`;
        }
        const imgBmp = new Uint8Array(rgba);
        resolve({ imgBmp, cubesize }, id);
      } catch (e) {
        resolve({ fail: `${data.path} could not be decoded: ${e.message || e}` }, id);
      }
    })();
  }

  /*
   * Worker-side: load a hardware-compressed KTX1 file. Picks which
   * compression flavor variant filename to fetch based on `settings`
   * (dxt/astc/pvrtc/etc), reads the standard KTX1 header (Int32 view
   * at offset 12, 13 dwords), then iterates mip levels copying each
   * compressed slice into its own Uint8Array. Each level is padded to
   * a 4-byte boundary per spec.
   *
   * Returns: gliFormat (internal GL format constant), compressedData
   * (array of Uint8Array per mip), sizes (width per mip), width/height
   * of mip-0, and a `cube` flag (true if 6 faces × 0 array elements).
   */
  function decodeKtx1CompressedImage(data, id) {
    (async (_) => {
      let ext;
      // Filename suffix decision. Note the original asymmetry: `etc`
      // setting maps to 'astc' file (preserved verbatim — may be an
      // intentional rebrand on the asset side).
      if (data.settings.dxt)        ext = 'dxt';
      else if (data.settings.etc)   ext = 'astc';
      else if (data.settings.pvrtc) ext = 'pvrtc';
      else if (data.settings.astc)  ext = 'astc';

      let fileName = data.path.split('/');
      fileName = fileName[fileName.length - 1];
      const response = await fetch(`${data.path}/${fileName}-${ext}.ktx`);
      if (200 !== response.status) throw `Image not found :: ${data.path}`;

      const arrayBuffer = await response.arrayBuffer();
      const header = new Int32Array(arrayBuffer, 12, 13);
      const gliFormat = header[4];                  // internal GL format
      const baseWidth = header[6];
      const baseHeight = header[7];
      let width  = baseWidth;
      let height = baseHeight;
      const numberOfArrayElements = header[9];
      const numberOfFaces  = header[10];
      const miplevels      = header[11];
      const buffers        = [];
      const compressedData = [];
      const sizes          = [];
      const cube = 6 === numberOfFaces && 0 === numberOfArrayElements;
      let dataOffset = 64 + header[12];

      for (let level = 0; level < miplevels; level++) {
        let imageSize = new Int32Array(arrayBuffer, dataOffset, 1)[0];
        dataOffset += 4;
        if (cube) imageSize *= 6;
        const byteArray = new Uint8Array(arrayBuffer, dataOffset, imageSize);
        dataOffset += imageSize;
        dataOffset += 3 - ((imageSize + 3) % 4); // KTX 4-byte alignment.
        sizes.push(width);
        width  = Math.max(1, 0.5 * width);
        height = Math.max(1, 0.5 * height);
        const clone = new Uint8Array(byteArray);
        compressedData.push(clone);
        buffers.push(clone.buffer);
      }
      resolve({
        gliFormat, compressedData, sizes,
        width:  baseWidth,
        height: baseHeight,
        cube,
      }, id, buffers);
    })().catch((e) => {
      console.log(e.toString());
      resolve({ fail: `${data.path} could not be decoded: ${e.message || e}` }, id);
    });
  }

  /*
   * Worker-side: decompress a KTX1 mip into a 128×128 RGBA8 buffer via
   * OffscreenCanvas WebGL1. Picks the smallest mip that fits in 128×128
   * (avoids decompressing the full resolution when we just need
   * pixels for k-means).
   */
  function renderOnQuad(image, compressionExtensions) {
    const aspect = image.width / image.height;
    const width  = Math.round(aspect > 1 ? 128         : 128 * aspect);
    const height = Math.round(aspect > 1 ? 128 / aspect : 128);
    const gl = new OffscreenCanvas(width, height).getContext('webgl');
    if (!gl) throw new Error('Unable to initialize offscreen WebGL canvas');

    function loadShader(gl, shaderSource, shaderType) {
      const shader = gl.createShader(shaderType);
      gl.shaderSource(shader, shaderSource);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const lastError = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error('Shader compile error: ' + lastError);
      }
      return shader;
    }

    const vs = loadShader(gl,
      '\nattribute vec4 a_position;\nvarying vec2 v_texcoord;\n\nvoid main() {\n    gl_Position = a_position;\n    v_texcoord = a_position.xy * 0.5 + 0.5;\n}',
      gl.VERTEX_SHADER);
    const fs = loadShader(gl,
      '\nprecision mediump float;\nvarying vec2 v_texcoord;\nuniform sampler2D u_texture;\n\nvoid main() {\n    gl_FragColor = texture2D(u_texture, v_texcoord);\n}',
      gl.FRAGMENT_SHADER);

    const program = (function createProgram(gl, shaders) {
      const program = gl.createProgram();
      shaders.forEach((shader) => { gl.attachShader(program, shader); });
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const lastError = gl.getProgramInfoLog(program);
        gl.deleteProgram(program);
        shaders.forEach((shader) => { gl.deleteShader(shader); });
        throw new Error('Shader link error:' + lastError);
      }
      return program;
    })(gl, [vs, fs]);

    const positionLocation = gl.getAttribLocation(program, 'a_position');
    const positionBuffer   = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    // Single oversized triangle that covers the viewport.
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1,  3, -1,  -1,  3]), gl.STATIC_DRAW);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    const ext = {};
    compressionExtensions.forEach((str) => {
      switch (str) {
        case 'astc':  ext.astc  = gl.getExtension('WEBGL_compressed_texture_astc'); break;
        case 'atc':   ext.atc   = gl.getExtension('WEBGL_compressed_texture_atc');  break;
        case 'etc':   ext.etc   = gl.getExtension('WEBGL_compressed_texture_etc');  break;
        case 'etc1':  ext.etc1  = gl.getExtension('WEBGL_compressed_texture_etc1'); break;
        case 'pvrtc':
          ext.pvrtc =
            gl.getExtension('WEBGL_compressed_texture_pvrtc') ||
            gl.getExtension('WEBKIT_WEBGL_compressed_texture_pvrtc');
          break;
        case 's3tc':
          ext.s3tc =
            gl.getExtension('WEBGL_compressed_texture_s3tc') ||
            gl.getExtension('WEBKIT_WEBGL_compressed_texture_s3tc');
          break;
        case 'bptc':       ext.bptc       = gl.getExtension('EXT_texture_compression_bptc');     break;
        case 's3tc_srgb':  ext.s3tc_srgb  = gl.getExtension('WEBGL_compressed_texture_s3tc_srgb');
      }
    });

    // Pick smallest mip that fits in 128².
    const index = image.sizes.findIndex((e) => e.width <= 128 && e.height <= 128);
    gl.compressedTexImage2D(
      gl.TEXTURE_2D, 0, image.gliFormat,
      image.sizes[index].width, image.sizes[index].height, 0,
      image.compressedData[index],
    );

    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.useProgram(null);

    const data = new Uint8Array(65536); // 128 * 128 * 4
    gl.readPixels(0, 0, 128, 128, gl.RGBA, gl.UNSIGNED_BYTE, data);
    return data;
  }

  /*
   * Worker-side: k-means over LAB color space. See module header for
   * algorithm summary.
   */
  function findDominantColors(e, id) {
    function calculateCenterColor(colors) {
      const center = new ColorLAB();
      colors.forEach((color) => {
        center.l += color.l;
        center.a += color.a;
        center.b += color.b;
      });
      if (colors.length) {
        center.l /= colors.length;
        center.a /= colors.length;
        center.b /= colors.length;
      }
      return center;
    }
    try {
      let data;
      if (e.compressionExtensions) {
        // Compressed KTX → on-GPU decompress then readPixels.
        data = renderOnQuad(e.image, e.compressionExtensions);
      } else if (e.image) {
        // Bitmap → 2D canvas downsample to ≤128px.
        const aspect = e.image.width / e.image.height;
        const max    = 128;
        const width  = Math.round(aspect > 1 ? max         : max * aspect);
        const height = Math.round(aspect > 1 ? max / aspect : max);
        const ctx = new OffscreenCanvas(width, height).getContext('2d');
        ctx.drawImage(e.image, 0, 0, width, height);
        data = ctx.getImageData(0, 0, width, height).data;
      } else {
        data = e.data;
      }

      // Build LAB samples, skipping near-transparent pixels.
      const count  = data.length / 4;
      const colors = [];
      let j = 0;
      for (let i = 0; i < count; ++i) {
        if (data[j + 3] > 25) {
          colors.push(new ColorLAB().setRGB(data[j] / 255, data[j + 1] / 255, data[j + 2] / 255));
        }
        j += 4;
      }

      // k-means proper.
      let results = (function kmeans(colors, k, minDiff) {
        // Seed: sort by L+a+b sum, split into k shards, average each.
        let clusters = (function getInitialClusters(colors, k) {
          const sums = colors.map((color) => [color.l + color.a + color.b, color]);
          sums.sort((a, b) => a[0] - b[0]);
          const centroids = [...Array(k)].map((_, i) => {
            const shardSize = Math.floor(sums.length / k);
            return calculateCenterColor(
              sums
                .slice(shardSize * i, i === k - 1 ? sums.length : shardSize * (i + 1))
                .map((sum) => sum[1]),
            );
          });
          // Dedupe identical centroids (can happen on flat palettes).
          for (let i = 0; i < centroids.length - 1; ++i) {
            const color     = centroids[i];
            const nextColor = centroids[i + 1];
            if (color.l === nextColor.l && color.a === nextColor.a && color.b === nextColor.b) {
              centroids.splice(i + 1, 1);
              i -= 1;
            }
          }
          return centroids.map((color) => [color, []]);
        })(colors, k);
        k = clusters.length;

        // Iterate until max centroid drift < minDiff or 50 iters.
        for (let i = 1; ; i++) {
          const lists = [...Array(k)].map(() => []);
          for (let j = 0; j < colors.length; j++) {
            const c = colors[j];
            let smallestDistance = Infinity;
            let idx = 0;
            for (let i = 0; i < k; i++) {
              const distance = c.deltaECIE94(clusters[i][0]);
              if (distance < smallestDistance) {
                smallestDistance = distance;
                idx = i;
              }
            }
            lists[idx].push(c);
          }
          let diff = 0;
          for (let i = 0; i < k; i++) {
            const old        = clusters[i];
            const center     = calculateCenterColor(lists[i]);
            const newCluster = [center, lists[i]];
            const dist       = old[0].deltaECIE94(center);
            clusters[i] = newCluster;
            diff = diff > dist ? diff : dist;
          }
          if (diff < minDiff || 50 === i) break;
        }
        return clusters;
      })(colors, 'number' === typeof e.numColors ? e.numColors : 4, 1 / 255)
        .filter((cluster) => cluster[1].length);

      // Sort by cluster population, return top centroid RGBs.
      results.sort((a, b) => b[1].length - a[1].length);
      results = results.map((result) => result[0].getRGB());
      resolve({ colors: results }, id);
    } catch (e) {
      resolve({ fail: e.message || e }, id);
      throw e;
    }
  }

  // Regex helpers for the ASCII .cube parser.
  function findNumberAfterString(source, str, toInt = false) {
    const regex = new RegExp(str + '\\D*([0-9]*\\.?[0-9]+)');
    const num   = source.match(regex);
    return num && num[1] ? (toInt ? parseInt(num[1]) : parseFloat(num[1])) : null;
  }
  function removeCubeHeader(source, str) {
    const regex = new RegExp(str + '[\\s\\S]*?(\\n+)');
    const match = source.match(regex);
    if (match) {
      const newlineIndex = match.index + match[0].length - 1;
      return source.slice(newlineIndex + 1);
    }
    return source;
  }

  // Lazy capability probe — OffscreenCanvas 2D / WebGL plus the GPU's
  // compression-extension list.
  function checkCapabilities() {
    if (undefined === _offscreen['2d']) {
      _offscreen['2d'] = 'OffscreenCanvas' in window && !!new OffscreenCanvas(1, 1).getContext('2d');
    }
    if (undefined === _offscreen.webgl) {
      _offscreen.webgl =
        'OffscreenCanvas' in window && !!new OffscreenCanvas(1, 1).getContext('webgl');
      if (_offscreen.webgl) {
        const compressionExtensions = ['compressed_texture', 'texture_compression'];
        const enabledExtensions = Device.graphics.webgl?.extensions || [];
        const dedupe = {};
        // Strip the prefix and optional underscore to get a short tag
        // like 'astc' / 'etc' / 's3tc' from the raw extension name.
        _offscreen.compressionExtensions = enabledExtensions
          .map((ext) =>
            compressionExtensions
              .map((name) => {
                let index = ext.indexOf(name);
                if (index < 0) return;
                index += name.length;
                if ('_' === ext.charAt(index)) index += 1;
                return ext.substring(index);
              })
              .find(Boolean),
          )
          .filter((ext) => !(!ext || dedupe[ext]) && (dedupe[ext] = true));
      }
    }
  }

  // Ship worker fns into every thread once Hydra is up.
  (async function init() {
    await Hydra.ready();
    Thread.upload(decodeImage);
    Thread.upload(decodeCubeLUT);
    Thread.upload(findNumberAfterString);
    Thread.upload(removeCubeHeader);
    Thread.upload(renderOnQuad);
    Thread.upload(findDominantColors);
    Thread.upload(decodeKtx1CompressedImage);
  })();

  /*
   * Public decode — routes to native / KTX1 / KTX2 / fallback. Performs
   * optional CPU-side post-scale to `self.scale * params.scale`.
   */
  this.decode = async function (path, params = {}) {
    const fallback = Thread.absolutePath(Assets.getPath('assets/images/_scenelayout/uv.jpg'));
    path = Thread.absolutePath(Assets.getPath(path));

    // First-call KTX1 capability probe.
    if (undefined === _ktx1Settings) {
      _ktx1Settings = {
        dxt:   !!Renderer.extensions.s3tc,
        etc:   !!Renderer.extensions.etc1,
        pvrtc: !!Renderer.extensions.pvrtc,
        astc:  !!Renderer.extensions.astc,
      };
      let found = false;
      for (const key in _ktx1Settings) if (true === _ktx1Settings[key]) found = true;
      if (!found) _ktx1Settings = null;
    }

    // Detect compressed path tag.
    const compressedIdentifier = /-compressedKtx2?/.exec(path)?.[0];
    let compressed = !!compressedIdentifier && (compressedIdentifier.endsWith('2') ? 'ktx2' : 'ktx1');

    if (Utils.query('noKtx') || (!_ktx1Settings && 'ktx1' === compressed)) {
      path = path.replace(compressedIdentifier, '');
      compressed = false;
    }
    if (/\.ktx2(?:\?|#|$)/.test(path)) {
      compressed = 'ktx2';
      if (Utils.query('noKtx')) params.uncompressed = true;
    }
    if (compressed && params.hintUsingPixelData) {
      checkCapabilities();
      if (!_offscreen.webgl) {
        if ('ktx2' === compressed) {
          params.uncompressed = true;
        } else {
          path = path.replace(compressedIdentifier, '');
          compressed = false;
        }
      }
    }

    if (compressed) {
      try {
        path = path.substring(0, path.lastIndexOf('.'));
        const bitmap =
          'ktx1' === compressed
            ? await Thread.shared().decodeKtx1CompressedImage({ path, params, settings: _ktx1Settings })
            : await Ktx2Transcoder.transcode({ path: `${path}.ktx2`, params });
        if (!bitmap.fail) return bitmap;
      } catch (e) {}
      return self.decode(fallback, params);
    }

    // Uncompressed path.
    let bitmap = await doDecodeImage(path, params);
    if (bitmap.fail && !this.disableFallbackImage) {
      const fallbackBitmap = await doDecodeImage(fallback, params);
      if (!fallbackBitmap.fail) bitmap = fallbackBitmap;
    }
    if (bitmap.fail) throw new Error(bitmap.fail);

    // Optional CPU-side rescale.
    return (function process(bitmap, scale) {
      if (1 === scale * self.scale) return bitmap;
      const pow2 = Math.isPowerOf2(bitmap.width, bitmap.height);
      const canvas = document.createElement('canvas');
      canvas.context = canvas.getContext('2d');
      canvas.width  = Math.round(bitmap.width  * self.scale * scale);
      canvas.height = Math.round(bitmap.height * self.scale * scale);
      // POT downscale: snap to power-of-two for mipmappability.
      if (pow2 && scale * self.scale < 1) {
        canvas.width = canvas.height = Math.floorPowerOf2(Math.max(canvas.width, canvas.height));
      }
      canvas.context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      return canvas;
    })(bitmap, params.scale || 1);
  };

  this.decodeCubeLUT = async function (path, params) {
    const fallback = Thread.absolutePath(Assets.getPath('assets/images/_scenelayout/invert.cube'));
    path = Thread.absolutePath(Assets.getPath(path));
    try {
      let bitmap = await Thread.shared().decodeCubeLUT({ path, params });
      if (bitmap.fail && !this.disableFallbackImage) {
        bitmap = await Thread.shared().decodeCubeLUT({ path: fallback, params });
        if (bitmap.fail) throw 'could not decode ' + path;
      }
      return { imgBmp: bitmap.imgBmp, cubesize: bitmap.cubesize };
    } catch (e) {
      throw 'could not decode ' + path;
    }
  };

  /*
   * Public: extract dominant palette from an image. Routes to whichever
   * worker pipeline can produce raw pixels: GPU decompress, OffscreenCanvas
   * 2D, or main-thread canvas fallback.
   */
  this.parseColors = async function (image, numColors = 4) {
    let result;
    checkCapabilities();

    if (image.sizes) {
      // Compressed KTX descriptor.
      if (_offscreen.webgl) {
        result = await Thread.shared().findDominantColors({
          image, numColors,
          compressionExtensions: _offscreen.compressionExtensions,
        });
      } else {
        // No offscreen GL — re-decode the smallest mip to RGBA and run
        // k-means on the raw bytes.
        let index = image.sizes.findIndex((e) => e.width <= 128 && e.height <= 128);
        index = Math.max(0, index);
        image = await self.decode(image.path + '-compressedKtx2', { uncompressed: true });
        const data = image.compressedData[index];
        result = await Thread.shared().findDominantColors(
          { data, numColors },
          [data.buffer],
        );
      }
    } else if (_offscreen['2d']) {
      // Bitmap/Image → ship to worker via OffscreenCanvas.
      const buffers = [];
      if (image instanceof HTMLImageElement) {
        image = await createImageBitmap(image);
        buffers.push(image);
      }
      result = await Thread.shared().findDominantColors({ image, numColors }, buffers);
    } else {
      // Main-thread canvas fallback.
      const canvas = document.createElement('canvas');
      canvas.context = canvas.getContext('2d');
      const aspect = image.width / image.height;
      const max    = 128;
      canvas.width  = Math.round(aspect > 1 ? max         : max * aspect);
      canvas.height = Math.round(aspect > 1 ? max / aspect : max);
      canvas.context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const data = canvas.context.getImageData(0, 0, canvas.width, canvas.height).data;
      result = await Thread.shared().findDominantColors(
        { data, numColors },
        [data.buffer],
      );
    }

    if (result.fail) throw new Error(result.fail);
    return result.colors.map((color) => new Color().copy(color));
  };
}, 'static');

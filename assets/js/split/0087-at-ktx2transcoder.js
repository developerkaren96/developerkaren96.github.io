/*
 * Ktx2Transcoder — static Hydra component that turns a .ktx2 file on the
 * server into a GPU-ready compressed texture for the current device. KTX2
 * is the Khronos container for Basis-Universal supercompressed textures;
 * the same file can be transcoded at load-time into whichever GPU format
 * the active WebGL context happens to support (ASTC on mobile/Apple,
 * BPTC/DXT on desktop, ETC2 on older Android, PVRTC on legacy iOS, or
 * uncompressed RGBA32 as a last-resort fallback).
 *
 * The transcode itself runs in worker threads (Thread.shared(true)) so it
 * doesn't block the main thread on large textures. Initialization is
 * one-shot and gated by a single promise — every call to `transcode` waits
 * on the same `_transcoderReady` so the WASM and capability tables are
 * only loaded once across the process.
 *
 * Init flow (`initBasisTranscoder`):
 *   1. Resolve the two basis-universal asset paths
 *      (basis_transcoder.js and basis_transcoder.wasm) through Hydra's
 *      asset router and the thread absolutePath rewriter.
 *   2. Fetch both in parallel — JS as text (will be eval'd inside each
 *      worker via importCode), WASM as ArrayBuffer (passed as
 *      `wasmBinary` for Emscripten module init).
 *   3. Build `formats` — the device capability table, derived from
 *      `Renderer.extensions`. Each entry has:
 *        • id — the family name ('astc', 'bptc', 'dxt', 'etc2', 'etc1',
 *          'pvrtc', 'uncompressed').
 *        • needsPowerOfTwo — true only for PVRTC.
 *        • gliFormat — pair of [opaque, alpha] glInternalFormat enums.
 *      Special-case: under WebGL2, etc1 is force-disabled (etc2 is a
 *      superset and the etc1 path uses the WebGL1-only enum).
 *   4. For each worker thread: importCode the basis JS, then
 *      loadFunction the init+transcode functions, then call
 *      initKtx2TranscoderThread with the WASM buffer and format table.
 *   5. Once every thread finishes initializing, resolve _transcoderReady
 *      and flag('transcoderLoaded', true).
 *
 * Worker thread init (`initKtx2TranscoderThread`):
 *   - Builds a BasisModule object with `wasmBinary` and an
 *     `onRuntimeInitialized` callback. BASIS(BasisModule) is the
 *     Emscripten factory provided by basis_transcoder.js.
 *   - When the WASM is ready: calls initializeBasis(), then walks the
 *     format table assigning the `transcoderFormat` enum for each id
 *     using BasisModule.transcoder_texture_format.cTF*.value.
 *     The pairs follow the same [opaque, alpha] layout as gliFormat.
 *   - Finally builds the per-source-format preference lists:
 *       uastc → astc, bptc, etc2, etc1, dxt, pvrtc, uncompressed
 *       etc1s → etc2, etc1, bptc, dxt, pvrtc, uncompressed
 *     Order matters — `getTranscoderFormat` walks the list and picks the
 *     first viable entry. UASTC prefers ASTC (mobile-friendly, high
 *     quality); ETC1S prefers ETC2/ETC1 (its native target).
 *   - Replaces the worker's own initKtx2TranscoderThread reference with
 *     the real transcode function and resolves so the main thread knows
 *     this worker is hot.
 *
 * Worker transcode (`transcodeKtx2`):
 *   1. Fetch the .ktx2 file, wrap in Uint8Array, hand to
 *      BasisModule.KTX2File. Validate with isValid().
 *   2. Read header: dimensions, depth, layers, levels, face count, alpha
 *      flag, premultiply flag (bit 0 of DFD flags), and basisFormat
 *      ('uastc' or 'etc1s' via isUASTC()).
 *   3. `getTranscoderFormat` picks the first format in the per-basisFormat
 *      preference list that meets the constraints:
 *        • Alpha sources require at least 2 entries in transcoderFormat.
 *        • PVRTC requires power-of-two dimensions.
 *      The `which` index (0=opaque, 1=alpha) selects the right
 *      enum from each pair. If everything falls through to
 *      'uncompressed' and the caller didn't explicitly request it, a
 *      warning is logged — uncompressed RGBA32 is ~4× the VRAM of any
 *      compressed format.
 *   4. Reject invalid headers (zero dim / zero levels) and array
 *      textures (layers > 1) — array textures aren't wired up.
 *   5. startTranscoding() primes the basis decoder.
 *   6. There are two output paths:
 *      a. **3D texture path** (params.isTexture3D + vkFormat + depth):
 *         The .ktx2 carries raw voxel data at the tail of the file.
 *         Slice off `W*H*D*typeSize*4` bytes from the end and push as
 *         the only level. No transcoding — already raw bytes.
 *      b. **2D / cube path**: iterate `levels` mip levels. For each
 *         level iterate `faceCount` faces (1 for 2D, 6 for cube). For
 *         each face, allocate `getImageTranscodedSizeInBytes` bytes
 *         and call transcodeImage. If multiple faces in one level (a
 *         cube), concatenate face buffers into one contiguous level
 *         buffer so the consumer can upload them with face stride.
 *   7. Resolve with { gliFormat, compressedData[], sizes[], width,
 *      height, depth, cube, premultiplyAlpha, uncompressed }. The
 *      ArrayBuffers are transferred (third arg to resolve) so there's
 *      no copy back to the main thread.
 *   8. Errors are caught and resolved as { fail: msg } so the main-side
 *      promise can reject with a useful message.
 *   9. `finally` always closes+deletes the KTX2File handle so the WASM
 *      heap doesn't leak.
 *
 * Public API:
 *   `transcode({path, params})` — kicks off init if needed, dispatches
 *   the file to a worker via Thread.shared() (round-robin), and either
 *   returns the result or throws.
 */
Class(function Ktx2Transcoder() {
  Inherit(this, Component);
  const self = this;

  let _transcoderReady;
  const _basisAssets = ['~assets/js/lib/basis_transcoder.js', '~assets/js/lib/basis_transcoder.wasm']
    .map(Assets.getPath)
    .map(Thread.absolutePath);

  /*
   * One-shot init: fetch JS + WASM, probe device capabilities, fan out
   * to every worker thread. Subsequent calls await the same promise.
   */
  async function initBasisTranscoder() {
    if (_transcoderReady) {
      await _transcoderReady;
      return;
    }

    _transcoderReady = Promise.create();

    // Fetch the basis JS as text (eval'd in each worker via importCode)
    // and the WASM as bytes (passed to Emscripten as wasmBinary).
    const [js, wasmBinary] = await Promise.all(
      _basisAssets.map(async (path, i) => {
        const response = await fetch(path);
        return i === 0 ? response.text() : response.arrayBuffer();
      }),
    );

    // Build the device capability table. Each entry pairs an opaque and
    // an alpha GPU enum; getTranscoderFormat picks one at decode time.
    const formats = (function getSupportedFormats() {
      const supported = {
        astc: !!Renderer.extensions.astc,
        etc1: !!Renderer.extensions.etc1,
        etc2: !!Renderer.extensions.etc,
        dxt: !!Renderer.extensions.s3tc,
        bptc: !!Renderer.extensions.bptc,
        pvrtc: !!Renderer.extensions.pvrtc,
        uncompressed: true,
      };
      // WebGL2 ships ETC2 as a superset; the WebGL1-only ETC1 enum
      // isn't reachable, so kill the option here.
      if (Renderer.type === Renderer.WEBGL2) supported.etc1 = false;

      const result = {};
      Object.keys(supported)
        .filter((id) => supported[id])
        .forEach((id) => {
          const format = { id, needsPowerOfTwo: false };
          result[id] = format;
          switch (id) {
            case 'astc':
              format.gliFormat = [
                Renderer.extensions.astc.COMPRESSED_RGBA_ASTC_4x4_KHR,
                Renderer.extensions.astc.COMPRESSED_RGBA_ASTC_4x4_KHR,
              ];
              break;
            case 'bptc':
              format.gliFormat = [
                Renderer.extensions.bptc.COMPRESSED_RGBA_BPTC_UNORM_EXT,
                Renderer.extensions.bptc.COMPRESSED_RGBA_BPTC_UNORM_EXT,
              ];
              break;
            case 'dxt':
              format.gliFormat = [
                Renderer.extensions.s3tc.COMPRESSED_RGB_S3TC_DXT1_EXT,
                Renderer.extensions.s3tc.COMPRESSED_RGBA_S3TC_DXT5_EXT,
              ];
              break;
            case 'etc2':
              format.gliFormat = [
                Renderer.extensions.etc.COMPRESSED_RGB8_ETC2,
                Renderer.extensions.etc.COMPRESSED_RGBA8_ETC2_EAC,
              ];
              break;
            case 'etc1':
              format.gliFormat = [Renderer.extensions.etc.COMPRESSED_RGB_ETC1_WEBGL];
              break;
            case 'pvrtc':
              // PVRTC textures must be power-of-two.
              format.gliFormat = [
                Renderer.extensions.pvrtc.COMPRESSED_RGB_PVRTC_4BPPV1_IMG,
                Renderer.extensions.pvrtc.COMPRESSED_RGBA_PVRTC_4BPPV1_IMG,
              ];
              format.needsPowerOfTwo = true;
              break;
            case 'uncompressed':
              format.gliFormat = [Renderer.context.RGBA, Renderer.context.RGBA];
              break;
          }
        });
      return result;
    })();

    // Spread init across every worker so they're all hot by the first
    // real decode call.
    const threads = Thread.shared(true).array;
    await Promise.all(
      threads.map(async (thread) => {
        thread.importCode(js);
        thread.loadFunction(initKtx2TranscoderThread);
        // Placeholder so it exists on the thread namespace; replaced
        // with the real transcodeKtx2 once basis init completes.
        thread.loadFunction(function transcodeKtx2() {});
        await thread.initKtx2TranscoderThread({ wasmBinary, formats });
      }),
    );

    _transcoderReady.resolve();
    self.flag('transcoderLoaded', true);
  }

  /*
   * Runs inside a worker thread. Bootstraps Basis-Universal and swaps in
   * the real transcodeKtx2 once the WASM is initialized.
   */
  function initKtx2TranscoderThread(e, id) {
    let _formats;

    async function transcodeKtx2({ path, params }, id) {
      let ktx2File;
      try {
        const response = await fetch(path);
        if (response.status !== 200) throw new Error(`Image not found :: ${path}`);
        const arrayBuffer = await response.arrayBuffer();

        ktx2File = new BasisModule.KTX2File(new Uint8Array(arrayBuffer));
        if (!ktx2File.isValid()) throw new Error('Invalid or unsupported .ktx2 file');

        const ktxheader = ktx2File.getHeader();
        const basisFormat = ktx2File.isUASTC() ? 'uastc' : 'etc1s';
        const baseWidth = ktx2File.getWidth();
        const baseHeight = ktx2File.getHeight();
        const baseDepth = ktxheader.pixelDepth;
        const layers = ktx2File.getLayers() || 1;
        const levels = ktx2File.getLevels();
        const faceCount = ktx2File.getFaces();
        const hasAlpha = ktx2File.getHasAlpha();
        // DFD flag bit 0 = premultiplied alpha.
        const premultiplyAlpha = !!(ktx2File.getDFDFlags() & 1);

        // Choose the first format whose constraints (alpha pair length,
        // POT for PVRTC) match the source. Falls back to uncompressed.
        const { transcoderFormat, gliFormat, uncompressed } = (function getTranscoderFormat(
          basisFormat, width, height, hasAlpha, params,
        ) {
          let format;
          if (params.uncompressed) {
            format = _formats.uncompressed;
          } else {
            format = _formats[basisFormat].find(
              (f) =>
                !(
                  (hasAlpha && f.transcoderFormat.length < 2) ||
                  (f.needsPowerOfTwo && !Math.isPowerOf2(width, height))
                ),
            );
          }
          const isUncompressed = format.id === 'uncompressed';
          if (isUncompressed && !params.uncompressed) {
            console.warn('No suitable compressed texture format found. Decoding to RGBA32.');
          }
          // 0 = opaque variant, 1 = alpha variant.
          const which = hasAlpha ? 1 : 0;
          return {
            transcoderFormat: format.transcoderFormat[which],
            gliFormat: format.gliFormat[which],
            uncompressed: isUncompressed,
          };
        })(basisFormat, baseWidth, baseHeight, hasAlpha, params);

        if (!baseWidth || !baseHeight || !levels) throw new Error('Invalid texture');
        if (layers > 1) throw new Error('Array textures not implemented');
        if (!ktx2File.startTranscoding()) throw new Error('startTranscoding failed');

        const buffers = [];
        const compressedData = [];
        const sizes = [];
        const cube = faceCount === 6;

        if (params.isTexture3D && ktxheader.vkFormat && baseDepth) {
          // 3D textures: ktx2 carries the voxel grid as raw bytes at the
          // tail of the file. Slice it off; no Basis decode happens.
          const channelCount = 4;
          const data = new Uint8Array(
            arrayBuffer.slice(
              baseWidth * baseHeight * baseDepth * ktxheader.typeSize * channelCount * -1,
            ),
          );
          compressedData.push(data);
          buffers.push(data.buffer);
          sizes.push({ baseWidth, baseHeight, baseDepth });
        } else {
          // 2D / cube path: iterate mip levels × faces.
          for (let level = 0; level < levels; level++) {
            let width, height, data;
            const faces = [];
            for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
              const levelInfo = ktx2File.getImageLevelInfo(level, 0, faceIndex);
              width = levelInfo.origWidth;
              height = levelInfo.origHeight;
              const faceData = new Uint8Array(
                ktx2File.getImageTranscodedSizeInBytes(level, 0, faceIndex, transcoderFormat),
              );
              if (!ktx2File.transcodeImage(faceData, level, 0, faceIndex, transcoderFormat, 0, -1, -1)) {
                throw new Error('transcodeImage failed');
              }
              faces.push(faceData);
            }
            // Cube level → concatenate the six face buffers into one
            // contiguous blob the consumer can upload face-by-face.
            if (faces.length > 1) {
              let totalLength = 0;
              faces.forEach((face) => { totalLength += face.byteLength; });
              data = new Uint8Array(totalLength);
              let offset = 0;
              faces.forEach((face) => {
                data.set(face, offset);
                offset += face.byteLength;
              });
            } else {
              data = faces[0];
            }
            compressedData.push(data);
            buffers.push(data.buffer);
            sizes.push({ width, height });
          }
        }

        // Transfer the typed-array buffers (third arg) so there's no
        // structured-clone copy back to the main thread.
        resolve(
          {
            path,
            gliFormat,
            compressedData,
            sizes,
            width: baseWidth,
            height: baseHeight,
            depth: baseDepth,
            cube,
            premultiplyAlpha,
            uncompressed,
          },
          id,
          buffers,
        );
      } catch (err) {
        console.log(err.toString());
        resolve({ fail: `${path} could not be decoded: ${err.message || err}` }, id);
      } finally {
        // Always release the WASM-side KTX2File handle to keep the heap
        // from growing across decodes.
        if (ktx2File) {
          ktx2File.close();
          ktx2File.delete();
        }
      }
    }

    // Emscripten module bootstrap. onRuntimeInitialized fires once the
    // WASM is fully linked and basis exports are callable.
    const BasisModule = {
      wasmBinary: e.wasmBinary,
      onRuntimeInitialized: function () {
        BasisModule.initializeBasis();

        // Fill in each format's transcoderFormat enum from the basis
        // module. Same [opaque, alpha] pair shape as gliFormat.
        (function initFormats(formats) {
          Object.keys(formats).forEach((id) => {
            const format = formats[id];
            switch (id) {
              case 'astc':
                format.transcoderFormat = [
                  BasisModule.transcoder_texture_format.cTFASTC_4x4_RGBA.value,
                  BasisModule.transcoder_texture_format.cTFASTC_4x4_RGBA.value,
                ];
                break;
              case 'bptc':
                format.transcoderFormat = [
                  BasisModule.transcoder_texture_format.cTFBC7_RGBA.value,
                  BasisModule.transcoder_texture_format.cTFBC7_RGBA.value,
                ];
                break;
              case 'dxt':
                format.transcoderFormat = [
                  BasisModule.transcoder_texture_format.cTFBC1_RGB.value,
                  BasisModule.transcoder_texture_format.cTFBC3_RGBA.value,
                ];
                break;
              case 'etc2':
                format.transcoderFormat = [
                  BasisModule.transcoder_texture_format.cTFETC1_RGB.value,
                  BasisModule.transcoder_texture_format.cTFETC2_RGBA.value,
                ];
                break;
              case 'etc1':
                format.transcoderFormat = [BasisModule.transcoder_texture_format.cTFETC1_RGB.value];
                break;
              case 'pvrtc':
                format.transcoderFormat = [
                  BasisModule.transcoder_texture_format.cTFPVRTC1_4_RGB.value,
                  BasisModule.transcoder_texture_format.cTFPVRTC1_4_RGBA.value,
                ];
                break;
              case 'uncompressed':
                format.transcoderFormat = [
                  BasisModule.transcoder_texture_format.cTFRGBA32.value,
                  BasisModule.transcoder_texture_format.cTFRGBA32.value,
                ];
                break;
            }
          });

          // Preference lists. UASTC is the higher-quality basis source
          // format (mobile-friendly via ASTC); ETC1S is smaller but
          // best-served by ETC2/ETC1 targets.
          _formats = {
            uastc: [
              formats.astc, formats.bptc, formats.etc2, formats.etc1,
              formats.dxt, formats.pvrtc, formats.uncompressed,
            ].filter(Boolean),
            etc1s: [
              formats.etc2, formats.etc1, formats.bptc, formats.dxt,
              formats.pvrtc, formats.uncompressed,
            ].filter(Boolean),
            uncompressed: formats.uncompressed,
          };
        })(e.formats);

        // Hot-swap the placeholder transcode function with the real one
        // now that the worker is initialized.
        self.transcodeKtx2 = transcodeKtx2;
        delete self.initKtx2TranscoderThread;
        resolve(id);
      },
    };

    // Emscripten factory provided by basis_transcoder.js (importCode'd
    // into this worker).
    BASIS(BasisModule);
  }

  /*
   * Public entry point. Boots the transcoder pool once, then dispatches
   * the .ktx2 to whichever shared worker the round-robin picks.
   */
  self.transcode = async function ({ path, params }) {
    if (!self.flag('transcoderLoaded')) await initBasisTranscoder();
    const result = await Thread.shared().transcodeKtx2({ path, params });
    if (result.fail) throw new Error(result.fail);
    return result;
  };
}, 'static');

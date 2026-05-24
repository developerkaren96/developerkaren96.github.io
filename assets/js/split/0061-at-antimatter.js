/*
 * Antimatter — the engine's GPU particle system. Front-end facade over
 * AntimatterFBO (the ping-pong render-target pipeline). One Antimatter
 * instance == one particle group: it owns a position-data texture of
 * size NxN where N is derived from particle count, plus per-particle
 * random attribs and a Points mesh that samples those textures in the
 * vertex shader.
 *
 * Texture sizing (`findSize`):
 *   `pot` (power-of-two) configs ceil to the next pow2 of √num so RT
 *   sampling is mipmap-friendly; otherwise just ceil(√num). The unused
 *   tail of the texture maps to particles beyond `_num` — `drawRange.end`
 *   on the geometry caps draw calls at `_drawLimit` so we don't pay for
 *   them.
 *
 * Async buffer prep (`createBuffer` + `defer`):
 *   AntimatterUtil builds the geometry/vertices/attribs arrays on a
 *   worker thread (see 0066). The deferred-init pattern lets a caller
 *   construct an Antimatter inline and immediately set
 *   `cloneVertices=true`, attach behaviors, etc. — the heavy work
 *   happens on the next microtask.
 *   `usedDepth` reports the fraction of the texture actually backing
 *   live particles (num / size²), used by spawn passes that need to
 *   sample within the live region.
 *
 * `useShader(vs, fs, params)`:
 *   Stash shader handles. The 2-arg form `(vs, params)` is supported
 *   when fs is the same as vs (single-program point sprite). `params`
 *   becomes the uniforms object merged into the mesh shader.
 *
 * `createMesh`/`getMesh`:
 *   Lazy mesh construction. Shader is built via `createShader` so it
 *   picks up tPos/tPrevPos/uDPR. Frustum culling is disabled because
 *   the particles live in a texture — bounding-box culling against the
 *   placeholder geometry would falsely cull active particles.
 *
 * `createShader(fs)`:
 *   Inject the standard particle-system uniforms (current position
 *   texture, previous position texture for motion blur / velocity, and
 *   the parent Nuke's device-pixel-ratio for size-in-pixels math).
 *   `findNuke()` walks up the parent chain looking for a Nuke (the
 *   compositor) to inherit dpr from — tries the standard `.parent`
 *   chain first, then a more permissive `.group._parent || .parent ||
 *   ._parent` walk so meshes deeply nested in groups still resolve.
 *   Falls back to World.NUKE.
 *   The `__ACTIVE_THEORY_LIGHTS__` token is the lighting injection
 *   point used by the shader preprocessor; we splice `uniform sampler2D
 *   tPos;` just before it so it's visible to subsequent #includes.
 *
 * `overrideShader(original)`:
 *   Reuse an arbitrary shader (e.g. for fancy material variants) and
 *   re-wire the same particle-system uniforms onto it. Replaces the
 *   mesh's shader in place.
 *
 * `upload(needsMesh)`:
 *   Two-phase synchronous-feeling preload for fade-in scenes that need
 *   the particle system fully resident before first draw. Suspends
 *   rendering, walks vertices/random/mesh/uniforms uploading each in
 *   sequence with `defer()` between to spread GC pressure over multiple
 *   ticks, then runs each pass's upload. Re-enables rendering at the end.
 *   `uploadSync` is the cheap counterpart: just ticks the FBO 4 times
 *   to warm up the ping-pong RTs.
 *
 * Computed accessors:
 *   `particleCount` actual particle count (≤ texture capacity)
 *   `textureSize`   N (texture is NxN)
 *   `powerOf2`      what N *would* be in pot mode (used by tooling)
 */
Class(function Antimatter(_num, _config, _renderer = World.RENDERER, _pointData = null) {
  Inherit(this, AntimatterFBO);
  const self = this;
  let _geometry;
  const _drawLimit = _num;

  // Texture side length. pot mode rounds up to the next power of two
  // for mipmap-friendly sampling; otherwise just ceil(√num).
  const _size = (function findSize() {
    return _config.pot
      ? Math.pow(2, Math.ceil(Math.log(Math.sqrt(_num)) / Math.log(2)))
      : Math.ceil(Math.sqrt(_num));
  })();

  // Worker-built buffers + AntimatterAttribute wrappers. Runs on the
  // next microtask so the caller can finish configuring `self`.
  async function createBuffer() {
    const { geometry, vertices, attribs, usedDepth } =
      await AntimatterUtil.createBufferArray(_size, _num, _config, _pointData);
    self.vertices = self.cloneVertices ? vertices.clone() : vertices;
    _geometry = geometry.clone(true);
    _geometry.drawRange.end = _drawLimit;
    self.vertices.geometry = _geometry;
    self.attribs = self.random = attribs;
    self.textureUsedDepth = usedDepth;
    self.init(_geometry, _renderer, _size);
  }
  defer(createBuffer);

  // Convenience: zeroed Float32Array sized to one component-set per
  // texel. Used by behaviors needing scratch buffers.
  this.createFloatArray = function (components = 3) {
    return new Float32Array(_size * _size * components);
  };
  this.createFloatArrayAsync = async function (components = 3, freshCopy) {
    const { array } = await AntimatterUtil.createFloatArray(
      _size * _size * components,
      freshCopy,
    );
    return array;
  };

  this.ready = function (callback) {
    return self.wait(self, 'vertices');
  };

  // 2-arg form: useShader(vs, params) — share vs as fs.
  this.useShader = function (vs, fs, params) {
    if ('object' == typeof fs) { params = fs; fs = null; }
    this.vertexShader   = vs;
    this.fragmentShader = fs || vs;
    this.uniforms       = params;
  };

  /*
   * Construct (and cache) the particle Points mesh. Frustum culling is
   * off — the placeholder geometry doesn't reflect actual particle
   * positions, which live in textures, so naive bounds would mis-cull.
   */
  this.createMesh = this.getMesh = function () {
    const shader = self.createShader(self.fragmentShader || 'AntimatterBasicFrag');
    self.mesh = new Points(_geometry, shader);
    self.mesh.frustumCulled = false;
    self.shader   = shader;
    self.geometry = _geometry;
    return self.mesh;
  };

  /*
   * Build the particle shader with the standard uniform set. The Nuke
   * lookup walks up the parent chain via two strategies — the strict
   * `.parent` chain first, then a permissive walk that also descends
   * through groups and `_parent` aliases. Falls back to World.NUKE.
   */
  this.createShader = function (fs) {
    const uniforms = self.uniforms || {};
    const nuke = (function findNuke() {
      let p = self.parent;
      while (p) {
        if (p.nuke) return p.nuke;
        p = p.parent;
      }
      p = self.parent;
      while (p) {
        if (p.nuke) return p.nuke;
        p = p.group ? p.group._parent : (p.parent || p._parent);
      }
      return World.NUKE;
    })();
    self._nuke = nuke;

    const obj = {
      tPos:     { type: 't', value: self.vertices.texture, ignoreUIL: true },
      tPrevPos: { type: 't', value: self.vertices.texture, ignoreUIL: true },
      uDPR:     { value: nuke?.dpr || 1, ignoreUIL: true },
    };
    for (const key in uniforms) obj[key] = uniforms[key];

    const shader = new Shader(self.vertexShader || 'AntimatterPosition', fs, obj);
    const vs = shader.vertexShader;

    // Splice tPos sampler declaration just before the lights injection
    // point so subsequent #includes can refer to it.
    if (vs && !vs.includes('uniform sampler2D tPos')) {
      const split = vs.split('__ACTIVE_THEORY_LIGHTS__');
      const defined = 'uniform sampler2D tPos;';
      shader.vertexShader = split[0] + '\n' + defined + '\n__ACTIVE_THEORY_LIGHTS__\n' + split[1];
    }

    shader._parentnuke = nuke;
    return shader;
  };

  // Used by behaviors that need to read the (xyz, index) attribute
  // arrays — Float32Array snapshot, not the live buffer.
  this.getLookupArray = function () {
    return new Float32Array(self.vertices.geometry.attributes.position.array);
  };

  this.getRandomArray = function () {
    return _geometry.attributes.random.array;
  };

  /*
   * Re-wire the particle uniforms onto an arbitrary shader (custom
   * material variants). Replaces the mesh's shader in place.
   */
  this.overrideShader = function (original) {
    const shader = original.clone();
    shader._parentnuke = self._nuke;
    original.copyUniformsTo(shader);
    shader.uniforms.tPos     = { type: 't', value: self.vertices.texture, ignoreUIL: true };
    shader.uniforms.tPrevPos = { type: 't', value: self.vertices.texture, ignoreUIL: true };
    shader.uniforms.uDPR     = { value: shader?._parentnuke?.dpr || 1, ignoreUIL: true };
    self.shader = shader;
    self.mesh.shader = shader;
  };

  /*
   * Heavy preload path: suspend rendering, sequentially upload every
   * data dependency with deferred gaps to spread GC pressure, then run
   * each pass's upload. `await self.wait(100)` lets the driver settle
   * before re-enabling rendering. needsMesh=true also uploads the mesh
   * buffers themselves (only needed before first draw).
   */
  this.upload = async function (needsMesh) {
    self.preventRender = true;
    _geometry.distributeBufferData = true;

    await self.ready();
    await self.vertices.uploadAsync();
    await defer();
    await self.random.uploadAsync();
    await defer();

    if (self.mesh && needsMesh) {
      self.mesh.upload();
      await _geometry.uploadBuffersAsync();
    }

    for (const key in self.shader.uniforms) {
      const uniform = self.shader.uniforms[key];
      if (!uniform.value) continue;
      if (uniform.value.uploadAsync) await uniform.value.uploadAsync();
      else if (uniform.value.upload) { uniform.value.upload(); await defer(); }
    }

    await self.wait(100);
    for (let i = 0; i < self.passes.length; i++) await self.passes[i].upload();
    self.preventRender = false;
  };

  // Cheap warm-up: tick the FBO four times so the ping-pong RTs are
  // primed with non-garbage content.
  this.uploadSync = async function (needsMesh) {
    await self.ready();
    if (self.customClass && self.customClass.loaded) await self.customClass.loaded();
    for (let i = 0; i < 4; i++) self.update();
  };

  this.get('particleCount', (_) => _num);
  this.get('textureSize',   (_) => _size);
  this.get('powerOf2',      (_) => Math.pow(2, Math.ceil(Math.log(Math.sqrt(_num)) / Math.log(2))));
});

/*
 * Lighting — singleton Component that aggregates BaseLights per Scene and
 * feeds their packed data into every receive-light shader, either:
 *   • by writing per-frame uniform arrays directly into each shader, or
 *   • (preferred when supported) by packing once into a shared UBO and
 *     binding it via `Lighting.bindUBO(shader)` from the shader-renderer.
 *
 * Scene-scoping: each Scene has its own light list + UBO + per-scene shader
 * roster, keyed by name in `_scenes`. `useScene(name)` swaps the active
 * scene. New Scenes are wired by `createScene(name, scene)` — the scene
 * gets its `_lightingData` set so `findParentScene` can find it by walking
 * `_parent` from any object.
 *
 * Per-frame loop (`loop`, attached to `Render.onDrawFrame`):
 *   1. `decomposeLights(_activeScene.lights)` — refresh each light's world
 *      position (cached on `light._world`, with an 8ms freshness window so
 *      multi-pass renders within a frame don't recompute).
 *   2. UBO path: pull one representative shader from the per-scene shader
 *      list, run `updateArrays(shader)` to repack its lighting-array
 *      uniforms (which the UBO is aliased to), and either upload-on-first
 *      use (`createUBO`) or `update()` the existing UBO.
 *   3. Non-UBO path: iterate every receive-light shader in the scene and
 *      repack its private uniform arrays directly.
 *
 * Per-shader registration: `getLighting(shader)` is the entry point from
 * Shader. It walks parents to find the owning Scene, registers the shader
 * with that scene's shader-list, installs the six `lightPos`/`lightColor`/
 * `lightData{,2,3}`/`lightProperties` uniforms as `v4v` arrays (or UBO-
 * aliased when `lightUBO`), and runs `updateArrays` once so the first
 * frame has valid data. AreaLights, if any, attach their lookup tables via
 * `AreaLightUtil.append`.
 *
 * Shadow side: `addToShadowGroup` / `removeFromShadowGroup` maintain the
 * per-scene `renderShadows[]` (the lights that actually contribute to the
 * shadow pass). `getShadowUniforms(shader)` emits the GLSL block that
 * Shader's header injection splices in (`SHADOW_MAPS` count, quality
 * defines, `shadowMap[]` sampler array, `shadowMatrix[]`, `shadowLightPos
 * []`, `shadowSize[]`). `initShadowShader(object, mesh)` clones the
 * receive-shadow shader with a depth fragment shader (`ShadowDepth` by
 * default, or `customShadowShader`) — the depth pass uses it to render
 * each light's shadow map.
 */
Class(function Lighting() {
  Inherit(this, Component);
  const self = this;

  // Active scene + map of all registered scenes (keyed by name).
  let _activeScene;
  const _scenes = {};

  /*
   * Per-frame tick. UBO path takes one shader off the per-scene shader
   * list as representative — all receive-light shaders in a scene share
   * the same lightPos/etc. arrays (they're packed once and bound). The
   * non-UBO path walks every shader and repacks them individually.
   */
  function loop() {
    decomposeLights(_activeScene.lights);
    if (self.UBO) {
      const shader = _activeScene.shaders.start();
      if (shader) {
        updateArrays(shader);
        if (_activeScene.ubo.created) _activeScene.ubo.update();
        else                          createUBO(shader.uniforms);
      }
    } else {
      let shader = _activeScene.shaders.start();
      while (shader) {
        updateArrays(shader);
        shader = _activeScene.shaders.next();
      }
    }
  }

  // First-touch UBO upload — register the 6 lighting uniform arrays and
  // commit. The UBO is shared by every receive-light shader in the scene.
  function createUBO(uniforms) {
    if (!uniforms.lightPos) return;
    _activeScene.ubo.created = true;
    _activeScene.ubo.push(uniforms.lightPos);
    _activeScene.ubo.push(uniforms.lightColor);
    _activeScene.ubo.push(uniforms.lightData);
    _activeScene.ubo.push(uniforms.lightData2);
    _activeScene.ubo.push(uniforms.lightData3);
    _activeScene.ubo.push(uniforms.lightProperties);
    _activeScene.ubo.upload();
  }

  /*
   * Cache each light's world position on `_world`. The 8ms freshness check
   * lets multi-pass renders inside a single tick reuse the same world pos
   * without re-running the parent-chain matrix update.
   * `lockToLocal` lights skip the world transform and use raw position
   * (useful for HUD-style lights that are positioned in clip space).
   */
  function decomposeLights(lights) {
    for (let i = lights.length - 1; i > -1; i--) {
      const light = lights[i];
      if (light._decomposedTime && Render.TIME - light._decomposedTime < 8) continue;
      light._decomposedTime = Render.TIME;
      if (!light._parent) light.updateMatrixWorld();
      if (!light._world)  light._world = new Vector3();
      if (light.lockToLocal) light._world.copy(light.position);
      else                   light.getWorldPosition(light._world);
    }
  }

  /*
   * Repack the six lighting arrays from the current set of lights. We
   * write directly into the shader's `__lighting` arrays — which are the
   * same arrays the uniforms point at (`type: 'v4v'`), so the renderer
   * picks up the new values on its next uniform upload.
   *
   * If a light hasn't been decomposed yet (e.g. just-added on this frame),
   * trigger a decomposition first so `_world` is valid.
   */
  function updateArrays(shader) {
    const L = shader.__lighting;
    L.position.length   = 0;
    L.color.length      = 0;
    L.data.length       = 0;
    L.data2.length      = 0;
    L.data3.length      = 0;
    L.properties.length = 0;
    for (let i = 0; i < _activeScene.lights.length; i++) {
      const light = _activeScene.lights[i];
      if (!light._world) decomposeLights(_activeScene.lights);
      L.position.push(light._world.x, light._world.y, light._world.z, 0);
      L.color.push(light.color.r, light.color.g, light.color.b, 0);
      L.data.push(light.data.x, light.data.y, light.data.z, light.data.w);
      L.data2.push(light.data2.x, light.data2.y, light.data2.z, light.data2.w);
      L.data3.push(light.data3.x, light.data3.y, light.data3.z, light.data3.w);
      L.properties.push(light.properties.x, light.properties.y, light.properties.z, light.properties.w);
    }
  }

  /*
   * Walk up an object's parent chain to find the owning Scene's lighting
   * data; falls back to the active scene if the object isn't attached or
   * its scene wasn't registered.
   * `_lightingData` is cached on each Scene the first time we find it.
   */
  function findParentScene(obj3d) {
    if (!obj3d)              return _activeScene;
    if (obj3d._lightingData) return obj3d._lightingData;
    let scene;
    for (let p = obj3d._parent; p; p = p._parent) {
      if (p instanceof Scene && p._lightingData) scene = p._lightingData;
    }
    if (!scene) scene = _activeScene;
    return scene;
  }

  // ── public surface ───────────────────────────────────────────────────────
  this.fallbackAreaToPoint = false;
  this.scenes = _scenes;

  // Bootstrap: as soon as Hydra is ready, create + use the 'default' scene.
  (async function () {
    await Hydra.ready();
    self.createScene('default');
    self.useScene('default');
  })();

  /*
   * Register a named Scene. `scene` (optional) is the actual Scene object;
   * stashing `_lightingData` on it lets us look up its lighting state
   * directly from any descendant via `findParentScene`.
   * Idempotent — re-creating an existing scene is a no-op.
   *
   * The UBO uses binding-point 2 (binding 0/1 are reserved for `global`
   * matrices etc.). `MetalUBO` is the WebGPU-on-Metal variant.
   */
  this.createScene = function (name, scene) {
    if (_scenes[name]) return this;
    const obj = {
      lights:        [],
      renderShadows: [],
      ubo:           new (window.Metal ? MetalUBO : UBO)(2),
      shaders:       new LinkedList(),
      name:          name,
    };
    if (scene) scene._lightingData = obj;
    _scenes[name] = obj;
    return this;
  };

  this.useScene = function (name) {
    _activeScene = _scenes[name];
    if (!_activeScene) throw `Scene ${name} not found`;
    loop();
    return this;
  };

  this.destroyScene = function (name) { delete _scenes[name]; };

  /*
   * Register a light with the scene it lives in. First push also:
   *   - Decides whether to use the UBO path: gated on Renderer.UBO
   *     capability + not-AURA + not-WebVR; force-enabled under Metal.
   *   - Starts the per-frame loop (`Render.onDrawFrame(loop)`), or under
   *     WebVR routes it through `World.NUKE`'s render pipeline instead.
   *   - Flags the scene as `hasAreaLight` if any contributing light has
   *     `isAreaLight` — controls the AreaLightUtil hookup later.
   */
  this.push = this.add = function (light) {
    self.UBO = Renderer.UBO && !(window.AURA || RenderManager.type == RenderManager.WEBVR);
    if (window.Metal) self.UBO = true;

    const scene = findParentScene(light);
    scene.lights.push(light);
    if (light.isAreaLight) scene.hasAreaLight = true;

    if (!self.startedLoop) {
      self.startedLoop = true;
      if (RenderManager.type == RenderManager.WEBVR) self.startRender(loop, World.NUKE);
      else                                           Render.onDrawFrame(loop);
    }
  };

  this.remove = function (light) { _activeScene.lights.remove(light); };

  /*
   * Per-shader lighting wire-up — called by Shader the first time it draws
   * (or when forced by `force`). Idempotent for the same shader.
   *
   * Effects:
   *   1. Register the shader with the owning scene's shader list (so the
   *      per-frame `loop` knows about it).
   *   2. AreaLightUtil hookup if the scene has any area lights.
   *   3. Allocate the six packed-light arrays on `shader.__lighting`.
   *   4. If the scene has no lights yet, return the (empty) arrays — the
   *      shader still compiles its `lights {}` UBO block, just with empty
   *      data; once a light is added, `loop` will populate it.
   *   5. Install the six `v4v` (vec4-array) uniforms on the shader, all
   *      aliased to the same arrays under `__lighting`. The renderer's
   *      uniform dispatch sees `lightUBO: true` and routes through the
   *      shared UBO rather than per-shader upload.
   *   6. Initial `updateArrays` pass + first-use UBO commit.
   */
  this.getLighting = function (shader, force) {
    if (shader.__lighting && !force) return shader.__lighting;

    const scene = findParentScene(shader.mesh);
    scene.shaders.push(shader);
    if (window.AreaLightUtil && scene.hasAreaLight) AreaLightUtil.append(shader);

    const lighting = shader.__lighting = {
      position: [], color: [], data: [], data2: [], data3: [], properties: [],
    };

    if (!scene.lights.length) return shader.__lighting;

    const lightUBO = self.UBO;
    const mkSlot = (value) => ({
      type: 'v4v', value, ignoreUIL: true, lightUBO, components: 4, metalIgnore: true,
    });
    shader.uniforms.lightPos        = mkSlot(lighting.position);
    shader.uniforms.lightColor      = mkSlot(lighting.color);
    shader.uniforms.lightData       = mkSlot(lighting.data);
    shader.uniforms.lightData2      = mkSlot(lighting.data2);
    shader.uniforms.lightData3      = mkSlot(lighting.data3);
    shader.uniforms.lightProperties = mkSlot(lighting.properties);

    updateArrays(shader);
    if (self.UBO && !_activeScene.ubo.created) createUBO(shader.uniforms);
    return shader.__lighting;
  };

  /* Drop a shader from the per-scene shader list (called by Shader.destroy
   * when `receiveLight` is set). The `findParentScene` call is preserved
   * for its side-effect of resolving the scene before the removal. */
  this.destroyShader = function (shader) {
    findParentScene(shader.mesh);
    _activeScene.shaders.remove(shader);
  };

  this.sort = function (callback) { _activeScene.lights.sort(callback); };

  // ── shadow-group bookkeeping (consumed by the shadow render pass) ────────
  this.addToShadowGroup = function (light) {
    findParentScene(light).renderShadows.push(light);
  };
  this.removeFromShadowGroup = function (light) {
    findParentScene(light);
    _activeScene.renderShadows.remove(light);
  };
  this.getShadowLights = function () { return _activeScene.renderShadows; };
  this.getShadowCount  = function () { return _activeScene.renderShadows.length; };

  /*
   * Create the depth-pass companion shader for a receive-shadow shader.
   * Skips entirely if the renderer isn't doing shadows or the scene has
   * zero shadow-casting lights. The shadow shader reuses:
   *   - the host shader's vsName (so vertex transforms match)
   *   - a depth-only fs (`ShadowDepth` by default; overridable via
   *     `customShadowShader`).
   *   - any user vertexShader / restoreVS string so hot-reload edits
   *     carry over.
   *   - the same defines (plus a `resetProgram` to recompile).
   *   - linked uniforms (so per-instance values stay in sync between
   *     color and depth passes).
   */
  this.initShadowShader = function (object, mesh) {
    let scene;
    const shader = object.shader || object;
    if (shader.mesh) {
      for (let p = shader.mesh._parent; p; p = p._parent) {
        if (p instanceof Scene && p._lightingData) scene = p._lightingData;
      }
    }
    if (!scene) scene = _activeScene;
    if (!World.RENDERER.shadows || 0 == scene.renderShadows.length) return '';

    if (!shader._gl) shader.upload();

    const vsName = shader.vsName;
    let fsName = 'ShadowDepth';
    if (shader.customShadowShader) fsName = shader.customShadowShader;

    shader.shadow = new Shader(vsName, fsName, {
      receiveLight:  shader.receiveLight,
      UILPrefix:     shader.UILPrefix,
      precision:     'high',
      customCompile: vsName + ' ' + fsName,
    });

    if (shader.vertexShader)  shader.shadow.vertexShader = shader.vertexShader;
    if (shader.restoreVS)     shader.shadow.vertexShader = shader.restoreVS;
    if (shader.customCompile) shader.shadow.customCompile = shader.customCompile + '_shadow';
    if (shader.defines) {
      shader.shadow.defines = shader.defines;
      shader.shadow.resetProgram();
    }

    shader.shadow.lights   = shader.lights;
    shader.shadow.isShadow = true;
    shader.copyUniformsTo(shader.shadow, true);   // linked uniforms — share refs
    shader.shadow.upload();
  };

  /*
   * GLSL block injected into receive-shadow shaders by `Shader.process` via
   * the `__ACTIVE_THEORY_LIGHTS__` marker:
   *   #define SHADOW_MAPS N
   *   #define SHADOWS_{LOW,MED,HIGH}      (quality preset selector)
   *   uniform sampler2D shadowMap[N];
   *   uniform mat4      shadowMatrix[N];   // light's view-proj matrices
   *   uniform vec3      shadowLightPos[N]; // for slope/distance heuristics
   *   uniform float     shadowSize[N];     // map resolution, for filter scale
   * Returns '' if shadows are disabled or the scene has zero shadow casters.
   */
  this.getShadowUniforms = function (shader) {
    let scene;
    if (shader.mesh) {
      for (let p = shader.mesh._parent; p; p = p._parent) {
        if (p instanceof Scene && p._lightingData) scene = p._lightingData;
      }
    }
    if (!scene) scene = _activeScene;
    if (!World.RENDERER.shadows || 0 == scene.renderShadows.length) return '';

    const n = scene.renderShadows.length;
    return [
      `\n#define SHADOW_MAPS ${n}`,
      World.RENDERER.shadows == Renderer.SHADOWS_LOW  ? '#define SHADOWS_LOW'  : '',
      World.RENDERER.shadows == Renderer.SHADOWS_MED  ? '#define SHADOWS_MED'  : '',
      World.RENDERER.shadows == Renderer.SHADOWS_HIGH ? '#define SHADOWS_HIGH' : '',
      `uniform sampler2D shadowMap[${n}];`,
      `uniform mat4      shadowMatrix[${n}];`,
      `uniform vec3      shadowLightPos[${n}];`,
      `uniform float     shadowSize[${n}];`,
    ].join('\n');
  };

  // Connect a shader's `lights {}` block to the per-scene UBO at its
  // binding point. Called from the shader-renderer right before draw.
  this.bindUBO = function (shader) {
    if (_activeScene.ubo.created) _activeScene.ubo.bind(shader, 'lights');
  };

  this.fallbackAreaToPointTest = function () { return self.fallbackAreaToPoint; };
  this.get('activeScene', (_) => _activeScene);

  /*
   * Allow-list: lets callers permit a specific renderable to be lit by a
   * specific light in the shadow pass, even when its own
   * `onBeforeRenderShadow(light)` would otherwise return false. We lazily
   * install a wrapping `onBeforeRenderShadow` that returns false only when
   * the light is NOT in the allow-list (and the original hook said no).
   * The allow-list is a WeakMap so released lights GC cleanly.
   */
  this.renderShadowsAllowLight = function (object, light) {
    if (!object._renderShadowsAllowLights) {
      const allowed = new WeakMap();
      object._renderShadowsAllowLights = allowed;
      const prev = object.onBeforeRenderShadow;
      object.onBeforeRenderShadow = function (renderLight) {
        const result = prev && prev.apply(this, arguments);
        return !allowed.has(renderLight) || result;
      };
    }
    object._renderShadowsAllowLights.set(light.light || light, true);
  };
}, 'static');

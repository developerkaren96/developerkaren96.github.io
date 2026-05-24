/*
 * FXScene — heavier sibling of FXLayer for self-contained render-to-
 * texture sub-scenes. Unlike FXLayer it owns its own RT (or RTPool slot),
 * supports VR-eye scheduling, optional multisample / multi-render-target,
 * post-processing pass chains, scissoring, and depth-texture attachment.
 *
 * High-level differences from FXLayer:
 *   - Always operates in clone mode (FXLayer's "draw-buffers"
 *     hijacking lives elsewhere — FXScene's MRT support is via real
 *     MultiRenderTarget objects on the scene's own RT).
 *   - Lifecycle is more elaborate: RTs may be borrowed from an RTPool
 *     (released on `onInvisible`, re-borrowed on `onVisible`) and
 *     destroyed on `onDestroy`.
 *   - Two VR modes: `vrWorldMode` mixes the FXScene's nodes back into
 *     the world Scene under a shared Group so they participate in the
 *     main render; `vrSceneMode` renders an extra pass on top of the
 *     existing target without clearing.
 *
 * Constructor: `new FXScene(parentNuke, type, ...rest)`
 *   `_parentNuke` is either a Nuke (auto-`create`d) or untouched.
 *   `create(nuke, rt?, options?)` is overloaded:
 *     - `rt` may be an RTPool — its `.nullRT` is used as the sentinel
 *       until the first `onVisible` fetches a live RT from the pool.
 *     - `nuke` may itself be an RTPool (then `rt` shifts into options).
 *     - `rt` may be `{ ...options }` if it has no `.isRT`.
 *
 * Options of note:
 *   format, type           — texture format/type for the RT (RGBA/UNSIGNED_BYTE default).
 *   vr, vrMode             — opts into VR-aware RT (one per eye).
 *   parentNuke             — explicit parent override.
 *   multisample, samplesAmount — MSAA on the nuke (auto-resolved post-render).
 *   multiRenderTarget      — uses MultiRenderTarget instead of RenderTarget.
 *   mipmaps                — enables mipmapped sampling.
 *   manualRender           — skip auto per-frame draw subscription.
 *
 * Per-frame draw:
 *   - Throttled to avoid sub-half-frame double-renders (warns in
 *     Hydra.LOCAL the first time it sees an over-eager re-entry).
 *   - VR scene-mode short-circuits: re-renders directly into the
 *     world Nuke's rttBuffer with clearDepth + autoClear=false, so it
 *     stacks on whatever was rendered before.
 *   - Otherwise the standard "mirror source objects' world matrices
 *     into clones, then render the scene into _rt" pipeline.
 *   - `clearColor` / `clearAlpha` overrides are pushed/popped around
 *     the render so they don't leak into the main render path.
 *   - `forceVisible` + `cloneVisible` skip the source-visibility check
 *     and use the clone's own `isVisible` flag.
 *   - `RenderStats.update('FXScene', 1, self)` records the cost.
 *   - On finish, `RenderManager.fire(self)` lets downstream consumers
 *     react (typically for VR / composite passes).
 *
 * RTPool integration:
 *   - `_rtPool.putRT(rt)` returns the RT to the pool when invisible /
 *     destroyed; `_rtPool.getRT()` re-fetches when visible again. This
 *     lets dozens of conditionally-visible effects share a few large
 *     textures.
 *
 * Other methods:
 *   - addPass / removePass         — post-processing chain on the nuke.
 *   - setSize / setDPR / setResolution
 *                                  — resize plumbing.
 *   - setScissor(x, y, w, h, inv)  — sub-rect rendering (normalised coords).
 *     `invert=true` keeps y top-aligned; default flips for the GL convention.
 *   - useRT(rt)                    — switch RT in-place (used by the pool).
 *   - useCamera(c) / useScene(s)   — swap the nuke's inputs without recreating.
 *   - upload()                     — forward an upload tick to the RT.
 *   - createDepthTexture(useRTTBuffer)
 *                                  — attach a depth texture so a downstream
 *                                    pass can sample scene depth. If post-
 *                                    processing is present, the attachment
 *                                    goes on the nuke's intermediate rttBuffer
 *                                    instead of the final RT.
 *   - vrWorldMode / vrSceneMode    — VR pipeline hooks (see header).
 */
Class(function FXScene(_parentNuke, _type, ...rest) {
  Inherit(this, Component);

  let _nuke;
  let _rt;
  let _rtPool;
  let _showManualRenderWarning;
  const self = this;
  let _scene = new Scene();
  const _id = Utils.timestamp();
  const _objects = [];
  let _renderTime = Render.TIME;
  let _visible = true;

  function resizeHandler() {
    if (_rt.setSize) {
      _rt.setSize(
        _nuke.stage.width  * self.resolution * _nuke.dpr,
        _nuke.stage.height * self.resolution * _nuke.dpr,
      );
    }
    self.nuke.setSize(_rt.width, _rt.height);
    self.width  = _rt.width;
    self.height = _rt.height;
  }

  this.resolution = 1;
  this.autoVisible = true;
  this.enabled = true;
  this.scene = _scene;
  this.renderShadows = true;

  this.set('visible', (v) => {
    if (!self.scene) return;
    self.scene.visible = v;
    _visible = v;
    self.onFXSceneVisibility?.(v);
  });
  this.get('visible', () => _visible);

  /*
   * Visibility hooks: when hidden, return the RT to the pool; when
   * visible again, borrow a fresh one. `needsOnVisible` flag prevents
   * double-fires when the source object cycles visibility within a tick.
   */
  this.onInvisible = this.fxInvisible = function () {
    if (this.scene.visible) {
      this.scene.visible = false;
      self.flag('needsOnVisible', true);
    }
    if (_rtPool) _rtPool.putRT(self.rt);
  };

  this._bindOnDestroy(function () {
    if (_rtPool) _rtPool.putRT(self.rt);
  });

  this.onVisible = this.fxVisible = function () {
    if (self.flag('needsOnVisible')) {
      this.scene.visible = true;
      self.flag('needsOnVisible', false);
    }
    if (_rtPool) {
      self.useRT(_rtPool.getRT());
      resizeHandler();
    }
  };

  /*
   * Initialise. See header for the argument overloading.
   */
  this.create = function (nuke = World.NUKE, rt, options) {
    if (self.nuke) return;

    // Decode argument shape.
    if (rt instanceof RTPool) {
      _rtPool = rt;
      rt = _rtPool.nullRT;
    }
    if (nuke instanceof RTPool) {
      options = rt;
      _rtPool = nuke;
      rt = _rtPool.nullRT;
      nuke = World.NUKE;
    } else if (rt && typeof rt === 'object') {
      if (!rt.isRT) {
        options = rt;
        rt = undefined;
      }
    } else if (!nuke || !(nuke instanceof Nuke)) {
      options = nuke;
      nuke = World.NUKE;
    }
    if (!options) options = {};

    self.rtFormat = options.format || Texture.RGBFormat;
    self.rtType   = options.type   || Texture.UNSIGNED_BYTE;
    if (options.vr || options.vrMode) self.vrRT = RenderManager.type === RenderManager.VR;
    if (options.parentNuke) nuke = options.parentNuke;

    self.scene = _scene;
    self.nuke = _nuke = self.initClass(Nuke, nuke.stage, {
      renderer:      nuke.renderer,
      camera:        nuke.camera,
      scene:         _scene,
      dpr:           nuke.dpr,
      format:        options.format,
      vrRT:          self.vrRT,
      multisample:   options.multisample,
      samplesAmount: options.samplesAmount,
    });
    _scene.nuke = _nuke;

    (function initRT(rt, options = {}) {
      // FLOAT → RGBA; on iOS swap to HALF_FLOAT + NEAREST sampling
      // (no linear-filtering of full FLOAT on the driver).
      if (options.type === Texture.FLOAT) {
        options.format = Texture.RGBAFormat;
        if (Device.system.os === 'ios') {
          options.type = Texture.HALF_FLOAT;
          options.minFilter = Texture.NEAREST;
          options.magFilter = Texture.NEAREST;
        }
      }
      const RT = self.nuke.useDrawBuffers && options.multiRenderTarget ? MultiRenderTarget : RenderTarget;
      self.width  = _nuke.stage.width  * self.resolution * _nuke.dpr;
      self.height = _nuke.stage.height * self.resolution * _nuke.dpr;
      const magFilter = Texture.LINEAR;
      const minFilter = options.mipmaps ? Texture.LINEAR_MIPMAP : Texture.LINEAR;
      _rt = rt || new RT(self.width, self.height, Object.assign(
        { minFilter, magFilter, generateMipmaps: options.mipmaps || false },
        options,
      ));
      _nuke.rtt = self.rt = _rt;
      _rt.fxscene = self;
      if (self.vrRT) _rt.vrRT = true;
    })(rt, options);

    if (rt) {
      // Caller-supplied RT — mark for pool recycle on destroy.
      self.flag('recycle_rt', true);
    } else {
      self.events.sub(Events.RESIZE, resizeHandler);
    }

    if (FXScene.onCreate) FXScene.onCreate(self);

    // Auto per-frame draw unless opted out. VR splits the loop across
    // both eyes — only run on eye index 0 (the second eye reads the
    // already-rendered RT).
    if (!options.manualRender && !self.manualRender && !FXScene.manualRender) {
      if (Hydra.LOCAL) _showManualRenderWarning = true;
      if (self.vrRT) {
        self.startRender(({ view }) => {
          if (view !== 0 || self.manualRender) return;
          self.draw();
        }, RenderManager.EYE_RENDER);
      } else {
        self.startRender(() => { if (!self.manualRender) self.draw(); }, nuke);
      }
    }
  };

  this.onDestroy = this.fxDestroy = function () {
    self.scene.deleted = true;
    if (self.flag('recycle_rt')) {
      if (_rtPool && _rt) _rtPool.putRT(_rt);
    } else if (_rt && _rt.destroy) {
      _rt.destroy();
    }
  };

  /*
   * Resize the RT (and the nested Nuke). `exact=true` skips the
   * resolution+DPR scaling — caller has already computed real pixels.
   */
  this.setSize = function (width, height, exact) {
    if (!_nuke) return;
    if (!exact) {
      width  = width  * self.resolution * _nuke.dpr;
      height = height * self.resolution * _nuke.dpr;
    }
    if (_rt.width === width && _rt.height === height) return;
    self.events.unsub(Events.RESIZE, resizeHandler);
    self.width  = width;
    self.height = height;
    if (_rt) _rt.setSize(self.width, self.height);
    _nuke.setSize(self.width, self.height);
  };

  /*
   * Register a source object: clones it into the FX scene and tags the
   * cloned shader's `_attachmentData` so the renderer binds matching
   * RT formats. Returns the clone.
   */
  this.add = this.addObject = function (object) {
    if (!object) return console.error('FXScene addObject undefined!');
    if (!object.shader) return;
    const clone = object.clone();
    object['clone_' + _id] = clone;
    _scene.add(clone);
    _objects.push(object);
    object.shader._attachmentData = {
      format:      self.rtFormat,
      type:        self.rtType,
      attachments: 1,
    };
    while (clone.children.length) clone.remove(clone.children[0]);
    return clone;
  };

  this.removeObject = function (object) {
    _scene.remove(object['clone_' + _id]);
    _objects.remove(object);
    delete object['clone_' + _id];
  };

  /*
   * Sub-rect rendering. Coordinates are normalised in [0, 1]; `invert`
   * keeps y top-aligned (default flips to GL's bottom-origin convention).
   * Pass `null` to clear the scissor entirely.
   */
  this.setScissor = function (x, y, w, h, invert) {
    if (x === null) {
      this.scissor = this.rt.scissor = null;
      return;
    }
    const width  = _rt.width;
    const height = _rt.height;
    if (!this.scissor) this.scissor = new Vector4();
    this.scissor.x = x * width;
    this.scissor.y = invert ? y * height : height - h * height - y * height;
    this.scissor.width  = w * width;
    this.scissor.height = h * height;
    this.rt.scissor = this.scissor;
  };

  /*
   * Render the FX scene into its RT.
   */
  this.render = this.draw = function (stage, camera) {
    if (self.preventRender) return;

    // VR world mode — main loop handles draw. Just fire the hook.
    if (self.isVrWorldMode) {
      if (self.onBeforeRender) self.onBeforeRender();
      return;
    }

    // Re-entry guard — avoid double-drawing within the same vsync.
    if (!self.manualRender && Render.TIME - _renderTime < 1e3 / Render.REFRESH_RATE / 2) {
      if (_showManualRenderWarning) {
        console.warn(
          `FXScene ${Utils.getConstructorName(self)} rendering early (${Math.round(Render.TIME - _renderTime, 3)}ms elapsed, expected ~${Math.round(1e3 / Render.REFRESH_RATE, 3)}ms. Set manualRender option if using own render loop.`,
        );
        _showManualRenderWarning = false;
      }
      return;
    }
    _renderTime = Render.TIME;

    // VR scene mode — stack a pass on top of the live world render.
    if (self.isVrSceneMode) {
      const rt = World.NUKE.enabled && World.NUKE.passes.length ? World.NUKE.rttBuffer : undefined;
      const autoClear = _nuke.renderer.autoClear;
      _nuke.renderer.autoClear = false;
      _nuke.renderer.clearDepth(rt);
      if (self.onBeforeRender) self.onBeforeRender();
      _nuke.renderer.render(_scene, _nuke.camera, rt);
      _nuke.renderer.autoClear = autoClear;
      return;
    }

    if (stage) {
      self.events.unsub(Events.RESIZE, resizeHandler);
      self.nuke.stage = stage;
      self.setSize(stage.width, stage.height);
    }
    if (camera) self.nuke.camera = camera;

    // Push clearColor / clearAlpha overrides for this render.
    let clearColor = null;
    let alpha = 1;
    if (self.clearColor) {
      clearColor = _nuke.renderer.getClearColor().getHex();
      _nuke.renderer.setClearColor(self.clearColor);
    }
    if (self.clearAlpha > -1) {
      alpha = _nuke.renderer.getClearAlpha();
      _nuke.renderer.setClearAlpha(self.clearAlpha);
    }
    if (!self.renderShadows) _nuke.renderer.overridePreventShadows = true;

    // Mirror each registered object's transform into its clone.
    for (let i = _objects.length - 1; i > -1; i--) {
      const obj = _objects[i];
      const clone = obj['clone_' + _id];
      if (self.forceVisible || obj.cloneVisible) {
        clone.visible = typeof clone.isVisible !== 'boolean' || clone.isVisible;
      } else {
        clone.visible = obj.determineVisible();
      }
      if (!clone.visible) continue;
      obj.updateMatrixWorld(obj.visible === false || undefined);
      if (obj.ignoreMatrix) continue;
      Utils3D.decompose(obj, clone);
      if (clone.overrideScale) clone.scale.setScalar(clone.overrideScale);
    }

    // Caller may skip the actual RT draw (used when they only want
    // the matrix-decompose side-effect, e.g. for shadow projection).
    if (!self.preventRTDraw) {
      RenderStats.update('FXScene', 1, self);
      if (self.onBeforeRender) self.onBeforeRender();
      _nuke.rtt = _rt;
      _nuke.render();
    }
    _nuke.renderer.overridePreventShadows = false;
    if (self.clearColor)        _nuke.renderer.setClearColor(clearColor);
    if (self.clearAlpha > -1)   _nuke.renderer.setClearAlpha(self.clearAlpha);

    RenderManager.fire(self);
  };

  this.setDPR = function (dpr) {
    if (!_nuke) return self;
    _nuke.dpr = dpr;
    resizeHandler();
    return self;
  };

  this.addPass    = function (pass) { if (_nuke) _nuke.add(pass);    };
  this.removePass = function (pass) { if (_nuke) _nuke.remove(pass); };

  this.setResolution = function (res) {
    self.resolution = res;
    if (_rt.vrRT) _rt.vrRT = res;
    resizeHandler();
    return this;
  };

  this.useRT = function (rt) {
    _rt = self.rt = rt;
    if (self.vrRT) rt.vrRT = true;
  };

  this.upload = function () {
    if (_rt) _rt.upload();
  };

  this.useCamera = function (camera) {
    if (self.nuke) self.nuke.camera = camera.camera || camera;
  };

  this.useScene = function (scene) {
    self.nuke.scene = scene;
  };

  /*
   * "World" VR mode — splice the FX scene's nodes into a Group under
   * the world Scene so they participate in the main render rather than
   * having an isolated RT.
   */
  this.vrWorldMode = function () {
    self.isVrWorldMode = true;
    self.group = new Group();
    for (let i = 0; i < this.scene.children.length; i++) {
      this.group.add(this.scene.children[i]);
    }
    _scene = self.scene = self.group;
    World.SCENE.add(self.group);
  };

  /*
   * "Scene" VR mode — keep our own scene, but draw it as an extra pass
   * stacked on top of the world Nuke's output. Disables autoClear so
   * the prior render stays intact.
   */
  this.vrSceneMode = function () {
    self.isVrSceneMode = true;
    World.NUKE.autoClear = false;
    RenderManager.renderer.autoClear = false;
  };

  /*
   * Lazily attach a depth texture. If we have a pass chain (or the
   * caller forces it), the attachment goes on the intermediate
   * rttBuffer so the passes can sample depth before tonemap/composite.
   */
  this.createDepthTexture = function (useRTTBuffer) {
    if (!self.depthTexture) {
      if (self.nuke.passes.length || useRTTBuffer) {
        self.nuke.rttBuffer.createDepthTexture();
        self.depthTexture = self.nuke.rttBuffer.depth;
      } else {
        self.rt.createDepthTexture();
        self.depthTexture = self.rt.depth;
      }
    }
    return self.depthTexture;
  };

  if (_parentNuke instanceof Nuke) this.create(_parentNuke, _type, ...rest);
});

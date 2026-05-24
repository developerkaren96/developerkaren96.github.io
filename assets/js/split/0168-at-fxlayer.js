/*
 * FXLayer — render-to-texture sub-scene that participates in a parent
 * Nuke's compositing pipeline. Each layer holds:
 *
 *   - A private Scene (`_scene`) containing clones of the objects you
 *     register via `add(object)`.
 *   - A nested Nuke (`_nuke`) that re-uses the parent's renderer,
 *     camera, and DPR but renders into the layer's own RT.
 *   - A RenderTarget (`_rt`) or an MRT draw-buffer slot, depending on
 *     whether `useDrawBuffers` is on.
 *
 * Two operating modes:
 *
 *  1) **Clone mode** (`!_useDrawBuffers`)
 *     - When you `add(object)`, the layer makes a shader-cloned copy
 *       of the object and adds it to `_scene`. Each frame, `draw()`
 *       decomposes the source object's world matrix into the clone so
 *       the layer mirrors the original's transform.
 *     - The clone's fragment shader is rewritten:
 *         * `#drawbuffer Color` markers are stripped (Color is the
 *           default output — no override needed in clone mode).
 *         * Other `#drawbuffer` markers are erased.
 *         * `#applyShadow` is kept on the clone iff `renderShadows`.
 *       The original object's shader gets `#applyShadow` kept so the
 *       main pass continues to render shadowed.
 *
 *  2) **Draw-buffers mode** (`_useDrawBuffers`)
 *     - The layer attaches a new texture as an additional output slot
 *       on the parent Nuke (via `_parentNuke.attachDrawBuffer(texture)`),
 *       receiving a stable index it stashes in `_textureIndex`.
 *     - Instead of cloning, the layer rewrites the original mesh's
 *       fragment shader so its `#drawbuffer <name>` lines are routed
 *       to the right MRT output:
 *         * On WebGL2: prepends a `layout(location=N) out vec4 <name>;`
 *           declaration before `main()`.
 *         * On WebGL1 (without GL_EXT_draw_buffers shimmed by the
 *           preprocessor): rewrites `gl_FragColor` references inside
 *           the marked block to `gl_FragData[N]`.
 *       `#applyShadow` markers are activated. The shader's
 *       `_attachmentData` is populated so the renderer knows the slot
 *       formats it has to bind.
 *
 * Two-stage init: `create(nuke, type, rt)`
 *   `type` may be either:
 *     - The render-target's data type constant (Texture.FLOAT, ...), or
 *     - An options object: { type, format, useDrawBuffers, manualRender,
 *       mipmaps, rt }.
 *   On iOS, FLOAT RTs are silently downgraded to HALF_FLOAT (driver
 *   doesn't expose linear filtering of full-float). Mipmaps swap the
 *   filter mode to LINEAR_MIPMAP.
 *
 *   Auto-create: if the constructor argument is already a Nuke, init
 *   is run immediately. If it's an AppState-style config (an object
 *   with `isAppState`), the layer pulls its parent's nuke and forwards
 *   the rest of the config.
 *
 *   `manualRender || FXScene.manualRender` skips the auto per-frame
 *   draw subscription — the caller is expected to invoke `draw()`
 *   themselves (used when ordering matters: e.g. lighting passes that
 *   feed a later draw).
 *
 * Public methods of note:
 *   - add / addObject / removeObject — manage the registered list.
 *   - draw / render                  — explicit RT-only render call.
 *   - addPass / removePass           — proxy to the nested Nuke's passes.
 *   - setSize / setDPR / setResolution — resize handlers.
 *   - useRT(rt)                      — swap in a caller-supplied RT.
 *   - getName()                      — falls back to the constructor name.
 *
 * Visibility:
 *   `visible`, `onVisible`, `onInvisible` proxy through to the layer's
 *   internal Scene so the layer hides as a unit when its parent goes
 *   off-screen.
 */
Class(function FXLayer(_parentNuke, _type, _preventDrawBuffers = false) {
  Inherit(this, Component);

  let _nuke;
  let _rt;
  const self = this;
  const _scene = new Scene();
  const _objects = [];
  let _textureIndex = -1;
  let _visible = true;
  const _id = Utils.timestamp();
  const _name = Utils.getConstructorName(self);
  let _useDrawBuffers = !_preventDrawBuffers;

  this.resolution = 1;
  this.enabled = true;
  this.renderShadows = true;

  // Black background for RT clear (alpha 1 — opaque so alpha-blended
  // compositing reads sensible values where nothing was drawn).
  const CLEAR_COLOR = [0, 0, 0, 1];

  function resizeHandler() {
    if (!_rt.setSize) return;
    _rt.setSize(
      _nuke.stage.width * self.resolution * _nuke.dpr,
      _nuke.stage.height * self.resolution * _nuke.dpr,
    );
  }

  FXLayer.exists = true;

  this.set('visible', (v) => {
    _visible = v;
    self.scene.visible = v;
  });
  this.get('visible', () => _visible);

  this.onInvisible = function () { self.scene.visible = false; };
  this.onVisible   = function () { self.scene.visible = true;  };

  /*
   * Initialise the layer against a parent Nuke. `type` is either a
   * Texture.* data type constant or an options bag (see header).
   */
  this.create = function (nuke = World.NUKE, type, rt) {
    if (!nuke) return;
    let format;
    let manualRender;
    let mipmaps;

    _useDrawBuffers = nuke.useDrawBuffers;
    if (type && typeof type === 'object') {
      if (typeof type.useDrawBuffers === 'boolean') _useDrawBuffers = type.useDrawBuffers;
      format = type.format;
      manualRender = type.manualRender;
      mipmaps = type.mipmaps;
      if (!rt) rt = type.rt;
      type = type.type;
    }

    self.rtType    = type   || Texture.UNSIGNED_BYTE;
    self.rtFormat  = format || Texture.RGBFormat;
    self.rtMipmaps = mipmaps;
    self.scene = _scene;

    _nuke = self.initClass(Nuke, nuke.stage, {
      renderer: nuke.renderer,
      camera:   nuke.camera,
      scene:    _scene,
      dpr:      nuke.dpr,
      useDrawBuffers: false,
    });
    _parentNuke = self.parent.nuke || nuke;
    _nuke.parentNuke = _parentNuke;
    self.nuke = _nuke;

    (function initRT(rt) {
      if (_useDrawBuffers) {
        // MRT mode — attach a draw-buffer slot to the parent Nuke.
        const texture = new Texture();
        texture.minFilter = Texture.LINEAR;
        texture.magFilter = Texture.LINEAR;
        texture.format = Texture.RGBAFormat;
        if (self.rtType)   texture.type   = self.rtType;
        if (self.rtFormat) texture.format = self.rtFormat;
        if (self.rtMipmaps) {
          texture.generateMipmaps = true;
          texture.minFilter = texture.magFilter = Texture.LINEAR_MIPMAP;
        } else {
          texture.generateMipmaps = false;
        }
        // FLOAT textures must be RGBA (no FLOAT RGB on most drivers).
        if (texture.type === Texture.FLOAT) texture.format = Texture.RGBAFormat;
        texture.wrapS = texture.wrapT = Texture.CLAMP_TO_EDGE;
        texture.fxLayer = self;
        self.textureIndex = _textureIndex = _parentNuke.attachDrawBuffer(texture);
        _rt = { texture };
      } else {
        // iOS FLOAT → HALF_FLOAT (driver bug — full FLOAT can't be linear filtered).
        if (self.rtType === Texture.FLOAT && Device.system.os === 'ios') {
          self.rtType = Texture.HALF_FLOAT;
        }
        _rt = rt || Utils3D.createRT(
          Math.round(_nuke.stage.width  * self.resolution * _nuke.dpr),
          Math.round(_nuke.stage.height * self.resolution * _nuke.dpr),
          self.rtType,
          self.rtFormat,
        );
        if (self.rtMipmaps) {
          _rt.texture.minFilter = _rt.texture.magFilter = Texture.LINEAR_MIPMAP;
          _rt.texture.generateMipmaps = true;
        } else {
          _rt.texture.generateMipmaps = false;
        }
      }
      self.rt = _rt;
      self.nuke.setSize(_rt.width, _rt.height);
    })(rt);

    self.events.sub(Events.RESIZE, resizeHandler);

    // Auto per-frame draw unless explicitly opted out.
    if (!manualRender && !FXScene.manualRender) self.startRender(() => self.draw(), nuke);
  };

  /*
   * Register an object with the layer. Behaviour depends on mode —
   * see the header comment.
   *
   * Returns the clone (clone-mode) so callers can poke at it.
   */
  this.addObject = this.add = function (object) {
    if (!_nuke) return;

    if (!_useDrawBuffers) {
      // ── Clone mode ─────────────────────────────────────────
      const clone = object.clone();
      object['clone_' + _id] = clone;
      _scene.add(clone);
      _objects.push(object);

      if (object.shader) {
        (function editShader(mesh) {
          // Strip `#drawbuffer <name> ` markers and any leftover
          // `#drawbuffer` directives; in clone mode all output goes to
          // the single colour attachment.
          const modifyShader = (shader, name) => {
            let fs = shader._fragmentShader;
            if (!fs) return;
            const marker = '#drawbuffer ' + name;
            if (fs.includes(marker)) fs = fs.split(marker + ' ').join('');
            while (fs.includes('#drawbuffer')) {
              fs = fs.split('\n');
              for (let i = 0; i < fs.length; i++) {
                if (fs[i].includes('#drawbuffer')) fs[i] = '';
              }
              fs = fs.join('\n');
            }
            shader.fragmentShader = fs;
          };
          // `#applyShadow` either activates (strip the directive,
          // keeping the line) or erases the whole line.
          const applyShadow = (shader, on) => {
            let fs = shader.fragmentShader;
            if (!fs) return;
            while (fs.includes('#applyShadow')) {
              fs = fs.split('\n');
              for (let i = 0; i < fs.length; i++) {
                if (!fs[i].includes('#applyShadow')) continue;
                fs[i] = on ? fs[i].replace('#applyShadow', '') : '';
              }
              fs = fs.join('\n');
            }
            shader.fragmentShader = fs;
          };

          if (!mesh.shader._fragmentShader) mesh.shader._fragmentShader = mesh.shader.fragmentShader;
          modifyShader(mesh.shader, 'Color');
          const shader = mesh.shader.clone(!self.renderShadows, `-${self.name || _name}`);
          modifyShader(shader, self.name || _name);
          applyShadow(shader, self.renderShadows);
          applyShadow(mesh.shader, true);
          mesh.shader.copyUniformsTo(shader, true);
          mesh.shader = shader;
        })(clone);
      }

      // Drop the cloned children — only the top-level mesh is needed
      // here; the source's transform is what we mirror each frame.
      while (clone.children.length) clone.remove(clone.children[0]);
      return clone;
    }

    // ── MRT (draw-buffers) mode ───────────────────────────────
    if (object.shader && object.shader.fragmentShader) {
      (function editDBShader(mesh) {
        const WEBGL2 = Renderer.type === Renderer.WEBGL2;

        // Route the `#drawbuffer <name>` block to the right output —
        // either a named `layout(location=N) out vec4` (WebGL2) or
        // gl_FragData[N] (WebGL1 + EXT_draw_buffers).
        const modifyMarker = (fs, name, index) => {
          if (WEBGL2) {
            // Layer ordering quirk: if `reflectionsData` already
            // claims slot 0 we leave the FS alone.
            if (fs.includes('layout(location=0) out vec4 reflectionsData')) return fs;
            if (!fs.includes(`layout(location=${index})`)) {
              fs = fs.replace('out vec4 FragColor;', '');
              const mainAt = fs.indexOf('void main()');
              const before = fs.slice(0, mainAt);
              const after = fs.slice(mainAt);
              fs = before + `layout(location=${index}) out vec4 ${name};\n` + after;
            }
          }
          const marker = '#drawbuffer ' + name;
          if (fs.includes(marker)) {
            const split = fs.split(marker + ' ');
            const finalOut = WEBGL2 ? name : `gl_FragData[${index}]`;
            for (let i = 1; i < split.length; ++i) {
              split[i] = split[i].replace('gl_FragColor', finalOut);
            }
            fs = split.join('');
          }
          // Activate `#applyShadow` (strip the directive, keep the line).
          while (fs.includes('#applyShadow')) {
            fs = fs.split('\n');
            for (let i = 0; i < fs.length; i++) {
              if (fs[i].includes('#applyShadow')) fs[i] = fs[i].replace('#applyShadow', '');
            }
            fs = fs.join('\n');
          }
          return fs;
        };

        const shader = mesh.shader;
        let fs = shader.fragmentShader;
        const name = self.name || _name;

        if (!(WEBGL2 && fs.includes('location=0'))) fs = modifyMarker(fs, 'Color', 0);
        fs = modifyMarker(fs, name, _textureIndex);
        shader.fragmentShader = fs;
      })(object);

      // Surface the layer's RT format/type so the renderer can bind
      // matching attachments when this shader executes.
      object.shader._attachmentData = {
        format: self.rtFormat,
        type:   self.rtType,
        attachments: _parentNuke.attachments,
      };
    }
  };

  this.removeObject = function (object) {
    if (!_nuke) return;
    _scene.remove(object['clone_' + _id]);
    _objects.remove(object);
    delete object['clone_' + _id];
  };

  /*
   * Render the layer into its RT. No-op in MRT mode — the parent Nuke's
   * draw produces all attachments in one pass.
   */
  this.render = this.draw = function (stage, camera) {
    if (!_nuke || !self.enabled || _useDrawBuffers) return;
    if (!_parentNuke.enabled || !_objects.length) return;

    const oldClear = Renderer.CLEAR;
    Renderer.CLEAR = CLEAR_COLOR;
    if (stage) {
      _nuke.stage = stage;
      self.setSize(stage.width, stage.height);
    }
    _nuke.camera = camera || _nuke.parentNuke.camera;
    if (!self.renderShadows) _nuke.renderer.overridePreventShadows = true;

    // Mirror each registered object's world transform onto its clone.
    for (let i = _objects.length - 1; i > -1; i--) {
      const obj = _objects[i];
      const clone = obj['clone_' + _id];
      clone.visible = self.forceVisible ? true : obj.determineVisible();
      if (!clone.visible) continue;
      obj.updateMatrixWorld();
      if (!obj.ignoreMatrix) Utils3D.decompose(obj, clone);
    }

    _nuke.rtt = _rt;
    _nuke.render();
    RenderStats.update('FXLayer');
    _nuke.renderer.overridePreventShadows = false;
    Renderer.CLEAR = oldClear;
  };

  // Post-processing pass plumbing forwards to the nested Nuke.
  this.addPass    = function (pass) { if (_nuke) _nuke.add(pass);    };
  this.removePass = function (pass) { if (_nuke) _nuke.remove(pass); };

  /*
   * Resize the RT + nested Nuke to a new logical size. The actual GL
   * size factors in `resolution * dpr`. Disables the auto resize
   * listener once an explicit size is set — caller takes over.
   */
  this.setSize = function (width, height) {
    if (!_nuke) return;
    if (_rt.width === width && _rt.height === height) return;
    self.events.unsub(Events.RESIZE, resizeHandler);
    if (_rt) _rt.setSize(width * self.resolution * _nuke.dpr, height * self.resolution * _nuke.dpr);
    _nuke.setSize(width * self.resolution * _nuke.dpr, height * self.resolution * _nuke.dpr);
  };

  this.setDPR = function (dpr) {
    if (!_nuke) return;
    _nuke.dpr = dpr;
    resizeHandler();
  };

  this.setResolution = function (res) {
    self.resolution = res;
    resizeHandler();
  };

  this.getObjects = function () { return _objects; };

  // Swap in a caller-supplied RT (used by FXScene which routes one
  // shared RT through several layers).
  this.useRT = function (rt) { _rt = self.rt = rt; };

  this.getName = function () { return self.name || _name; };

  // Auto-init paths: Nuke as parent — straight create; AppState config —
  // pull the nuke off the parent and forward the rest of the config.
  if (_parentNuke instanceof Nuke) this.create(_parentNuke, _type);
  if (_parentNuke.isAppState) {
    const config = _parentNuke;
    this.create(self.parent.nuke || config.nuke, config);
    this.name = config.name;
  }
});

/*
 * RenderManager — the per-frame dispatcher / scheduler that drives
 * every "run this each frame" callback in the framework. Lives
 * above Hydra's raw render loop and below the World/Stage drawers.
 *
 * Schedule storage:
 *   - `_stringSchedules` (Map)  — for built-in named hooks like
 *     `BEFORE_RENDER`, `AFTER_LOOPS`, `RENDER_END`. String keys.
 *   - `_objectSchedules` (WeakMap) — for ad-hoc event objects
 *     (lets callers pass a Component or other identity as the
 *     event key without preventing GC). Same store, different
 *     keying.
 *   - `getSchedulesMap(evt)` returns the right one based on
 *     `typeof evt`, and `getSchedule(evt)` retrieves the callback
 *     array.
 *
 * Dispatch (`fire(evt, data)`):
 *   - Walks the array in order. Each callback that isn't flagged
 *     `markedForDeletion` is invoked with either the user-supplied
 *     `data`, or `(Render.TIME, Render.DELTA)` if no data was
 *     given (the typical "tick" signature).
 *   - Wraps every callback in `try / catch` so one buggy listener
 *     can't crash the whole frame: the error is published on
 *     `Render.RENDER_CALLBACK_ERROR` for dev tooling, then the
 *     callback is unscheduled (unless `preventStopRender` was set
 *     on the event, which lets debug observers keep firing through
 *     errors).
 *   - `_firingEvt` is set while a dispatch is in flight so
 *     `unschedule` calls made *from inside* a callback can defer
 *     removal (via `markedForDeletion`) instead of mutating the
 *     array mid-iteration; the deferred sweep runs after the loop.
 *
 * `_hasGLUI` / `_hasMetal` cache whether those rendering backends
 * are active so the per-frame fast paths can short-circuit.
 * `_dpr` lazily mirrors the device pixel ratio.
 *
 * The rest of the file exposes `schedule(cb, evt)` /
 * `unschedule(cb, evt)` plus the named event constants
 * (`BEFORE_RENDER`, `AFTER_LOOPS`, `RENDER_END`, etc.).
 */
Class(function RenderManager() {
  Inherit(this, Component);
  const self = this;
  var _hasGLUI,
    _hasMetal,
    _firingEvt,
    _dpr = null,
    _stringSchedules = new Map(),
    _objectSchedules = new WeakMap();
  function getSchedulesMap(evt) {
    return 'string' == typeof evt ? _stringSchedules : _objectSchedules;
  }
  function getSchedule(evt) {
    return getSchedulesMap(evt).get(evt);
  }
  function fire(evt, data) {
    let array = getSchedule(evt);
    if (array) {
      let len = array.length;
      for (let i = 0; i < len; i++) {
        let cb = array[i];
        if (!array.markedForDeletion.has(cb)) {
          _firingEvt = evt;
          try {
            data ? cb(data) : cb(Render.TIME, Render.DELTA);
          } catch (error) {
            let errorEvt = {
              callback: cb,
              error: error,
              preventStopRender: false,
            };
            Events.emitter._fireEvent(Render.RENDER_CALLBACK_ERROR, errorEvt);
            evt.preventStopRender || self.unschedule(cb, evt);
          }
        }
      }
      _firingEvt = undefined;
      array.markedForDeletion.size &&
        (array.markedForDeletion.forEach((_, cb) => {
          array.remove(cb);
        }),
        array.markedForDeletion.clear());
    }
  }
  function startFrame() {
    fire(self.FRAME_BEGIN);
  }
  function resizeHandler() {
    self.renderer && self.renderer.setSize(Stage.width, Stage.height);
  }
  function getDPR() {
    return window.AURA
      ? Device.pixelRatio
      : GPU.OVERSIZED
        ? 1
        : GPU.lt(0)
          ? Math.min(1.3, Device.pixelRatio)
          : GPU.lt(1)
            ? Math.min(1.8, Device.pixelRatio)
            : GPU.mobileLT(2)
              ? Math.min(2, Device.pixelRatio)
              : GPU.gt(4)
                ? Math.max(1.5, Device.pixelRatio)
                : Math.max(1.25, Device.pixelRatio);
  }
  function directRenderCallback(render) {
    _hasGLUI && _hasMetal && GLUI.renderDirect(render);
  }
  this.NORMAL = 'normal';
  this.MAGIC_WINDOW = 'magic_window';
  this.VR = this.WEBVR = 'webvr';
  this.AR = this.WEBAR = 'webar';
  this.RENDER = 'RenderManager_render';
  this.BEFORE_RENDER = 'RenderManager_before_render';
  this.POST_RENDER = this.FRAME_END = 'RenderManager_post_render';
  this.EYE_RENDER = 'RenderManager_eye_render';
  this.BEFORE_OBJECT_EYE_RENDER = 'RenderManager_before_object_eye_render';
  this.FRAME_BEGIN = 'RenderManager_frame_begin';
  this.AFTER_LOOPS = 'RenderManager_after_loops';
  this.NATIVE_FRAMERATE = 'RenderManager_native_framerate';
  this.READY = 'render_gl_ready';
  this.initialized = Promise.create();
  self.events.sub(Events.RESIZE, resizeHandler);
  Render.startFrame = startFrame;
  Hydra.ready((_) => {
    _hasGLUI = !!window.GLUI;
    _hasMetal = !!window.Metal;
  });
  this.get('DPR', (v) => getDPR());
  this.initialize = function (type, params = {}) {
    if (
      (self.camera && self.camera.destroy(),
      self.renderer && self.renderer.destroy(),
      (type != self.WEBVR && type != self.WEBAR) ||
        ((params.xrCompatible = true),
        (params.alpha = false),
        window.Ares && (params.alpha = true),
        window.XRDeviceManager && XRDeviceManager.antialias && (params.antialias = true)),
      !self.gl)
    ) {
      let camera = new PerspectiveCamera(45, Stage.width / Stage.height, 0.01, 200);
      self.gl = (function () {
        'safari' == Device.system.browser &&
          Device.system.browserVersion < 13 &&
          delete params.powerPreference;
        Utils.query('compat') && (params.forceWebGL1 = true);
        let renderer = new Renderer(params);
        return (
          renderer.setSize(Stage.width, Stage.height),
          renderer.setPixelRatio(getDPR()),
          renderer
        );
      })();
      self.scene = new Scene();
      self.nuke = self.initClass(
        Nuke,
        Stage,
        Object.assign(
          {
            renderer: self.gl,
            scene: self.scene,
            camera: camera,
            dpr: World.DPR,
          },
          params,
        ),
      );
    }
    switch (((_dpr = _dpr || World.DPR || 1), type)) {
      case self.WEBVR:
        self.renderer = self.initClass(VRRenderer, self.gl, self.nuke);
        self.camera = self.initClass(VRCamera);
        break;
      case self.WEBAR:
        self.renderer = self.initClass(ARRenderer, self.gl, self.nuke);
        self.camera = self.initClass(ARCamera);
        window.Ares &&
          (document.body.appendChild(self.gl.domElement),
          (self.gl.domElement.style.backgroundColor = 'transparent'),
          (document.body.style.backgroundColor = 'transparent'));
        break;
      case self.MAGIC_WINDOW:
        self.renderer = self.initClass(MagicWindowRenderer, self.gl, self.nuke);
        self.camera = self.initClass(VRCamera);
        break;
      case self.NORMAL:
        self.renderer = self.initClass(RenderManagerRenderer, self.gl, self.nuke);
        self.camera = self.initClass(RenderManagerCamera);
    }
    self.type = type;
    self.nuke.camera = self.camera.worldCamera;
    self.initialized.resolve();
  };
  this.render = function (scene, camera, renderTarget, forceClear) {
    fire(self.AFTER_LOOPS);
    self.type == self.VR && fire(World.NUKE);
    fire(self.BEFORE_RENDER);
    self.renderer.render(
      scene || self.scene,
      self.nuke.camera,
      renderTarget,
      forceClear,
      directRenderCallback,
    );
    self.events.fire(self.POST_RENDER);
    fire(self.POST_RENDER);
  };
  this.schedule = function (callback, slot) {
    let schedules = getSchedulesMap(slot),
      array = schedules.get(slot);
    array || ((array = []), (array.markedForDeletion = new Map()), schedules.set(slot, array));
    array.indexOf(callback) >= 0 ? array.markedForDeletion.delete(callback) : array.push(callback);
  };
  this.scheduleOne = function (callback, slot) {
    let result;
    'function' != typeof callback &&
      ((slot = callback), (result = Promise.create()), (callback = result.resolve));
    let array = getSchedule(slot);
    if (array) {
      if (array.find((h) => h.scheduleOneCallback === callback)) return;
    }
    let handler = function () {
      return (self.unschedule(handler, slot), callback.apply(this, arguments));
    };
    return ((handler.scheduleOneCallback = callback), self.schedule(handler, slot), result);
  };
  this.unschedule = function (callback, slot) {
    const array = getSchedule(slot);
    if (!array) return;
    const index = array.indexOf(callback);
    index < 0 ||
      (_firingEvt ? array.markedForDeletion.set(callback, true) : array.splice(index, 1));
  };
  this.setSize = function (width, height) {
    self.events.unsub(Events.RESIZE, resizeHandler);
    self.renderer.setSize(width, height);
  };
  this.fire = fire;
}, 'static');

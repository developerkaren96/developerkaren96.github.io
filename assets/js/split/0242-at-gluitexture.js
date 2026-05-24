/*
 * GLUITexture — captures a GLUI layout into a `RenderTarget` so it
 * can be used as a texture on any 3D mesh. Useful for stage-style
 * UI that needs to live inside the 3D scene (curved screens,
 * billboards, deformable surfaces) without being constrained to
 * screen-space.
 *
 * Construction:
 *   - Accepts either `(layout, w, h, rtPool?, strict?)` or, as a
 *     convenience, `(w, h, rtPool?, strict?)` — the leading number
 *     check shifts the args and synthesises a default `{ element:
 *     $gl() }` layout.
 *   - `strict` skips the DPR multiplier so the RT stays at the
 *     requested logical size (useful when texturing onto a fixed-
 *     resolution surface).
 *   - When an `_rtPool` is provided, the RT is leased from the pool
 *     on `onVisible` and returned on `onInvisible`. Otherwise a
 *     freshly created RGBA RT is owned by the instance.
 *   - Builds an orthographic camera viewport sized to the texture,
 *     parents the layout into its private Scene, and walks up the
 *     parent chain to find the nearest `nuke.camera` to use for
 *     ray casting (`_hitCamera`). Falls back to `World.CAMERA`.
 *   - Registers a `GLUIStageInteraction2D` with `_custom = true`
 *     so its pointer events come from the texture-side hit feeder
 *     rather than the global Mouse.
 *
 * Per-frame `render()`:
 *   - Toggles autoClear/clearAlpha so the RT clears to transparent
 *     even if the global renderer was set to clear to opaque.
 *   - Decrements `_needsRenderCount` (a "render N more frames"
 *     budget used by `setSize`, `onVisible`, etc. to ensure a
 *     fresh capture after layout changes).
 *   - `loop()` skips the render when `manualRender` is set and no
 *     dirty flags are pending — lets consumers gate expensive UIs.
 *
 * Hit feeding (`hitUpdate` / `missUpdate`):
 *   - Wired into `$glObj.mesh.onHitUpdate` so when the parent 3D
 *     mesh is raycast (by Interaction3D), the UV of the hit point
 *     is converted into stage pixels and fed into the private
 *     interaction. Supports both 2D mouse and XR finger inputs.
 *
 * `raycastMove(e)`:
 *   - Drives the `onDragMove` callback for code that wants the
 *     hit position even when there's no click — e.g. cursor
 *     trails, hover-driven layouts. Supports multi-controller XR
 *     by picking the closest hit when input is an array.
 *   - Emits `{ normal, tilt, pos, hit }` where `tilt` is the UV
 *     remapped to [-1, +1].
 *
 * Needs-render bookkeeping:
 *   - `_needsRender` is a one-shot "render at least one more
 *     frame" flag with a timer that flips it off after `time`ms.
 *   - `_needsRenderCount` is an N-frame budget (useful when a
 *     known animation needs N frames captured).
 *
 * Stage-layout-capture:
 *   - The layout's element is tagged `stageLayoutCapture = self`
 *     so descendant GLUI objects can walk up and discover that
 *     they're inside a texture (used by GLUIObject.mask and the
 *     interaction routers to know the right pixel dimensions).
 *
 * Public:
 *   - `setSize(w, h)`     — resize the camera viewport (and stage
 *                            bounds; doesn't resize the RT — that's
 *                            the pool's job).
 *   - `render()`          — force a single render.
 *   - `bindMove()`/`unbindMove()` — start/stop the `raycastMove`
 *     loop for drag-style interactions.
 *   - `object3d` setter/getter — the parent 3D mesh that hosts
 *     this RT (registered into Interaction3D).
 *   - `hitCamera` setter   — swap which camera does the raycast.
 *   - `enabled` / `mouseEnabled` setters — gate interaction.
 *   - `layout` setter      — swap the displayed layout.
 *   - `checkObjectHit` / `checkObjectFromValues` /
 *     `getObjectHitLocalCoords` — proxy hit tests through both
 *     the outer 3D ray and the inner 2D interaction so consumers
 *     can ask "is this inner GLUIObject under the current pointer?"
 *
 * Static:
 *   - `GLUITexture.createRTPool(w, h, strict?)` — convenience
 *     `RTPool` clone preconfigured to RGBA at the right pixel size.
 */
Class(
  function GLUITexture(_layout, _w, _h, _rtPool, _strict) {
    Inherit(this, Component);
    const self = this;
    var _rt,
      _camera,
      _hitCamera,
      _interaction,
      _ray,
      _needsRender,
      _rendered,
      _hitEvt,
      _usingFingers,
      $glObj,
      _needsRenderCount = 0,
      _needsRenderTimerCount = 0,
      _scene = new Scene(),
      _mouse = new Vector2(),
      _stage = new Vector2(),
      _v3 = new Vector3(),
      _enabled = true,
      _width = _w,
      _height = _h,
      _cacheHits = [];
    function loop() {
      _enabled && ((self.manualRender && !_needsRender && 0 == _needsRenderCount) || render());
    }
    function render() {
      let clearAlpha = World.RENDERER.getClearAlpha(),
        autoClear = World.RENDERER.autoClear;
      self.disableClear && (World.RENDERER.autoClear = false);
      let clearColor = World.RENDERER.getClearColor().getHex();
      clearColor > 0 ? World.RENDERER.setClearColor(0, 0) : World.RENDERER.setClearAlpha(0);
      World.RENDERER.render(_scene, _camera, _rt);
      clearColor > 0
        ? World.RENDERER.setClearColor(clearColor, clearAlpha)
        : World.RENDERER.setClearAlpha(clearAlpha);
      self.disableClear && (World.RENDERER.autoClear = autoClear);
      _needsRenderCount > 0 && (_needsRenderCount -= 1);
      _rendered = true;
    }
    function noop() {}
    function hitUpdate(hit) {
      let x = hit.uv.x * _width,
        y = (1 - hit.uv.y) * _height;
      _usingFingers = hit.usingFinger;
      self.isHitting = true;
      _mouse.set(x, y);
      _enabled &&
        _interaction &&
        (hit.usingFinger
          ? _interaction.testWithFinger(_mouse, hit.distance)
          : _interaction.testWith(_mouse));
    }
    function missUpdate() {
      self.isHitting = false;
      _mouse.set(9999, 9999);
      _interaction &&
        (_usingFingers ? _interaction.testWithFinger(_mouse, 9999) : _interaction.testWith(_mouse));
    }
    function raycastMove(e) {
      _ray || (_ray = self.initClass(Raycaster, _hitCamera));
      let hit,
        input = Interaction3D.find(_hitCamera).input;
      if (Array.isArray(input.obj)) {
        _cacheHits.length = 0;
        for (let i = 0; i < input.obj.length; i++) {
          let obj = input.obj[i];
          _v3.set(0, 0, -1).applyQuaternion(obj.quaternion);
          let hit = _ray.checkFromValues($glObj.mesh, obj.position, _v3)[0];
          hit && _cacheHits.push(hit);
        }
        _cacheHits.sort((a, b) => a.distance - b.distance);
        hit = _cacheHits[0];
      } else
        '2d' == input.type
          ? (hit = _ray.checkHit($glObj.mesh, input.position, input.rect || Stage)[0])
          : (_v3.set(0, 0, -1).applyQuaternion(input.quaternion),
            (hit = _ray.checkFromValues($glObj.mesh, input.position, _v3)[0]));
      _hitEvt ||
        (_hitEvt = {
          normal: new Vector2(),
          tilt: new Vector2(),
          pos: new Vector2(),
        });
      hit
        ? (_hitEvt.normal.set(hit.uv.x, 1 - hit.uv.y),
          _hitEvt.tilt.set(
            Math.range(_hitEvt.normal.x, 0, 1, -1, 1),
            Math.range(_hitEvt.normal.y, 0, 1, -1, 1),
          ),
          _hitEvt.pos.set(_hitEvt.normal.x * _width, _hitEvt.normal.y * _height),
          (_hitEvt.hit = hit),
          self.onDragMove && self.onDragMove(_hitEvt))
        : self.onDragMove && self.onDragMove(null);
    }
    function flipNeedsRender() {
      if (!(--_needsRenderTimerCount > 0))
        return _needsRender && !_rendered ? scheduleFlipNeedsRender() : void (_needsRender = false);
    }
    function scheduleFlipNeedsRender(time = 1) {
      _needsRenderTimerCount += 1;
      Timer.create(flipNeedsRender, time);
    }
    function doCheckObjectHit(object, callback) {
      if (self._invisible) return;
      let hit = callback(Interaction3D.find(_hitCamera));
      if (hit) {
        let x = hit.uv.x * _width,
          y = (1 - hit.uv.y) * _height;
        return _interaction.checkObjectHit(object, {
          x: x,
          y: y,
        });
      }
    }
    this.disableClear = false;
    (function () {
      'number' == typeof _layout &&
        ((_strict = _rtPool),
        (_rtPool = _h),
        (_h = _w),
        (_w = _layout),
        (_layout = {
          element: $gl(),
        }));
      _width = _w;
      _height = _h;
      'boolean' == typeof _rtPool && ((_strict = _rtPool), (_rtPool = null));
      let dpr = _strict ? 1 : RenderManager.DPR;
      _rtPool
        ? (self.rt = _rtPool.nullRT)
        : ((_rt = Utils3D.createRT(_width * dpr, _height * dpr, null, Texture.RGBAFormat)),
          (self.rt = _rt));
      self.root = _layout.element;
      self.root.stageLayoutCapture = self;
      _scene.add(_layout.element.group);
      (_camera = new OrthographicCamera()).setViewport(_width, _height);
      _camera.position.z = 1;
      _camera.position.x = _width / 2;
      _camera.position.y = -_height / 2;
      _scene.disableAutoSort = true;
      _stage.set(_width, _height);
      (function findHitCamera() {
        let p = self.parent;
        for (; p; ) {
          if (((_hitCamera = p.nuke?.camera), _hitCamera)) return;
          p = p.parent;
        }
        _hitCamera = World.CAMERA;
      })();
      _interaction = self.initClass(GLUIStageInteraction2D, _camera, _scene, _stage, true);
      self.startRender(loop, RenderManager.AFTER_LOOPS);
    })();
    this.onVisible = function () {
      _rtPool && (_rt = self.rt = _rtPool.getRT());
    };
    this.onInvisible = function () {
      _rtPool && _rtPool.putRT(_rt);
    };
    this.setSize = function (width, height) {
      _width = width;
      _height = height;
      _camera.setViewport(_width, _height);
      _camera.position.z = 1;
      _camera.position.x = _width / 2;
      _camera.position.y = -_height / 2;
      _stage.set(width, height);
    };
    this.render = function () {
      render();
    };
    this.get('object3d', () => $glObj);
    this.set('object3d', (gl) => {
      gl.mesh ||
        (gl = {
          mesh: gl,
        });
      ($glObj = gl).mesh.onHitUpdate = hitUpdate;
      $glObj.mesh.onMissUpdate = missUpdate;
      _hitCamera && Interaction3D.find(_hitCamera).add($glObj.mesh, noop, noop);
    });
    this.get('camera', () => _camera);
    this.set('hitCamera', (camera) => {
      camera != _hitCamera &&
        ($glObj && Interaction3D.find(_hitCamera).remove($glObj.mesh),
        (_hitCamera = camera),
        $glObj && Interaction3D.find(_hitCamera).add($glObj.mesh, noop, noop),
        _ray && (_ray.camera = _hitCamera));
    });
    this.set('enabled', (v) => {
      _interaction._disabled = !v;
      _enabled = v;
    });
    this.get('enabled', (_) => _enabled);
    this.set('mouseEnabled', (v) => {
      v
        ? ((_interaction._disabled = false),
          ($glObj.mesh.onHitUpdate = hitUpdate),
          ($glObj.mesh.onMissUpdate = missUpdate),
          _hitCamera && Interaction3D.find(_hitCamera).add($glObj.mesh, noop, noop))
        : ((_interaction._disabled = true),
          $glObj &&
            (_hitCamera && Interaction3D.find(_hitCamera).remove($glObj.mesh),
            delete $glObj.mesh.onHitUpdate,
            delete $glObj.mesh.onMissUpdate));
    });
    this.set('layout', (layout) => {
      _layout && _scene.remove(_layout.element.group);
      _scene.add(layout.element.group);
      _layout = layout;
    });
    this.get('layout', (_) => _layout);
    this.get('scene', (_) => _scene);
    this.get('width', (_) => _width);
    this.get('height', (_) => _height);
    this.onVisible = function () {
      _rtPool && (_rt = self.rt = _rtPool.getRT());
      self.needsRenderCount = 10;
    };
    this.onInvisible = function () {
      _rtPool &&
        self.rt != _rtPool.nullRT &&
        (_rtPool.putRT(self.rt), (_rt = self.rt = _rtPool.nullRT));
    };
    this.onDestroy = function () {
      _rtPool ? self.onInvisible() : self.rt.destroy();
      $glObj &&
        (Interaction3D.find(_hitCamera).remove($glObj.mesh),
        delete $glObj.mesh.onHitUpdate,
        delete $glObj.mesh.onMissUpdate);
    };
    this.bindMove = function () {
      self.startRender(raycastMove);
    };
    this.unbindMove = function () {
      self.stopRender(raycastMove);
    };
    this.get('needsRender', () => _needsRender);
    this.set('needsRender', (value) => {
      _needsRender = true;
      _rendered = false;
      scheduleFlipNeedsRender('number' == typeof value ? value : 1e3);
    });
    this.get('needsRenderCount', () => _needsRenderCount);
    this.set('needsRenderCount', (value) => {
      _needsRenderCount = Math.max(_needsRenderCount, value);
    });
    self.checkObjectHit = function (object, mouse) {
      return doCheckObjectHit(object, (interaction) =>
        interaction.checkObjectHit($glObj.mesh, mouse),
      );
    };
    self.checkObjectFromValues = function (object, origin, direction) {
      return doCheckObjectHit(object, (interaction) =>
        interaction.checkObjectFromValues($glObj.mesh, origin, direction),
      );
    };
    self.getObjectHitLocalCoords = function (v, object, mouse) {
      return (
        Interaction3D.find(_hitCamera).getObjectHitLocalCoords(v, $glObj.mesh, mouse),
        (mouse = {
          x: (0.5 + v.x) * _width,
          y: (0.5 - v.y) * _height,
        }),
        _interaction.getObjectHitLocalCoords(v, object.mesh, mouse)
      );
    };
  },
  (_) => {
    GLUITexture.createRTPool = function (width, height, strict) {
      let pool = RTPool.instance().clone({
          format: Texture.RGBAFormat,
        }),
        dpr = strict ? 1 : RenderManager.DPR;
      return (pool.setSize(width * dpr, height * dpr), pool);
    };
  },
);

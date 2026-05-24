/*
 * UserInputGazeSelector — singleton: VR "look-to-click" dwell
 * selector. A reticle plane parented to a wrapper Group is kept
 * in front of the camera; if the reticle's forward ray hits a
 * registered object for `trackingTime` ms (default 1500), a
 * synthetic click fires.
 *
 * Visual: `_mesh` is a `World.PLANE` with the `GazeSelector`
 * shader (additive blending, depth off, renderOrder 9999 so it
 * always sits on top). Uniforms drive the dwell-fill animation:
 *   - `uVisible`  0/1 — whether the reticle should be drawn.
 *   - `uAlpha`    background fill of the ring.
 *   - `uAlpha2`   foreground fill of the ring (inverse role).
 *   - `uTime`     0→1 sweep over `trackingTime` (the "filling
 *     circle" feedback).
 *
 * Render slot: uses `RenderManager.EYE_RENDER` in VR (so the
 * reticle is composited per-eye), `Camera.instance()` otherwise.
 *
 * Per-frame loops:
 *   - `loop` (always running when visible):
 *       - Smooths `_mouse` toward `Mouse.tilt` (parallax).
 *       - Positions reticle in front of camera via
 *         `Utils3D.positionInFrontOfCamera`.
 *       - Builds `_test` from visible bound objects.
 *       - Raycasts straight ahead (camera forward) — `[hit]`.
 *       - Hit: fires hover {action:'over'} on the object; calls
 *         `startTracking()`. If the same `_over` already had
 *         `__hasTracked` true, suppress re-trigger.
 *       - Miss: fires {action:'out'} and stops tracking.
 *   - `track` (only while a dwell is active, VR + `snapToPosition`):
 *       - Snaps the reticle onto the hit point and re-orients to
 *         face the camera (so the ring sticks to a surface).
 *
 * Tracking state machine:
 *   - `startTracking()` plays the alpha/time tweens and a
 *     `delayedCall(trackingTime)` that fires `__gazeClick({action:
 *     'click'})` on success, then `animateOut`.
 *   - `stopTracking()` cancels the timer, reverses alpha tweens,
 *     and (if dwell didn't finish) tweens `uTime` back to 0.
 *
 * Bind/unbind:
 *   - `bind(obj, hover, click)` stashes hover/click as
 *     `__gazeHover`/`__gazeClick` on the object; first bind also
 *     calls `animateIn()` (1.2→1 scale tween, `uVisible`→1).
 *   - `unbind(obj)` removes from list, clears hover, animates out
 *     if list became empty.
 *
 * Events (constants set on the class object):
 *   - `TRACKING_STARTED` / `TRACKING_STOPPED` (carries `{object,
 *     finished}`).
 *
 * `prevent` flag pauses hit-testing without tearing down state
 * (useful when a modal is up). `Dev.expose('gazeObjects', …)`
 * exposes the bound-object list for debugging.
 */
Class(
  function UserInputGazeSelector() {
    Inherit(this, Component);
    const self = this;
    var _over,
      _mesh,
      _shader,
      _wrapper,
      _objects = [],
      _test = [],
      _v3 = new Vector3(),
      _raycaster = Raycaster.find(World.CAMERA),
      _mouse = new Vector2(),
      lastDistance = 2;
    this.prevent = false;
    this.snapToPosition = false;
    this.trackingTime = 1500;
    const renderSlot =
      RenderManager.type === RenderManager.NORMAL ? Camera.instance() : RenderManager.EYE_RENDER;
    function startTracking() {
      self.tracking ||
        _shader.uniforms.uVisible.value < 0.5 ||
        ((self.tracking = true),
        (self.finishedTracking = false),
        _over && (_over.__hasTracked = true),
        self.events.fire(UserInputGazeSelector.TRACKING_STARTED, {
          object: _over,
        }),
        self.startRender(track, renderSlot),
        _shader.tween('uAlpha', 0.9, self.trackingTime / 3, 'easeOutSine'),
        _shader.tween('uAlpha2', 0.25, self.trackingTime / 3, 'easeOutSine'),
        _shader.set('uTime', 0),
        _shader.tween('uTime', 1, self.trackingTime, 'easeInOutSine'),
        (self.timeout = self.delayedCall((_) => {
          self.finishedTracking = true;
          stopTracking();
          self.animateOut();
          _over &&
            _over.__gazeClick &&
            _over.__gazeClick({
              action: 'click',
              mesh: _over,
            });
        }, self.trackingTime)));
    }
    function stopTracking() {
      self.tracking &&
        ((self.tracking = false),
        self.events.fire(UserInputGazeSelector.TRACKING_STOPPED, {
          object: _over,
          finished: self.finishedTracking,
        }),
        self.stopRender(track, renderSlot),
        self.timeout && clearTimeout(self.timeout),
        _shader.tween('uAlpha', 0.2, 500, 'linear'),
        _shader.tween('uAlpha2', 0.8, 500, 'linear'),
        self.finishedTracking || _shader.tween('uTime', 0, 1e3, 'easeOutSine'));
    }
    function positionSelector() {
      Utils3D.positionInFrontOfCamera(_wrapper, lastDistance);
    }
    function track() {
      if (!_over) return;
      _v3.set(0, 0, -1).applyQuaternion(World.CAMERA.quaternion);
      let [hit] = _raycaster.checkFromValues(_over, World.CAMERA.position, _v3);
      hit &&
        RenderManager.type == RenderManager.VR &&
        self.snapToPosition &&
        (_wrapper.position.copy(hit.point),
        (lastDistance = hit.point.distanceTo(World.CAMERA.position)),
        _wrapper.lookAt(World.CAMERA.position));
    }
    function loop() {
      if ((_mouse.lerp(Mouse.tilt, 0.1), positionSelector(), !_objects.length || self.prevent))
        return;
      _test.length = 0;
      for (let i = _objects.length - 1; i > -1; i--) {
        let obj = _objects[i];
        obj.determineVisible() && _test.push(obj);
      }
      _v3.set(0, 0, -1).applyQuaternion(World.CAMERA.quaternion);
      let [hit] = _raycaster.checkFromValues(_test, World.CAMERA.position, _v3);
      if (hit) {
        if (_over)
          !_over ||
            _over.__hasTracked ||
            _over.__preventTrack ||
            (_over.__gazeHover &&
              _over.__gazeHover({
                action: 'over',
                mesh: hit.object,
              }),
            startTracking());
        else {
          if ((((_over = hit.object).__hasTracked = false), _over.__preventTrack)) return;
          _over.__gazeHover &&
            _over.__gazeHover({
              action: 'over',
              mesh: hit.object,
            });
          startTracking();
        }
      } else
        _over &&
          (_over.__gazeHover &&
            _over.__gazeHover({
              action: 'out',
            }),
          (_over.__hasTracked = false),
          (_over = null),
          stopTracking());
    }
    !(function initMesh() {
      _wrapper = new Group();
      World.SCENE.add(_wrapper);
      _shader = self.initClass(Shader, 'GazeSelector', {
        uColor: {
          value: new Color(Colors.grey[0]),
        },
        uTime: {
          value: 0,
        },
        uAlpha: {
          value: 0,
        },
        uAlpha2: {
          value: 0.8,
        },
        uVisible: {
          value: 0,
        },
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: Shader.ADDITIVE_BLENDING,
      });
      self.mesh = _mesh = new Mesh(World.PLANE, _shader);
      _mesh.scale.setScalar(Device.mobile.phone ? 1.25 : 0.9);
      _wrapper.add(_mesh);
      _wrapper.renderOrder = 9999;
      positionSelector();
    })();
    this.bind = function (obj, hover, click) {
      _objects.some((el) => el.id === obj.id) ||
        ((obj.__gazeHover = hover),
        (obj.__gazeClick = click),
        _objects.push(obj),
        self.animateIn());
    };
    this.unbind = function (obj) {
      if (!obj) return;
      let lengthBefore = _objects.length;
      _objects = _objects.filter((el) => el.id !== obj.id);
      _over &&
        _over.id === obj.id &&
        (_over.__gazeHover &&
          _over.__gazeHover({
            action: 'out',
          }),
        (_over.__hasTracked = false),
        (_over = null),
        stopTracking());
      lengthBefore && 0 === _objects.length && self.isVisible && self.animateOut();
    };
    self.reset = function () {
      _shader.set('uTime', 0);
      _shader.tween('uAlpha', 0.2, 2e3, 'easeInOutSine');
      _shader.tween('uAlpha2', 0.8, 2e3, 'easeInOutSine');
      lastDistance = 2;
    };
    self.animateIn = function () {
      return (
        (self.isVisible = true),
        self.startRender(loop, renderSlot),
        (self.finishedTracking = false),
        _shader.tween('uVisible', 1, 2e3, 'easeInOutSine'),
        (_wrapper.scale.x = _wrapper.scale.y = 1.2),
        tween(
          _wrapper.scale,
          {
            x: 1,
            y: 1,
          },
          2e3,
          'easeInOutCubic',
        ).promise()
      );
    };
    self.animateOut = async function () {
      self.isVisible = false;
      _shader.tween('uTime', 0, 10, 'easeOutSine');
      await _shader.tween('uVisible', 0, 1e3, 'easeOutSine').promise();
      self.stopRender(loop, renderSlot);
      _over &&
        (_over.__gazeHover &&
          _over.__gazeHover({
            action: 'out',
          }),
        (_over.__hasTracked = false),
        (_over = null));
      stopTracking();
    };
    this.getMesh = function () {
      return _mesh;
    };
    Dev.expose('gazeObjects', () => _objects);
  },
  'singleton',
  () => {
    UserInputGazeSelector.TRACKING_STARTED = 'gaze_selector_tracking_started';
    UserInputGazeSelector.TRACKING_STOPPED = 'gaze_selector_tracking_stopped';
  },
);

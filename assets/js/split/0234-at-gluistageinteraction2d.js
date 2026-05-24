/*
 * GLUIStageInteraction2D — pointer/click router for the 2D GLUI
 * stage. Tracks the currently-hovered object (`_over`) and the
 * candidate-pressed object (`_click`), and dispatches `over`/`out`/
 * `click` events to the matching GLUIObjects via `_onOver`/`_onClick`.
 *
 * Wiring:
 *   - Listens to `Mouse.input` Interaction.MOVE / START / END.
 *   - Also listens to `Interaction3D.EXTERNAL_PRESS` and
 *     `EXTERNAL_RELEASE` so that AR/VR pointer rigs (3D rays) can
 *     replay a 2D start/end at the last-tested point — used by the
 *     finger-poke fallback path in `testWithFinger`.
 *
 * Hit testing:
 *   - Uses a lazily-created `Raycaster(_camera)` with
 *     `testVisibility = false` (visibility is already handled by
 *     `testObjects()` filtering out invisible candidates).
 *   - `testObjects()` reads the global `GLUI.Stage.interaction.objects`
 *     list, caches the topmost Scene ancestor per object
 *     (`interactionScene`), and includes only those that either
 *     `forceGLUIInteraction` or are visible and live in *this*
 *     stage's scene.
 *
 * Move / hover bookkeeping (`move(e)`):
 *   - On a successful hit, switches `_over` and sets the page
 *     cursor to `pointer`. On miss or empty candidate list, blurs
 *     the previous `_over` with `action: 'out'` and restores
 *     `cursor: auto`. Sets the global `GLUI.HIT` flag so other
 *     subsystems can short-circuit when the pointer is over UI
 *     (skipped during `_customTest` runs).
 *
 * Press / click (`start` / `end`):
 *   - `start` records the candidate click target and timestamp.
 *     On non-mobile (and outside WebVR) it also re-runs `move`
 *     synchronously so a touchstart can pick the candidate without
 *     waiting for a separate move event.
 *   - `end` debounces: ignored if the press lasted > 750ms (treat
 *     as a long-press), otherwise fires `click`. After firing,
 *     blocks further clicks for `preventDoubleClickTime` (300ms).
 *     Also fires an explicit `out` after click on mobile/custom
 *     stacks so the pointer-leave event isn't lost.
 *
 * Custom pointer modes:
 *   - `testWith(point, id)` — feed an arbitrary 2D point as if it
 *     were a mouse move (used by GLUI's stage-layout-capture
 *     mechanic so nested RT scenes can route hits).
 *   - `testWithFinger(point, distance, minDistance)` — XR finger
 *     poke: < 2cm triggers click; >= 2cm exits any existing hover.
 *     Per-object `_preventClickTime` / `_requiresClear` flags
 *     debounce repeated pokes.
 *
 * Helpers exposed:
 *   - `checkObjectHit(object, mouse)`        — single-object raycast.
 *   - `checkObjectFromValues(object, origin, direction)` — same but
 *     with an explicit ray.
 *   - `getObjectHitLocalCoords(v, object, mouse)` — fills `v` with
 *     the local-space hit point (falls back to a plane-intersect
 *     against the object's local Z plane if no triangle hit).
 *   - All three first call `findCapture(object)` to honour a nested
 *     `stageLayoutCapture` proxy if one is registered via `UI3D`.
 *
 * Disable / invisible:
 *   - `_disabled` setter and `onInvisible` both clear `_over`/
 *     `_click` and restore the cursor.
 *   - Module-level guards (`GLUI.PREVENT_INTERACTION`,
 *     `GLUI.PREVENT_DEFAULT_INTERACTION`, `self._invisible`,
 *     `_disabled`, `_blocked`) short-circuit pointer handling.
 */
Class(function GLUIStageInteraction2D(_camera, _scene, _stage, _custom) {
  Inherit(this, Component);
  const self = this;
  var _ray,
    _over,
    _click,
    _customTest,
    _disabled,
    _blocked,
    _test = [],
    _objects = (this.objects = []),
    _hold = new Vector2(),
    _lastTestedPoint = (new Vector2(), new Vector2()),
    _plane = new Plane();
  function cacheTopScene(obj) {
    let p = obj;
    for (; p; ) {
      p instanceof Scene && (obj.interactionScene = p);
      p = p._parent;
    }
  }
  function testObjects() {
    let objects = GLUI.Stage.interaction.objects;
    _test.length = 0;
    for (let i = objects.length - 1; i > -1; i--) {
      let obj = objects[i];
      obj.interactionScene || cacheTopScene(obj);
      (obj.forceGLUIInteraction || (obj.determineVisible() && _scene == obj.interactionScene)) &&
        _test.push(obj);
    }
    return _test;
  }
  function externalStart() {
    self._invisible || start(_lastTestedPoint);
  }
  function externalRelease() {
    self._invisible || end(_lastTestedPoint);
  }
  function move(e) {
    if (GLUI.PREVENT_INTERACTION || self._invisible || _disabled || _blocked) return;
    _ray || ((_ray = new Raycaster(_camera)).testVisibility = false);
    let objects = testObjects();
    if (!objects.length)
      return void (
        _over &&
        (_over._onOver({
          action: 'out',
          object: _over,
        }),
        (_over = null),
        Stage.cursor('auto'))
      );
    let hit = _ray.checkHit(objects, e, _stage);
    try {
      if (hit[0]) {
        _customTest || (GLUI.HIT = true);
        let obj = hit[0].object.glui;
        _over ||
          ((_over = obj)._onOver({
            action: 'over',
            object: obj,
          }),
          Stage.cursor('pointer'));
        _over != obj &&
          (_over._onOver({
            action: 'out',
            object: _over,
          }),
          (_over = obj)._onOver({
            action: 'over',
            object: obj,
          }),
          Stage.cursor('pointer'));
      } else {
        _customTest || (GLUI.HIT = false);
        _over &&
          (_over._onOver({
            action: 'out',
            object: _over,
          }),
          (_over = null),
          Stage.cursor('auto'));
      }
    } catch (e) {
      console.warn(e);
    }
  }
  function start(e) {
    let handlingEvent = !(e instanceof Vector2),
      checkDefault = GLUI.PREVENT_DEFAULT_INTERACTION && handlingEvent,
      checkPrevention = GLUI.PREVENT_INTERACTION || self._invisible || _disabled || _blocked;
    checkDefault ||
      checkPrevention ||
      ((_custom && handlingEvent) ||
        (!Device.mobile && RenderManager.type != RenderManager.WEBVR) ||
        move(e),
      _over && !_click && ((_click = _over), _hold.copy(e), (_hold.time = Date.now())));
  }
  function end(e) {
    if (!(GLUI.PREVENT_INTERACTION || self._invisible || _disabled || _blocked)) {
      if (
        (_customTest && Device.mobile && _click && null == _over && (_over = _click),
        (GLUI.HIT = false),
        _click)
      ) {
        if (Date.now() - _hold.time > 750) return (_click = null);
        if (_click == _over)
          try {
            _blocked = true;
            self.delayedCall((_) => {
              _blocked = false;
            }, self.preventDoubleClickTime);
            _click._onClick({
              action: 'click',
              object: _click,
            });
            (Device.mobile || _custom) &&
              _over &&
              (_over._onOver({
                action: 'out',
                object: _over,
              }),
              (_over = null),
              Stage.cursor('auto'));
          } catch (e) {
            console.warn(e);
          }
      }
      _click = null;
    }
  }
  function findCapture(object) {
    let capture = object.__slc;
    return undefined === capture && window.UI3D
      ? (object.__slc = UI3D.findStageLayoutCapture(object) || null)
      : capture;
  }
  this.preventDoubleClickTime = 300;
  (function addListeners() {
    _custom || self.events.sub(Mouse.input, Interaction.MOVE, move);
    self.events.sub(Mouse.input, Interaction.START, start);
    self.events.sub(Mouse.input, Interaction.END, end);
    self.events.sub(Interaction3D.EXTERNAL_PRESS, externalStart);
    self.events.sub(Interaction3D.EXTERNAL_RELEASE, externalRelease);
  })();
  self.startRender((_) => {});
  this.add = function (obj) {
    obj && _objects.push(obj.mesh || obj);
  };
  this.remove = function (obj) {
    obj && _objects.remove(obj.mesh || obj);
  };
  this.testWith = function (point, id) {
    point.customTest = true;
    _lastTestedPoint.copy(point);
    _lastTestedPoint.customTest = true;
    _customTest = true;
    move(point);
    Device.mobile && RenderManager.type != RenderManager.WEBVR && _over && start(point);
  };
  this.testWithFinger = function (point, distance, minDistance) {
    _ray || ((_ray = new Raycaster(_camera)).testVisibility = false);
    _customTest = true;
    let objects = testObjects();
    if (objects.length)
      if (distance < 0.02) {
        let hit = _ray.checkHit(objects, point, _stage);
        try {
          if (hit[0]) {
            let obj = hit[0].object.glui;
            (!obj._preventClickTime ||
              Render.TIME - obj._preventClickTime > self.preventDoubleClickTime) &&
              (obj._requiresClear ||
                ((_over = obj),
                obj._onOver({
                  action: 'over',
                  object: obj,
                }),
                obj._onClick({
                  action: 'click',
                  object: obj,
                }),
                (obj._preventClickTime = Render.TIME),
                (obj._requiresClear = true)));
          } else
            _over &&
              ((_over._requiresClear = false),
              _over._onOver({
                action: 'out',
                object: _over,
              }),
              (_over = null));
        } catch (e) {
          console.warn(e);
        }
      } else
        _over &&
          ((_over._requiresClear = false),
          _over._onOver({
            action: 'out',
            object: _over,
          }),
          (_over = null));
  };
  this.checkObjectHit = function (object, mouse) {
    let capture = findCapture(object);
    return capture
      ? capture.checkObjectHit(object.mesh || object, mouse)
      : (_ray || ((_ray = new Raycaster(_camera)).testVisibility = false),
        _ray.checkHit(object.mesh || object, mouse, _stage)[0]);
  };
  this.checkObjectFromValues = function (object, origin, direction) {
    let capture = findCapture(object);
    return capture
      ? capture.checkObjectFromValues(object.mesh || object, origin, direction)
      : (_ray || ((_ray = new Raycaster(_camera)).testVisibility = false),
        _ray.checkFromValues(object.mesh || object, origin, direction)[0]);
  };
  this.getObjectHitLocalCoords = function (v, object, mouse) {
    let capture = findCapture(object);
    if (capture) return capture.getObjectHitLocalCoords(v, object, mouse);
    let hit = self.checkObjectHit(object, mouse);
    if (hit) return (v.copy(hit.point), hit.object.worldToLocal(v));
    {
      let mesh = object.mesh || object;
      return (
        _plane.normal.set(0, 0, 1).applyQuaternion(mesh.getWorldQuaternion()),
        (_plane.constant = -mesh.getWorldPosition().dot(_plane.normal)),
        _ray.ray.intersectPlane(_plane, v),
        mesh.worldToLocal(v)
      );
    }
  };
  this.set('_disabled', (v) => {
    (_disabled = v) &&
      ((_click = null),
      _over &&
        (_over._onOver({
          action: 'out',
          object: _over,
        }),
        (_over = null),
        Stage.cursor('auto')));
  });
  this.onInvisible = () => {
    _click = null;
    _over &&
      (_over._onOver({
        action: 'out',
        object: _over,
      }),
      (_over = null),
      Stage.cursor('auto'));
  };
});

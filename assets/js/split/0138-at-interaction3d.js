/*
 * Interaction3D — per-camera input router that turns mouse / touch / VR
 * controller events into hover / click / move callbacks on registered
 * 3D meshes, using a Raycaster against the camera or controller pose.
 *
 * Lifecycle:
 *   - One instance per camera. `Interaction3D.find(camera)` lazily
 *     creates and caches one per camera in `_map`.
 *   - The active input source (Mouse by default, or a VR controller
 *     object, or an array of VR controllers for hand-tracking) is set
 *     via `Interaction3D.useInput(obj)` which broadcasts to every
 *     known camera's interaction. `self.input = obj` on an instance
 *     swaps just that camera's input mode.
 *
 * Input modes (decided in `set input` based on `obj`):
 *   2d — Mouse / touch. Cursor at `(_input.position, _input.rect)` is
 *        fed to Mouse.input events: START → start, MOVE → move,
 *        CLICK → click, plus END on mobile.
 *   3d — Single VR controller. Beam-cast direction is the controller's
 *        forward (-Z transformed by its world quaternion). Subscribes
 *        to VRInput.BUTTON for trigger-press → start, trigger-release
 *        → click. `self.startRender(move)` runs per-frame pose updates.
 *   3d (hand array) — multiple controllers / hand bones; the per-frame
 *        loop is `moveHand` which raycasts from each "finger" tip and
 *        picks the closest hit; near-touch triggers click, also drives
 *        hover.
 *
 * Mesh registration (`self.add(meshes, hover, click, move, seo)`):
 *   - `parseMeshes` walks the supplied tree and:
 *       * Skips OcclusionMesh (used purely for depth, no interaction).
 *       * If a mesh exposes `hitArea` / `hitMesh`, an invisible Mesh
 *         is attached so the actual rendered geometry stays untouched
 *         while a simpler proxy gets ray-tested. `neverRender` makes
 *         the hit mesh skip draw calls.
 *       * Recurses through children so a single .add call covers a
 *         whole subtree.
 *       * `mouseEnabled(visible)` toggles the proxy's participation
 *         without having to remove and re-add.
 *   - SEO objects (`seo` param) get a screen-reader anchor wired up:
 *     div focus → hover-over, div blur → hover-out, div select →
 *     click. The DOM element is provided by GLSEO.objectNode.
 *
 * Per-frame logic (`move` / `moveHand`):
 *   - `testObjects()` filters _meshes to those whose `determineVisible`
 *     passes (early-out for off-screen / faded-out meshes).
 *   - When a hit's mesh has `onHitUpdate`, that callback owns the
 *     hover/click semantics for the frame — the standard hover/click
 *     pipeline is suppressed and `onMissUpdate` is invoked the frame
 *     a previously-hit mesh stops being hit.
 *   - In 3D mode, `_maximumVRHitDistance` clips far hits; per-mesh
 *     `maximumVRHitDistance` overrides the global default.
 *
 * Hover / click dispatch:
 *   - `triggerHover(action, mesh, hit)` fires the HOVER event and the
 *     mesh's own `__hoverCallback`.
 *   - `triggerClick(mesh, hit)` fires CLICK + `__clickCallback`.
 *   - `triggerMove` (inline in `move`) fires MOVE + per-instance
 *     `__moveCallback<ID>` (suffixed with `self.ID` so two
 *     Interaction3Ds on the same mesh don't collide).
 *
 * DOM occlusion check (`checkIfProhibited`):
 *   - Walks up from `document.elementFromPoint` looking for any class
 *     in PROHIBITED_ELEMENTS (`hit`, `prevent_interaction3d`). If a
 *     DOM overlay is on top of the canvas at the cursor, the 3D scene
 *     ignores the event.
 *
 * Cursor coordination (`Interaction3D.requestCursor`):
 *   - Multiple meshes may compete for the cursor across cameras. A
 *     `pointer` request stamps the caller as `_cursorObj`; only that
 *     same caller can later release back to `auto`. Prevents cursor
 *     flicker between adjacent meshes mid-frame.
 *
 * Static accessors:
 *   - `Interaction3D.find(camera)`     — get/create per-camera instance.
 *   - `Interaction3D.useInput(obj)`    — broadcast input swap.
 *   - `Interaction3D.maximumVRHitDistance` — default VR hit clip.
 *   - Event constants: HOVER, CLICK, MOVE, EXTERNAL_PRESS, EXTERNAL_RELEASE.
 */
Class(
  function Interaction3D(_camera) {
    Inherit(this, Component);
    const self = this;

    let _hover;
    let _click;
    let _lastOnUpdate;
    let _maximumVRHitDistance;

    const _v3 = new Vector3();
    const _plane = new Plane();
    let _input = {};
    const _cacheHits = [];
    let _enabled = true;

    self.ID = Utils.timestamp();
    _camera = _camera || World.CAMERA;

    const _ray = self.initClass(Raycaster, _camera);
    const _meshes = [];
    const _test = [];
    const _event = {};

    // DOM classes that, if present at the cursor, suppress the 3D hit.
    const PROHIBITED_ELEMENTS = ['hit', 'prevent_interaction3d'];

    /*
     * Walk up the DOM looking for a "this is an overlay over the canvas"
     * marker class — if found, the 3D scene should not receive this event.
     */
    function checkIfProhibited(element) {
      for (let el = element; el; el = el.parentNode) {
        if (!el.classList) continue;
        for (let i = 0; i < PROHIBITED_ELEMENTS.length; i++) {
          if (el.classList.contains(PROHIBITED_ELEMENTS[i])) return true;
        }
      }
      return false;
    }

    /*
     * Normalise the input list into an array of leaf "hit mesh" objects.
     * Recurses through children. Promotes meshes with a `hitArea` /
     * `hitMesh` to use an invisible proxy so the visual mesh isn't
     * disturbed by ray tests.
     */
    function parseMeshes(meshes) {
      if (!Array.isArray(meshes)) meshes = [meshes];
      const output = [];

      function initHitMesh(obj) {
        if (!obj.hitMesh) obj.hitMesh = new Mesh(obj.hitArea);
        obj.add(obj.hitMesh);
        obj = obj.hitMesh;
        obj.isHitMesh = true;
        obj.shader.neverRender = true;
        return obj;
      }

      meshes.forEach(function checkMesh(obj) {
        if (obj.isOcclusionMesh) return;
        if (obj.hitArea || obj.hitMesh) obj = initHitMesh(obj);

        if (typeof obj.isHitMesh === 'boolean') {
          // Hit-mesh proxies get a runtime enable/disable toggle.
          obj.mouseEnabled = function (visible) {
            if (visible) {
              if (!~_meshes.indexOf(obj)) _meshes.push(obj);
            } else {
              _meshes.remove(obj);
            }
          };
          output.push(obj);
        } else {
          output.push(obj);
        }
        if (obj.children.length) obj.children.forEach(checkMesh);
      });

      return output;
    }

    /*
     * Filter the registered mesh list to only those currently visible
     * for raycasting (off-screen / faded-out meshes skipped).
     */
    function testObjects() {
      _test.length = 0;
      for (let i = _meshes.length - 1; i > -1; i--) {
        const obj = _meshes[i];
        if (obj.determineVisible()) _test.push(obj);
      }
      return _test;
    }

    /*
     * Press handler — record the hit object so a subsequent release on
     * the same mesh fires a click. In 3D mode we additionally fire an
     * EXTERNAL_PRESS event so non-interaction listeners can react.
     */
    function start(e) {
      if (_input.type === '2d') {
        const element = document.elementFromPoint(
          Math.clamp(e.x || 0, 0, Stage.width),
          Math.clamp(e.y || 0, 0, Stage.height),
        );
        if ((element && checkIfProhibited(element)) || GLUI.HIT) return;
      }
      if (!_enabled) return;
      const hit = move(e);
      if (_input.type === '3d') self.events.fire(Interaction3D.EXTERNAL_PRESS);
      if (hit) {
        _click = hit.object;
        _click.time = Render.TIME;
      } else {
        _click = null;
      }
    }

    /*
     * Per-frame hand / multi-controller loop. Raycasts from each finger
     * tip, picks the closest hit, and routes to onHitUpdate / click /
     * hover. Distance < 0.01 counts as a "touch click" with a 1-second
     * per-mesh debounce so a continuous touch doesn't spam clicks.
     */
    function moveHand() {
      if (!_enabled) return;
      _cacheHits.length = 0;
      for (let i = 0; i < _input.obj.length; i++) {
        const obj = _input.obj[i];
        _v3.set(0, 0, -1).applyQuaternion(obj.quaternion);
        const hit = _ray.checkFromValues(testObjects(), obj.position, _v3)[0];
        if (hit) _cacheHits.push(hit);
      }
      _cacheHits.sort((a, b) => a.distance - b.distance);
      const hit = _cacheHits[0];

      // Fire onMissUpdate on the previous frame's "owned" mesh if we've
      // moved off it.
      if (!hit || hit.object !== _lastOnUpdate) {
        if (_lastOnUpdate && _lastOnUpdate.onMissUpdate) _lastOnUpdate.onMissUpdate();
        _lastOnUpdate = null;
      }

      if (!hit) {
        if (_hover) { triggerHover('out', _hover); _hover = null; }
        return;
      }

      const mesh = hit.object;
      if (mesh.onHitUpdate) {
        hit.usingFinger = true;
        _lastOnUpdate = mesh;
        mesh.onHitUpdate(hit);
        return false;
      }

      if (!mesh._debounceFingerClick || Render.TIME - mesh._debounceFingerClick > 1e3) {
        if (hit.distance < 0.01) {
          _click = mesh;
          triggerClick(mesh, hit);
          mesh._debounceFingerClick = Render.TIME;
        } else if (!_hover) {
          _hover = mesh;
          triggerHover('over', mesh, hit);
        }
      } else if (_hover) {
        triggerHover('out', _hover);
        _hover = null;
      }
    }

    /*
     * Move/update handler — runs every frame in 3D mode, on mouse-move
     * in 2D. Drives hover transitions and forwards `onHitUpdate` for
     * meshes that opt into per-frame ownership. Returns the hit object
     * (so `start` can capture it for click detection).
     */
    function move(e) {
      if (_input.type === '2d') {
        const element = document.elementFromPoint(
          Math.clamp(e.x || 0, 0, Stage.width),
          Math.clamp(e.y || 0, 0, Stage.height),
        );
        if (element && checkIfProhibited(element)) return;
      }
      if (!_enabled) {
        Interaction3D.requestCursor('auto', self);
        return;
      }

      let hit;
      if (_input.type === '2d') {
        hit = _ray.checkHit(testObjects(), _input.position, _input.rect || Stage)[0];
      } else {
        _input.obj.hideBeam();
        _v3.set(0, 0, -1).applyQuaternion(_input.obj.group.getWorldQuaternion());
        hit = _ray.checkFromValues(testObjects(), _input.obj.group.getWorldPosition(), _v3)[0];
      }

      // Notify the previous-frame owner that it's no longer the target.
      if (!hit || hit.object !== _lastOnUpdate) {
        if (_lastOnUpdate && _lastOnUpdate.onMissUpdate) _lastOnUpdate.onMissUpdate();
        _lastOnUpdate = null;
      }

      if (!hit) {
        self.intersecting = false;
        end();
        if (_input.obj && _input.obj.setHitPosition) _input.obj.setHitPosition(false);
        return false;
      }

      self.intersecting = true;
      const mesh = hit.object;

      if (_input.type === '3d') {
        let max = _maximumVRHitDistance || Interaction3D.maximumVRHitDistance;
        if (typeof mesh.maximumVRHitDistance === 'number' && mesh.maximumVRHitDistance > 0) {
          max = mesh.maximumVRHitDistance;
        }
        // Owned meshes outside the clip distance: hide the beam, return false.
        if (mesh.onHitUpdate && hit.distance > max) return false;
        _input.obj.showBeam();
        if (_input.obj.setHitPosition) _input.obj.setHitPosition(hit);
      }

      if (mesh.onHitUpdate) {
        mesh.onHitUpdate(hit);
        _lastOnUpdate = mesh;
        return false;
      }

      if (_hover !== mesh) {
        if (_hover) triggerHover('out', _hover, hit);
        _hover = mesh;
        triggerHover('over', _hover, hit);
        Interaction3D.requestCursor(_hover.__clickCallback ? 'pointer' : 'auto', self);
      } else {
        // Same-mesh move tick: fire MOVE event + per-mesh move callback.
        _event.action = 'move';
        _event.mesh = _hover;
        _event.hit = hit;
        self.events.fire(Interaction3D.MOVE, _event, true);
        if (_hover['__moveCallback' + self.ID]) _hover['__moveCallback' + self.ID](_event);
      }

      return hit;
    }

    /*
     * Clear hover state — called when input leaves the scene entirely.
     * Resets the cursor back to whatever this instance's default is.
     */
    function end() {
      if (_hover) {
        triggerHover('out', _hover, null);
        _hover = null;
        Interaction3D.requestCursor(self.cursor, self);
      }
    }

    /*
     * Release handler. Fires CLICK only if the release lands on the
     * same mesh that the press captured. In 3D, broadcasts an
     * EXTERNAL_RELEASE event regardless of hit state.
     */
    function click(e) {
      if (_input.type === '3d') self.events.fire(Interaction3D.EXTERNAL_RELEASE);
      if (!self.enabled) return;
      if (!_click) return;

      const element = document.elementFromPoint(
        Math.clamp(e.x || 0, 0, Stage.width),
        Math.clamp(e.y || 0, 0, Stage.height),
      );
      if (element && checkIfProhibited(element)) return;

      let hit;
      if (_input.type === '2d') {
        if (GLUI.HIT) return;
        hit = _ray.checkHit(testObjects(), _input.position, _input.rect)[0];
      } else {
        _v3.set(0, 0, -1).applyQuaternion(_input.obj.group.getWorldQuaternion());
        hit = _ray.checkFromValues(testObjects(), _input.obj.group.getWorldPosition(), _v3)[0];
      }
      if (hit && hit.object === _click) triggerClick(_click, hit);
      _click = null;
    }

    function triggerHover(action, mesh, hit) {
      _event.action = action;
      _event.mesh = mesh;
      _event.hit = hit;
      self.events.fire(Interaction3D.HOVER, _event, true);
      if (_hover && _hover.__hoverCallback) _hover.__hoverCallback(_event);
    }

    function triggerClick(mesh, hit) {
      _event.action = 'click';
      _event.mesh = mesh;
      _event.hit = hit;
      self.events.fire(Interaction3D.CLICK, _event, true);
      if (_click && _click.__clickCallback) _click.__clickCallback(_event);
    }

    // VR controller buttons → press / release. Only the trigger button
    // participates in 3D picking.
    function vrInputButton(e) {
      if (e.label !== 'trigger') return;
      if (e.pressed) start(e);
      else click(e);
    }

    this.cursor = 'auto';
    _ray.testVisibility = true;

    this.set('camera', (c) => {
      _ray.camera = c;
    });

    /*
     * Register meshes for interaction. `hover`/`click`/`move` are
     * callbacks the mesh receives; `seo` wires up DOM accessibility
     * anchors so screen-reader focus / select fires the same events.
     */
    this.add = function (meshes, hover, click, move, seo) {
      let seoRoot;
      if (!Array.isArray(meshes)) meshes = parseMeshes(meshes);
      // Permit calling as `.add(meshes, hover, click, seoObj)`.
      if (move && typeof move !== 'function') {
        seo = move;
        move = null;
      }
      if (seo && seo.root) {
        seoRoot = seo.root;
        seo = seo.seo;
      }

      meshes.forEach((mesh, i) => {
        if (seo) {
          try {
            mesh._divFocus  = () => hover({ action: 'over',  seo: true, mesh });
            mesh._divBlur   = () => hover({ action: 'out',   seo: true, mesh });
            mesh._divSelect = () => click({ action: 'click', seo: true, mesh });
            const { url, label, ...options } = Array.isArray(seo) ? seo[i] : seo;
            GLSEO.objectNode(mesh, seoRoot);
            mesh.seo.aLink(url, label, options);
          } catch (e) {
            if (Hydra.LOCAL) console.warn('Could not add SEO to Interaction3D meshes', e);
          }
        }
        mesh.hitDestroy = () => _meshes.remove(mesh);
        if (hover) mesh.__hoverCallback = hover;
        if (click) mesh.__clickCallback = click;
        if (move)  mesh['__moveCallback' + self.ID] = move;
        _meshes.push(mesh);
      });
    };

    this.remove = function (meshes) {
      if (!Array.isArray(meshes)) meshes = parseMeshes(meshes);
      meshes.forEach((mesh) => {
        if (mesh === _hover) {
          _hover = null;
          Interaction3D.requestCursor(self.cursor, self);
        }
        if (mesh.seo) mesh.seo.unlink();
        for (let i = _meshes.length - 1; i >= 0; i--) {
          if (mesh === _meshes[i]) _meshes.splice(i, 1);
        }
      });
    };

    this.set('testVisibility', (v) => (_ray.testVisibility = v));

    /*
     * Swap the input source. Detaches the previous source's listeners
     * + beam/hit indicators, decides 2D vs 3D vs hand mode based on
     * shape of `obj`, and wires the appropriate listeners.
     */
    this.set('input', (obj) => {
      if (_input && _input.obj) {
        if (_input.obj.isVrController) self.events.unsub(_input.obj, VRInput.BUTTON, vrInputButton);
        if (_input.obj.setHitPosition) _input.obj.setHitPosition(false);
        if (_input.obj.hideBeam) _input.obj.hideBeam();
      }
      _input = {};
      _input.obj = obj;
      _input.position = obj.group ? obj.group.position : obj;
      _input.quaternion = obj.group ? obj.group.quaternion : null;
      // Heuristic: 3D inputs expose a z-coordinate (Vector3 position)
      // or arrive as an array of controllers / hand bones.
      _input.type = typeof _input.position.z === 'number' || Array.isArray(obj) ? '3d' : '2d';
      _input.rect = obj.rect;

      if (obj === Mouse) {
        self.events.sub(Mouse.input, Interaction.START, start);
        if (Device.mobile) self.events.sub(Mouse.input, Interaction.END, end);
        self.events.sub(Mouse.input, Interaction.MOVE, move);
        self.events.sub(Mouse.input, Interaction.CLICK, click);
      } else {
        self.events.unsub(Mouse.input, Interaction.START, start);
        if (Device.mobile) self.events.unsub(Mouse.input, Interaction.END, end);
        self.events.unsub(Mouse.input, Interaction.MOVE, move);
        self.events.unsub(Mouse.input, Interaction.CLICK, click);

        if (Array.isArray(obj)) {
          // Hand / multi-finger mode — drives moveHand each frame.
          self.startRender(moveHand);
          self.stopRender(move);
        } else {
          // Single VR controller.
          self.events.sub(obj, VRInput.BUTTON, vrInputButton);
          self.startRender(move);
          self.stopRender(moveHand);
        }
      }
    });

    this.get('input', () => _input);

    this.get('enabled', () => _enabled);
    this.set('enabled', (v) => {
      _enabled = v;
      if (_enabled) return;
      // Cleanly leave hover/beam state on disable.
      if (_hover) triggerHover('out', _hover, null);
      _hover = null;
      if (_input && _input.obj) {
        if (_input.obj.setHitPosition) _input.obj.setHitPosition(false);
        if (_input.obj.hideBeam) _input.obj.hideBeam();
      }
    });

    /*
     * One-off hit test against a custom object set (e.g. an editor
     * gizmo) without registering them in `_meshes`.
     */
    this.checkObjectHit = function (object, mouse, rect = Stage) {
      return _ray.checkHit(object, mouse, rect)[0];
    };

    this.checkObjectFromValues = function (object, origin, direction) {
      return _ray.checkFromValues(object, origin, direction)[0];
    };

    /*
     * Convert a mouse hit into local coordinates of `object`. If the
     * ray misses the geometry, falls back to the object's own facing
     * plane (so dragging off the mesh still produces sensible deltas).
     */
    this.getObjectHitLocalCoords = function (v, object, mouse, rect = Stage) {
      const hit = self.checkObjectHit(object, mouse, rect);
      if (hit) {
        v.copy(hit.point);
        return hit.object.worldToLocal(v);
      }
      _plane.normal.set(0, 0, 1).applyQuaternion(object.getWorldQuaternion());
      _plane.constant = -object.getWorldPosition().dot(_plane.normal);
      _ray.ray.intersectPlane(_plane, v);
      return object.worldToLocal(v);
    };

    this.get('maximumVRHitDistance', () => _maximumVRHitDistance);
    this.set('maximumVRHitDistance', (value) => {
      if (value) {
        if (typeof value === 'number' && value > 0) _maximumVRHitDistance = value;
      } else {
        _maximumVRHitDistance = undefined;
      }
    });
  },

  // ── Static side. ────────────────────────────────────────────────────
  () => {
    Interaction3D.HOVER            = 'interaction3d_hover';
    Interaction3D.CLICK            = 'interaction3d_click';
    Interaction3D.MOVE             = 'interaction3d_move';
    Interaction3D.EXTERNAL_PRESS   = 'interaction3d_ext_press';
    Interaction3D.EXTERNAL_RELEASE = 'interaction3d_ext_release';

    let _cursorObj;
    const _map = new Map();
    let _input = Mouse;
    let _maximumVRHitDistance = 5;

    /*
     * Per-camera singleton. Camera-like wrappers (with `.camera`) are
     * unwrapped to the bare camera key.
     */
    Interaction3D.find = function (camera) {
      camera = camera.camera || camera;
      if (!_map.has(camera)) {
        const interaction = new Interaction3D(camera);
        interaction.input = _input;
        _map.set(camera, interaction);
      }
      return _map.get(camera);
    };

    /*
     * Globally swap input source — propagates to every existing
     * Interaction3D so they all switch from Mouse to a controller (or
     * back) in lockstep.
     */
    Interaction3D.useInput = function (obj) {
      if (_input === obj) return;
      for (const [, interaction] of _map) interaction.input = obj;
      _input = obj;
    };

    /*
     * Cooperative cursor request. Only the original `pointer` requester
     * can release back to `auto` — keeps competing meshes from fighting
     * over the cursor on the same frame.
     */
    Interaction3D.requestCursor = function (cursor, obj) {
      if (obj.forceCursor) cursor = obj.forceCursor;
      if (cursor === 'pointer') {
        _cursorObj = obj;
        Stage.cursor(cursor);
      }
      if (cursor === 'auto' && _cursorObj === obj) {
        Stage.cursor(cursor);
        _cursorObj = null;
      }
    };

    Object.defineProperty(Interaction3D, 'maximumVRHitDistance', {
      get: () => _maximumVRHitDistance,
      set(value) {
        if (value) {
          if (typeof value === 'number' && value > 0) _maximumVRHitDistance = value;
        } else {
          _maximumVRHitDistance = 5;
        }
      },
    });
  },
);

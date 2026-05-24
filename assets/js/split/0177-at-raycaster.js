/*
 * Raycaster — Active Theory's wrapper around the underlying
 * `RayManager` (Möller–Trumbore intersector). Provides:
 *
 *   - `checkHit(objects, mouse, rect)`        : screen-space pointer
 *     to world-space ray; iterates each `object.raycast(raycaster,
 *     intersects)` and returns hits sorted by distance.
 *   - `checkFromValues(objects, origin, dir)` : explicit ray.
 *
 * Visibility gate: `testVisibility` (default `true`) walks up each
 * candidate's parent chain and skips the object if any ancestor is
 * invisible (unless `forceRayVisible` overrides on that ancestor, or
 * `testVisibility` is explicitly disabled on it).
 *
 * The closure-level traversal in `intersectObject` is non-recursive
 * by default — callers that want full subtree testing pass
 * `recursive = true`.
 *
 * Static side: maintains a `WeakMap<camera, Raycaster>` so
 * `Raycaster.find(camera)` returns the same instance per camera,
 * and `Raycaster.checkHit` / `Raycaster.checkFromValues` use a lazy
 * `World.CAMERA` singleton.
 */
Class(
  function Raycaster(_camera) {
    Inherit(this, Component);
    const self = this;
    const _mouse = new Vector3();
    const _raycaster = new RayManager();

    function ascSort(a, b) {
      return a.distance - b.distance;
    }

    function intersectObject(object, raycaster, intersects, recursive) {
      // Visibility walk: any invisible ancestor (without forceRayVisible)
      // makes the whole subtree non-hittable.
      let obj = object;
      while (obj && self.testVisibility) {
        if (obj.visible === false && !obj.forceRayVisible && obj.testVisibility !== false) return;
        obj = obj.parent;
      }
      if (object.raycast) {
        object.raycast(raycaster, intersects);
        if (recursive === true) {
          const children = object.children;
          for (let i = 0, l = children.length; i < l; i++) {
            intersectObject(children[i], raycaster, intersects, true);
          }
        }
      }
    }

    function intersect(objects) {
      if (!Array.isArray(objects)) objects = [objects];
      const intersects = [];
      objects.forEach((object) => {
        intersectObject(object, _raycaster, intersects, false);
      });
      intersects.sort(ascSort);
      return intersects;
    }

    this.testVisibility = true;

    this.set('camera', (camera) => {
      _camera = camera;
    });

    this.set('pointsThreshold', (value) => {
      _raycaster.params.Points.threshold = value;
    });

    this.get('ray', () => _raycaster.ray);

    this.checkHit = function (objects, mouse, rect = Stage) {
      mouse = mouse || Mouse;
      _mouse.x = (mouse.x / rect.width) * 2 - 1;
      _mouse.y = (-mouse.y / rect.height) * 2 + 1;
      _raycaster.setFromCamera(_mouse, _camera);
      return intersect(objects);
    };

    this.checkFromValues = function (objects, origin, direction) {
      _raycaster.set(origin, direction, 0, Number.POSITIVE_INFINITY);
      return intersect(objects);
    };
  },
  () => {
    let _ray;
    const _map = new WeakMap();

    Raycaster.checkHit = function (objects, mouse) {
      if (!_ray) _ray = new Raycaster(World.CAMERA);
      return _ray.checkHit(objects, mouse);
    };

    Raycaster.checkFromValues = function (objects, origin, direction) {
      if (!_ray) _ray = new Raycaster(World.CAMERA);
      return _ray.checkFromValues(objects, origin, direction);
    };

    Raycaster.find = function (camera) {
      if (!_map.has(camera)) _map.set(camera, new Raycaster(camera));
      return _map.get(camera);
    };
  },
);

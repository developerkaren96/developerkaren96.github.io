/*
 * RayManager — Three.js-style Raycaster: a Ray plus a near/far slab
 * and per-renderable-type pick parameters. The entry point for mouse
 * picking and other ray queries against the scene graph.
 *
 *   ray              the underlying Ray.
 *   near, far        valid parameter window along the ray.
 *   params           per-renderable defaults — Points uses
 *                    `threshold` as a click radius (in world units)
 *                    around each sprite; Mesh has no defaults.
 *
 * `setFromCamera(coords, camera)` casts a ray from a normalised
 * device-coordinate (`coords.x`, `coords.y` ∈ [-1, 1]):
 *
 *   Perspective: ray starts at the camera centre and points through
 *                the unprojected (x, y, 0.5) NDC sample.
 *   Orthographic: ray's origin is the unprojected (x, y, z0) point
 *                on the near plane; direction is the camera's −Z.
 *
 * `intersectObject` and `intersectObjects` walk one (or many) targets
 * (and optionally their descendants) calling each `object.raycast`
 * (a per-class hook defined on Mesh / Points / Line / etc.). Results
 * are sorted by distance.
 */
class RayManager {
  constructor(origin, direction, near = 0, far = 1 / 0) {
    this.ray  = new Ray(origin, direction);
    this.near = near;
    this.far  = far;
    this.params = {
      Mesh:   {},
      Points: { threshold: 1 },
    };
  }

  set(origin, direction) { this.ray.set(origin, direction); return this; }

  /*
   * Construct a ray that picks the point under the given NDC
   * coordinates as seen by `camera`.
   *
   *   Perspective: standard "shoot a ray from the eye through the
   *                pixel" — the origin is the camera world position,
   *                the direction is the unprojected screen point
   *                normalised.
   *   Orthographic: rays are all parallel — the origin sits on the
   *                near plane at the corresponding NDC location, and
   *                the direction is the camera's local −Z axis.
   */
  setFromCamera(coords, camera) {
    if (camera.isPerspective) {
      this.ray.origin.setFromMatrixPosition(camera.matrixWorld);
      this.ray.direction
        .set(coords.x, coords.y, 0.5)
        .unproject(camera)
        .sub(this.ray.origin)
        .normalize();
    } else {
      this.ray.origin
        .set(coords.x, coords.y, (camera.near + camera.far) / (camera.near - camera.far))
        .unproject(camera);
      this.ray.direction.set(0, 0, -1).transformDirection(camera.matrixWorld);
    }
  }

  _ascSort(a, b) { return a.distance - b.distance; }

  // Recursive walk: call the object's per-class raycast hook (if any),
  // then descend into children when `recursive`.
  _intersectObject(object, raycaster, intersects, recursive, forceAllVisible) {
    if (false === object.visible && !forceAllVisible) return;
    if (object.raycast) object.raycast(raycaster, intersects);
    if (true === recursive) {
      const children = object.children;
      for (let i = 0, l = children.length; i < l; i++) {
        this._intersectObject(children[i], raycaster, intersects, true);
      }
    }
  }

  // Single-object entry point. Results are sorted near→far by distance.
  intersectObject(object, recursive, optionalTarget, forceAllVisible) {
    const intersects = optionalTarget || [];
    this._intersectObject(object, this, intersects, recursive, forceAllVisible);
    intersects.sort(this._ascSort);
    return intersects;
  }

  // Multi-object entry point — same but for an array of targets.
  intersectObjects(objects, recursive, optionalTarget) {
    const intersects = optionalTarget || [];
    for (let i = 0, l = objects.length; i < l; i++) {
      this._intersectObject(objects[i], this, intersects, recursive);
    }
    intersects.sort(this._ascSort);
    return intersects;
  }
}

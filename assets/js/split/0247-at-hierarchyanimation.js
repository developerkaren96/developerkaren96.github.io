/*
 * HierarchyAnimation — keyframed skeletal animation playback for a
 * tree of Object3Ds. The `_data` payload (either a JSON path string
 * resolved against `assets/geometry/${name}.json`, or an inline
 * object) carries:
 *   - `hierarchy[]`  — per-node descriptor with `name` and `parent`
 *     index. The user-supplied `createObjects(hierarchy)` callback
 *     must return a parallel array of Object3D instances; this class
 *     nests them according to `parent` (skipping any node whose name
 *     is literally `"null"` — those represent unused slots in the
 *     exporter).
 *   - `frames[]`     — per-frame keys, each with flat typed arrays
 *     `position[i*3]`, `quaternion[i*4]`, `scale[i*3]` indexed by
 *     object order.
 *   - `fps`          — playback rate (informational; `elapsed` is
 *     the actual drive variable, in `[0,1)` normalised time).
 *
 * Drive model:
 *   - `elapsed` ∈ [0,1) — clamped to `[0, 0.99]`, multiplied by
 *     `duration` (= frame count) to get a fractional frame index.
 *   - Each `update(totalWeight=1, isSet)` interpolates the floor and
 *     ceil keys (`prevKey`, `nextKey`) with `blend = elapsed -
 *     floor`, using lerp/slerp into scratch quaternions/vectors
 *     (`prevPos`, `prevRot`, `prevScl` — note the names are reused
 *     as the blended target after the lerp).
 *   - `loop` controls whether the last frame wraps to frame 0 or
 *     pins to the final key.
 *   - The blend weight is either `1` (`isSet === true`, hard set) or
 *     `self.weight / totalWeight` — meaning multiple animations can
 *     be summed by a parent driver that totals their weights first.
 *   - `_isLayout` mode skips writing identity transforms (default
 *     quat/pos/scale) so a layout pass can blend over only the
 *     channels actually authored — used by `HierarchyLayout` (0248).
 *
 * `_lastElapsed` short-circuit: if the new `elapsed` resolves to
 * within 0.001 frames of the previous tick, the update is skipped
 * entirely (animations paused on a single frame don't churn).
 *
 * Lifecycle:
 *   - Constructor IIFE awaits the JSON (if a string was passed),
 *     calls the user's `createObjects`, validates the returned
 *     array length matches `hierarchy.length`, then nests the
 *     objects. `self.duration` is populated last — `ready()` waits
 *     on that field.
 *   - `start()` / `stop()` register `loop()` (which just calls
 *     `update()`) with the parent Component's render driver.
 *   - `set('data', …)` lets callers swap the keyframe payload at
 *     runtime; resets `elapsed` to 0.
 */
Class(function HierarchyAnimation(_data, createObjects, _isLayout) {
  Inherit(this, Object3D);
  const self = this;
  var _objects,
    _lastElapsed = -1;
  this.elapsed = 0;
  this.weight = 1;
  this.scale = 1;
  this.duration = 0;
  this.loop = false;
  const prevPos = new Vector3(),
    prevRot = new Quaternion(),
    prevScl = new Vector3(),
    nextPos = new Vector3(),
    nextRot = new Quaternion(),
    nextScl = new Vector3(),
    DEFAULT_QUAT = new Quaternion(0, 0, 0, 1),
    DEFAULT_POS = new Vector3(0, 0, 0),
    DEFAULT_SCALE = new Vector3(1, 1, 1);
  function loop() {
    self.update();
  }
  !(async function () {
    if ('function' != typeof createObjects)
      throw 'HierarchyAnimation :: Second parameter requires callback function to create objects';
    if (
      ('string' == typeof _data &&
        (_data = await get(Assets.getPath(`assets/geometry/${_data}.json`))),
      (_objects = await createObjects(_data.hierarchy)),
      !Array.isArray(_objects))
    )
      throw 'HierarchyAnimation :: Object creation function requires an array to be returned';
    !(function nestObjects() {
      try {
        if (_data.hierarchy.length != _objects.length)
          throw 'HierarchyAnimation :: Number of objects in hierarchy does not match number of objects created.';
        _data.hierarchy.forEach((d, i) => {
          if (d.parent > -1) {
            'null' != _data.hierarchy[Number(d.parent)].name && _objects[d.parent].add(_objects[i]);
          } else 'null' != d.name && self.add(_objects[i]);
        });
      } catch (e) {
        throw (
          console.error(
            'HierarchyAnimation :: Could not successfully nest objects -- check your names!',
          ),
          e
        );
      }
    })();
    self.duration = _data.frames.length;
    self.fps = _data.fps;
  })();
  this.update = function (totalWeight = 1, isSet) {
    if (!_objects) return;
    const weight = isSet ? 1 : self.weight / totalWeight,
      elapsed = Math.clamp(self.elapsed, 0, 0.99) * self.duration;
    if (Math.abs(elapsed - _lastElapsed) < 0.001) return;
    _lastElapsed = elapsed;
    const floorFrame = Math.floor(elapsed),
      blend = elapsed - floorFrame,
      prevKey = _data.frames[floorFrame],
      nextKey = _data.frames[self.loop ? (floorFrame + 1) % self.duration : floorFrame + 1];
    prevKey &&
      nextKey &&
      _objects.forEach((object, i) => {
        prevPos.fromArray(prevKey.position, 3 * i).multiplyScalar(self.scale);
        prevRot.fromArray(prevKey.quaternion, 4 * i);
        prevScl.fromArray(prevKey.scale, 3 * i);
        nextPos.fromArray(nextKey.position, 3 * i).multiplyScalar(self.scale);
        nextRot.fromArray(nextKey.quaternion, 4 * i);
        nextScl.fromArray(nextKey.scale, 3 * i);
        prevPos.lerp(nextPos, blend, false);
        prevRot.slerp(nextRot, blend, false);
        prevScl.lerp(nextScl, blend, false);
        _isLayout
          ? (prevPos.equals(DEFAULT_POS) || object.position.lerp(prevPos, weight, false),
            prevRot.equals(DEFAULT_QUAT) || object.quaternion.slerp(prevRot, weight, false),
            prevScl.equals(DEFAULT_SCALE) || object.scale.lerp(prevScl, weight, false))
          : (object.position.lerp(prevPos, weight, false),
            object.quaternion.slerp(prevRot, weight, false),
            object.scale.lerp(prevScl, weight, false));
      });
  };
  this.start = function () {
    self.startRender(loop);
  };
  this.stop = function () {
    self.stopRender(loop);
  };
  this.ready = function () {
    return self.wait(self, 'duration');
  };
  this.set('data', (data) => {
    _data = data;
    self.duration = _data.frames.length;
    self.fps = _data.fps;
    self.elapsed = 0;
  });
});

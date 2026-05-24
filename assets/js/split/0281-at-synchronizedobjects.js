/*
 * SynchronizedObjects — generic per-frame object-state synchroniser
 * layered on top of PhysicalSync (v1). Lets app code register
 * arbitrary objects under string keys and replicate their
 * position/orientation (or 2D x/y) plus arbitrary scalar fields
 * across all peers in the multiplayer room.
 *
 * Object shape:
 *   - 3D objects with `position` + `quaternion`  → packed as
 *     `p[3]` + `q[4]`.
 *   - 2D objects (anything else with `x` / `y`) → packed as
 *     `p[2]` scaled to `stage.width / stage.height` so they're
 *     resolution-independent.
 *   - Other primitive fields on `syncObj` (other keys beyond
 *     `p` / `q` / `key`) are copied verbatim — drop in numbers,
 *     booleans, etc.
 *
 * Per-frame `loop()`:
 *   - Rewrites `_data` (which is *aliased* into
 *     `parent.player.group.extraData`, so PhysicalSync ships it on
 *     the next outgoing snapshot) from every active local object.
 *   - For every remote player, reads their `extraData`, looks up
 *     each entry by key in the local `_objects` map, and lerps/slerps
 *     the local proxy's transform toward the remote value with
 *     `self.lerp` (default 0.3) for smoothing.
 *
 * Activation handshake — `syncStart` / `syncEnd`:
 *   - The owning side calls `obj.startSync()` to begin replicating;
 *     it also fires the namespaced event so other peers can react
 *     (e.g. flag the object as "being held by player X"). Similarly
 *     `endSync` fires `_name + 'sync_end'`.
 *   - Receivers toggle `isActive` and invoke `onActivate` /
 *     `onDeactivate(syncObj)` callbacks on the local proxy.
 *
 * Naming:
 *   - `_name = _key + parent class name` — disambiguates event
 *     names so the same `SynchronizedObjects` can coexist on
 *     multiple parent classes without colliding.
 */
Class(function SynchronizedObjects(_key = '') {
  Inherit(this, Component);
  const self = this;
  var _data = [],
    _active = [],
    _objects = {},
    _v3 = new Vector3(),
    _q = new Quaternion(),
    _name = _key + Utils.getConstructorName(self.parent);
  function loop() {
    let stage = self.parent.player.stage || Stage;
    _data.length = 0;
    for (let i = _active.length - 1; i > -1; i--) {
      let obj = _active[i];
      obj.position
        ? (obj.position.toArray(obj.syncObj.p), obj.quaternion.toArray(obj.syncObj.q))
        : ((obj.syncObj.p[0] = obj.x / stage.width), (obj.syncObj.p[1] = obj.y / stage.height));
      _data.push(obj.syncObj);
    }
    let players = self.parent.getPlayers();
    for (let key in players) {
      let player = players[key];
      if (player.me) continue;
      let data = player.group.extraData;
      data &&
        data.forEach((d) => {
          let obj = _objects[d.key];
          if (obj) {
            if (obj.syncObj)
              for (let key in d)
                'p' != key && 'q' != key && 'key' != key && (obj.syncObj[key] = d[key]);
            2 == d.p.length
              ? ((obj.x = Math.lerp(d.p[0] * stage.width, obj.x, self.lerp)),
                (obj.y = Math.lerp(d.p[1] * stage.height, obj.y, self.lerp)))
              : (_v3.fromArray(d.p),
                _q.fromArray(d.q),
                obj.position.lerp(_v3, self.lerp),
                obj.quaternion.slerp(_q, self.lerp));
          }
        });
    }
  }
  function syncStart({ key: key }) {
    let object = _objects[key];
    object &&
      !object.isActive &&
      ((object.isActive = true), object.onActivate && object.onActivate());
  }
  function syncEnd({ key: key, syncObj: syncObj }) {
    let object = _objects[key];
    object &&
      object.isActive &&
      ((object.isActive = false), object.onDeactivate && object.onDeactivate(syncObj));
  }
  this.lerp = 0.3;
  (async function () {
    await self.parent.wait('player');
    self.parent.player.bindGlobalEvent(_name + 'sync_start', syncStart);
    self.parent.player.bindGlobalEvent(_name + 'sync_end', syncEnd);
    self.parent.player.group.extraData = _data;
    self.startRender(loop);
  })();
  this.add = function (obj, key) {
    obj.syncObj = {
      p: [],
      q: [],
      key: key,
    };
    _objects[key] = obj;
    obj.startSync = (_) => {
      obj.syncedKey = key;
      _active.push(obj);
      self.parent.player.fireEvent(_name + 'sync_start', {
        key: key,
      });
    };
    obj.endSync = (_) => {
      _active.remove(obj);
      self.parent.player.fireEvent(_name + 'sync_end', {
        key: key,
        syncObj: obj.syncObj,
      });
    };
  };
  this.removeByKey = function (key) {
    undefined !== _objects[key] && (_active.remove(_objects[key]), delete _objects[key]);
  };
});

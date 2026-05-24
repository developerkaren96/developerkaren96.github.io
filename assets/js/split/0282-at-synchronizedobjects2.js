/*
 * SynchronizedObjects2 — v2 sibling of SynchronizedObjects (0281).
 * Identical interaction model and lerp-smoothed replication, bound
 * to the v2 PhysicalSync/PhysicalLink/PlayerModel surface. See
 * 0281 for the lifecycle and event-handshake walkthrough.
 */
Class(function SynchronizedObjects2(_key = '') {
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

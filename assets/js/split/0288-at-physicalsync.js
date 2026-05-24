/*
 * PhysicalSync — global transform + event replication layer over
 * GameCenter rooms (v1). Sits above the room's `broadcast` /
 * `userData` channels and beneath the per-player `PhysicalLink`
 * (0286) adapter.
 *
 * Concepts:
 *   - "Instance link"   — a registered Object3D that's bound to a
 *     remote player's id. Inbound snapshots from that player update
 *     the linked object's matrix; outbound snapshots from the local
 *     player ship the matrix outward.
 *   - "Local / Remote link" — direction-specific bind helpers
 *     called by PhysicalLink.bindLink.
 *   - "Global link"     — room-wide objects (not owned by a
 *     specific player). Anyone in the room can update them; usually
 *     the host is authoritative.
 *   - "Event"           — discrete (non-transform) message. Local
 *     events are queued in `_events`, packed into `_evt.events`,
 *     and shipped on the next outbound packet with the transform
 *     snapshot. The host re-broadcasts globally so latecomers can
 *     resync.
 *
 * State maps:
 *   - `_instances` / `_instanceBackup`  — per-player instance
 *     tables (current and shadow for diffing).
 *   - `_objects`                        — local-owned links.
 *   - `_global`                         — global links shared by
 *     the room.
 *   - `_eventMap` / `_events` / `_evt`  — outbound event queue;
 *     `_evt = {pS:'d', events:[]}` is the wire envelope reused each
 *     transmit to avoid allocations.
 *   - `_handledEvents` / `_receivedGlobals` — dedupe sets so we
 *     don't echo our own messages back to ourselves.
 *
 * Tunables:
 *   - `baseLerp = 0.15`    — default smoothing factor for remote
 *     transforms (so packet jitter doesn't show as visible jumps).
 *   - `transmitFPS = 30`   — outbound packet rate cap. The
 *     `_transmitTime` cursor enforces this against `Render.TIME`.
 *   - `compensateLag = true` — adjust for round-trip ping when
 *     reconstructing the remote pose.
 *   - `throttle = false`   — when true, suppresses outbound packets
 *     during heavy frames.
 *
 * Bootstrap handshake:
 *   - `startSync()` on the host broadcasts a `perform_sync` packet
 *     carrying the host camera pose; clients use it to align world
 *     coordinates if they need a shared reference frame.
 *
 * Events: `CONNECTION`, `DISCONNECTION`, `ROOM_TIMEOUT`.
 */
Class(function PhysicalSync() {
  Inherit(this, Component);
  const self = this;
  var _room,
    _playerQueue,
    _visibilityTimer,
    _matrix = new Matrix4(),
    _instances = {},
    _instanceBackup = {},
    _objects = {},
    _global = {},
    _globalEvents = {},
    _eventMap = {},
    _events = [],
    _transmit = {},
    _globalTransmit = {},
    _handledEvents = {},
    _receivedGlobals = [],
    _evt = {
      pS: 'd',
      events: [],
    },
    _transmitTime = Render.TIME;
  this.CONNECTION = 'physical_sync_connection';
  this.DISCONNECTION = 'physical_sync_disconnection';
  this.ROOM_TIMEOUT = 'physical_sync_room_timeout';
  this.baseLerp = 0.15;
  this.transmitFPS = 30;
  this.compensateLag = true;
  this.throttle = false;
  const ZERO_POS = new Vector3(0, 0, 0),
    ZERO_QUAT = new Quaternion(0, 0, 0, 1);
  function startSync() {
    _room.host &&
      _room.broadcast({
        pS: 'perform_sync',
        pos: World.CAMERA.position.toArray(),
        quaternion: World.CAMERA.quaternion.toArray(),
      });
  }
  function optimize(obj) {
    for (let i = 0; i < 3; i++) obj.p[i] = Number(obj.p[i].toFixed(3));
    if (obj.q) for (let i = 0; i < 4; i++) obj.q[i] = Number(obj.q[i].toFixed(3));
  }
  function shouldHandle(event) {
    return (
      !_handledEvents[event.id] &&
      ((_handledEvents[event.id] = true),
      self.delayedCall((_) => {
        delete _handledEvents[event.id];
      }, 1e3),
      true)
    );
  }
  function isZero(obj) {
    return obj.position.equals(ZERO_POS) && obj.quaternion.equals(ZERO_QUAT);
  }
  function transmit() {
    if (
      !(self.throttle && !self.flag('blurred') && Render.TIME - _transmitTime < 1e3) &&
      _objects.local &&
      _room
    ) {
      _transmitTime = Render.TIME;
      for (let key in _objects.local) {
        let obj = _objects.local[key];
        obj.preventSync || (!obj.eD && isZero(obj))
          ? _transmit[key] && delete _transmit[key]
          : (_transmit[key] ||
              ((_transmit[key] = {
                p: [],
              }),
              obj.noPSQuaternion || (_transmit[key].q = [])),
            obj.position.toArray(_transmit[key].p),
            obj.noPSQuaternion || obj.quaternion.toArray(_transmit[key].q),
            optimize(_transmit[key]),
            obj.eD && (_transmit[key].eD = obj.eD));
      }
      for (let key in _global) {
        let obj = _global[key];
        obj.broadcastSync || obj.forceBroadcastSync
          ? (_globalTransmit[key] ||
              (_globalTransmit[key] = {
                p: [],
                q: [],
                f: obj.forceBroadcastSync,
              }),
            obj.position.toArray(_globalTransmit[key].p),
            obj.quaternion.toArray(_globalTransmit[key].q),
            optimize(_globalTransmit[key]))
          : _globalTransmit[key] && delete _globalTransmit[key];
      }
      _evt.events.length = 0;
      for (let i = 0; i < _events.length; i++) {
        let event = _events[i];
        Render.TIME - event.time < 250 ? _evt.events.push(event.evt) : _events.splice(i, 1);
      }
      _evt.objects = _transmit;
      _evt.global = _globalTransmit;
      _room &&
        _room.broadcast &&
        (_evt.events.length ||
          Object.keys(_evt.global).length ||
          Object.keys(_evt.objects).length) &&
        _room.broadcast(_evt);
    }
  }
  function loop() {
    for (let player in _objects) {
      if ('local' == player) continue;
      let playerObj = _objects[player];
      for (let key in playerObj) {
        let obj = playerObj[key],
          lerp = self.baseLerp * obj.lerpMult;
        obj.positionTarget &&
          !obj.preventSync &&
          (obj.position.lerp(obj.positionTarget, lerp),
          obj.quaternion.slerp(obj.quaternionTarget, lerp));
      }
    }
    if (_receivedGlobals.length) {
      for (let i = 0; i < _receivedGlobals.length; i++) {
        let key = _receivedGlobals[i],
          obj = _global[key];
        if (obj.positionTarget && !obj.preventSync) {
          let lerp = obj.forced ? 1 : self.baseLerp * obj.lerpMult;
          obj.position.lerp(obj.positionTarget, lerp);
          obj.quaternion.slerp(obj.quaternionTarget, lerp);
        }
      }
      _receivedGlobals.length = 0;
    }
    if (_playerQueue.length) {
      for (let i = 0; i < 10; i++) {
        let obj = _playerQueue.shift();
        obj && self.events.fire(self.CONNECTION, obj);
      }
    }
  }
  function handleEvent({ evtData: evtData, evtName: evtName, from: from }) {
    let callbacks = _eventMap[from];
    if (callbacks) {
      let callback = callbacks[evtName];
      callback && callback(evtData);
    }
    let callback = _globalEvents[evtName];
    callback && callback(evtData);
  }
  function playerJoin(e) {
    if (
      (_room.isCommunity
        ? _playerQueue.push({
            id: e.player.id,
            userData: e.player.data,
            player: e.player,
          })
        : self.events.fire(self.CONNECTION, {
            id: e.player.id,
            userData: e.player.data,
            player: e.player,
          }),
      _room.host && !_room.isCommunity)
    ) {
      for (let key in _global) _global[key].forceBroadcastSync = e.player.id;
      self.delayedCall((_) => {
        for (let key in _global) _global[key].forceBroadcastSync = false;
      }, 500);
    }
  }
  function playerDisconnect(e) {
    let obj = _instances[e.player.id] || _instanceBackup[e.player.id];
    obj &&
      (self.events.fire(self.DISCONNECTION, {
        id: e.player.id,
        userData: e.player.data,
      }),
      obj.onDisconnect ? obj.onDisconnect() : obj.destroy && obj.destroy());
    delete _instances[e.player.id];
    delete _instanceBackup[e.player.id];
    delete _eventMap[e.player.id];
    for (let i = 0; i < _playerQueue.length; i++)
      _playerQueue[i].player == e.player && (_playerQueue.splice(i, 1), (i -= 1));
  }
  function roomError() {
    self.events.fire(self.ROOM_TIMEOUT);
    _room &&
      _room.players &&
      _room.players.forEach((player) => {
        playerDisconnect({
          player: player,
        });
      });
  }
  function data({ data: data, player: player }) {
    if (data.pS)
      switch (data.pS) {
        case 'start_sync':
          startSync();
          break;
        case 'perform_sync':
          !(function performSync({ pos: pos, quaternion: quaternion }) {
            let remotePos = new Vector3().fromArray(pos),
              cameraQuat = World.CAMERA.quaternion,
              cameraPos = World.CAMERA.position,
              localQuaternion = World.SCENE.quaternion,
              localScene = World.SCENE.position,
              orientedRemotePos =
                (new Quaternion().fromArray(quaternion),
                new Vector3().copy(remotePos).applyQuaternion(cameraQuat)),
              localOrigin = new Vector3().copy(cameraPos),
              remoteOrigin = new Vector3().copy(orientedRemotePos).multiplyScalar(-1);
            localScene.copy(localOrigin).add(remoteOrigin);
            localQuaternion.copy(cameraQuat);
          })(data);
          break;
        case 'd':
          !(function transmitData(
            { objects: objects, from: from, global: global, events: events },
            player,
          ) {
            let lerpMultiplier = self.compensateLag
              ? Math.range(player.ping, 50, 200, 1, 0.25, true)
              : 1;
            for (let key in global) {
              let obj = _global[key];
              obj &&
                ((obj.lerpMult = lerpMultiplier),
                obj.positionTarget ||
                  ((obj.positionTarget = new Vector3()), (obj.quaternionTarget = new Quaternion())),
                global[key].p &&
                  (_receivedGlobals.push(key),
                  global[key].f == GameCenter.GCID &&
                    (obj.physics &&
                      (undefined === obj.physics.stashKinematic &&
                        ((obj.physics.stashKinematic = obj.physics.kinematic),
                        (obj.physics.kinematic = true)),
                      clearTimeout(obj.physics.timer),
                      (obj.physics.timer = self.delayedCall((_) => {
                        obj.physics.kinematic = obj.physics.stashKinematic;
                      }, 100))),
                    (obj.forced = true)),
                  obj.positionTarget.fromArray(global[key].p),
                  global[key].q && obj.quaternionTarget.fromArray(global[key].q)));
            }
            if (_objects[from])
              for (let key in objects) {
                let obj = _objects[from][key];
                obj &&
                  ((obj.lerpMult = lerpMultiplier),
                  obj.positionTarget ||
                    ((obj.positionTarget = new Vector3()),
                    (obj.quaternionTarget = new Quaternion())),
                  objects[key].p &&
                    (obj.positionTarget.fromArray(objects[key].p),
                    objects[key].q && obj.quaternionTarget.fromArray(objects[key].q)),
                  objects[key].eD && (obj.eD = objects[key].eD));
              }
            if (events)
              for (let i = events.length - 1; i > -1; i--) {
                let event = events[i];
                shouldHandle(event) && ((event.from = from), handleEvent(event));
              }
          })(data, player);
          break;
        case 'event':
          handleEvent(data);
      }
  }
  function handleVisibility(e) {
    'blur' == e.type
      ? (self.flag('blurred', true), (_visibilityTimer = setInterval(transmit, 250)))
      : (self.flag('blurred', false), clearInterval(_visibilityTimer));
  }
  self.events.sub(GameCenter.LOST_CONNECTION, (_) => self.useRoom(null));
  self.events.sub(Events.VISIBILITY, handleVisibility);
  this.connect = async function (server) {
    GameCenter.ports = this.ports || 1;
    GameCenter.userData = this.userData || {};
    GameCenter.connect(server);
    try {
      _room = await GameCenter.findRoom();
      self.events.sub(_room, GameCenterRoom.PLAYER_JOIN, playerJoin);
      self.events.sub(_room, GameCenterRoom.PLAYER_DISCONNECT, playerDisconnect);
      self.events.sub(_room, GameCenter.DATA, data);
    } catch (e) {
      console.error(e);
    }
    _room.players.forEach((player) => {
      player.me ||
        self.events.fire(self.CONNECTION, {
          id: player.id,
          userData: player.data,
          player: player,
        });
    });
  };
  this.useRoom = function (room) {
    if (
      (null == room &&
        _room &&
        (_room.players &&
          _room.players.forEach((player) => {
            player.me ||
              playerDisconnect({
                player: player,
              });
          }),
        self.events.unsub(_room, GameCenterRoom.PLAYER_JOIN, playerJoin),
        self.events.unsub(_room, GameCenterRoom.PLAYER_DISCONNECT, playerDisconnect),
        self.events.unsub(_room, GameCenterRoom.ERROR, roomError),
        self.events.unsub(_room, GameCenter.DATA, data)),
      (_room = room),
      (_playerQueue = []),
      self.startRender(loop),
      _room)
    ) {
      try {
        self.events.sub(_room, GameCenterRoom.PLAYER_JOIN, playerJoin);
        self.events.sub(_room, GameCenterRoom.PLAYER_DISCONNECT, playerDisconnect);
        self.events.sub(_room, GameCenterRoom.ERROR, roomError);
        self.events.sub(_room, GameCenter.DATA, data);
      } catch (e) {
        console.error(e);
      }
      _room.players.forEach((player) => {
        player.me ||
          (_room.isCommunity
            ? _playerQueue.push({
                id: player.id,
                userData: player.data,
                player: player,
              })
            : self.events.fire(self.CONNECTION, {
                id: player.id,
                userData: player.data,
                player: player,
              }));
      });
    }
  };
  this.sync = function () {
    _room.host
      ? startSync()
      : _room.broadcast({
          pS: 'start_sync',
        });
  };
  this.createInstanceLink = function (obj, id) {
    _instances[id] = obj;
    _instanceBackup[id] = obj;
  };
  this.deleteInstanceLink = function (id) {
    id && (delete _instances[id], delete _objects[id], delete _eventMap[id]);
  };
  this.createLocalLink = function (obj, id) {
    _objects.local || (_objects.local = {});
    _objects.local[id] = obj;
    self.startRender(transmit, self.transmitFPS);
  };
  this.deleteLocalLink = function (id) {
    delete _objects.local[id];
  };
  this.createRemoteEvent = function (name, id, callback) {
    _eventMap[id] || (_eventMap[id] = {});
    _eventMap[id][name] = callback;
  };
  this.createGlobalEvent = function (id, callback) {
    _globalEvents[id] = callback;
  };
  this.deleteGlobalEvent = function (id) {
    delete _globalEvents[id];
  };
  this.fireLocalEvent = function (name, data = {}) {
    _events.push({
      evt: {
        evtData: data,
        evtName: name,
        id: Utils.uuid(),
      },
      time: Render.TIME,
    });
  };
  this.createGlobalLink = function (obj, id) {
    _global[id] = obj;
  };
  this.deleteGlobalLink = function (id) {
    delete _global[id];
  };
  this.createRemoteLink = function (obj, playerId, id) {
    _objects[playerId] || (_objects[playerId] = {});
    _objects[playerId][id] = obj;
    self.startRender(loop);
  };
  this.alignLocally = function (yOffset = 0) {
    World.SCENE.quaternion.copy(World.CAMERA.quaternion);
    World.SCENE.rotation.z = 0;
    World.SCENE.rotation.x = 0;
    World.SCENE.position.copy(World.CAMERA.position);
    World.SCENE.position.y += yOffset;
    World.SCENE.updateMatrixWorld(true);
    _matrix.getInverse(World.SCENE.matrix);
    self.flag('aligned', true);
  };
  this.realignObject = function (obj) {
    self.flag('aligned') && obj.applyMatrix(_matrix);
  };
}, 'static');

/*
 * GameCenter2 — v2 of the multiplayer/presence service connector
 * (see 0207 for the v1 GameCenter docstring; the design is the same).
 *
 * Differences vs v1:
 *   - Targets the newer relay backend's message envelope/protocol.
 *   - Same public API surface (`useCoordinates`, `LOCATED` event,
 *     player roster) so consumer code can flip between v1 and v2 by
 *     swapping the class reference.
 *
 * Both modules coexist in the bundle so legacy experiences shipping
 * against v1 keep working while new ones target v2.
 */
Class(function GameCenter2() {
  Inherit(this, Component);
  let _socket,
    _coords,
    self = this,
    _id = Utils.timestamp();
  function getCoords() {
    if (!self.useCoordinates) return ((_coords = [0, 0]), Promise.resolve());
    let promise = Promise.create();
    return (
      navigator.geolocation.getCurrentPosition(
        (data) => {
          _coords = [data.coords.latitude, data.coords.longitude];
          self.events.fire(self.LOCATED);
          promise.resolve();
        },
        (error) => {
          self.events.fire(self.LOCATION_ERROR);
        },
      ),
      promise
    );
  }
  function connected() {
    self.events.fire(self.CONNECTED);
    self.events.sub(_socket, 'server_data', handleServerData);
    self.flag('connected', true);
  }
  function handleServerData(e) {
    self.events.fire(self.SERVER_DATA, e);
  }
  this.userData = {};
  this.useCoordinates = false;
  this.ports = 1;
  this.maxServerConnections = 900;
  this.CONNECTED = 'gamecenter2_connect';
  this.DISCONNECTED = 'gamecenter2_disconnected';
  this.LOCATION_ERROR = 'gamecenter2_location_error';
  this.LOCATED = 'gamecenter2_located';
  this.DATA = 'gamecenter2_data';
  this.START_GAME = 'gamecenter2_start_game';
  this.END_GAME = 'gamecenter2_end_game';
  this.LOST_CONNECTION = 'gamecenter2_lost_connection';
  this.SERVER_DATA = 'gamecenter2_server_data';
  this.BROADCAST = 'gamecenter2_server_data';
  this.BLOCKED_ERROR = 'gamecenter2_blocked_error';
  this.connect = async function (server) {
    let port = 'number' == typeof this.ports ? ':' + (7100 + Math.random(0, this.ports - 1)) : '',
      connectTime = 0;
    await (async (_) => {
      let promise = Promise.create();
      if ((_socket && _socket.close(), !(Date.now() - connectTime < 100)))
        return (
          (connectTime = Date.now()),
          (self.server = server),
          (_socket = new SocketConnection2(server + port)),
          (self.socket = _socket),
          self.events.sub(_socket, SocketConnection2.OPEN, (_) => {
            promise.resolve();
            connected();
          }),
          self.events.sub(_socket, SocketConnection2.BLOCKED, (_) => {
            self.events.fire(self.BLOCKED_ERROR);
            AppState.set(self.BLOCKED_ERROR, true);
            self.BLOCKED = true;
          }),
          self.events.sub(_socket, SocketConnection2.CLOSE, (_) => {
            self.BLOCKED ||
              (self.flag('connected', false),
              self.events.fire(self.LOST_CONNECTION, {
                reconnected: (_) => self.wait('connected'),
              }));
          }),
          self.events.sub(_socket, SocketConnection2.ERROR, (_) => {
            self.BLOCKED ||
              (self.flag('connected', false),
              self.events.fire(self.LOST_CONNECTION, {
                reconnected: (_) => self.wait('connected'),
              }));
          }),
          self.events.sub(_socket, 'broadcast', (e) => {
            console.log('receive broadcast', e);
            self.events.fire(self.BROADCAST, e);
          }),
          promise
        );
    })();
    self.flag('initialized', true);
  };
  this.locateUser = function () {
    getCoords();
  };
  this.findRoom = async function (type = 'any', config) {
    await self.wait('initialized');
    let promise = Promise.create(),
      find = function () {
        self.roundTrip(
          'findAny',
          {
            coords: _coords,
            type: type,
            forceNewRoom: config.forceNewRoom,
          },
          async (data) => {
            let room = new GameCenterRoom2(data.id, _socket);
            type.includes('community') && room.communityRoom();
            try {
              await room.join(config);
              promise.resolve(room);
            } catch (e) {
              promise.reject();
            }
          },
        );
      };
    return (_coords ? find() : getCoords().then(find), promise);
  };
  this.joinRoom = async function (id, config, watcher) {
    await self.wait('initialized');
    try {
      let room = new GameCenterRoom2(id, _socket);
      return (
        id.includes('community') && room.communityRoom(),
        await room.join(config, watcher),
        room
      );
    } catch (e) {
      throw "Couldn't join!";
    }
  };
  this.watchRoom = async function (id, watcher) {
    await self.wait('initialized');
    try {
      let room = new GameCenterRoom2(id, _socket);
      return (id.includes('community') && room.communityRoom(), await room.watch(watcher), room);
    } catch (e) {
      throw "Couldn't join!";
    }
  };
  this.findNearby = async function (type = 'any') {
    await self.wait('initialized');
    let promise = Promise.create();
    if (!this.useCoordinates) throw 'findNearby requires user coords';
    let find = function () {
      self.roundTrip(
        'findNearby',
        {
          coords: _coords,
          type: type,
        },
        (data) => {
          promise.resolve(data);
        },
      );
    };
    return (_coords ? find() : getCoords().then(find), promise);
  };
  this.roundTrip = function (evt, data, callback) {
    let receive = (e) => {
      self.events.unsub(_socket, `${evt}_response`, receive);
      callback && callback(e);
    };
    self.events.sub(_socket, `${evt}_response`, receive);
    _socket.send(evt, data);
  };
  this.sendData = function (data = {}) {
    _socket && ((data.id = _id), _socket.send('server_data', data));
  };
  this.broadcast = function (data = {}) {
    _socket.send('broadcast', data);
  };
  this.locateServer = function (roomId) {
    let promise = Promise.create();
    return (
      self.roundTrip(
        'locate_server',
        {
          roomId: roomId,
        },
        promise.resolve,
      ),
      promise
    );
  };
  this.getRoomCount = async function (roomId) {
    let promise = Promise.create();
    return (
      self.roundTrip(
        'roomCount',
        {
          roomId: roomId,
        },
        promise.resolve,
      ),
      promise
    );
  };
  this.get('coords', (v) => {
    _coords = v;
  });
  this.get('coords', (_) => _coords);
}, 'static');

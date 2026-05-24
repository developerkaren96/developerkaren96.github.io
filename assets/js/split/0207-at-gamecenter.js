/*
 * GameCenter — Active Theory's lightweight multiplayer/presence
 * service connector. Opens a WebSocket to a relay server and brokers
 * "player joined / left", "geolocation match", and per-player message
 * channels for small multiplayer experiences.
 *
 * Identifier:
 *   `_id` is a `Utils.timestamp()` — a wall-clock ms value used to
 *   identify this client to the server. Conflicts are statistically
 *   negligible at human-scale concurrency.
 *
 * Geolocation:
 *   - `useCoordinates` opts the client into geo-matching.
 *   - When on, `getCoords()` requests `navigator.geolocation` and
 *     fires the `LOCATED` event with `[lat, lng]` once available.
 *     The server uses these to put nearby players in the same room.
 *   - When off, `_coords = [0, 0]` is a sentinel for "any room".
 *
 * Other responsibilities (lower in the file):
 *   - Socket lifecycle: connect, reconnect on drop, periodic ping.
 *   - Player roster: track `GameCenterPlayer` per remote `_id`.
 *   - Broadcast / per-player message dispatch.
 *
 * `GameCenter2` (0208) is the v2 of this module — same shape, with
 * minor protocol differences for the newer relay backend. Both
 * coexist so older experiences keep working while newer ones move
 * to v2.
 */
Class(function GameCenter() {
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
  this.CONNECTED = 'gamecenter_connect';
  this.DISCONNECTED = 'gamecenter_disconnected';
  this.LOCATION_ERROR = 'gamecenter_location_error';
  this.LOCATED = 'gamecenter_located';
  this.DATA = 'gamecenter_data';
  this.START_GAME = 'gamecenter_start_game';
  this.END_GAME = 'gamecenter_end_game';
  this.LOST_CONNECTION = 'gamecenter_lost_connection';
  this.SERVER_DATA = 'gamecenter_server_data';
  this.BROADCAST = 'gamecenter_server_data';
  this.BLOCKED_ERROR = 'gamecenter_blocked_error';
  this.connect = async function (server) {
    let port = 'number' == typeof this.ports ? ':' + (7e3 + Math.random(0, this.ports - 1)) : '',
      connectTime = 0;
    await (async (_) => {
      let promise = Promise.create();
      if ((_socket && _socket.close(), !(Date.now() - connectTime < 100)))
        return (
          (connectTime = Date.now()),
          (self.server = server),
          (_socket = new SocketConnection(server + port)),
          (self.socket = _socket),
          self.events.sub(_socket, SocketConnection.OPEN, (_) => {
            promise.resolve();
            connected();
          }),
          self.events.sub(_socket, SocketConnection.BLOCKED, (_) => {
            self.events.fire(self.BLOCKED_ERROR);
            AppState.set(self.BLOCKED_ERROR, true);
            self.BLOCKED = true;
          }),
          self.events.sub(_socket, SocketConnection.CLOSE, (_) => {
            self.BLOCKED ||
              (self.flag('connected', false),
              self.events.fire(self.LOST_CONNECTION, {
                reconnected: (_) => self.wait('connected'),
              }));
          }),
          self.events.sub(_socket, SocketConnection.ERROR, (_) => {
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
            let room = new GameCenterRoom(data.id, _socket);
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
      let room = new GameCenterRoom(id, _socket);
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
      let room = new GameCenterRoom(id, _socket);
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

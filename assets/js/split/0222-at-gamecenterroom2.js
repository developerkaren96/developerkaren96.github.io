/*
 * GameCenterRoom2 — v2 of GameCenterRoom (see 0221 for the full
 * lifecycle/events docstring). Identical shape and behaviour;
 * every reference to the singleton namespace (`GameCenter.X`,
 * `GameCenterPlayer.X`, `SocketConnection.BINARY`, etc.) is swapped
 * to its v2 counterpart (`GameCenter2`, `GameCenterPlayer2`,
 * `SocketConnection2`). Event constants are namespaced separately
 * (`gc2_*`, `gc_room2_*`) so v1 and v2 subscribers never collide.
 */
Class(
  function GameCenterRoom2(_id, _socket) {
    Inherit(this, Component);
    const self = this;
    var _aliveTimer, _fallbackSocket, _roomConfig;
    this.id = _id;
    this.host = false;
    this.players = [];
    this.socket = _socket;
    var _waiting = {},
      _pending = [],
      _playerMap = new Map(),
      _players = self.players;
    function handlePlayers(players) {
      let player;
      players.forEach((obj, i) => {
        obj.id == GameCenter2.GCID
          ? (player = new GameCenterUser2(_socket, self.isCommunity))
          : ((player = _playerMap.get(obj.id)),
            player || ((player = createPlayer(obj.id, obj.data)), _playerMap.set(obj.id, player)));
        _players[i] = player;
      });
    }
    function createPlayer(id, data, init) {
      data.data && (data = data.data);
      let player = self.initClass(GameCenterPlayer2, id, _socket, data, init, self.isCommunity);
      return (
        self.events.sub(player, GameCenter2.DATA, playerData),
        self.events.sub(player, Events.ERROR, playerDisconnect),
        self.events.sub(player, GameCenterPlayer2.FALLBACK_SOCKET, fallbackSocket),
        self.events.sub(player, Events.READY, async () => {
          await defer();
          self.events.fire(GameCenterRoom2.PLAYER_READY, {
            player: player,
          });
        }),
        _waiting[id] && _waiting[id].resolve(player),
        player
      );
    }
    function fallbackSocket() {
      _fallbackSocket = true;
    }
    function alive() {
      _socket.send('alive');
      Render.blurTime > 0 &&
        Date.now() - Render.blurTime > (_roomConfig.timeoutDisconnect || 6e6) &&
        (forceDisconnect(), self.leave && self.leave());
    }
    function requestInitialState() {
      if (self.events)
        try {
          _socket.send('request_state');
        } catch (e) {
          setTimeout(requestInitialState, 50);
        }
    }
    function addListeners() {
      self.events.sub(_socket, 'player_disconnect', playerDisconnect);
      self.events.sub(_socket, 'become_host', becomeHost);
      self.events.sub(_socket, 'open_connection', openConnection);
      self.events.sub(_socket, 'establish_rtc', establishRTC);
      self.events.sub(_socket, 'ws_data', websocketData);
      self.events.sub(_socket, 'promote_watcher', promoteWatcher);
      self.events.sub(_socket, 'rebroadcast_players', rebroadcastPlayers);
      self.events.sub(_socket, 'start_game', startGame);
      self.events.sub(_socket, 'end_game', endGame);
      self.events.sub(_socket, 'force_disconnect', forceDisconnect);
      self.events.sub(_socket, 'update_user_data', updateUserData);
      self.events.sub(_socket, 'pin', handlePin);
      self.events.sub(_socket, 'unpin', handleUnpin);
      self.events.sub(GameCenter2.LOST_CONNECTION, closeRoom);
      self.events.sub(_socket, SocketConnection2.BINARY, communityData);
    }
    function updateUserData({ data: data }) {
      _players.forEach((player) => {
        player.id == data.gcID &&
          ((player.data = data.data),
          player.data.data && (player.data = player.data.data),
          player.events.fire(GameCenterPlayer2.UPDATE_DATA, {
            player: player,
            data: player.data,
          }));
      });
    }
    function forceDisconnect(e) {
      self.events.fire(GameCenterRoom2.ERROR);
    }
    function closeRoom() {
      self.destroy();
    }
    function startGame(e) {
      self.events.fire(GameCenter2.START_GAME, e);
      self.playing = true;
    }
    function endGame(e) {
      self.events.fire(GameCenter2.END_GAME, e);
      self.playing = false;
    }
    function establishRTC(e) {
      let found = false;
      if (
        (_players.forEach((player) => {
          player.id == e.from && ((found = true), player.connection.establish(e));
        }),
        !found)
      ) {
        let player = createPlayer(e.from, e.data);
        _players.push(player);
        _playerMap.set(e.gcID, player);
        player.connection.establish(e);
      }
    }
    function playerDisconnect(e) {
      let toRemove;
      _playerMap.delete(e.gcID);
      _players.forEach((player) => {
        player.id == e.gcID &&
          (player.disconnect(),
          (toRemove = player),
          self.events.fire(GameCenterRoom2.PLAYER_DISCONNECT, {
            player: player,
          }),
          player.destroy());
      });
      toRemove && _players.remove(toRemove);
    }
    function becomeHost(e) {
      self.host = true;
      self.events.fire(GameCenterRoom2.BECOME_HOST);
    }
    function rebroadcastPlayers({ data: data }) {
      data.forEach((obj) => {
        obj.id != GameCenter2.GCID && ((obj.gcID = obj.id), openConnection(obj));
      });
    }
    function openConnection(e) {
      if (_playerMap.has(e.gcID)) return;
      let player = createPlayer(e.gcID, e.data, true);
      _playerMap.set(e.gcID, player);
      _players.push(player);
      self.events.fire(GameCenterRoom2.PLAYER_JOIN, {
        player: player,
      });
    }
    function playerData(e) {
      self.events.fire(GameCenter2.DATA, e);
    }
    function websocketData(e) {
      let player = _playerMap.get(e.from);
      player && player.connection.wsData(e);
    }
    function promoteWatcher() {
      self.flag('canPromote') && (self.join(), self.events.fire(GameCenterRoom2.PROMOTED));
    }
    function communityData({ data: data }) {
      _pending.length = 0;
      for (let i = data.length - 1; i > -1; i--) {
        let obj = data[i],
          player = _playerMap.get(obj.from);
        player && !_pending.includes(obj.from) && (player.onMessage(obj), _pending.push(obj.from));
      }
    }
    function handlePin(e) {
      let player;
      _players.forEach((p) => {
        p.id == e.message.playerId && (player = p);
      });
      self.events.fire(GameCenterRoom2.PIN, {
        message: e.message,
        player: player,
      });
    }
    function handleUnpin(e) {
      let player;
      _players.forEach((p) => {
        p.id == e.message.playerId && (player = p);
      });
      self.events.fire(GameCenterRoom2.UNPIN, {
        message: e.message,
        player: player,
      });
    }
    this.onDestroy = function () {
      this.leave && this.leave();
    };
    this.updateUserData = function (data = GameCenter2.userData) {
      GameCenter2.userData = data;
      GameCenter2.GCID &&
        _socket.send('update_user_data', {
          gcID: GameCenter2.GCID,
          data: data,
        });
    };
    this.create = function (type, data = {}) {
      self.host = true;
      GameCenter2.roundTrip(
        'create',
        {
          id: _id,
          coords: GameCenter2.coords,
          type: type,
          MAX_IN_ROOM: data.maxInRoom,
          TIMEOUT_DISCONNECT: data.timeoutDisconnect,
        },
        self.join,
      );
    };
    this.join = function (data = {}) {
      if (self.flag('joined')) return Promise.resolve();
      self.flag('joined', true);
      self.flag('watching', false);
      let promise = Promise.create();
      return (
        (_roomConfig = data).timeoutDisconnect > 0 &&
          (_roomConfig.timeoutDisconnect = Math.max(_roomConfig.timeoutDisconnect, 5e3)),
        GameCenter2.roundTrip(
          'join',
          {
            id: _id,
            user: GameCenter2.userData,
            MAX_IN_ROOM: data.maxInRoom,
            TIMEOUT_DISCONNECT: data.timeoutDisconnect,
            type: data.type,
          },
          (e) => {
            if (!e.success) return promise.reject();
            e.host && (self.host = true);
            GameCenter2.GCID = e.myID;
            handlePlayers(e.players);
            addListeners();
            _aliveTimer = setInterval(alive, 4e3);
            promise.resolve();
            setTimeout(requestInitialState, 500);
          },
        ),
        promise
      );
    };
    this.watch = function (canPromote) {
      let promise = Promise.create();
      return (
        self.flag('canPromote', canPromote),
        self.flag('watching', true),
        GameCenter2.roundTrip(
          'watch',
          {
            id: _id,
            user: GameCenter2.userData,
          },
          (e) => {
            if (!e.success) return promise.reject();
            GameCenter2.GCID = e.myID;
            handlePlayers(e.players);
            addListeners();
            promise.resolve();
          },
        ),
        promise
      );
    };
    this.leave = function () {
      self.leave = null;
      clearTimeout(_aliveTimer);
      self.flag('joined', false);
      _players.forEach((player) => player.disconnect());
      GameCenter2.roundTrip('leave', {
        id: _id,
        user: GameCenter2.userData,
      });
      self.destroy();
    };
    this.broadcast = function (data) {
      if (_players.length && !self.flag('watching')) {
        data.from = GameCenter2.GCID;
        _fallbackSocket || self.isCommunity || (data = JSON.stringify(data));
        for (let i = 0; i < _players.length; i++) _players[i].connection.emit(data);
      }
    };
    this.start = function (data) {
      self.host && _socket.send('start_game', data);
    };
    this.end = function (data) {
      self.host && _socket.send('end_game', data);
    };
    this.pin = function (data, timeInSeconds = 5) {
      data.playerId = GameCenter2.GCID;
      _socket.send('pin', {
        message: data,
        time: timeInSeconds,
        userData: GameCenter2.userData,
        playerId: GameCenter2.GCID,
      });
    };
    this.unpin = function (data) {
      data.playerId = GameCenter2.GCID;
      _socket.send('unpin', {
        playerId: GameCenter2.GCID,
        message: data,
      });
    };
    this.communityRoom = function () {
      self.isCommunity = true;
    };
    this.waitForPlayer = function (id) {
      return _playerMap.has(id)
        ? _playerMap.get(id)
        : ((_waiting[id] = Promise.create()), _waiting[id]);
    };
    this.get('me', (_) => {
      for (let i = 0; i < _players.length; i++) {
        let player = _players[i];
        if (player.me) return player;
      }
    });
    this.get('watcher', (_) => self.flag('watching'));
  },
  () => {
    GameCenterRoom2.PLAYER_DISCONNECT = 'gc_room2_player_dc';
    GameCenterRoom2.BECOME_HOST = 'gc2_become_host';
    GameCenterRoom2.PLAYER_JOIN = 'gc2_player_join';
    GameCenterRoom2.PLAYER_READY = 'gc2_player_ready';
    GameCenterRoom2.PROMOTED = 'gc2_player_promoted';
    GameCenterRoom2.ERROR = 'gc2_room_error';
    GameCenterRoom2.PIN = 'gc2_room_pin';
    GameCenterRoom2.UNPIN = 'gc2_room_unpin';
  },
);

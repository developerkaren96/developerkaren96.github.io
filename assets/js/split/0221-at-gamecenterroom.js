/*
 * GameCenterRoom — a single GameCenter "room" (matchmaking lobby /
 * gameplay session). Owns the local player roster, brokers WebRTC
 * handshakes between peers, and exposes room-level controls
 * (host/promotion, start/end game, pin/unpin messages, broadcast).
 *
 * Lifecycle:
 *   - `create(type, opts)`     — host-side: tell the relay to create
 *                                the room, then auto-`join`.
 *   - `join(opts)`             — become a full participant; sets
 *                                up the alive-ping heartbeat and
 *                                requests the host's initial state.
 *   - `watch(canPromote)`      — read-only spectator that can be
 *                                promoted into the room by the host.
 *   - `leave()` / `destroy()`  — clean up timers, drop peers.
 *
 * Inbound relay events wired in `addListeners()`:
 *   - player_disconnect       — peer left.
 *   - become_host             — relay promoted us to host.
 *   - open_connection         — instantiate a `GameCenterPlayer`
 *                               and start the RTC handshake.
 *   - establish_rtc           — SDP/ICE negotiation traffic; routed
 *                               to the matching player's connection.
 *   - ws_data                 — relay-side payload (used when peer
 *                               falls back from RTC to WS).
 *   - promote_watcher         — relay invited a watcher into the
 *                               room (joins if `canPromote`).
 *   - rebroadcast_players     — relay re-sent the roster; reopen
 *                               connections to any newly seen peers.
 *   - start_game / end_game   — host control fan-out.
 *   - force_disconnect        — relay told us to drop.
 *   - update_user_data        — peer published new user blob.
 *   - pin / unpin             — sticky room messages.
 *   - BINARY (community)      — bulk inbound payload from many
 *                               peers (community/feed-style rooms),
 *                               deduped per remote in `_pending`.
 *
 * Heartbeat:
 *   - `alive()` pings every 4s. If the tab has been blurred for
 *     longer than `_roomConfig.timeoutDisconnect` (default 100min),
 *     drop the room — avoids zombie clients holding slots.
 *
 * Outbound API:
 *   - `broadcast(data)`       — fan-out to every connected peer via
 *                               their `connection.emit` (RTC or WS).
 *                               Watchers can't broadcast.
 *   - `start(data)` / `end(data)` — host-only relay broadcasts.
 *   - `pin(msg, ttl)` / `unpin(msg)` — sticky-message control.
 *   - `updateUserData(data)`  — publish new local user blob.
 *   - `waitForPlayer(id)`     — resolves when peer with id joins.
 *   - `communityRoom()`       — switch to community fan-in mode.
 *
 * Getters:
 *   - `me`      — local player object inside `players`.
 *   - `watcher` — true if currently in watch mode.
 *
 * Events fired:
 *   - PLAYER_DISCONNECT, BECOME_HOST, PLAYER_JOIN, PLAYER_READY,
 *     PROMOTED, ERROR, PIN, UNPIN — see static table at the bottom.
 *
 * v2 sibling: GameCenterRoom2 (0222).
 */
Class(
  function GameCenterRoom(_id, _socket) {
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
        obj.id == GameCenter.GCID
          ? (player = new GameCenterUser(_socket, self.isCommunity))
          : ((player = _playerMap.get(obj.id)),
            player || ((player = createPlayer(obj.id, obj.data)), _playerMap.set(obj.id, player)));
        _players[i] = player;
      });
    }
    function createPlayer(id, data, init) {
      data.data && (data = data.data);
      let player = self.initClass(GameCenterPlayer, id, _socket, data, init, self.isCommunity);
      return (
        self.events.sub(player, GameCenter.DATA, playerData),
        self.events.sub(player, Events.ERROR, playerDisconnect),
        self.events.sub(player, GameCenterPlayer.FALLBACK_SOCKET, fallbackSocket),
        self.events.sub(player, Events.READY, async () => {
          await defer();
          self.events.fire(GameCenterRoom.PLAYER_READY, {
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
      self.events.sub(GameCenter.LOST_CONNECTION, closeRoom);
      self.events.sub(_socket, SocketConnection.BINARY, communityData);
    }
    function updateUserData({ data: data }) {
      _players.forEach((player) => {
        player.id == data.gcID &&
          ((player.data = data.data),
          player.data.data && (player.data = player.data.data),
          player.events.fire(GameCenterPlayer.UPDATE_DATA, {
            player: player,
            data: player.data,
          }));
      });
    }
    function forceDisconnect(e) {
      self.events.fire(GameCenterRoom.ERROR);
    }
    function closeRoom() {
      self.destroy();
    }
    function startGame(e) {
      self.events.fire(GameCenter.START_GAME, e);
      self.playing = true;
    }
    function endGame(e) {
      self.events.fire(GameCenter.END_GAME, e);
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
          self.events.fire(GameCenterRoom.PLAYER_DISCONNECT, {
            player: player,
          }),
          player.destroy());
      });
      toRemove && _players.remove(toRemove);
    }
    function becomeHost(e) {
      self.host = true;
      self.events.fire(GameCenterRoom.BECOME_HOST);
    }
    function rebroadcastPlayers({ data: data }) {
      data.forEach((obj) => {
        obj.id != GameCenter.GCID && ((obj.gcID = obj.id), openConnection(obj));
      });
    }
    function openConnection(e) {
      if (_playerMap.has(e.gcID)) return;
      let player = createPlayer(e.gcID, e.data, true);
      _playerMap.set(e.gcID, player);
      _players.push(player);
      self.events.fire(GameCenterRoom.PLAYER_JOIN, {
        player: player,
      });
    }
    function playerData(e) {
      self.events.fire(GameCenter.DATA, e);
    }
    function websocketData(e) {
      let player = _playerMap.get(e.from);
      player && player.connection.wsData(e);
    }
    function promoteWatcher() {
      self.flag('canPromote') && (self.join(), self.events.fire(GameCenterRoom.PROMOTED));
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
      self.events.fire(GameCenterRoom.PIN, {
        message: e.message,
        player: player,
      });
    }
    function handleUnpin(e) {
      let player;
      _players.forEach((p) => {
        p.id == e.message.playerId && (player = p);
      });
      self.events.fire(GameCenterRoom.UNPIN, {
        message: e.message,
        player: player,
      });
    }
    this.onDestroy = function () {
      this.leave && this.leave();
    };
    this.updateUserData = function (data = GameCenter.userData) {
      GameCenter.userData = data;
      GameCenter.GCID &&
        _socket.send('update_user_data', {
          gcID: GameCenter.GCID,
          data: data,
        });
    };
    this.create = function (type, data = {}) {
      self.host = true;
      GameCenter.roundTrip(
        'create',
        {
          id: _id,
          coords: GameCenter.coords,
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
        GameCenter.roundTrip(
          'join',
          {
            id: _id,
            user: GameCenter.userData,
            MAX_IN_ROOM: data.maxInRoom,
            TIMEOUT_DISCONNECT: data.timeoutDisconnect,
            type: data.type,
          },
          (e) => {
            if (!e.success) return promise.reject();
            e.host && (self.host = true);
            GameCenter.GCID = e.myID;
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
        GameCenter.roundTrip(
          'watch',
          {
            id: _id,
            user: GameCenter.userData,
          },
          (e) => {
            if (!e.success) return promise.reject();
            GameCenter.GCID = e.myID;
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
      GameCenter.roundTrip('leave', {
        id: _id,
        user: GameCenter.userData,
      });
      self.destroy();
    };
    this.broadcast = function (data) {
      if (_players.length && !self.flag('watching')) {
        data.from = GameCenter.GCID;
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
      data.playerId = GameCenter.GCID;
      _socket.send('pin', {
        message: data,
        time: timeInSeconds,
        userData: GameCenter.userData,
        playerId: GameCenter.GCID,
      });
    };
    this.unpin = function (data) {
      data.playerId = GameCenter.GCID;
      _socket.send('unpin', {
        playerId: GameCenter.GCID,
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
    GameCenterRoom.PLAYER_DISCONNECT = 'gc_room_player_dc';
    GameCenterRoom.BECOME_HOST = 'gc_become_host';
    GameCenterRoom.PLAYER_JOIN = 'gc_player_join';
    GameCenterRoom.PLAYER_READY = 'gc_player_ready';
    GameCenterRoom.PROMOTED = 'gc_player_promoted';
    GameCenterRoom.ERROR = 'gc_room_error';
    GameCenterRoom.PIN = 'gc_room_pin';
    GameCenterRoom.UNPIN = 'gc_room_unpin';
  },
);

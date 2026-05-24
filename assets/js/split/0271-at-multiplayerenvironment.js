/*
 * MultiplayerEnvironment — high-level orchestrator that turns a
 * `Multiplayer` (v1) room into a populated scene: when remote
 * players connect it instantiates the configured `playerClass`,
 * keeps a mirror in `_players` (id → instance) and `_playersState`
 * (StateArray for reactive UI bindings), and tears them down on
 * disconnect.
 *
 * State:
 *   - `_config`        — configured by MultiplayerConfig (0269).
 *   - `_room`          — active GameCenterRoom.
 *   - `_active`        — true while the environment is alive
 *     (cleared by tear-down so error retries don't reconnect after
 *     disable).
 *   - `_synced`        — set once the initial state sync has
 *     arrived (used by callers to gate "ready to interact").
 *   - `_players`       — plain map of id → Player instance.
 *   - `_playersState`  — `StateArray` so UI/HUD can bind to
 *     additions/removals reactively.
 *
 * Connection handler `onConnection(e)`:
 *   - Spawns `Player(_config.playerClass, id, player, playerData)`
 *     — `playerClass` is the per-app subclass; `id` is the remote
 *     peer id; `player` is the GameCenter peer descriptor;
 *     `playerData` is the join payload.
 *   - Fires `self.onConnection(player)` for app code that wants
 *     to react.
 *   - Pushes onto `_playersState` (idempotent via
 *     `getStatePlayerById`).
 *
 * Resilience:
 *   - `onError` waits for tab focus via `Multiplayer.waitForFocus()`,
 *     then re-establishes the room and rebinds its error handler —
 *     a typical "tab went to sleep, socket dropped, come back to
 *     focus → reconnect" loop.
 *   - `onPromoted` enables the local player (host migration: the
 *     local user just became host and may need authoritative
 *     features unlocked).
 */
Class(function MultiplayerEnvironment() {
  const self = this;
  var _config,
    _room,
    _active,
    _synced,
    _players = {},
    _playersState = new StateArray([]);
  function onConnection(e) {
    let player = self.initClass(Player, _config.playerClass, e.id, e.player, _config.playerData);
    self.onConnection && self.onConnection(player);
    _players[e.id] = player;
    getStatePlayerById(e.id) ||
      _playersState.push({
        id: e.id,
        player: player,
      });
  }
  function getStatePlayerById(id) {
    let returnedPlayer = null;
    return (
      _playersState.forEach((state) => {
        state.get('id') === id && (returnedPlayer = state);
      }),
      returnedPlayer
    );
  }
  async function onDisconnection(e) {
    let statePlayer = getStatePlayerById(e.id);
    statePlayer && _playersState.remove(statePlayer);
    delete _players[e.id];
  }
  async function onError() {
    await Multiplayer.waitForFocus();
    _active &&
      ((_room = await Multiplayer.establish(_config)),
      self.events.sub(_room, GameCenterRoom.ERROR, onError));
  }
  function onPromoted() {
    self.player.enable();
  }
  async function onLostConnection(e) {
    await e.reconnected();
    _active && self.onVisible();
  }
  async function createConnection() {
    if (!_config) return self.delayedCall((_) => self.onVisible?.(), 100);
    if (!self._invisible) {
      if (
        (self.events.sub(PhysicalSync.CONNECTION, onConnection),
        self.events.sub(PhysicalSync.DISCONNECTION, onDisconnection),
        self.events.sub(GameCenter.LOST_CONNECTION, onLostConnection),
        (_active = true),
        _config.maxInRoom > 0)
      )
        try {
          if (!(_room = await Multiplayer.establish(_config)) || !_room.events) return;
          self.events.sub(_room, GameCenterRoom.ERROR, onError);
          self.events.sub(_room, GameCenterRoom.PROMOTED, onPromoted);
        } catch (e) {
          self.delayedCall((_) => self.onVisible(), 100);
        }
      if (!self.player || null == self.player.enable) {
        if (!Multiplayer.room) return;
        self.player = self.initClass(
          Player,
          _config.playerClass,
          null,
          Multiplayer.room.me,
          _config.playerData,
        );
      }
      _room.watcher && self.player && self.player.disable();
    }
  }
  !(function () {
    if (!self.events)
      throw 'MultiplayerEnvironment must be inherited alongside Object3D, FXScene, or Component';
    self.startRender((_) => {});
  })();
  this.configure = async function (obj) {
    if (Utils.query('mlt') && !Multiplayer.usedMLTConfig)
      try {
        let data = JSON.parse(atob(Utils.query('mlt')));
        data.roomId && (obj.roomId = data.roomId);
        data.roomKey && (obj.roomKey = data.roomKey);
        Multiplayer.usedMLTConfig = true;
      } catch (e) {}
    if (obj) {
      if (_config && _config.roomKey == obj.roomKey && _config.roomId == obj.roomId) return;
      if (!obj.roomKey) throw 'configure must define roomKey';
      if (!obj.playerClass) throw 'configure must define playerClass';
      if (undefined === obj.maxInRoom) throw 'configure must define maxInRoom';
      true !== obj.p2p && (obj.community = true);
      _config = obj;
    }
    return (
      _config.maxInRoom > 0 &&
        (_active
          ? ((_room = await Multiplayer.establish(_config)).watcher &&
              self.player &&
              self.player.disable(),
            self.events.sub(_room, GameCenterRoom.ERROR, onError),
            self.events.sub(_room, GameCenterRoom.PROMOTED, onPromoted))
          : false === self._invisible &&
            (self.onVisible(),
            self.delayedCall((_) => {
              false !== self._invisible || Multiplayer.room || self.onVisible();
            }, 1e3))),
      _room
    );
  };
  this.getShareConfig = async function () {
    return (
      await self.wait((_) => !!_config),
      {
        roomId: _config.roomId,
        roomKey: _config.roomKey,
      }
    );
  };
  this.onVisible = async function () {
    self.fxVisible && self.fxVisible();
    Utils.debounce(createConnection, 100);
  };
  this.clearMultiplayer = function () {
    if (!self._invisible) {
      if ('boolean' != typeof self._invisible) return self.delayedCall(self.onVisible, 100);
      self.player && (self.player.visible = false);
      this.onInvisible();
      _config = null;
    }
  };
  this.onInvisible = this.onDestroy = function () {
    _config?.alwaysOn ||
      (self.flag('setVisible', false),
      self.fxInvisible && self.fxInvisible(),
      _config &&
        (self.events.unsub(PhysicalSync.CONNECTION, onConnection),
        self.events.unsub(PhysicalSync.DISCONNECTION, onDisconnection),
        self.events.unsub(GameCenter.LOST_CONNECTION, onLostConnection),
        Multiplayer.leave(_room),
        (_room = _active = false),
        self.player && self.player.onDisconnect?.()));
  };
  this.onConnection = this.onDisconnection = function () {};
  this.synchronizedObjects = function (key) {
    return (_synced || (_synced = self.initClass(SynchronizedObjects, key)), _synced);
  };
  this.getPlayers = function (includeSelf = false) {
    return includeSelf
      ? {
          ..._players,
          me: self.player,
        }
      : _players;
  };
  this.hasPlayer = function () {
    return self.wait('player');
  };
  this.playersState = _playersState;
});

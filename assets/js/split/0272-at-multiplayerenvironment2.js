/*
 * MultiplayerEnvironment2 — v2 sibling of MultiplayerEnvironment
 * (0271). Identical orchestration logic but bound to `Player2`,
 * `Multiplayer2`, and the v2 GameCenter room types. See 0271 for
 * the full lifecycle commentary.
 */
Class(function MultiplayerEnvironment2() {
  const self = this;
  var _config,
    _room,
    _active,
    _synced,
    _players = {},
    _playersState = new StateArray([]);
  function onConnection(e) {
    let player = self.initClass(Player2, _config.playerClass, e.id, e.player, _config.playerData);
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
    await Multiplayer2.waitForFocus();
    _active &&
      ((_room = await Multiplayer2.establish(_config)),
      self.events.sub(_room, GameCenterRoom2.ERROR, onError));
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
        (self.events.sub(PhysicalSync2.CONNECTION, onConnection),
        self.events.sub(PhysicalSync2.DISCONNECTION, onDisconnection),
        self.events.sub(GameCenter2.LOST_CONNECTION, onLostConnection),
        (_active = true),
        _config.maxInRoom > 0)
      )
        try {
          if (!(_room = await Multiplayer2.establish(_config)) || !_room.events) return;
          self.events.sub(_room, GameCenterRoom2.ERROR, onError);
          self.events.sub(_room, GameCenterRoom2.PROMOTED, onPromoted);
        } catch (e) {
          self.delayedCall((_) => self.onVisible(), 100);
        }
      if (!self.player || null == self.player.enable) {
        if (!Multiplayer2.room) return;
        self.player = self.initClass(
          Player2,
          _config.playerClass,
          null,
          Multiplayer2.room.me,
          _config.playerData,
        );
      }
      _room.watcher && self.player && self.player.disable();
    }
  }
  !(function () {
    if (!self.events)
      throw 'MultiplayerEnvironment2 must be inherited alongside Object3D, FXScene, or Component';
    self.startRender((_) => {});
  })();
  this.configure = async function (obj) {
    if (Utils.query('mlt') && !Multiplayer2.usedMLTConfig)
      try {
        let data = JSON.parse(atob(Utils.query('mlt')));
        data.roomId && (obj.roomId = data.roomId);
        data.roomKey && (obj.roomKey = data.roomKey);
        Multiplayer2.usedMLTConfig = true;
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
          ? ((_room = await Multiplayer2.establish(_config)).watcher &&
              self.player &&
              self.player.disable(),
            self.events.sub(_room, GameCenterRoom2.ERROR, onError),
            self.events.sub(_room, GameCenterRoom2.PROMOTED, onPromoted))
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
        (self.events.unsub(PhysicalSync2.CONNECTION, onConnection),
        self.events.unsub(PhysicalSync2.DISCONNECTION, onDisconnection),
        self.events.unsub(GameCenter2.LOST_CONNECTION, onLostConnection),
        Multiplayer2.leave(_room),
        (_room = _active = false),
        self.player && self.player.onDisconnect?.()));
  };
  this.onConnection = this.onDisconnection = function () {};
  this.synchronizedObjects = function (key) {
    return (_synced || (_synced = self.initClass(SynchronizedObjects2, key)), _synced);
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

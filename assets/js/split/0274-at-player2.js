/*
 * Player2 — v2 sibling of Player (0273). Same composition and
 * lifecycle, but bound to `PhysicalLink2` (v2 transform replication
 * channel), `PlayerModel2`, `GameCenterPlayer2`. See 0273 for the
 * shared lifecycle commentary.
 */
Class(
  function Player2(PlayerClass, _id, _player, _playerData = {}) {
    Inherit(this, Object3D);
    Inherit(this, PhysicalLink2, _id);
    const self = this;
    var _view,
      _playerId = _player.id;
    function updateState(data) {
      for (let key in data) self.state.set(key, data[key]);
    }
    this.gcPlayer = _player;
    this.state = AppState.createLocal();
    this.data = _player.data;
    _player.data && _player.data.data && (this.data = _player.data.data);
    (function () {
      let playerData = {};
      for (let key in _playerData) playerData[key] = _playerData[key];
      if (
        ((playerData.local = !_id),
        (self.view = _view = self.initClass(PlayerClass, playerData)),
        !_view.setUserData)
      )
        throw 'Player2 :: View must inherit PlayerView2';
      self.bindLink(self.group, 'player');
      _id
        ? (function initRemote() {
            let data = _player.data;
            data.data && (data = data.data);
            updateState(data);
            _view.setUserData(data, _player);
            self.events.sub(_player, GameCenterPlayer2.UPDATE_DATA, ({ data: data }) => {
              data.data && (data = data.data);
              _view.setUserData(data, _player);
              updateState(data);
            });
          })()
        : (async function initLocal() {
            _view.setUserData(PlayerModel2.data);
            updateState(PlayerModel2.data);
            self.events.sub(PlayerModel2, PlayerModel2.UPDATE, (_) => {
              _view?.setUserData?.(PlayerModel2.data);
              updateState(PlayerModel2.data);
            });
          })();
      self.events.fire(Player2.JOIN, {
        player: self,
      });
    })();
    this.onDisconnect = async function () {
      self.parent.onDisconnection && self.parent.onDisconnection(self);
      await _view?.onDisconnect?.();
      self.parent &&
        (self.events.fire(Player2.LEAVE, {
          id: _playerId,
          player: self,
          playerData: self.data,
        }),
        tween(
          self.group.scale,
          {
            x: 0,
            y: 0,
            z: 0,
          },
          300,
          'easeOutCubic',
        ).onComplete((_) => {
          self.parent && self.parent.group && self.parent.group.remove(self.group);
          self.destroy && self.destroy();
        }));
    };
    this.disable = function () {
      self.group.visible = false;
    };
    this.enable = function () {
      self.group.visible = true;
    };
  },
  (_) => {
    Player2.JOIN = 'player2_join';
    Player2.LEAVE = 'player2_leave';
  },
);

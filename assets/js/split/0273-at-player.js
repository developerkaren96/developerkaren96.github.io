/*
 * Player — wrapper for a single multiplayer participant (local or
 * remote). Composes three things:
 *
 *   1. `Object3D`        — gives it a scene node so the view can
 *      be parented in the world.
 *   2. `PhysicalLink(id)` — connects the player to the
 *      PhysicalSync transform-replication channel keyed by id; the
 *      `bindLink(self.group, 'player')` call below registers the
 *      group as the "player" tracked node (its position/rotation
 *      will be transmitted for the local case, received and
 *      applied for the remote case).
 *   3. A user-supplied `PlayerClass` instance (`_view`) that must
 *      extend `PlayerView` (validated via the `setUserData`
 *      method check — throws if missing) — this is the actual
 *      rendered avatar / mesh / animation rig.
 *
 * State:
 *   - `state`        — per-player AppState (local replication).
 *   - `data`         — peer data payload (unwrapped if the upstream
 *     GameCenter stored it under `data.data`).
 *   - `gcPlayer`     — raw GameCenterPlayer reference.
 *
 * Local vs remote bootstrap:
 *   - Remote (`_id` truthy): seeds `_view.setUserData` from the
 *     join data and subscribes to `GameCenterPlayer.UPDATE_DATA`
 *     so remote-side profile edits propagate to the view + state.
 *   - Local (`_id` falsy): seeds from `PlayerModel.data` and
 *     subscribes to `PlayerModel.UPDATE` so the local model
 *     drives the view + state. Sets `playerData.local = true`
 *     before initialising the view so it can branch on local-ness.
 *
 * Fires `Player.JOIN` on construction; on disconnect:
 *   - Awaits the view's optional `onDisconnect` hook (so it can
 *     play a leave animation), fires `Player.LEAVE`, then
 *     scale-tweens the group to 0 over 300ms easeOutCubic before
 *     removing it from the parent group and destroying.
 *
 * `enable()` / `disable()` toggle group visibility for host-only
 * UIs (cf. `onPromoted` in 0271).
 */
Class(
  function Player(PlayerClass, _id, _player, _playerData = {}) {
    Inherit(this, Object3D);
    Inherit(this, PhysicalLink, _id);
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
        throw 'Player :: View must inherit PlayerView';
      self.bindLink(self.group, 'player');
      _id
        ? (function initRemote() {
            let data = _player.data;
            data.data && (data = data.data);
            updateState(data);
            _view.setUserData(data, _player);
            self.events.sub(_player, GameCenterPlayer.UPDATE_DATA, ({ data: data }) => {
              data.data && (data = data.data);
              _view.setUserData(data, _player);
              updateState(data);
            });
          })()
        : (async function initLocal() {
            _view.setUserData(PlayerModel.data);
            updateState(PlayerModel.data);
            self.events.sub(PlayerModel, PlayerModel.UPDATE, (_) => {
              _view?.setUserData?.(PlayerModel.data);
              updateState(PlayerModel.data);
            });
          })();
      self.events.fire(Player.JOIN, {
        player: self,
      });
    })();
    this.onDisconnect = async function () {
      self.parent.onDisconnection && self.parent.onDisconnection(self);
      await _view?.onDisconnect?.();
      self.parent &&
        (self.events.fire(Player.LEAVE, {
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
    Player.JOIN = 'player_join';
    Player.LEAVE = 'player_leave';
  },
);

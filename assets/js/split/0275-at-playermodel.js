/*
 * PlayerModel — static singleton holding the local user's persisted
 * profile (avatar config, name, custom data) that the multiplayer
 * stack publishes as `userData` to other clients.
 *
 * State:
 *   - `data`     — plain object, hydrated from `Storage.get('playerModel')`
 *     on boot (LocalStorage-backed). Mirrored into `GameCenter.userData`
 *     so any subsequent GameCenter connect carries it as the join
 *     payload.
 *   - `state`    — AppState wrapper on the same dictionary, exposed
 *     for reactive UI bindings. The setter is overridden (see below)
 *     so writes flow through `PlayerModel.set` rather than directly.
 *   - `dataReady` — flag set after hydration so async consumers can
 *     wait.
 *
 * `set(key, value)`:
 *   - Skips if unchanged (prevents storm-fires).
 *   - Updates `data`, writes back to `Storage`, propagates to the
 *     active room via `_room.updateUserData(data)` (broadcasts to
 *     peers), fires `UPDATE`, and updates the AppState mirror.
 *
 * `useRoom(room)` — set by `Multiplayer.establish` so writes can
 * push through the active room. `null` means offline mode (writes
 * persist locally but don't broadcast).
 *
 * Declared `'static'` — one shared model per page.
 */
Class(function PlayerModel() {
  Inherit(this, Model);
  const self = this;
  var _room;
  this.UPDATE = 'player_model_update';
  this.state = AppState.createLocal();
  this.state._set = this.state.set;
  this.state.set = this.set;
  (function () {
    self.data = Storage.get('playerModel') || {};
    GameCenter.userData = self.data;
    for (let key in self.data) self.state._set(key, self.data[key]);
    self.dataReady = true;
  })();
  this.set = function (key, value) {
    self.data[key] !== value &&
      ((self.data[key] = value),
      Storage.set('playerModel', self.data),
      _room && _room.updateUserData(self.data),
      self.events.fire(self.UPDATE),
      self.state._set(key, value));
  };
  this.get = function (key) {
    return self.data[key];
  };
  this.useRoom = function (room) {
    _room = room;
  };
}, 'static');

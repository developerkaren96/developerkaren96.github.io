/*
 * PlayerModel2 — v2 sibling of PlayerModel (0275). Identical
 * persistence model and event surface, but publishes to
 * `GameCenter2.userData` and fires `player2_model_update` so the
 * v1 and v2 stacks can coexist. Both back to the same
 * `Storage.get('playerModel')` key so the user's avatar/profile
 * is shared across versions.
 */
Class(function PlayerModel2() {
  Inherit(this, Model);
  const self = this;
  var _room;
  this.UPDATE = 'player2_model_update';
  this.state = AppState.createLocal();
  this.state._set = this.state.set;
  this.state.set = this.set;
  (function () {
    self.data = Storage.get('playerModel') || {};
    GameCenter2.userData = self.data;
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

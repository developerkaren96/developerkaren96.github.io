/*
 * PlayerView — base class that user-supplied avatar classes extend
 * (the `PlayerClass` argument passed into `Player` in 0273). Acts
 * as a thin adapter that:
 *
 *   - Pulls `state` and the PhysicalLink helpers (`bindLink`,
 *     `bindEvent`, `bindGlobal`, `bindGlobalEvent`, `fireEvent`) off
 *     the parent `Player` so the subclass doesn't have to traverse
 *     up to access them.
 *   - Aliases `setPlayerData` to `PlayerModel.set` so subclasses can
 *     mutate the local player's profile from inside the view code.
 *   - Provides empty `setUserData` and `onDisconnect` stubs that
 *     subclasses override (Player validates `setUserData` exists in
 *     0273).
 *   - `getIndex()` returns this player's index in
 *     `Multiplayer.room.players` — useful for deterministic
 *     ordering (turn-based games, seat assignment).
 */
Class(function PlayerView() {
  Inherit(this, Object3D);
  const self = this;
  this.state = this.parent.state;
  this.bindLink = this.parent.bindLink;
  this.bindEvent = this.parent.bindEvent;
  this.bindGlobal = this.parent.bindGlobal;
  this.bindGlobalEvent = this.parent.bindGlobalEvent;
  this.fireEvent = this.parent.fireEvent;
  this.setPlayerData = PlayerModel.set;
  this.setUserData = function () {};
  this.onDisconnect = function () {};
  this.getIndex = function () {
    let gcPlayer = self.parent.gcPlayer;
    return Multiplayer.room.players.indexOf(gcPlayer);
  };
});

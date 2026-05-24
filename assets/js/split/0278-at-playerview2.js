/*
 * PlayerView2 — v2 sibling of PlayerView (0277). Same adapter shape
 * but routes through `PlayerModel2.set` and `Multiplayer2.room`.
 * See 0277 for the surface walkthrough.
 */
Class(function PlayerView2() {
  Inherit(this, Object3D);
  const self = this;
  this.state = this.parent.state;
  this.bindLink = this.parent.bindLink;
  this.bindEvent = this.parent.bindEvent;
  this.bindGlobal = this.parent.bindGlobal;
  this.bindGlobalEvent = this.parent.bindGlobalEvent;
  this.fireEvent = this.parent.fireEvent;
  this.setPlayerData = PlayerModel2.set;
  this.setUserData = function () {};
  this.onDisconnect = function () {};
  this.getIndex = function () {
    let gcPlayer = self.parent.gcPlayer;
    return Multiplayer2.room.players.indexOf(gcPlayer);
  };
});

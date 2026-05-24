/*
 * GameCenterUser2 — v2 of GameCenterUser (see 0211 for the design
 * docstring). Same public surface, but binds against the v2 sibling
 * classes: GameCenter2, GameCenterSocket2, GameCenterNull2.
 */
Class(function GameCenterUser2(_socket, _community) {
  Inherit(this, Component);
  this.connection = new (_community ? GameCenterSocket2 : GameCenterNull2)(_socket);
  this.me = true;
  this.data = GameCenter2.userData;
  this.id = GameCenter2.GCID;
  this.disconnect = function () {};
});

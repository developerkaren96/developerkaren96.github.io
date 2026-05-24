/*
 * GameCenterConnection2 — v2 of the GameCenterConnection abstract
 * transport base (see 0213). Identical surface; bound to the v2
 * concrete transports.
 */
Class(function GameCenterConnection2() {
  Inherit(this, Component);
  this.establish = function () {};
  this.emit = function () {};
  this.wsData = function () {};
});

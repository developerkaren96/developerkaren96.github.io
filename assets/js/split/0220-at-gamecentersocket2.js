/*
 * GameCenterSocket2 — v2 of GameCenterSocket (see 0219). Identical
 * pure-relay transport, bound to the v2 GameCenter lineage so v2
 * sessions get a v2 instance.
 */
Class(function GameCenterSocket2(_socket) {
  Inherit(this, Component);
  this.emit = function (data = {}) {
    _socket.sendBinary(data);
  };
});

/*
 * GameCenterSocket — pure relay transport: every outbound payload
 * goes through the shared signalling socket as a binary frame.
 *
 * Used when WebRTC isn't viable (browser missing support, peers
 * behind symmetric NAT, etc.) and as the explicit transport for
 * "always relay" sessions. `establish` / `wsData` stay as the
 * no-op stubs inherited from GameCenterConnection (0213) — inbound
 * relay data is delivered by the parent session, not by this class.
 *
 * v2 sibling: GameCenterSocket2 (0220).
 */
Class(function GameCenterSocket(_socket) {
  Inherit(this, Component);
  this.emit = function (data = {}) {
    _socket.sendBinary(data);
  };
});

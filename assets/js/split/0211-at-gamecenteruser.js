/*
 * GameCenterUser — the "self" peer in a GameCenter session.
 *
 * Mirrors the GameCenterPlayer surface but for the local user. Sets:
 *   - `connection` : either a real GameCenterSocket (when a community
 *                    room is provided) or a no-op GameCenterNull
 *                    placeholder (single-player / offline mode).
 *   - `me`         : true — flag to differentiate from remote peers.
 *   - `data`       : initial profile payload from `GameCenter.userData`.
 *   - `id`         : globally-unique identifier provided by the
 *                    GameCenter relay (`GameCenter.GCID`).
 *
 * `disconnect()` is a no-op for the local user — disconnecting self
 * is handled by tearing down the whole GameCenter session.
 *
 * v2 sibling: GameCenterUser2 (0212).
 */
Class(function GameCenterUser(_socket, _community) {
  Inherit(this, Component);
  this.connection = new (_community ? GameCenterSocket : GameCenterNull)(_socket);
  this.me = true;
  this.data = GameCenter.userData;
  this.id = GameCenter.GCID;
  this.disconnect = function () {};
});

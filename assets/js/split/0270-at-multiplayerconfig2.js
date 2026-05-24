/*
 * MultiplayerConfig2 — v2 sibling of `MultiplayerConfig` (0269).
 * Same declarative shape but binds against `Multiplayer2` and uses
 * its own `connectedServer` static guard so v1 and v2 connection
 * state stay independent (a scene can configure both without one
 * reconnect cycle masking the other).
 *
 * Field semantics are identical to 0269 — see that file's header
 * for the parameter walkthrough.
 */
Class(function MultiplayerConfig2(_params) {
  _params.server &&
    MultiplayerConfig2.connectedServer !== _params.server &&
    ((MultiplayerConfig2.connectedServer = _params.server), Multiplayer2.connect(_params.server));
  this.parent.configure({
    roomKey: _params.roomKey,
    roomId: _params.roomId,
    playerClass: window[_params.playerClass],
    maxInRoom: _params.maxInRoom || 50,
    playerData: _params.data,
    watcher: _params?.data?.watcher || false,
    alwaysOn: _params?.data?.alwaysOn || false,
  });
});

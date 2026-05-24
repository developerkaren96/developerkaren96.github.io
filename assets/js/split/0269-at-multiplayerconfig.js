/*
 * MultiplayerConfig — declarative scene-layout adapter that wires a
 * parent multiplayer container (the v1 system) to a server +
 * room descriptor pulled from layout params. Doing this through a
 * Class rather than imperatively lets it live inline in a scene
 * graph JSON.
 *
 * Behaviour:
 *   - If `params.server` is set and differs from the previously
 *     connected one (`MultiplayerConfig.connectedServer`), calls
 *     `Multiplayer.connect(server)` exactly once per server URL.
 *     The static field guards against reconnects when the same
 *     scene is reloaded.
 *   - Calls `this.parent.configure({...})` to hand the parent the
 *     full join descriptor:
 *       - `roomKey` / `roomId`        — which room to join.
 *       - `playerClass`               — resolved off the global
 *         scope by name (string), so layouts can reference any
 *         registered player class.
 *       - `maxInRoom`                 — capacity (default 50).
 *       - `playerData`                — opaque payload sent with
 *         the join; the server passes it through to other clients.
 *       - `watcher` / `alwaysOn`      — read from `params.data`.
 *         `watcher` triggers spectator (`watchRoom`) join;
 *         `alwaysOn` keeps the connection alive while backgrounded.
 */
Class(function MultiplayerConfig(_params) {
  _params.server &&
    MultiplayerConfig.connectedServer !== _params.server &&
    ((MultiplayerConfig.connectedServer = _params.server), Multiplayer.connect(_params.server));
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

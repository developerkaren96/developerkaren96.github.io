/*
 * GameCenterConnection — abstract base for any transport that can
 * carry GameCenter peer-to-peer data (WebSocket relay, WebRTC, or
 * null/loopback).
 *
 * All three methods are no-op stubs here; concrete subclasses
 * (`GameCenterSocket`, `GameCenterRTC`, `GameCenterNull`) override
 * them with real behaviour. Consumers can hold a
 * `GameCenterConnection` reference without caring which transport
 * is in use.
 *
 *   - `establish()` — start the connection (open WS / SDP exchange).
 *   - `emit(data)`  — send a payload to the remote peer.
 *   - `wsData(data)` — fold inbound relay data into the peer's state
 *                       (used by RTC during signalling fallback).
 *
 * v2 sibling: GameCenterConnection2 (0214).
 */
Class(function GameCenterConnection() {
  Inherit(this, Component);
  this.establish = function () {};
  this.emit = function () {};
  this.wsData = function () {};
});

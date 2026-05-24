/*
 * Multiplayer — static top-level facade for the GameCenter
 * networking stack. Hides the choice between `findRoom`,
 * `joinRoom`, and `watchRoom` (spectator) behind a single
 * `establish(obj)` call, and re-publishes the room's PIN/UNPIN
 * events on its own channels so app code doesn't need to know
 * about GameCenterRoom directly.
 *
 * Connection lifecycle:
 *   - `connect(server)` — bootstrap the GameCenter socket. Also
 *     subscribes to `BLOCKED_ERROR` and re-fires it as `UNREACHABLE`
 *     so app code listens on a stable name.
 *   - `establish(obj)` — leaves any existing room (awaits the
 *     leave promise so transitions don't race), then:
 *       - With `roomId`: joins or watches an explicit room key
 *         (`watchRoom` if `obj.watcher`, else `joinRoom`). The room
 *         key is `${community ? 'community_' : ''}${roomKey/roomId}`.
 *       - Without: calls `findRoom` to discover or create one.
 *       - Community fallback: if the explicit join failed and the
 *         room was community-flagged, fall back to `watchRoom` so
 *         spectator-mode degraded join still works.
 *     After acquiring `_room`, plugs it into PhysicalSync,
 *     PlayerModel, optionally GameCenterMedia (voice/video),
 *     exposes it on `Dev.expose('room', …)`, hooks the PIN/UNPIN
 *     repeaters, and fires `ROOM` with `{room}`.
 *   - `leave(room)` — only acts if the given room matches the
 *     active one (prevents stale callbacks racing against newer
 *     joins).
 *   - Internal `leave()` arms a 5-second fallback timer so a
 *     hung disconnect doesn't pin `self.leaving = true` forever.
 *
 * `waitForFocus()` returns a Promise that resolves the next time
 * the page gains visibility/focus — handy for batching network
 * resyncs against tab focus rather than tab-blurred background
 * ticks.
 *
 * Events: `ROOM`, `PIN`, `UNPIN`, `UNREACHABLE`. PIN/UNPIN are the
 * "persisted message" channels (latched events that new joiners
 * receive on connect).
 */
Class(function Multiplayer() {
  Inherit(this, Component);
  const self = this;
  let _room, _focusPromise, _leavingPromise, _joiningPromise;
  async function leave() {
    await _joiningPromise;
    _leavingPromise = Promise.create();
    let fallback = self.delayedCall((_) => {
      self.leaving = false;
      _leavingPromise.resolve();
    }, 5e3);
    self.leaving = true;
    PhysicalSync.useRoom(null);
    _room && _room.leave && (_room = _room.leave());
    PlayerModel.useRoom(null);
    window.GameCenterMedia && (await GameCenterMedia.useRoom(null));
    self.leaving = false;
    _leavingPromise.resolve();
    clearTimeout(fallback);
  }
  function onVisibility(e) {
    'focus' == e.type ? _focusPromise && _focusPromise.resolve() : (_focusPromise = null);
  }
  function handlePin(e) {
    self.events.fire(self.PIN, e);
  }
  function handleUnpin(e) {
    self.events.fire(self.UNPIN, e);
  }
  function gameCenterBlocked() {
    self.events.fire(self.UNREACHABLE);
  }
  this.ROOM = 'multiplayer_room';
  this.PIN = 'multiplayer_pin';
  this.UNPIN = 'multiplayer_unpin';
  this.UNREACHABLE = 'multiplayer_unreachable';
  (function addListeners() {
    self.events.sub(Events.VISIBILITY, onVisibility);
  })();
  this.connect = function (server) {
    GameCenter.connect(server);
    self.events.sub(GameCenter.BLOCKED_ERROR, gameCenterBlocked);
  };
  this.establish = async function (obj) {
    _room && leave();
    await _leavingPromise;
    await self.wait(50);
    _joiningPromise = Promise.create();
    try {
      if (obj.roomId) {
        let fn = obj.watcher ? GameCenter.watchRoom : GameCenter.joinRoom;
        _room = await fn(
          `${obj.community ? 'community_' : ''}${obj.roomKey + '/' + obj.roomId}`,
          obj,
        );
      } else
        _room = await GameCenter.findRoom(
          `${obj.community ? 'community_' : ''}${obj.roomKey}`,
          obj,
        );
    } catch (e) {
      if (!obj.roomId || !obj.community) throw e;
      try {
        _room = await GameCenter.watchRoom('community_' + (obj.roomKey + '/' + obj.roomId), true);
      } catch (e) {
        throw e;
      }
    }
    return (
      PhysicalSync.useRoom(_room),
      PlayerModel.useRoom(_room),
      window.GameCenterMedia && (await GameCenterMedia.useRoom(_room)),
      Dev.expose('room', _room),
      self.events.sub(_room, GameCenterRoom.PIN, handlePin),
      self.events.sub(_room, GameCenterRoom.UNPIN, handleUnpin),
      self.events.fire(self.ROOM, {
        room: _room,
      }),
      _joiningPromise.resolve(),
      _room
    );
  };
  this.leave = function (room) {
    _room == room && leave();
  };
  this.pin = function (data, timeInSeconds) {
    _room && _room.pin(data, timeInSeconds);
  };
  this.unpin = function (data) {
    _room && _room.unpin(data);
  };
  this.waitForFocus = function () {
    return (_focusPromise || (_focusPromise = Promise.create()), _focusPromise);
  };
  this.get('room', (_) => _room);
}, 'static');

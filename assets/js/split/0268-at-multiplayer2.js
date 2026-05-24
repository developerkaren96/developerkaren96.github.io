/*
 * Multiplayer2 — v2 sibling of `Multiplayer` (0267). Identical
 * surface and lifecycle, but wired against the v2 versions of
 * the underlying systems:
 *   - GameCenter2 (instead of GameCenter)
 *   - PhysicalSync2 / PlayerModel2 / GameCenterMedia2
 *
 * The split exists because v2 uses a different wire protocol /
 * relay format (see GameCenterRTC2, GameCenterRoom2, etc.), so the
 * two namespaces co-exist for backwards compatibility — code that
 * was authored against v1 keeps working unchanged.
 *
 * Everything else (establish overloads, community-fallback to
 * watchRoom, PIN/UNPIN re-publishing, focus-promise plumbing,
 * 5-second leave fallback) is identical to 0267 — see that file's
 * header for the detailed lifecycle commentary.
 */
Class(function Multiplayer2() {
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
    PhysicalSync2.useRoom(null);
    _room && _room.leave && (_room = _room.leave());
    PlayerModel2.useRoom(null);
    window.GameCenterMedia2 && (await GameCenterMedia2.useRoom(null));
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
  this.ROOM = 'multiplayer2_room';
  this.PIN = 'multiplayer2_pin';
  this.UNPIN = 'multiplayer2_unpin';
  this.UNREACHABLE = 'multiplayer2_unreachable';
  (function addListeners() {
    self.events.sub(Events.VISIBILITY, onVisibility);
  })();
  this.connect = function (server) {
    GameCenter2.connect(server);
    self.events.sub(GameCenter2.BLOCKED_ERROR, gameCenterBlocked);
  };
  this.establish = async function (obj) {
    _room && leave();
    await _leavingPromise;
    await self.wait(50);
    _joiningPromise = Promise.create();
    try {
      if (obj.roomId) {
        let fn = obj.watcher ? GameCenter2.watchRoom : GameCenter2.joinRoom;
        _room = await fn(
          `${obj.community ? 'community_' : ''}${obj.roomKey + '/' + obj.roomId}`,
          obj,
        );
      } else
        _room = await GameCenter2.findRoom(
          `${obj.community ? 'community_' : ''}${obj.roomKey}`,
          obj,
        );
    } catch (e) {
      if (!obj.roomId || !obj.community) throw e;
      try {
        _room = await GameCenter2.watchRoom('community_' + (obj.roomKey + '/' + obj.roomId), true);
      } catch (e) {
        throw e;
      }
    }
    return (
      PhysicalSync2.useRoom(_room),
      PlayerModel2.useRoom(_room),
      window.GameCenterMedia2 && (await GameCenterMedia2.useRoom(_room)),
      Dev.expose('room', _room),
      self.events.sub(_room, GameCenterRoom2.PIN, handlePin),
      self.events.sub(_room, GameCenterRoom2.UNPIN, handleUnpin),
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

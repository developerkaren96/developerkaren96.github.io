/*
 * GameCenterNull — loopback / no-op transport used when there is no
 * community to connect to (single-player mode, offline preview).
 *
 * `isNull = true` lets the GameCenter peer-roster code skip work
 * (heartbeat pings, presence broadcast) when there's nobody on the
 * other end.
 *
 * The prototype is patched on the first construction so all instances
 * share the same no-op methods — a slight memory optimisation
 * (avoids per-instance closure allocation).
 *
 * v2 sibling: GameCenterNull2 (0216).
 */
Class(function GameCenterNull() {
  const prototype = GameCenterNull.prototype;
  if (prototype.establish === undefined) {
    prototype.isNull = true;
    prototype.establish = function () {};
    prototype.emit = function () {};
    prototype.wsData = function () {};
    prototype.close = function () {};
  }
});

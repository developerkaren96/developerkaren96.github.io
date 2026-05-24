/*
 * GameCenterNull2 — v2 of GameCenterNull (see 0215). Same shape and
 * prototype-patch trick, just a distinct constructor so consumers
 * binding to the v2 lineage get a v2 instance.
 */
Class(function GameCenterNull2() {
  const prototype = GameCenterNull2.prototype;
  if (prototype.establish === undefined) {
    prototype.isNull = true;
    prototype.establish = function () {};
    prototype.emit = function () {};
    prototype.wsData = function () {};
    prototype.close = function () {};
  }
});

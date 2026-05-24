/*
 * GameCenterPlayer — represents one remote peer in a GameCenter
 * session. The host GameCenter creates one of these per remote `_id`
 * it sees on the socket.
 *
 * State:
 *   - `_results`     : the most recent ping samples (capped at 3 —
 *                       early-exit `sendPing` once we have a stable
 *                       latency estimate so we don't spam the relay).
 *   - `_messages`    : per-channel/per-key message queue (used by
 *                       ordered reliable delivery on top of the
 *                       unordered websocket).
 *   - `_lastMessage` : `Render.TIME` of last incoming message — used
 *                       by the host to detect dead peers and tear
 *                       down their session.
 *   - `_evt`         : preallocated event envelope reused on
 *                       outbound events to avoid per-event GC.
 *
 * Construction:
 *   `_id`        — remote player ID (timestamp from their client).
 *   `_socket`    — shared WebSocket; this peer uses it for
 *                   targeted send/receive but doesn't own it.
 *   `_data`      — initial data payload from the server when this
 *                   player joined.
 *   `_initiator` — true if *we* opened the connection to them
 *                   (vs. they were already in the room when we
 *                   arrived) — controls who pings first.
 *   `_community` — the GameCenter room key.
 *
 * The full file (below) wires up the message/ping protocol and the
 * outbound event dispatch for `JOIN`, `LEAVE`, `MESSAGE`, etc.
 *
 * `GameCenterPlayer2` (0210) is the v2 sibling — same role, different
 * relay protocol.
 */
Class(
  function GameCenterPlayer(_id, _socket, _data, _initiator, _community) {
    Inherit(this, Component);
    var self = this,
      _evt = {
        target: self,
        id: _id,
      },
      _results = [],
      _messages = {},
      _lastMessage = Render.TIME;
    function sendPing() {
      if (_results.length >= 3) return;
      let message = {
        _ping: true,
      };
      message.id = Utils.timestamp();
      message.outTime = Date.now();
      message.to = _id;
      message.from = GameCenter.GCID;
      _messages[message.id] = message;
      self.emit(message);
    }
    function handlePing(data) {
      if (_messages[data.id]) {
        let difference = Date.now() - data.inTime;
        _results.unshift(difference);
        self.offset = difference;
        _results.length < 3
          ? sendPing()
          : (function calculate() {
              self.flag('ready', true);
              self.events.fire(Events.READY);
              _results.length > 3 && (_results = _results.slice(0, 3));
              _results.sort((a, b) => a - b);
              self.offset = _results[1];
            })();
      } else {
        data.inTime = Date.now();
        self.emit(data);
      }
    }
    function onMessage(data) {
      if (!data.to || data.to == GameCenter.GCID) {
        if (((self.ping = Render.TIME - _lastMessage), (_lastMessage = Render.TIME), data._ping))
          return handlePing(data);
        _evt.player = self;
        _evt.data = data;
        self.events.fire(GameCenter.DATA, _evt);
      }
    }
    function ready(e) {
      self.connection.isNull ||
        self.parent.flag('watcher') ||
        (e.socket && self.events.fire(GameCenterPlayer.FALLBACK_SOCKET),
        self.delayedCall(() => {
          sendPing();
        }, 10));
    }
    this.connection = self.initClass(
      _community ? GameCenterNull : GameCenterRTC,
      _id,
      _socket,
      _initiator,
      self,
    );
    this.id = _id;
    this.data = _data;
    this.offset = 0;
    this.ping = 0;
    (function addListeners() {
      self.connection.isNull ||
        (self.events.sub(self.connection, Events.READY, ready),
        self.events.bubble(self.connection, Events.ERROR),
        (self.connection.onMessage = onMessage));
    })();
    this.onMessage = onMessage;
    this.emit = function (data) {
      self.connection.emit(data.length ? data : JSON.stringify(data));
    };
    this.disconnect = function () {
      self.connection.close();
      self.events.fire(GameCenter.DISCONNECTED);
    };
    this.connected = function () {
      return self.wait('ready');
    };
    this.sever = function () {
      self.videos?.forEach((v) => v.destroy());
    };
  },
  (_) => {
    GameCenterPlayer.UPDATE_DATA = 'gcp_update_data';
    GameCenterPlayer.FALLBACK_SOCKET = 'gcp_fallback_socket';
  },
);

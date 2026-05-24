/*
 * GameCenterPlayer2 — v2 remote-peer abstraction (see 0209 for the
 * v1 GameCenterPlayer docstring; the design is the same).
 *
 * Same public surface — `_id`, `_socket`, `_data`, `_initiator`,
 * `_community` — but uses the v2 relay's protocol semantics. Paired
 * with GameCenter2 (0208).
 */
Class(
  function GameCenterPlayer2(_id, _socket, _data, _initiator, _community) {
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
      message.from = GameCenter2.GCID;
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
      if (!data.to || data.to == GameCenter2.GCID) {
        if (((self.ping = Render.TIME - _lastMessage), (_lastMessage = Render.TIME), data._ping))
          return handlePing(data);
        _evt.player = self;
        _evt.data = data;
        self.events.fire(GameCenter2.DATA, _evt);
      }
    }
    function ready(e) {
      self.connection.isNull ||
        self.parent.flag('watcher') ||
        (e.socket && self.events.fire(GameCenterPlayer2.FALLBACK_SOCKET),
        self.delayedCall(() => {
          sendPing();
        }, 10));
    }
    this.connection = self.initClass(
      _community ? GameCenterNull2 : GameCenterRTC2,
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
      self.events.fire(GameCenter2.DISCONNECTED);
    };
    this.connected = function () {
      return self.wait('ready');
    };
    this.sever = function () {
      self.videos?.forEach((v) => v.destroy());
    };
  },
  (_) => {
    GameCenterPlayer2.UPDATE_DATA = 'gcp2_update_data';
    GameCenterPlayer2.FALLBACK_SOCKET = 'gcp2_fallback_socket';
  },
);

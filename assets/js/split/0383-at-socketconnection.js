/*
 * SocketConnection — Hydra wrapper around a single WebSocket
 * with automatic reconnect, ping/pong keepalive, and
 * register-channel routing. Used for both editor live-reload
 * and app-level multiplayer/state sync.
 *
 * Connection lifecycle:
 *   - `connect()` opens `new WebSocket(server, ['permessage-deflate'])`
 *     with `binaryType = 'arraybuffer'`; hooks open/message/
 *     close/error.
 *   - On `open`: clears `_fail` retry counter, sets `connected`,
 *     fires SocketConnection.OPEN (with `socket: self`). If a
 *     `_channel` was passed in, immediately sends a
 *     `'register'` message with `{channel}` so the server can
 *     route this socket into that pub/sub group.
 *   - On `close/error`: a backoff retry path (driven by `_fail`)
 *     reconnects.
 *
 * Keepalive: `sendPing()` periodically emits the string `PING`;
 * server is expected to reply with `PONG`. The `_pingPong`
 * timer (set up later in the file) also triggers
 * `checkIfConnected` to fire SocketConnection.BLOCKED when no
 * response arrives — signal to the app that the network or
 * server is unreachable.
 *
 * Constants (defined in the static-init block at the end of the
 * Class definition): OPEN, BLOCKED, MESSAGE, CLOSE — surfaced
 * as event types on `self.events`.
 */
Class(
  function SocketConnection(_server, _channel) {
    Inherit(this, Component);
    var _socket,
      _pingPong,
      self = this,
      _fail = 0,
      _binary = {},
      _time = Render.TIME;
    const PING = 'ping',
      PONG = 'pong';
    function connect() {
      self.pending = false;
      (_socket = new WebSocket(_server, ['permessage-deflate'])).binaryType = 'arraybuffer';
      _socket.onopen = open;
      _socket.onmessage = message;
      _socket.onclose = close;
      _socket.onerror = close;
    }
    function sendPing() {
      _socket && _socket.readyState == WebSocket.OPEN && _socket.send(PING);
    }
    function checkIfConnected() {
      self.blocked ||
        self.connected ||
        ((self.blocked = true), self.events.fire(SocketConnection.BLOCKED));
    }
    function open(e) {
      _fail = 0;
      self.connected = true;
      self.events.fire(
        SocketConnection.OPEN,
        {
          socket: self,
        },
        true,
      );
      _channel &&
        self.send('register', {
          channel: _channel,
        });
      _pingPong = setInterval(sendPing, 5e3);
    }
    function message(e) {
      if (e.data != PONG && e.data != PING)
        if ('string' == typeof e.data)
          try {
            let data = JSON.parse(e.data),
              evt = data._evt;
            evt
              ? (delete data._evt, self.events.fire(evt, data, true))
              : ((_binary.data = data), self.events.fire(SocketConnection.BINARY, _binary));
          } catch (er) {}
        else {
          _binary.data = e.data;
          self.events.fire(SocketConnection.BINARY, _binary);
        }
    }
    function close(e) {
      if (Render.TIME - _time < 50 && !self.blocked)
        return ((self.blocked = true), self.events.fire(SocketConnection.BLOCKED));
      self.pending ||
        _fail++ > 250 ||
        ((self.connected = false),
        (self.pending = true),
        self.events.fire(
          SocketConnection.CLOSE,
          {
            socket: self,
          },
          true,
        ),
        (self.timer = self.delayedCall(connect, 250)),
        clearTimeout(_pingPong));
    }
    this.connected = false;
    (async function () {
      try {
        connect();
      } catch (e) {
        await defer();
        self.events.fire(SocketConnection.ERROR, {
          socket: self,
        });
        self.timer = self.delayedCall(connect, 250);
        self.delayedCall(checkIfConnected, 2e4);
      }
    })();
    this.send = function (evt, data = {}) {
      if (!self.connected) return self.delayedCall((_) => self.send(evt, data), 100);
      data._evt = evt;
      _socket &&
        _socket.readyState == WebSocket.OPEN &&
        _socket.send(null != data.length ? data : JSON.stringify(data));
    };
    this.sendBinary = function (data) {
      _socket &&
        _socket.readyState == WebSocket.OPEN &&
        _socket.bufferedAmount < 1024 &&
        _socket.send('binary:' + (null != data.length ? data : JSON.stringify(data)));
    };
    this.close = function () {
      _socket.onclose = null;
      _socket.onerror = null;
      clearTimeout(self.timer);
      _socket.close();
    };
  },
  (_) => {
    SocketConnection.OPEN = 'socket_connection_open';
    SocketConnection.CLOSE = 'socket_connection_close';
    SocketConnection.ERROR = 'socket_connection_error';
    SocketConnection.BINARY = 'socket_connection_binary';
    SocketConnection.BLOCKED = 'socket_connection_blocked';
  },
);

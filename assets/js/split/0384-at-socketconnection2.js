/*
 * SocketConnection2 — duplicate of SocketConnection (0383) used
 * as a secondary channel so an app can hold two independent
 * WebSocket connections (e.g. one for control plane, one for
 * binary data). All event constants are namespaced under
 * `SocketConnection2.*` to keep the two buses separate.
 *
 * Behaviour is identical to 0383: connect / ping-pong /
 * register-channel / reconnect backoff. See that file's header
 * for full documentation; the class is duplicated rather than
 * sharing a base because each one carries its own static event
 * constants and the runtime needs the two to be distinct
 * subscribable namespaces.
 */
Class(
  function SocketConnection2(_server, _channel) {
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
        ((self.blocked = true), self.events.fire(SocketConnection2.BLOCKED));
    }
    function open(e) {
      _fail = 0;
      self.connected = true;
      self.events.fire(
        SocketConnection2.OPEN,
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
              : ((_binary.data = data), self.events.fire(SocketConnection2.BINARY, _binary));
          } catch (er) {}
        else {
          _binary.data = e.data;
          self.events.fire(SocketConnection2.BINARY, _binary);
        }
    }
    function close(e) {
      if (Render.TIME - _time < 50 && !self.blocked)
        return ((self.blocked = true), self.events.fire(SocketConnection2.BLOCKED));
      self.pending ||
        _fail++ > 250 ||
        ((self.connected = false),
        (self.pending = true),
        self.events.fire(
          SocketConnection2.CLOSE,
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
        self.events.fire(SocketConnection2.ERROR, {
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
    SocketConnection2.OPEN = 'socket2_connection_open';
    SocketConnection2.CLOSE = 'socket2_connection_close';
    SocketConnection2.ERROR = 'socket2_connection_error';
    SocketConnection2.BINARY = 'socket2_connection_binary';
    SocketConnection2.BLOCKED = 'socket2_connection_blocked';
  },
);

/*
 * GameCenterRTC2 — v2 of GameCenterRTC (see 0217 for the full design
 * docstring). Same offer/answer + negotiated-DataChannel + relay
 * fallback pattern; the only divergence is that fallback envelopes
 * tag themselves with `GameCenter2.GCID` so the v2 session bus
 * routes them correctly.
 */
Class(function GameCenterRTC2(_id, _socket, _initiator, _parent) {
  Inherit(this, Component);
  var _peer,
    _data,
    _fallbackSocket,
    _timeout,
    self = this;
  function fallbackToSocket() {
    clearTimeout(_timeout);
    _socket.send('ws_data', {
      from: GameCenter2.GCID,
      fallbackToSocket: true,
    });
    _fallbackSocket = true;
    self.events.fire(Events.READY, {
      socket: true,
    });
  }
  function sendNegotiation(type, sdp) {
    let data = {
      to: _id,
      type: type,
      sdp: sdp,
    };
    _socket.send('establish_rtc', data);
  }
  function dataMessage(e) {
    self.onMessage && self.onMessage(JSON.parse(e.data));
  }
  function dataOpen(e) {
    self.events.fire(Events.READY);
  }
  function dataClose(e) {
    clearTimeout(_timeout);
    self.events.fire(Events.ERROR, {
      gcID: _id,
    });
  }
  function dataError(e) {
    self.events.fire(Events.ERROR, {
      gcID: _id,
    });
  }
  !(function initPeerConnection() {
    _peer = new RTCPeerConnection({
      iceServers: [
        {
          urls: 'stun:stun.l.google.com:19302',
        },
      ],
    });
    _timeout = self.delayedCall(fallbackToSocket, 7e3);
    _peer.onicecandidate = (e) => {
      _peer && e && e.candidate && sendNegotiation('candidate', e.candidate);
    };
    (_data = _peer.createDataChannel('gamecenter', {
      ordered: false,
      negotiated: true,
      id: 7,
    })).onmessage = dataMessage;
    _data.onopen = dataOpen;
    _data.onclose = dataClose;
    _data.onerror = dataError;
    _peer.ondatachannel = (e) => {
      e.channel.onmessage = dataMessage;
      e.channel.onclose = dataClose;
      e.channel.onerror = dataError;
    };
    _peer.onconnectionstatechange = (e) => {
      switch (_peer.iceConnectionState) {
        case 'connected':
          self.flag('connected', true);
          clearTimeout(_timeout);
          break;
        case 'disconnected':
          self.flag('connected', false);
      }
    };
    _peer.oniceconnectionstatechange = (e) => {
      'failed' == _peer.iceConnectionState && fallbackToSocket();
    };
  })();
  _initiator &&
    (async function initConnection() {
      let sdp = await _peer.createOffer();
      _peer.setLocalDescription(sdp);
      sendNegotiation('offer', sdp);
    })();
  this.establish = function (data) {
    if (_peer)
      switch (data.type) {
        case 'candidate':
          !(function processIce(iceCandidate) {
            if (!self.flag('connected'))
              try {
                _peer.addIceCandidate(new RTCIceCandidate(iceCandidate));
              } catch (e) {
                self.events.fire(Events.ERROR, {
                  gcID: _id,
                });
              }
          })(data.sdp);
          break;
        case 'offer':
          !(async function processOffer(offer) {
            if (!self.flag('connected'))
              try {
                await _peer.setRemoteDescription(new RTCSessionDescription(offer));
                let sdp = await _peer.createAnswer();
                _peer.setLocalDescription(sdp).catch((e) =>
                  self.events.fire(Events.ERROR, {
                    gcID: _id,
                  }),
                );
                sendNegotiation('answer', sdp);
              } catch (e) {}
          })(data.sdp);
          break;
        case 'answer':
          !(async function processAnswer(answer) {
            if (!self.flag('connected')) {
              try {
                await _peer.setRemoteDescription(new RTCSessionDescription(answer));
              } catch (e) {
                self.events.fire(Events.ERROR, {
                  gcID: _id,
                });
              }
              return true;
            }
          })(data.sdp);
      }
  };
  this.emit = function (data) {
    if (('string' != typeof data && (data = JSON.stringify(data)), _fallbackSocket))
      _socket.sendBinary(data);
    else {
      if (_data && 'open' != _data.readyState) return;
      try {
        _data && _data.send(data);
      } catch (e) {}
    }
  };
  this.wsData = function (data) {
    if (data.fallbackToSocket)
      return ((_fallbackSocket = true), void self.events.fire(Events.READY));
    self.onMessage && self.onMessage(data);
  };
  this.close = function () {
    _peer &&
      (_peer.close(),
      (_peer.onconnectionstatechange = null),
      (_peer.ondatachannel = null),
      (_peer.oniceconnectionstatechange = null),
      (_peer.onicecandidate = null),
      (_peer = null),
      clearTimeout(_timeout));
  };
});

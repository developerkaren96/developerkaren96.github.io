/*
 * MobileSync — Multiplayer pairing fragment. Hosts a QRCode
 * fragment on desktop and a 2-player room on
 * `wss://s.dreamwave.network/ws` so a phone can scan the QR
 * and remote-control the desktop view (scroll + mouse +
 * touch + contact/work navigation).
 *
 * Key generation: `atv6qr${Utils.uuid()}` (overridable via
 * ?roomqr= query — used when the phone navigates to the QR's
 * URL).
 *
 * Roles:
 *   - Desktop side (!Device.mobile): creates the QR (size 110)
 *     and publishes it on AppState 'qrcode'. On player
 *     connect, scrolls to top.
 *   - Phone side (?roomqr present): joins the room with the
 *     scanned key; isDesktop=false so it doesn't render its
 *     own QR.
 *
 * Dominance protocol:
 *   - PlayerModel.lastaction is bumped on any local Interaction
 *     start/move, Keyboard.DOWN, or wheel event.
 *   - isDominant() compares the local lastaction against the
 *     other player's — whichever moved more recently wins and
 *     skips sync-apply so input doesn't echo.
 *
 * Synced state per frame (PlayerModel):
 *   - scroll (normalised), mousex, mousey, mousedown
 *
 * Synced events via Multiplayer.room.broadcast:
 *   - set_contact ← ViewController/contact toggle
 *   - set_work    ← Work/project (index lookup against
 *     WorkItems/items list; sets Work/project and
 *     WorkItems/videoURL on receive)
 *
 * When non-dominant the fragment replays the other side's
 * scroll position (sm.scrollTo) and dispatches synthetic
 * MouseEvent('mousemove') + TouchEvent('touchmove') so all
 * the local interaction handlers fire for the remote cursor.
 * uSyncTouch shader uniform lerps based on movement delta to
 * trigger ripple FX on the receiving end.
 *
 * MultiplayerConfig: server wss://s.dreamwave.network/ws,
 * playerClass 'ScrollPlayer', maxInRoom 2.
 *
 * Standard Fragment plumbing.
 */
Class(function MobileSync(_params, ...restArgs) {
  const self = this;
  Inherit(self, Component);
  Inherit(self, MultiplayerEnvironment);
  Inherit(self, XComponent);
  self.fragName = 'MobileSync';
  self.contexts = 'Component,MultiplayerEnvironment';
  self.params = _params;
  self.args = arguments;
  this.isFragment = true;
  var _promises = [];
  !(async function () {
    self.element && (self.element.onMountedHook = (_) => self.onMounted?.());
    self.params = _params;
    self.args = arguments;
    self.parent?.layers && (self.layers = self.parent.layers);
    self.layout?.getAllLayers && (self.layers = await self.layout.getAllLayers());
    self.key = `atv6qr${Utils.uuid()}`;
    let isDesktop = !Device.mobile;
    function isDominant() {
      const otherplayer = self.get('otherplayer', true);
      if (!otherplayer) return;
      return !((otherplayer.state.lastaction || 0) > self.get('lastaction', true));
    }
    function onLastAction(e) {
      if (self.fromSync) return;
      const now = +Date.now();
      self.set('lastaction', now);
      PlayerModel.set('lastaction', now);
    }
    Utils.query('roomqr') && ((self.key = Utils.query('roomqr')), (isDesktop = false));
    isDesktop &&
      (self.qrcode = self.createFragment(QRCode, {
        size: 110,
        key: self.key,
      }));
    self.set('qrcode', self.qrcode);
    self.set('otherplayer', false);
    self.set('lastaction', +Date.now());
    self.otherx = 0;
    self.othery = 0;
    self.scroll = 0;
    self.bind('otherplayer', (player) => {
      self.qrcode && player && self.set('ViewController/contact', false);
    });
    self.onConnection = (player) => {
      const { gcPlayer: gcPlayer } = player,
        { parent: parent } = gcPlayer;
      if (Multiplayer.room.id === parent.id) {
        if ((self.set('otherplayer', player), isDesktop)) {
          let sm = self.get('ViewController/scroll', true);
          sm?.scrollTo?.(0, 0);
        } else onLastAction();
        self.set('ViewController/contact', false);
        self.bind('ViewController/contact', (open) => {
          console.log('send contact');
          self.sendEvent('set_contact', open);
        });
        self.bindEvent('set_contact', (d) => {
          isDominant() || (console.log('set contact'), self.set('ViewController/contact', d));
        });
        self.bind('Work/project', (open) => {
          console.log('send work', open?.index);
          self.sendEvent('set_work', {
            index: open?.index,
          });
        });
        self.bindEvent('set_work', (work) => {
          if (isDominant()) return;
          const index = work?.index,
            item = self
              .get('WorkItems/items', true)
              .toJSON()
              .find((t) => t.index === index);
          console.log('open item', index);
          item
            ? (self.set('Work/project', item), self.set('WorkItems/videoURL', item.videoURL))
            : self.set('Work/project', null);
        });
      }
    };
    self.onDisconnection = (_) => {
      self.set('otherplayer', false);
    };
    self.sendEvent = (key, data) => {
      Multiplayer.room &&
        Multiplayer.room.broadcast({
          data: data,
          type: key,
        });
    };
    self.bindEvent = (key, callback) => {
      Multiplayer.room &&
        Multiplayer.room.events.sub(
          Multiplayer.room.socket,
          SocketConnection.BINARY,
          ({ data: data }) => {
            try {
              if ((data = data[0]).from === GameCenter.GCID) return;
              data.type === key && callback(data.data);
            } catch (e) {
              console.error(e);
            }
          },
        );
    };
    self.wasDominant = false;
    self.startRender((_) => {
      let sm = self.get('ViewController/scroll', true);
      if (!sm) return;
      const scroll = sm.renderManager.controller.scroll,
        total = sm.renderManager.controller.totalHeight,
        scrollIndex = scroll / total,
        otherplayer = self.get('otherplayer', true);
      if (
        (PlayerModel.set('scroll', scrollIndex),
        PlayerModel.set('mousex', Mouse.x / Stage.width),
        PlayerModel.set('mousey', Mouse.y / Stage.height),
        PlayerModel.set('mousedown', Mouse.down ? 1 : 0),
        !otherplayer)
      )
        return;
      if (isDominant()) return void (self.wasDominant = true);
      self.fromSync = true;
      const otherscroll = otherplayer.state.scroll;
      self.scroll = otherscroll;
      sm.scrollTo(self.scroll * total, 0);
      const x = otherplayer.state.mousex * Stage.width,
        y = otherplayer.state.mousey * Stage.height;
      self.otherx = Math.lerp(x, self.otherx, 0.1);
      self.othery = Math.lerp(y, self.othery, 0.1);
      let uniforms = self.get('ViewController/uniforms'),
        moved = Math.abs(self.otherx - x) + Math.abs(self.othery - y);
      uniforms.uSyncTouch.value = Math.lerp(Math.min(2, moved), uniforms.uSyncTouch.value, 0.1);
      (function simulateMouseEvent(type, x, y) {
        const element = window,
          mouseEvent = new MouseEvent(type, {
            screenX: 0,
            screenY: 0,
            clientX: parseInt(x) || 0,
            clientY: parseInt(y) || 0,
            view: window,
            cancelable: true,
            bubbles: true,
          });
        element.dispatchEvent(mouseEvent);
      })('mousemove', self.otherx, self.othery);
      (function simulateTouchEvent(type, touches) {
        const touchEvents = [],
          element = window;
        touches.forEach((touch) => {
          touchEvents.push(
            new Touch({
              clientX: parseInt(touch.x) || 0,
              clientY: parseInt(touch.y) || 0,
              identifier: touch.id,
              target: element,
            }),
          );
        });
        element.dispatchEvent(
          new TouchEvent(type, {
            touches: touchEvents,
            view: window,
            cancelable: true,
            bubbles: true,
          }),
        );
      })('touchmove', [
        {
          x: self.otherx,
          y: self.othery,
          id: 0,
        },
      ]);
      self.fromSync = false;
    });
    self.onInit = function () {
      self.input = new Interaction(__window);
      self.input.unlocked = true;
      self.events.sub(self.input, Interaction.START, onLastAction);
      self.events.sub(self.input, Interaction.MOVE, onLastAction);
      self.events.sub(Keyboard.DOWN, onLastAction);
      __window.bind('wheel', onLastAction);
    };
    for (let key in self)
      if (self[key]?.then) {
        let store = self[key];
        store.then((val) => (self[key] = val));
        _promises.push(store);
      }
    _promises.length && (await Promise.all(_promises));
    self.ref_MultiplayerConfig895 = self.initClass(
      MultiplayerConfig,
      AppState.createLocal(
        {
          server: 'wss://s.dreamwave.network/ws',
          roomKey: self.key,
          playerClass: 'ScrollPlayer',
          maxInRoom: 2,
        },
        true,
      ),
    );
    self.ref_MultiplayerConfig895.isFragment &&
      _promises.push(self.wait(self.ref_MultiplayerConfig895, '__ready'));
    _promises = null;
    self.flag?.('__ready', true);
    self.onInit?.();
  })();
});

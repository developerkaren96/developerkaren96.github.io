/*
 * ChatUIInput — GLUI fragment for the chat input field. Built
 * from FragUIHelper as four GL layers:
 *   - glText "text"       — what the user has typed (NBArchitekt
 *                            12px white, initial '_').
 *   - glText "suggestion" — autocomplete/hint glText shown
 *                            grayed behind the cursor.
 *   - glObject "bg"       — 400×400 #000 background panel.
 *   - glObj "cursor"      — 8×12 cyan caret.
 *
 * Custom `ChatBGShader` (init below the cutoff): renders the bg
 * panel with a tinted color (#111111 base, modulated by uniform
 * driver).
 *
 * The rest of the file wires keyboard events to text mutation,
 * cursor blink, and submission → propagates the assistant's
 * response to ChatUIResponse (0396).
 *
 * Standard Fragment plumbing as in other XComponent classes.
 */
Class(function ChatUIInput(_params, ...restArgs) {
  const self = this;
  Inherit(self, GLUIElement);
  Inherit(self, XComponent);
  self.fragName = 'ChatUIInput';
  self.contexts = 'GLUIElement';
  self.params = _params;
  self.args = arguments;
  this.isFragment = true;
  var _promises = [];
  !(async function () {
    self.element && (self.element.onMountedHook = (_) => self.onMounted?.());
    self.initClass(FragUIHelper, {
      _type: 'UI',
      refName: 'wrapper',
      children: [
        {
          font: 'NBArchitektStd-Regular',
          fontSize: 12,
          fontColor: '#ffffff',
          _type: 'glText',
          _innerText: '_',
          refName: 'text',
          children: [],
        },
        {
          font: 'NBArchitektStd-Regular',
          fontSize: 12,
          fontColor: '#ffffff',
          _type: 'glText',
          _innerText: '_',
          refName: 'suggestion',
          children: [],
        },
        {
          width: 400,
          height: 400,
          bg: '#000000',
          _type: 'glObject',
          refName: 'bg',
          children: [],
        },
        {
          bg: '#00ffff',
          width: 8,
          height: 12,
          _type: 'glObj',
          refName: 'cursor',
          children: [],
        },
      ],
    });
    self.params = _params;
    self.args = arguments;
    self.parent?.layers && (self.layers = self.parent.layers);
    self.layout?.getAllLayers && (self.layers = await self.layout.getAllLayers());
    let bgShader = new Shader('ChatBGShader', {
      uColor: {
        value: new Color('#111111'),
      },
      uBottom: {
        value: 1,
      },
      uScroll: {
        value: 0,
      },
      uHeight: {
        value: 0.12,
      },
      uDisabled: {
        value: 0,
      },
      uActive: {
        value: 0,
      },
      uScrollDelta: {
        value: 0,
      },
    });
    self.bg.useShader(bgShader);
    let color1 = new Color('#00ffff'),
      color2 = new Color('#ffffff'),
      text = '';
    self.bind('ChatUIInput/reset', async (_) => {
      self.bg.disabled = false;
      bgShader.tween('uDisabled', 0, 800, 'easeInOutSine');
      text = '';
      self.text.setText(text + '_');
      self.text.setColor(color2);
    });
    self.bind('ChatUIResponse/submit', async (t) => {
      self.text.setText(t);
      self.text.setColor(color1);
      bgShader.tween('uDisabled', 1, 500, 'easeOutSine');
      self.bg.disabled = true;
    });
    self.events.sub(Keyboard.DOWN, async (e) => {
      if (!self.bg.disabled) {
        if (e && e.key && !e.metaKey && !e.shiftKey && !e.ctrlKey && !e.altKey && 'Tab' !== e.key)
          switch (e.key) {
            case 'Enter':
              text.length > 0
                ? self.set('ChatUIResponse/submit', text.toLowerCase())
                : self.set('ChatUIResponse/submit', 'PROMETHEUS'.toLowerCase());
              break;
            case 'Backspace':
              text = text.slice(0, -1);
              self.text.setText(text + '_');
              break;
            case 'Delete':
            case 'Escape':
              text = '';
              self.text.setText(text + '_');
              break;
            case 'Shift':
            case 'Dead':
            case 'Alt':
            case 'Control':
            case 'ArrowRight':
            case 'ArrowLeft':
            case 'ArrowUp':
            case 'ArrowDown':
              break;
            default:
              let letters = '0123456789abcdefghijklmnopqrstuvwxyz '.split('');
              text.length < 32 && e.key.toLowerCase().includes(letters) && (text += e.key);
              self.text.setText(text + '_');
          }
        self.text.alpha = 1;
        loop();
      }
    });
    let scroll = Scroll.createUnlimited(),
      scrolled = 0;
    function loop() {
      scrolled += 0.002 * scroll.delta.y;
      bgShader.uniforms.uScroll.value = Math.lerp(scrolled, bgShader.uniforms.uScroll.value, 0.1);
      let delta = 0.3 * -Math.clamp(scroll.delta.y, -20, 20);
      bgShader.uniforms.uScrollDelta.value = Math.lerp(
        delta,
        bgShader.uniforms.uScrollDelta.value,
        0.1,
      );
      let active = '' !== text ? 1 : 0;
      bgShader.uniforms.uActive.value = Math.lerp(active, bgShader.uniforms.uActive.value, 0.1);
      self.text.x = 0.22 * self.bg.width;
      self.text.y = self.bg.height / 2 - 7 + 5 * bgShader.uniforms.uScrollDelta.value;
      self.suggestion.x = self.text.x;
      self.suggestion.y = self.text.y;
      self.cursor.x = self.text.x - 20;
      self.cursor.y = self.text.y;
      self.suggestion.alpha = text.length > 0 ? 0 : 0.2;
      self.set('ChatUIInput/y', 5 * bgShader.uniforms.uScrollDelta.value);
    }
    self.startRender(loop);
    self.startRender((_) => {
      self.suggestion.setText('PROMETHEUS');
      self.cursor.visible = !self.cursor.visible;
      self.cursor.alpha = self.cursor.visible ? 1 : 0;
      self.bg.disabled || (self.cursor.alpha = 0);
      self.text.alpha = self.cursor.visible ? 1 : 0;
      ('' !== text || self.bg.disabled) && (self.text.alpha = 1);
    }, 3);
    for (let key in self)
      if (self[key]?.then) {
        let store = self[key];
        store.then((val) => (self[key] = val));
        _promises.push(store);
      }
    _promises.length && (await Promise.all(_promises));
    _promises = null;
    self.flag?.('__ready', true);
    self.onInit?.();
  })();
});

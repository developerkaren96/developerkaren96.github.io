/*
 * ChatUIResponse — GLUI fragment displaying the assistant's
 * reply. Single 350-wide centered glText layer in
 * `NBArchitektStd-Regular` 10.5px / 1.5 line height.
 *
 * Owns its own `InteractAI.Assistant` instance (separate from
 * the one in 0394/0393 so this fragment can be hosted standalone
 * in editor previews).
 *
 * Subscribes to `ChatUIResponse/submit` AppState:
 *   - null  → reset to base text "What are you looking for?\n
 *     Im trained on 112 projects".
 *   - 'contact' → reset to base text AND fire
 *     `ViewController/contact = true` so the contact view
 *     animates in.
 *   - any other string → forwarded to the assistant; reply is
 *     animated character-by-character into `self.response`.
 *
 * `self.response.type = 1` is a glText animation mode flag —
 * enables the "typewriter / decoded" reveal used elsewhere.
 *
 * Standard Fragment plumbing.
 */
Class(function ChatUIResponse(_params, ...restArgs) {
  const self = this;
  Inherit(self, GLUIElement);
  Inherit(self, XComponent);
  self.fragName = 'ChatUIResponse';
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
          align: 'center',
          fontSize: 10.5,
          lineHeight: 1.5,
          fontColor: '#ffffff',
          width: 350,
          _type: 'glText',
          _innerText: 'Response',
          refName: 'response',
          children: [],
        },
      ],
    });
    self.assistant = self.initClass(InteractAI.Assistant);
    self.assistant.isFragment && _promises.push(self.wait(self.assistant, '__ready'));
    self.params = _params;
    self.args = arguments;
    self.parent?.layers && (self.layers = self.parent.layers);
    self.layout?.getAllLayers && (self.layers = await self.layout.getAllLayers());
    let options = {
        lineHeight: 2,
      },
      base = '',
      response = base;
    self.response.type = 1;
    self.bind('ChatUIResponse/submit', async (text) => {
      switch (text) {
        case null:
          response = base;
          break;
        case 'contact':
          response = base;
          self.set('ViewController/contact', true);
          break;
        default:
          self.response.erasing = true;
          self.response.tween(
            {
              alpha: 0,
            },
            3e3,
            'easeOutCubic',
          );
          response = await self.assistant.once(text);
          response.length > 400 && (response = response.substring(0, 400) + '...');
      }
      self.set('ChatUIInput/reset', response);
      self.set('ChatUIResponse/update', response);
    });
    self.bind('ChatUIResponse/update', async (text) => {
      self.response.erasing = true;
      await self.response
        .tween(
          {
            alpha: 0,
          },
          400,
          'easeInSine',
        )
        .promise();
      response = text || base;
      self.response.erasing = false;
      self.response.tween(
        {
          alpha: 1,
        },
        1500,
        'easeOutCubic',
      );
    });
    self.startRender((_) => {
      let trim = response.substring(0, 400 * self.response.alpha);
      trim = (function replaceRandomLetters(str, numReplacements) {
        if (str.length < 2) return str;
        let result = str.split('');
        const replacementChars = '0123456789';
        for (let i = 0; i < numReplacements; i++) {
          const randomPos = Math.floor(Math.random() * str.length),
            randomChar = replacementChars.charAt(
              Math.floor(Math.random() * replacementChars.length),
            );
          result[randomPos].includes([' ', '/', '?', ',', '.', '\n']) ||
            (result[randomPos] = randomChar);
        }
        return result.join('');
      })(trim, response.length * Math.smoothStep(0.8, 0, self.response.alpha));
      trim.length < response.length && (trim += '_');
      self.response.setText(trim, options);
    }, 20);
    self.startRender((_) => {
      let y = self.get('ChatUIInput/y');
      self.response.height = self.response.dimensions.height;
      self.response.x = 0;
      self.response.y = -self.response.height + y;
    });
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

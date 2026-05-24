/*
 * NavUIItem — GLUI child of NavUI (0417). One label
 * (`self.params.text`) with an invisible 60×30 hit rect
 * offset by (-10, -10) so the click area is generous.
 *
 * Behaviour:
 *   - Hover tweens text alpha 1 ↔ 0.7.
 *   - Click on 'Work' → ViewController/contact=false, fires
 *     'ViewController/goToWork', clears Work/project.
 *   - Click on 'Contact' → toggles ViewController/contact.
 *     ESC / 'x' keyboard shortcut also closes it (only when
 *     active).
 *   - The Contact item's label flips between 'Contact' and
 *     'CLOSE-X' depending on `active`.
 *
 * Decoded-text effect: every 12 render frames replaces 0.2·
 * scrollDeltaV + 0.1·smoothStep(1, 0.7, alpha) random
 * positions with digits 1-9. Same glitch trick used in
 * ContactUI / LoaderView.
 *
 * Standard Fragment plumbing.
 */
Class(function NavUIItem(_params, ...restArgs) {
  const self = this;
  Inherit(self, GLUIElement);
  Inherit(self, XComponent);
  self.fragName = 'NavUIItem';
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
          width: 60,
          height: 30,
          bg: '#ff0000',
          _type: 'glObject',
          refName: 'hit',
          children: [],
        },
        {
          font: 'NBArchitektStd-Regular',
          fontSize: 12,
          fontColor: '#ffffff',
          _type: 'glText',
          _innerText: '_',
          refName: 'text',
          children: [],
        },
      ],
    });
    self.params = _params;
    self.args = arguments;
    self.parent?.layers && (self.layers = self.parent.layers);
    self.layout?.getAllLayers && (self.layers = await self.layout.getAllLayers());
    self.hit.alpha = 0;
    self.hit.y = -10;
    self.hit.x = -10;
    await self.wait((_) => self.parent.ui.group.seo);
    GLA11y.objectNode(self.hit, self.parent.ui.group);
    self.hit.interact(
      function hover(e) {
        switch (e.action) {
          case 'over':
            self.text.tween(
              {
                alpha: 0.7,
              },
              200,
              'easeOutSine',
            );
            break;
          case 'out':
            self.text.tween(
              {
                alpha: 1,
              },
              400,
              'easeOutSine',
            );
        }
      },
      click,
      '#',
      self.params.text,
    );
    let link = self.params.text.toLowerCase();
    'contact' == link &&
      (self.events.sub(Keyboard.DOWN, async (e) => {
        e && e.key && e.key.toLowerCase().includes(['x', 'escape']) && active && click();
      }),
      self.bind('ViewController/contact', (a) => {
        active = a;
      }));
    let active = false;
    function click() {
      'contact' == link
        ? active
          ? self.set('ViewController/contact', false)
          : self.set('ViewController/contact', true)
        : (self.set('ViewController/contact', false),
          self.fire('ViewController/goToWork'),
          self.set('Work/project', null));
    }
    self.startRender((_) => {
      let delta = self.get('ViewController/scrollDeltaV');
      self.text.setText(
        (function replaceRandomLetters(str, numReplacements) {
          let result = str.split('');
          for (let i = 0; i < numReplacements; i++) {
            const randomPos = Math.floor(Math.random() * str.length),
              randomChar = '1234567890'.charAt(Math.floor(10 * Math.random()));
            result[randomPos].includes([' ', '/', '?', ',', '.']) ||
              (result[randomPos] = randomChar);
          }
          return result.join('');
        })(
          active ? 'CLOSE-X' : self.params.text,
          Math.floor(0.2 * delta) + 0.1 * Math.smoothStep(1, 0.7, self.text.alpha),
        ),
      );
    }, 12);
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

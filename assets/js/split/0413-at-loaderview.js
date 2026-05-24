/*
 * LoaderView — DOM-based loader percent display rendered above
 * the LoaderGLUI 3D loader (0412). Two stacked divs (`behind`
 * = ASCII grid of `/` chars, cyan; `text` = giant centred
 * percent number).
 *
 * Progress sources — `self.params.loader` (an AssetLoader)
 * gets weighted entries added before triggering:
 *   - +2 baseline, triggered by GPU.ready + World.ready +
 *     LoaderGLUI.ready (in onInit, fires loader.trigger(1)).
 *   - +1 triggered by 'FXScroll/firstScene' event.
 *   - +1 triggered by 'ContactUI/ready' event.
 *   - +1 triggered by 'NavUI/ready' event.
 *   So total = 6 "ticks" — they don't all weight equally; the
 *   loader.add()/trigger() pattern means percent eases up as
 *   each milestone fires.
 *
 * Visual:
 *   - behind div radial-mask, 16×30 grid of '/' truncated to
 *     `text.percent` of its length, then replaceRandomLetters
 *     swaps 30 random positions per frame with digits from the
 *     current rounded percent string for a glitch effect.
 *   - text colour randomised per frame from a 3-shade cyan
 *     palette; prefix '//<n>' (<10) / '/<n>' (<100) / '>>>'
 *     (==100) for retro look.
 *
 * On Events.PROGRESS: tween text.percent → 0.9·percent (500ms
 * linear) — the final 10% is reserved for the COMPLETE handler.
 * On Events.COMPLETE: fade behind/text out (2s), snap percent
 * to 1, animateOut the gluiLoader, fire 'Global/loadFinished',
 * fade in the page scrollbar via CSS variable, then destroy().
 *
 * Standard Fragment plumbing.
 */
Class(function LoaderView(_params, ...restArgs) {
  const self = this;
  Inherit(self, Element);
  Inherit(self, XComponent);
  self.fragName = 'LoaderView';
  self.contexts = 'Element';
  self.params = _params;
  self.args = arguments;
  this.isFragment = true;
  var _promises = [];
  !(async function () {
    self.element && (self.element.onMountedHook = (_) => self.onMounted?.());
    self.initClass(FragUIHelper, {
      css: 'position: absolute',
      size: '100%',
      setZ: 1e4,
      _type: 'UI',
      refName: 'unnamed',
      children: [
        {
          font: 'nbarchitekt',
          fontSize: 13,
          css: 'textAlign: center, lineHeight: 1, letterSpacing: 0.1em, z-index: 100, position: absolute',
          fontColor: '#81ecfe',
          _type: 'div',
          _innerText: '000000000000000000000000000000000000',
          refName: 'behind',
          children: [],
        },
        {
          font: 'nbarchitekt',
          fontSize: 16,
          css: 'textAlign: center, lineHeight: 1, letterSpacing: 0.1em, z-index: 100, position: absolute',
          fontColor: '#e0fff6',
          _type: 'div',
          _innerText: '0',
          refName: 'text',
          children: [],
        },
      ],
    });
    self.params = _params;
    self.args = arguments;
    self.parent?.layers && (self.layers = self.parent.layers);
    self.layout?.getAllLayers && (self.layers = await self.layout.getAllLayers());
    self.text.size(220, 14).center().css({
      textAlign: 'center',
      opacity: 1,
    });
    self.behind.size(220, 220).center().css({
      textAlign: 'left',
      opacity: 0.4,
    });
    self.behind.css({
      maskImage: 'radial-gradient(black 49%, transparent 50%)',
    });
    self.text.percent = 0;
    self.params.loader.add(2);
    self.bind('FXScroll/firstScene', (_) => {
      self.params.loader.trigger(1);
    });
    self.params.loader.add(1);
    self.bind('ContactUI/ready', (_) => {
      self.params.loader.trigger(1);
    });
    self.params.loader.add(1);
    self.bind('NavUI/ready', (_) => {
      self.params.loader.trigger(1);
    });
    self.onInit = async (_) => {
      await GPU.ready();
      await World.instance().ready();
      self.gluiLoader = self.createFragment(LoaderGLUI);
      await self.gluiLoader.ready();
      self.params.loader.trigger(1);
    };
    let tick = 0;
    self.startRender((_) => {
      let text = '';
      for (var i = 0; i < 16; i++) {
        for (var j = 0; j < 30; j++) text += '/';
        text += '\n';
      }
      tick++;
      text = text.slice(0, Math.round(self.text.percent * text.length));
      text.length > 0
        ? self.behind.html(
            (function replaceRandomLetters(str, numReplacements) {
              let result = str.split('');
              const replacementChars = Math.round(100 * self.text.percent).toString();
              for (let i = 0; i < numReplacements; i++) {
                const randomPos = Math.floor(Math.random() * str.length),
                  randomChar = replacementChars.charAt(
                    Math.floor(Math.random() * replacementChars.length),
                  );
                result[randomPos].includes([' ', ' ', '\n', '?', ',']) ||
                  (result[randomPos] = randomChar);
              }
              return result.join('');
            })(text, tick % 2 == 0 ? 30 : 0),
          )
        : self.behind.html(text);
    }, 12);
    let colors = ['#86cfd1', '#ace6e8', '#77c4d9'];
    self.startRender((_) => {
      self.text.div.style.color = colors.random();
      let percent = Math.round(100 * self.text.percent);
      percent < 10 && (percent = '//' + percent);
      percent < 100 && (percent = '/' + percent);
      100 == percent && (percent = '>>>');
      self.text.text(`${percent}`);
    }, 24);
    self.startRender((_) => {
      self.gluiLoader && (self.gluiLoader.progress = self.text.percent);
    });
    self.bind(self.params.loader, Events.PROGRESS, ({ percent: percent }) => {
      tween(
        self.text,
        {
          percent: 0.9 * percent,
        },
        500,
        'linear',
      );
    });
    self.bind(self.params.loader, Events.COMPLETE, async (_) => {
      self.behind.tween(
        {
          opacity: 0,
        },
        2e3,
        'easeOutSine',
      );
      self.text.tween(
        {
          opacity: 0,
        },
        2e3,
        'easeInOutSine',
      );
      await tween(
        self.text,
        {
          percent: 1,
        },
        300,
        'easeOutSine',
      ).promise();
      await self.gluiLoader.animateOut();
      self.fire('Global/loadFinished');
      (function animateInScrollbar() {
        let obj = {
            opacity: 0,
          },
          root = document.documentElement;
        tween(
          obj,
          {
            opacity: 0.9,
          },
          2e3,
          'easeOutSine',
          500,
        ).onUpdate(() => {
          root.style.setProperty('--baropacity', obj.opacity);
        });
      })();
      self.destroy();
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

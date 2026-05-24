/*
 * NavUI — GLUI top-nav: Work / Contact labels (NavUIItem
 * children 0418) plus an audio toggle button, all painted
 * over a frosted-glass background rectangle that uses a
 * custom NavBGShader.
 *
 * NavBGShader uniforms: uColor (#111111 dark grey), uBottom,
 * uDisabled, uScroll, uHeight (0.14), uScrollDelta, uUIColor
 * + uUIBlend (blended in when a Work project opens so the
 * nav tints to the project's color).
 *
 * NavAudioShader uniforms: uColor, uScroll, uAmplitude
 * (tweened 0/1 based on Global/audioEnabled), uAlpha, uHover.
 * Tests.noMusic() forces uAmplitude=0.
 *
 * Per-frame startRender (positions all four children relative
 * to the bg rect; uses scrollDeltaV for a y-jitter that
 * trails the page scroll — gives the bar a "wobble" while
 * scrolling).
 *
 * Layout (onResize):
 *   - bg.width = Tests.noMusic() ? 300 : 340
 *   - Anchor top-right, slight y offset that lifts the
 *     rect's centre above the viewport edge.
 *   - Mobile gets a slightly different offset.
 *
 * Reveal: opens after Global/loadFinished — ui alpha
 * 0.001→1, audioShader uAlpha 0→1, both 2s easeInOutSine
 * with 1s delay.
 *
 * Click on audio toggles Global/audioEnabled AppState.
 *
 * Standard Fragment plumbing.
 */
Class(function NavUI(_params, ...restArgs) {
  const self = this;
  Inherit(self, GLUIElement);
  Inherit(self, Initialization);
  Inherit(self, XComponent);
  self.fragName = 'NavUI';
  self.contexts = 'GLUIElement,Initialization';
  self.params = _params;
  self.args = arguments;
  this.isFragment = true;
  var _promises = [];
  !(async function () {
    self.element && (self.element.onMountedHook = (_) => self.onMounted?.());
    self.initClass(FragUIHelper, {
      addTo: 'GLUI.Stage',
      _type: 'UI',
      refName: 'ui',
      children: [
        {
          text: 'Work',
          _type: 'NavUIItem',
          refName: 'work',
          children: [],
        },
        {
          text: 'Contact',
          _type: 'NavUIItem',
          refName: 'contact',
          children: [],
        },
        {
          width: 50,
          height: 40,
          bg: '#ffffff',
          _type: 'glObject',
          refName: 'audio',
          children: [],
        },
        {
          width: 320,
          height: 320,
          bg: '#000000',
          _type: 'glObject',
          refName: 'bg',
          children: [],
        },
      ],
    });
    self.params = _params;
    self.args = arguments;
    self.parent?.layers && (self.layers = self.parent.layers);
    self.layout?.getAllLayers && (self.layers = await self.layout.getAllLayers());
    self.onInit = async function () {
      await self.initSync(self.ui.group);
      await self.initSync(self.ui);
      self.set('ready', true);
    };
    let bgShader = self.createFragment(Shader, 'NavBGShader', {
      uColor: {
        value: new Color('#111111'),
      },
      uBottom: {
        value: 0,
      },
      uDisabled: {
        value: 0,
      },
      uScroll: {
        value: 0,
      },
      uHeight: {
        value: 0.14,
      },
      uScrollDelta: {
        value: 0,
      },
      uUIColor: {
        value: new Color(),
      },
      uUIBlend: {
        value: 0,
      },
    });
    self.bg.useShader(bgShader);
    let audioShader = self.createFragment(Shader, 'NavAudioShader', {
      uColor: {
        value: new Color('#ffffff'),
      },
      uScroll: {
        value: 0,
      },
      uAmplitude: {
        value: 0,
      },
      uAlpha: {
        value: 0,
      },
      uHover: {
        value: 0,
      },
    });
    self.audio.useShader(audioShader);
    GLA11y.registerPage(self.ui.group, 'NavigationUI');
    GLA11y.objectNode(self.audio, self.ui.group);
    self.audio.interact(
      function hover(e) {
        switch (e.action) {
          case 'over':
            audioShader.tween('uHover', 1, 300, 'easeOutSine');
            break;
          case 'out':
            audioShader.tween('uHover', 0, 500, 'easeOutSine');
        }
      },
      function click() {
        let toggle = !self.get('Global/audioEnabled');
        self.set('Global/audioEnabled', toggle);
      },
      '#',
      'Toggle Audio',
    );
    self.set('Global/audioEnabled', false);
    self.ui.alpha = 0.001;
    self.listen('Global/loadFinished', (_) => {
      self.ui.tween(
        {
          alpha: 1,
        },
        2e3,
        'easeInOutSine',
        1e3,
      );
      audioShader.tween('uAlpha', 1, 2e3, 'easeInOutSine');
    });
    self.bind('Work/project', (data, prevData) => {
      data
        ? (bgShader.set('uUIColor', new Color('#' + data.color)),
          bgShader.tween('uUIBlend', 1, 1500, 'workInOut'))
        : prevData && bgShader.tween('uUIBlend', 0, 1500, 'workInOut');
    });
    self.bind('Global/audioEnabled', (enabled) => {
      audioShader.tween('uAmplitude', !Tests.noMusic() && enabled ? 1 : 0, 500, 'easeOutCubic');
    });
    self.startRender(async (_) => {
      let scrolled = await self.get('ViewController/scrollV', true),
        delta = await self.get('ViewController/scrollDeltaV', true);
      bgShader.uniforms.uScroll.value = scrolled;
      bgShader.uniforms.uScrollDelta.value = delta;
      audioShader.uniforms.uScroll.value = scrolled;
      self.work.wrapper.x = self.bg.x + 80;
      self.work.wrapper.y =
        self.bg.y + 0.475 * self.bg.height + 4.5 * bgShader.uniforms.uScrollDelta.value;
      self.contact.wrapper.x =
        self.bg.x + self.bg.width * Math.mix(0.6, 0.5, Tests.noMusic() ? 1 : 0) - 2;
      self.contact.wrapper.y =
        self.bg.y + 0.475 * self.bg.height + 4.5 * bgShader.uniforms.uScrollDelta.value;
      self.audio.x = self.bg.x + 0.5 * self.bg.width - self.audio.width / 2 - 13;
      self.audio.y =
        self.bg.y + 0.475 * self.bg.height + 4.5 * bgShader.uniforms.uScrollDelta.value - 12;
      Tests.noMusic() &&
        ((self.work.wrapper.x -= 8),
        (self.contact.wrapper.x += 20),
        (self.audio.width = 30),
        (self.audio.alpha = 0.6),
        (self.audio.x -= 2));
    });
    self.onResize(function updateLayout() {
      self.bg.width = Tests.noMusic() ? 300 : 340;
      Device.mobile
        ? ((self.bg.x = Stage.width - self.bg.width - 0 + 20),
          (self.bg.y = 0.3 * -self.bg.height - 10))
        : ((self.bg.x = Stage.width - self.bg.width - 0 + 10),
          (self.bg.y = 0.25 * -self.bg.height - 15));
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

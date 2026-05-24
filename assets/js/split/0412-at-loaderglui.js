/*
 * LoaderGLUI — full-screen GLUI loader background fragment.
 * One `visual` glObject (1000×1000) using the LoaderBGShader
 * — bar-pattern background that draws `uBars` (20 desktop /
 * 24 phone) vertical/horizontal stripes whose fill animates
 * with `uProgress`.
 *
 * Per-frame:
 *   - visual stretched to Stage size, centred.
 *   - uProgress lerped toward `self.progress` (set externally
 *     by LoaderView 0413) at 0.02 factor — slow ease-toward.
 *
 * Lifecycle:
 *   - flag('isReady') set in onInit; ready() awaits it then
 *     fades ui alpha 0→1 over 500ms with 100ms delay.
 *   - animateOut() tweens uVisible 1→0 and ui alpha 1→0 in
 *     500ms easeInCubic.
 *
 * Other uniforms: uColor (#111111 dark bg), uBottom,
 * uVisible, uMobile (phone flag), uHeight (0.14), uScrollDelta,
 * uAlpha (start 0); transparent: true.
 *
 * Standard Fragment plumbing.
 */
Class(function LoaderGLUI(_params, ...restArgs) {
  const self = this;
  Inherit(self, GLUIElement);
  Inherit(self, XComponent);
  self.fragName = 'LoaderGLUI';
  self.contexts = 'GLUIElement';
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
          width: 1e3,
          height: 1e3,
          bg: '#0000ff',
          _type: 'glObject',
          refName: 'visual',
          children: [],
        },
      ],
    });
    self.params = _params;
    self.args = arguments;
    self.parent?.layers && (self.layers = self.parent.layers);
    self.layout?.getAllLayers && (self.layers = await self.layout.getAllLayers());
    let bgShader = self.createFragment(Shader, 'LoaderBGShader', {
      uColor: {
        value: new Color('#111111'),
      },
      uBottom: {
        value: 0,
      },
      uProgress: {
        value: 0,
      },
      uBars: {
        value: Device.mobile.phone ? 24 : 20,
      },
      uVisible: {
        value: 1,
      },
      uMobile: {
        value: Device.mobile.phone ? 1 : 0,
      },
      uHeight: {
        value: 0.14,
      },
      uScrollDelta: {
        value: 0,
      },
      uAlpha: {
        value: 0,
      },
      transparent: true,
    });
    self.visual.useShader(bgShader);
    self.startRender((_) => {
      self.visual.width = Stage.width;
      self.visual.height = Stage.height;
      self.visual.x = Stage.width / 2 - self.visual.width / 2;
      self.visual.y = Stage.height / 2 - self.visual.height / 2;
      bgShader.uniforms.uProgress.value = Math.lerp(
        self.progress,
        bgShader.uniforms.uProgress.value,
        0.02,
      );
    });
    self.visual.scale = Device.mobile ? 2 : 1;
    self.ui.alpha = 0;
    self.onInit = async (_) => {
      self.flag('isReady', true);
    };
    self.ready = async function () {
      await self.wait('isReady');
      self.ui.alpha = 0;
      await self.ui
        .tween(
          {
            alpha: 1,
          },
          500,
          'easeOutSine',
          100,
        )
        .promise();
    };
    self.animateOut = async function () {
      bgShader.tween('uVisible', 0, 500, 'easeInCubic');
      await self.ui
        .tween(
          {
            alpha: 0,
          },
          500,
          'easeInCubic',
        )
        .promise();
    };
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

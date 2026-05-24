/*
 * ViewController — the application root Frag3D + Router.
 * Owns the global scroll-driven scene stack and the global
 * composite pipeline.
 *
 * Scene order (assembled via _initFXScroll):
 *   home   4vh / cameraMove 20      ← Home
 *   about  1vh / cameraMove 2       ← About
 *   work   10vh                     ← Work (no cameraMove)
 *   tree   2vh / cameraMove 6       ← TreeScene
 *   contact 1.2vh / cameraMove 4    ← CleanRoom
 *   footer 4vh / cameraMove 20      ← Footer
 *
 * Global pipeline:
 *   World.NUKE is paused while passes are wired, then
 *   resumed. NukePass (GlobalComposite shader, the
 *   self.uniforms set: uRGB/Contrast/Scroll/ScrollDelta/
 *   Mouse/Normal/NormalScale/FrostCorner/Gradient/Contact/
 *   Visible/ChatOpen/UIColor/SyncTouch/UIBlend) +
 *   FX.UnrealBloom (dpr 0.3, gated by Tests.bloom()) +
 *   FX.HydraLensStreak (gated by Tests.lensStreak()).
 *
 * Per-route shader variant: createShaderVariant(key,
 *   bloom.compositeShader) is registered for each scene id
 *   and setShaderVariant(Router/state.split('/')[0]) is
 *   called whenever the route changes, so bloom can swap
 *   compositing per-section.
 *
 * Tween bindings:
 *   ViewController/contact  ← composite.uContact 0↔1
 *   Work/project            ← composite.uUIColor / uUIBlend
 *
 * Render loop: scrollProgress is differenced into uScroll
 *   / uScrollDelta (lerped, clamped ±3); uMouse follows
 *   Mouse.normal; uGradient depends on Stage aspect /
 *   Device.mobile portrait.
 *
 * MusicPlayerDOM is gated by 'hasMusic' (=!Tests.noMusic()).
 * Document.title is "Karen Simonyan · Creative Digital
 * Experiences" by default, but switches to project title
 * when Work/project is set.
 *
 * Standard Fragment plumbing.
 */
Class(function ViewController(_params, ...restArgs) {
  const self = this;
  Inherit(self, Frag3D, 'ViewController');
  Inherit(self, Router, null, '');
  Inherit(self, XComponent);
  self.fragName = 'ViewController';
  self.contexts = 'Frag3D, "ViewController",Router, null, ""';
  self.params = _params;
  self.args = arguments;
  this.isFragment = true;
  var _promises = [];
  !(async function () {
    let video;
    self.element && (self.element.onMountedHook = (_) => self.onMounted?.());
    (self.nuke || World.NUKE).paused = true;
    self.ref_ShaderVariants986 = self.initClass(ShaderVariants);
    self.ref_ShaderVariants986.isFragment &&
      _promises.push(self.wait(self.ref_ShaderVariants986, '__ready'));
    self.ref_Home905 = self.initClass(Home);
    self.ref_Home905.isFragment && _promises.push(self.wait(self.ref_Home905, '__ready'));
    self.ref_About181 = self.initClass(About);
    self.ref_About181.isFragment && _promises.push(self.wait(self.ref_About181, '__ready'));
    self.work = self.initClass(Work);
    self.work.isFragment && _promises.push(self.wait(self.work, '__ready'));
    self.ref_TreeScene264 = self.initClass(TreeScene);
    self.ref_TreeScene264.isFragment && _promises.push(self.wait(self.ref_TreeScene264, '__ready'));
    self.ref_CleanRoom870 = self.initClass(CleanRoom);
    self.ref_CleanRoom870.isFragment && _promises.push(self.wait(self.ref_CleanRoom870, '__ready'));
    self.ref_Footer111 = self.initClass(Footer);
    self.ref_Footer111.isFragment && _promises.push(self.wait(self.ref_Footer111, '__ready'));
    self.scroll = self.initClass(
      FXScroll,
      AppState.createLocal(
        {
          angle: 0.7,
          pingPong: Tests.pingPongRender(),
          keyboard: 'false',
          virtualScroll: 'false',
          pageScalar: Device.mobile.phone ? 0.5 : 1,
        },
        true,
      ),
    );
    self.scroll.isFragment && _promises.push(self.wait(self.scroll, '__ready'));
    self.ref_NavUI333 = self.initClass(NavUI);
    self.ref_NavUI333.isFragment && _promises.push(self.wait(self.ref_NavUI333, '__ready'));
    self.ref_ContactUI570 = self.initClass(ContactUI);
    self.ref_ContactUI570.isFragment && _promises.push(self.wait(self.ref_ContactUI570, '__ready'));
    self.ref_CookieBanner690 = self.initClass(CookieBanner);
    self.ref_CookieBanner690.isFragment &&
      _promises.push(self.wait(self.ref_CookieBanner690, '__ready'));
    self.params = _params;
    self.args = arguments;
    self.parent?.layers && (self.layers = self.parent.layers);
    self.layout?.getAllLayers && (self.layers = await self.layout.getAllLayers());
    self.set('hasMusic', !Tests.noMusic());
    self.set('scroll', self.scroll);
    self.uniforms = {
      uRGBStrength: {
        value: 1,
      },
      uContrast: {
        value: new Vector2(1, 1),
      },
      uScrollDelta: {
        value: 0,
      },
      uScroll: {
        value: 0,
      },
      tNormal: {
        value: Utils3D.getTexture('assets/images/pbr/damaged_road_normal.jpg'),
        getTexture: Utils3D.getRepeatTexture,
      },
      uMouse: {
        value: new Vector2(),
      },
      uNormalScale: {
        value: 1,
      },
      uFrostCorner: {
        value: new Vector3(0.8, 0.9, 0.1),
      },
      uGradient: {
        value: new Vector2(0, 1),
      },
      uContact: {
        value: 0,
      },
      uVisible: {
        value: 0,
      },
      uChatOpen: {
        value: 0,
      },
      uUIColor: {
        value: new Color('#ff0000'),
      },
      uSyncTouch: {
        value: 0,
      },
      uUIBlend: {
        value: 0,
      },
    };
    self.set('uniforms', self.uniforms);
    Device.mobile && self.uniforms.uFrostCorner.value.set(0.75, 1.4, 0.35);
    self.bind('ViewController/contact', (active) => {
      active
        ? self.composite?.tween?.('uContact', 1, 1500, 'workInOut')
        : self.composite?.tween?.('uContact', 0, 1500, 'workInOut');
    });
    self.bind('Work/project', (data, prevData) => {
      data
        ? (self.composite?.set?.('uUIColor', new Color('#' + data.color)),
          self.composite?.tween?.('uUIBlend', 1, 1500, 'workInOut'))
        : prevData && self.composite?.tween?.('uUIBlend', 0, 1500, 'workInOut');
    });
    self.onInit = (_) => {
      MouseFluid.instance().applyTo(self.composite.pass);
      ['home', 'about', 'work', 'tree', 'contact', 'footer'].forEach((key) => {
        self.createShaderVariant(key, self.bloom.compositeShader);
      });
      self.bind('Router/state', (val) => {
        val &&
          ['home', 'about', 'work', 'tree', 'contact', 'footer'].some((route) =>
            val.startsWith(route),
          ) &&
          self.setShaderVariant(val.split('/')[0]);
      });
      self.listen('Global/loadFinished', (_) => {
        self.composite.set('uVisible', 0);
        self.composite.tween('uVisible', 1, 5e3, 'workInOut');
      });
    };
    Tests.videoVFX()
      ? ((video = self.createFragment(VideoTexture, 'assets/video/reel.mp4', {
          firstFrame: 'assets/video/reel-frame.jpg',
        })),
        video.start())
      : (video = Utils3D.getTexture('assets/images/room/matcap-test.jpg'));
    self.set('video', video);
    self.bind('FXScroll/initialized', (_) => self.set('scroll', self.scroll));
    let scrolled = 0,
      delta = 0;
    self.startRender((_) => {
      if (self.scroll && self.scroll.progress) {
        let dif = scrolled - self.scroll.progress;
        delta = Math.clamp(1500 * dif, -3, 3);
        scrolled = self.scroll.progress;
      }
      let lerp = Device.mobile ? 0.15 : 0.1;
      self.uniforms.uScrollDelta.value = Math.lerp(delta, self.uniforms.uScrollDelta.value, lerp);
      self.uniforms.uScroll.value = Math.lerp(20 * scrolled, self.uniforms.uScroll.value, lerp);
      self.uniforms.uMouse.value = Math.lerp(Mouse.normal, self.uniforms.uMouse.value, lerp);
      self.uniforms.uGradient.value.x = Device.mobile && Stage.width < Stage.height ? 0.05 : 0.02;
      self.uniforms.uGradient.value.y = Device.mobile && Stage.width < Stage.height ? 2 : 0.9;
      self.set('visibleV', self.uniforms.uVisible.value);
      self.set('scrollV', self.uniforms.uScroll.value);
      self.set('scrollDeltaV', self.uniforms.uScrollDelta.value);
    });
    World.SCENE.add(self.group);
    self.listen('resetWork', (_) => {
      'work' === self.get('Router/state') && self.scroll.scrollTo(self.work, 1e3);
    });
    self.listen('topOfWork', (_) => {
      self.scroll.scrollTo(self.work);
    });
    self.listen('bottomOfWork', (_) => {
      self.scroll.scrollTo(self.work.end - Stage.height);
    });
    self.listen('goToWork', (_) => {
      self.scroll.scrollTo(self.work, 1e3);
    });
    self.bind('navigate', (path) => self.navigate(path));
    document.title = 'Karen Simonyan · Senior Software Engineer';
    self.bind('Work/project', (data) => {
      document.title = data
        ? `${data.title} · Karen Simonyan`
        : 'Karen Simonyan · Senior Software Engineer';
    });
    for (let key in self)
      if (self[key]?.then) {
        let store = self[key];
        store.then((val) => (self[key] = val));
        _promises.push(store);
      }
    _promises.length && (await Promise.all(_promises));
    self.composite = self.initClass(
      NukePass,
      AppState.createLocal(
        {
          shader: 'GlobalComposite',
          uniforms: self.uniforms,
        },
        true,
      ),
    );
    self.composite.isFragment && _promises.push(self.wait(self.composite, '__ready'));
    self.nuke && (self.composite.texture = self.nuke.rttBuffer);
    self.bloom = self.initClass(
      FX.UnrealBloom,
      AppState.createLocal(
        {
          unique: 'globalbloom',
          nuke: self.nuke,
          dpr: 0.3,
          enabled: Tests.bloom(),
        },
        true,
      ),
    );
    self.bloom.isFragment && _promises.push(self.wait(self.bloom, '__ready'));
    self.bloom.uniforms && self.composite.addUniforms(self.bloom.uniforms);
    self.ref_FXHydraLensStreak624 = self.initClass(
      FX.HydraLensStreak,
      AppState.createLocal(
        {
          nuke: self.nuke,
          enabled: Tests.lensStreak(),
        },
        true,
      ),
    );
    self.ref_FXHydraLensStreak624.isFragment &&
      _promises.push(self.wait(self.ref_FXHydraLensStreak624, '__ready'));
    self.ref_FXHydraLensStreak624.uniforms &&
      self.composite.addUniforms(self.ref_FXHydraLensStreak624.uniforms);
    (self.composite.upload || self.composite.pass) &&
      ((self.nuke || World.NUKE).add(
        self.composite.pass instanceof NukePass ? self.composite.pass : self.composite,
      ),
      ShaderUIL.add(
        self.composite.pass instanceof NukePass ? self.composite.pass : self.composite,
      ));
    (self.nuke || World.NUKE).paused = false;
    self._initFXScroll([
      {
        vh: '4',
        cameraMove: '20',
        privateRoute: 'home',
        view: '$ref_Home905',
      },
      {
        vh: '1',
        cameraMove: '2',
        cameraLayer: 'camera',
        privateRoute: 'about',
        view: '$ref_About181',
      },
      {
        vh: '10',
        route: 'work',
        view: '$work',
      },
      {
        vh: '2',
        cameraMove: '6',
        cameraLayer: 'camera',
        privateRoute: 'tree',
        view: '$ref_TreeScene264',
      },
      {
        vh: '1.2',
        cameraMove: '4',
        cameraLayer: 'camera',
        privateRoute: 'contact',
        view: '$ref_CleanRoom870',
      },
      {
        vh: '4',
        cameraMove: '20',
        privateRoute: 'footer',
        view: '$ref_Footer111',
      },
    ]);
    self.initClass(StateInitializer, MusicPlayerDOM, 'music', undefined, {
      init: 'hasMusic',
    });
    _promises = null;
    self.flag?.('__ready', true);
    self.onInit?.();
  })();
});

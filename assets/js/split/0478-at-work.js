/*
 * Work — FragFXScene for the /work section.
 * Has its own WorkRefraction FXLayer + SnapshotFrame and
 * a WorkComposite NukePass (uRGB/Contrast/uTransition/
 * tDetail). uTransition tweens 0↔1 via 'workInOut' custom
 * cubic-bezier (.29,.05,.06,.92) when Work/project is
 * set / cleared.
 *
 * WorkDetail child holds the per-project content card and
 * is hidden until a project is selected.
 *
 * Per-project flow (bind 'Work/project'):
 *   set     → scroll-edge detection (top/bottom-of-work),
 *             lock parent ViewController scroll,
 *             startRender checkScrollOut (detect kickout
 *             scroll delta > 10/20px), tween uTransition
 *             to 1, show detail.
 *   clear   → reset ChatDOM, navigate('work'),
 *             unlockScroll, stop checkScrollOut, tween
 *             uTransition to 0, hide detail when done.
 *
 * Esc key on Keyboard.DOWN also clears the project.
 *
 * flower particle attenuation (uSizeBias) is tier-scaled
 * based on Tests.particleCount() and halved further on
 * mobile.phone.
 *
 * GLA11y.registerPage(scene,'WorkPage') registers the
 * scene with the screen-reader accessibility tree.
 *
 * Standard Fragment plumbing.
 */
Class(function Work(_params, ...restArgs) {
  const self = this;
  Inherit(self, FragFXScene, 'Work');
  Inherit(self, XComponent);
  self.fragName = 'Work';
  self.contexts = 'FragFXScene, "Work"';
  self.params = _params;
  self.args = arguments;
  this.isFragment = true;
  var _promises = [];
  !(async function () {
    self.element && (self.element.onMountedHook = (_) => self.onMounted?.());
    self.detail = self.initClass(WorkDetail);
    self.detail.isFragment && _promises.push(self.wait(self.detail, '__ready'));
    self._initFXScene(World.NUKE, null, {
      format: undefined,
      type: undefined,
      minFilter: undefined,
      magFilter: undefined,
      multiRenderTarget: undefined,
      mipmaps: undefined,
      screenQuad: undefined,
      vrMode: undefined,
      multisample: undefined,
      samplesAmount: undefined,
    });
    self.refractionLayer = self.initClass(
      FXLayer,
      AppState.createLocal(
        {
          name: 'WorkRefraction',
        },
        true,
      ),
    );
    self.refractionLayer.isFragment && _promises.push(self.wait(self.refractionLayer, '__ready'));
    self.refraction = self.initClass(
      SnapshotFrame,
      AppState.createLocal(
        {
          texture: self.refractionLayer,
        },
        true,
      ),
    );
    self.refraction.isFragment && _promises.push(self.wait(self.refraction, '__ready'));
    (self.nuke || World.NUKE).paused = true;
    self.chat = self.initClass(ChatDOM);
    self.chat.isFragment && _promises.push(self.wait(self.chat, '__ready'));
    self.params = _params;
    self.args = arguments;
    self.parent?.layers && (self.layers = self.parent.layers);
    self.layout?.getAllLayers && (self.layers = await self.layout.getAllLayers());
    self.uniforms = {
      uRGBStrength: {
        value: 1,
      },
      uContrast: {
        value: new Vector2(1, 1),
      },
      uTransition: {
        value: 0,
      },
      tDetail: {
        value: self.detail,
      },
    };
    self.detail && (self.detail.visible = false);
    self.set('refraction', self.refraction);
    self.set('pane', self.layers.pane);
    self.set('pane_ui', self.layers.pane_ui);
    self.set('camera', self.layers.camera);
    self.set('scene', self.scene);
    self.layers.camera.lock();
    (Device.mobile?.phone || 0.9 * Stage.width < Stage.height) &&
      (self.layers.camera.setFOV(55), (self.layers.flower.group.scale.y *= 1.2));
    GLA11y.registerPage(self.scene, 'WorkPage');
    let video = self.createFragment(
      VideoTexture,
      'https://storage.googleapis.com/activetheory-v6.appspot.com/media/prometheus (720p).mp4',
      {
        preload: false,
      },
    );
    self.set('video', video);
    self.bind('WorkItems/videoURL', async (src) => {
      video.src = src;
      await video.start();
      self.fire('updatedVideo', src);
    });
    let flowerRotation = 0;
    self.startRender(async (_) => {
      await self.layers.flower.ready();
      null != self.scrollProgress &&
        ((self.layers.flower.shader.uniforms.uRotate.value = Math.lerp(
          flowerRotation,
          self.layers.flower.shader.uniforms.uRotate.value,
          0.05,
        )),
        (self.layers.flower.group.rotation.y = Math.radians(100)),
        (self.layers.flower.shader.uniforms.uScroll.value = self.scrollProgress),
        (self.layers.flower.shader.uniforms.uSparkle.value += 0.005),
        self.set('scrollProgress', self.scrollProgress));
    });
    var _scroll = Scroll.getUnlimited();
    function checkScrollOut() {
      Math.abs(_scroll.delta.y) > (Device.mobile ? 20 : 10) && self.set('Work/project', null);
    }
    self.events.sub(Keyboard.DOWN, async (e) => {
      e && e.key && e.key.toLowerCase().includes(['escape']) && self.set('Work/project', null);
    });
    TweenManager.addCustomEase({
      name: 'workInOut',
      curve: 'cubic-bezier(.29,.05,.06,.92)',
    });
    self.bind('ViewController/resetWork', (_) => {
      null != self.scrollProgress &&
        ((flowerRotation += 2 * Math.radians(360 * self.scrollProgress)),
        (self.layers.flower.shader.uniforms.uSparkle.value = 0));
    });
    self.bind('Work/project', (data, prevData) => {
      data
        ? (self.scrollProgress < 0.07
            ? self.fire('ViewController/topOfWork')
            : self.scrollProgress > 0.93 && self.fire('ViewController/bottomOfWork'),
          self.findParent('ViewController').lockScroll(),
          self.startRender(checkScrollOut),
          self.detail && (self.detail.visible = true),
          self.composite.tween('uTransition', 1, 1500, 'workInOut').onComplete((_) => {}))
        : prevData &&
          (self.fire('ChatDOM/clearText'),
          self.fire('ChatDOM/resetOptions'),
          self.navigate('work'),
          self.findParent('ViewController').unlockScroll(),
          self.stopRender(checkScrollOut),
          self.composite.tween('uTransition', 0, 800, 'workInOut').onComplete((_) => {
            self.detail.visible = false;
          }));
    });
    self.bind('FXScroll/initialized', (_) => {
      Initializer3D.uploadAllAsync(self.detail.layout);
    });
    self.onInit = async (_) => {
      await self.layers.flower.ready();
      let attenuation = 1;
      Tests.particleCount() <= 16384
        ? (attenuation = 1.6)
        : Tests.particleCount() <= 65536
          ? (attenuation = 1.4)
          : Tests.particleCount() <= 262144 && (attenuation = 1.2);
      Device.mobile.phone && (attenuation *= 0.6);
      self.layers.flower.shader.addUniforms({
        uSizeBias: {
          value: attenuation,
        },
      });
    };
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
          shader: 'WorkComposite',
          uniforms: self.uniforms,
        },
        true,
      ),
    );
    self.composite.isFragment && _promises.push(self.wait(self.composite, '__ready'));
    self.nuke && (self.composite.texture = self.nuke.rttBuffer);
    (self.composite.upload || self.composite.pass) &&
      ((self.nuke || World.NUKE).add(
        self.composite.pass instanceof NukePass ? self.composite.pass : self.composite,
      ),
      ShaderUIL.add(
        self.composite.pass instanceof NukePass ? self.composite.pass : self.composite,
      ));
    (self.nuke || World.NUKE).paused = false;
    _promises = null;
    self.flag?.('__ready', true);
    self.onInit?.();
  })();
});

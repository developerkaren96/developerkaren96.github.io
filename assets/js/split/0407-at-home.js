/*
 * Home — landing-page FragFXScene 'Home'. Same composite-
 * pipeline shape as Footer (0405) but tuned for the intro
 * camera arc: y goes 40→-7 (-11 on phone) across scroll;
 * z = range(visibleV, 0, 1, -30, 5) so the camera dollies in
 * as the view-controller blends Home in, then dollies out
 * 15·(1-scroll) so scrolling further pushes the camera back
 * toward the user; phone gets +5 z offset.
 *
 * Refraction snapshot: FXLayer 'HomeRefraction' → SnapshotFrame
 * shared via AppState 'refraction' (consumed by HomeLogo /
 * Column / chains).
 *
 * "Scroll" hint text:
 *   - alpha 0 initially, tween to 0.6 after Global/loadFinished
 *     with a 5s delay over 5s.
 *   - Once scrollProgress > 0.2, animateOutScrollText() fades
 *     it to 0 in 500ms and latches `self.layers.scroll.out`.
 *
 * Particles rotation:
 *   - delta.lerp(Mouse.delta, 0.07) → momentum-smoothed
 *     mouse rotation.
 *   - scrollTarget = 90° - 190°·scrollProgress (note inverse
 *     direction vs Footer's +180° + 180°·progress).
 *   - particles uPulse drifts +0.001/frame and resets to 0
 *     on mouse-down.
 *   - logo y tracks camera y + 4.5 - 0.6·(1-visibleV); logo
 *     rotation.y combines scroll + 210°·(1-visibleV)^1.2
 *     for a spin-in on initial reveal.
 *
 * Tubes interaction + HomeComposite NukePass + FX.Volumetric
 * Light (unique 'home', dpr 0.2 — lower than Footer's 0.1
 * resolution).
 *
 * Standard Fragment plumbing.
 */
Class(function Home(_params, ...restArgs) {
  const self = this;
  Inherit(self, FragFXScene, 'Home');
  Inherit(self, XComponent);
  self.fragName = 'Home';
  self.contexts = 'FragFXScene, "Home"';
  self.params = _params;
  self.args = arguments;
  this.isFragment = true;
  var _promises = [];
  !(async function () {
    self.element && (self.element.onMountedHook = (_) => self.onMounted?.());
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
          name: 'HomeRefraction',
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
    self.params = _params;
    self.args = arguments;
    self.parent?.layers && (self.layers = self.parent.layers);
    self.layout?.getAllLayers && (self.layers = await self.layout.getAllLayers());
    self.camera = self.layers.camera;
    self.uniforms = {
      uRGBStrength: {
        value: 1,
      },
      uVolumetricStrength: {
        value: 1,
      },
      uContrast: {
        value: new Vector2(1, 1),
      },
    };
    self.set('pane', self.layers.pane);
    self.set('camera', self.layers.camera);
    self.set('refraction', self.refraction);
    self.layers.camera.lock();
    let tweenTimeline = self.createFragment(TweenTimeline),
      rotation = 0,
      baseRotation = Math.radians(-20),
      delta = new Vector2(),
      zero = new Vector2();
    self.layers.scroll.text.alpha = 0;
    self.listen('Global/loadFinished', async (_) => {
      self.layers.scroll.out ||
        tween(
          self.layers.scroll.text,
          {
            alpha: 0.6,
          },
          5e3,
          'easeInOutSine',
          5e3,
        );
    });
    self.startRender((_) => {
      if (null == self.scrollProgress) return;
      let visibleV = self.get('ViewController/visibleV');
      if (
        ((tweenTimeline.elapsed = self.scrollProgress),
        tweenTimeline.update(),
        (self.layers.camera.group.position.y = Math.range(
          self.scrollProgress,
          0,
          1,
          40,
          Device.mobile.phone ? -11 : -7,
        )),
        (self.layers.camera.group.position.z = Math.range(visibleV, 0, 1, -30, 5)),
        (self.layers.camera.group.position.z -= 15 * (1 - self.scrollProgress)),
        Device.mobile.phone && (self.layers.camera.group.position.z += 5),
        (self.layers.camera.position.y = Math.range(
          self.scrollProgress,
          0,
          1,
          4.5,
          Device.mobile.phone ? 1 : 2.5,
        )),
        self.scrollProgress > 0.2 &&
          (function animateOutScrollText() {
            self.layers.scroll.out ||
              ((self.layers.scroll.out = true),
              tween(
                self.layers.scroll.text,
                {
                  alpha: 0,
                },
                500,
                'easeOutSine',
              ));
          })(),
        !self.layers.particles.layers)
      )
        return;
      let scrollTarget = Math.radians(90) - Math.radians(190 * self.scrollProgress);
      delta.lerp(Mouse.down ? Mouse.delta : zero, 0.07);
      rotation += delta.x * (Device.mobile ? 0.0075 : 0.0025);
      self.layers.particles.layers.particles.group.rotation.y =
        baseRotation + rotation + scrollTarget;
      self.layers.particles.layers.particles.shader.uniforms.uScroll.value = self.scrollProgress;
      self.layers.particles.layers.particles.shader.uniforms.uVisible.value = Math.smoothStep(
        0,
        0.92,
        visibleV,
      );
      Mouse.down && (self.layers.particles.layers.particles.shader.uniforms.uPulse.value = 0);
      self.layers.particles.layers.particles.shader.uniforms.uPulse.value += 0.001;
      self.layers.particles.layers.logo.position.y =
        self.layers.camera.group.position.y + 4.5 - 0.6 * (1 - visibleV);
      self.layers.particles.layers.logo.rotation.y =
        Math.radians(270) +
        2 * (rotation + scrollTarget) +
        Math.radians(210) * Math.pow(1 - visibleV, 1.2);
      self.layers.particles.layers.logo.shader.uniforms.uVisible.value = Math.smoothStep(
        0.5,
        1,
        visibleV,
      );
      self.layers.particles.layers.particles.shader.uniforms.uLogoPos.value.copy(
        self.layers.particles.layers.logo.position,
      );
      self.layers.particles.layers.particles.shader.uniforms.uLogoPos.value.x += 1;
      self.layers.particles.layers.particles.shader.uniforms.uLogoPos.value.z += 2;
      self.layers.particles.layers.column.position.y =
        self.layers.particles.layers.logo.position.y - 10;
      self.layers.particles.layers.column.rotation.y =
        1 * self.layers.particles.layers.logo.rotation.y;
      self.layers.particles.layers.column.shader.uniforms.uVisible.value = Math.smoothStep(
        0.5,
        1,
        visibleV,
      );
      self.layers.particles.layers.column2.position.y =
        self.layers.particles.layers.logo.position.y - 10;
      self.layers.particles.layers.column2.rotation.y =
        1 * self.layers.particles.layers.logo.rotation.y;
      self.layers.particles.layers.column2.shader.uniforms.uVisible.value = Math.smoothStep(
        0.5,
        1,
        visibleV,
      );
      self.layers.particles.layers.logo.shader.uniforms.tRefraction.value = self.refraction;
      self.layers.particles.layers.column.shader.uniforms.tRefraction.value = self.refraction;
      self.layers.particles.layers.column2.shader.uniforms.tRefraction.value = self.refraction;
      self.set('rotationV', self.layers.particles.layers.particles.group.rotation.y);
    });
    self.onInit = async (_) => {
      await self.layers.particles.layout.getAllLayers();
      self.volumetricLight.addLight(self.layers.particles.layers.logo);
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
          shader: 'HomeComposite',
          uniforms: self.uniforms,
        },
        true,
      ),
    );
    self.composite.isFragment && _promises.push(self.wait(self.composite, '__ready'));
    self.nuke && (self.composite.texture = self.nuke.rttBuffer);
    self.volumetricLight = self.initClass(
      FX.VolumetricLight,
      AppState.createLocal(
        {
          unique: 'home',
          nuke: self.nuke,
          dpr: 0.2,
          enabled: Tests.volumetricLight(),
        },
        true,
      ),
    );
    self.volumetricLight.isFragment && _promises.push(self.wait(self.volumetricLight, '__ready'));
    self.volumetricLight.uniforms && self.composite.addUniforms(self.volumetricLight.uniforms);
    (self.composite.upload || self.composite.pass) &&
      ((self.nuke || World.NUKE).add(
        self.composite.pass instanceof NukePass ? self.composite.pass : self.composite,
      ),
      ShaderUIL.add(
        self.composite.pass instanceof NukePass ? self.composite.pass : self.composite,
      ));
    (self.nuke || World.NUKE).paused = false;
    self.initClass(
      StateInitializer,
      TubesInteraction,
      'tubes',
      {
        scene: '#x#_this.scene#x#',
        camera: '_this.camera',
        refraction: '_this.refraction',
      },
      {
        init: '#x#Tests.interactiveTubes()#x#',
      },
    );
    _promises = null;
    self.flag?.('__ready', true);
    self.onInit?.();
  })();
});

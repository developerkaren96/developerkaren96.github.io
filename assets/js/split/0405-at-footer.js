/*
 * Footer — final-page FragFXScene "Footer" with the rotating
 * particle column and AT logo. One of the heaviest stage
 * scenes — its own FX scene + refraction snapshot +
 * volumetric light + tubes interaction.
 *
 * Composition:
 *   - `_initFXScene(World.NUKE, ...)` — own RT.
 *   - FXLayer 'FooterRefraction' → SnapshotFrame stored on
 *     `self.refraction` so shaders downstream (logo, columns)
 *     can sample the scene-behind for refraction.
 *   - World.NUKE paused while children load.
 *   - HomeComposite NukePass + FX.VolumetricLight (god-rays
 *     from the logo, unique key 'home', resolution 0.1).
 *   - TubesInteraction registered via StateInitializer
 *     (placeholder substitutions: scene=_this.scene,
 *     camera=_this.camera, refraction=_this.refraction; init
 *     gated by Tests.interactiveTubes()).
 *
 * Custom uniforms (same names as About/Contact/CleanRoom):
 *   - uRGBStrength / uVolumetricStrength / uContrast.
 *
 * Per-frame `startRender`:
 *   - Camera y eases 26→-20 across scrollProgress; z=10 on
 *     phone, -5*scroll dolly-in.
 *   - tweenTimeline.elapsed = scrollProgress drives any
 *     scrubbed sub-tweens.
 *   - delta.lerp(Mouse.delta, 0.07) — momentum-smoothed
 *     mouse-drag rotation; `rotation` accumulates and is
 *     summed with scroll-driven `scrollTarget` (180° +
 *     180°·progress).
 *   - particles group rotates with baseRotation 130° -
 *     (rotation + scrollTarget); logo rotates 2× as fast
 *     for parallax.
 *   - logo y travels 32→-12 + 10 across scroll; columns
 *     follow logo y-10.
 *   - particles shader uLogoPos copied from logo position
 *     (y mirrored + offset 22) so particles can attract/
 *     repel around the logo.
 *   - Refraction texture wired into logo/column/column2
 *     shaders each frame; uFooter=1 flag on logo.
 *   - AppState 'rotationV' published with particles rotation
 *     (consumed by other fragments for sync).
 *
 * onInit:
 *   - video layer flipped (rotation.z = 180°), pushed y+=1,
 *     alpha 0.5.
 *   - column/column2 alpha 0.6.
 *   - volumetricLight adds the logo as light source.
 *
 * Standard Fragment plumbing.
 */
Class(function Footer(_params, ...restArgs) {
  const self = this;
  Inherit(self, FragFXScene, 'Footer');
  Inherit(self, XComponent);
  self.fragName = 'Footer';
  self.contexts = 'FragFXScene, "Footer"';
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
          name: 'FooterRefraction',
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
    self.layers.camera.lock();
    let tweenTimeline = self.createFragment(TweenTimeline),
      rotation = 0,
      baseRotation = Math.radians(130),
      delta = new Vector2(),
      zero = new Vector2();
    self.startRender((_) => {
      if (null == self.scrollProgress) return;
      let progress = 1 - self.scrollProgress;
      if (
        ((tweenTimeline.elapsed = self.scrollProgress),
        tweenTimeline.update(),
        (self.layers.camera.group.position.y = Math.range(self.scrollProgress, 0, 1, 26, -20)),
        (self.layers.camera.group.position.z = Device.mobile.phone ? 10 : 0),
        (self.layers.camera.group.position.z -= 5 * self.scrollProgress),
        !self.layers.particles.layers)
      )
        return;
      delta.lerp(Mouse.down ? Mouse.delta : zero, 0.07);
      rotation += delta.x * (Device.mobile ? 0.0075 : 0.0025);
      let scrollTarget = Math.radians(180) + Math.radians(180 * progress);
      self.layers.particles.layers.particles.group.rotation.y =
        baseRotation + -(rotation + scrollTarget);
      self.layers.particles.layers.particles.shader.uniforms.uScroll.value = progress;
      self.layers.particles.layers.logo.position.y = Math.range(progress, 0, 1, 32, -12) + 10;
      self.layers.particles.layers.logo.rotation.y =
        Math.radians(90) + 2 * (rotation + scrollTarget);
      self.layers.particles.layers.logo.rotation.x = Math.radians(180);
      self.layers.particles.layers.particles.shader.uniforms.uLogoPos.value.copy(
        self.layers.particles.layers.logo.position,
      );
      self.layers.particles.layers.particles.shader.uniforms.uLogoPos.value.y *= -1;
      self.layers.particles.layers.particles.shader.uniforms.uLogoPos.value.y += 22;
      self.layers.particles.layers.column.position.y =
        self.layers.particles.layers.logo.position.y - 10;
      self.layers.particles.layers.column.rotation.y =
        1 * self.layers.particles.layers.logo.rotation.y;
      self.layers.particles.layers.column2.position.y =
        self.layers.particles.layers.logo.position.y - 10;
      self.layers.particles.layers.column2.rotation.y =
        1 * self.layers.particles.layers.logo.rotation.y;
      self.layers.particles.layers.logo.shader.uniforms.tRefraction.value = self.refraction;
      self.layers.particles.layers.logo.shader.uniforms.uFooter.value = 1;
      self.layers.particles.layers.column.shader.uniforms.tRefraction.value = self.refraction;
      self.layers.particles.layers.column2.shader.uniforms.tRefraction.value = self.refraction;
      self.set('rotationV', self.layers.particles.layers.particles.group.rotation.y);
    });
    self.onInit = async (_) => {
      await self.layers.particles.layout.getAllLayers();
      self.layers.particles.layers.video.rotation.z = Math.radians(180);
      self.layers.particles.layers.video.position.y += 1;
      self.layers.particles.layers.video.shader.uniforms.uAlpha.value = 0.5;
      self.layers.particles.layers.column.shader.uniforms.uAlpha.value = 0.6;
      self.layers.particles.layers.column2.shader.uniforms.uAlpha.value = 0.6;
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
          resolution: 0.1,
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

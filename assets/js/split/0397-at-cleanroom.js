/*
 * CleanRoom — "Clean Room" page Fragment (FragFXScene). One of
 * the app's stage scenes; renders to its own FX scene RT then
 * composites via Nuke.
 *
 * Composition:
 *   - `_initFXScene(World.NUKE, ...)` — own RT scene.
 *   - World.NUKE paused while children boot to avoid first-
 *     frame flicker.
 *   - Layout root scaled 2x (`self.layout.group.scale.setScalar(2)`).
 *   - Camera locked (no interaction).
 *
 * Custom uniforms exposed for shaders downstream:
 *   - uRGBStrength      (number 1) — chromatic aberration
 *     intensity multiplier.
 *   - uVolumetricStrength (number 1) — god-ray mix.
 *   - uContrast         (Vector2 1,1) — pre/post contrast.
 *
 * Accessibility: registers 'CleanRoomPage' with GLA11y and
 * announces the `text` layer's string for screen readers.
 *
 * Responsive layout: portrait mobile pushes text/text2 to
 * hand-tuned positions and pulls the camera closer (z=3);
 * landscape restores `oPos` (cached original positions, stored
 * by FragFXScene at load time) and camera z=5.
 *
 * `url = 'https://github.com/developerkaren96'` — hard-coded link target for the
 * atlogo layer (wiring to the click handler lives below the
 * cutoff).
 *
 * Standard Fragment plumbing follows.
 */
Class(function CleanRoom(_params, ...restArgs) {
  const self = this;
  Inherit(self, FragFXScene, 'CleanRoom');
  Inherit(self, XComponent);
  self.fragName = 'CleanRoom';
  self.contexts = 'FragFXScene, "CleanRoom"';
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
    (self.nuke || World.NUKE).paused = true;
    self.params = _params;
    self.args = arguments;
    self.parent?.layers && (self.layers = self.parent.layers);
    self.layout?.getAllLayers && (self.layers = await self.layout.getAllLayers());
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
    self.layout.group.scale.setScalar(2);
    self.layers.camera.lock();
    GLA11y.registerPage(self.scene, 'CleanRoomPage');
    GLA11y.textNode(self.layers.text.group, self.layers.text.text.text.string);
    let url = 'https://github.com/developerkaren96';
    async function updateLayout() {
      Device.mobile && Stage.height > Stage.width
        ? ((self.layers.text.group.position.x = 0.2),
          (self.layers.text.group.position.y = 0.9),
          (self.layers.text2.group.position.x = -0.2),
          (self.layers.text2.group.position.y = 0.4 - 0.5),
          (self.layers.camera.position.z = 3))
        : ((self.layers.camera.position.z = 5),
          self.layers.text.group.position.copy(self.layers.text.group.oPos),
          self.layers.text2.group.position.copy(self.layers.text2.group.oPos));
    }
    self.layers.hit.shader.set('uAlpha', 0);
    self.layers.text.text.alpha = 0.7;
    self.layers.text2.text.alpha = 0.7;
    self.layers.atlogo.shader.set('uAlpha', 0);
    self.layers.atlogo.visible = false;
    Interaction3D.find(self.layers.camera).add(
      self.layers.hit,
      function onHover(e) {
        switch (((Global.LOGO_HOVERED = 'over' == e.action ? 1 : 0), e.action)) {
          case 'over':
            self.layers.text.text.tween(
              {
                alpha: 1,
              },
              500,
              'easeOutCubic',
            );
            self.layers.text2.text.tween(
              {
                alpha: 1,
              },
              500,
              'easeOutCubic',
            );
            self.layers.atlogo.shader.set('uAlpha', 0);
            tween(
              self.layers.camera.group.position,
              {
                z: -0.25,
              },
              500,
              'easeOutCubic',
            );
            break;
          case 'out':
            self.layers.text.text.tween(
              {
                alpha: 0.7,
              },
              800,
              'easeOutCubic',
            );
            self.layers.text2.text.tween(
              {
                alpha: 0.7,
              },
              800,
              'easeOutCubic',
            );
            self.layers.atlogo.shader.set('uAlpha', 0);
            tween(
              self.layers.camera.group.position,
              {
                z: 0,
              },
              800,
              'easeOutCubic',
            );
        }
      },
      function onClick(e) {
        open(url, '_self');
      },
      {
        url: url,
      },
    );
    self.layers.text.group.oPos = new Vector3().copy(self.layers.text.group.position);
    self.layers.text2.group.oPos = new Vector3().copy(self.layers.text2.group.position);
    updateLayout();
    self.onResize(updateLayout);
    self.startRender((_) => {
      if (null == self.scrollProgress) return;
      let base = (Device.mobile && (Stage.height, Stage.width), 0.5),
        spin = Device.mobile && Stage.height > Stage.width ? Math.radians(-8) : Math.radians(-15);
      self.layers.room.rotation.y = spin * (-base + self.scrollProgress);
    });
    self.onInit = async (_) => {
      self.volumetricLight.addLight(self.layers.white);
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
          shader: 'CleanRoomComposite',
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
          unique: 'cleanroom',
          nuke: self.nuke,
          dpr: 0.4,
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
    _promises = null;
    self.flag?.('__ready', true);
    self.onInit?.();
  })();
});

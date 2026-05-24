/*
 * TreeScene — "Tree" page FragFXScene. Lightweight composite
 * scene: own FX scene RT + TreeSceneComposite NukePass.
 *
 * Per-frame startRender:
 *   - wrapper.rotation.y = 180° + -60°·(−0.5 + scrollProgress)
 *     (so the whole rig sweeps ±30° around the up-axis as the
 *     user scrolls).
 *   - camera.z = (mobile 40 / desktop 35) − 15·scrollProgress
 *     (dolly-in as scroll advances).
 *   - cables.shader.uLight.x = −0.5 + scrollProgress (slides
 *     a directional light's x position with scroll for the
 *     cable highlights).
 *
 * Uniforms (smaller set than Home/About — no volumetric):
 *   uRGBStrength, uContrast (Vector2).
 *
 * Standard Fragment plumbing.
 */
Class(function TreeScene(_params, ...restArgs) {
  const self = this;
  Inherit(self, FragFXScene, 'TreeScene');
  Inherit(self, XComponent);
  self.fragName = 'TreeScene';
  self.contexts = 'FragFXScene, "TreeScene"';
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
      uContrast: {
        value: new Vector2(1, 1),
      },
    };
    self.startRender((_) => {
      null != self.scrollProgress &&
        ((self.layers.wrapper.rotation.y =
          Math.radians(180) + Math.radians(-60) * (-0.5 + self.scrollProgress)),
        (self.layers.camera.position.z = (Device.mobile ? 40 : 35) - 15 * self.scrollProgress),
        (self.layers.cables.shader.uniforms.uLight.value.x = -0.5 + self.scrollProgress));
    });
    self.onInit = async (_) => {};
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
          shader: 'TreeSceneComposite',
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

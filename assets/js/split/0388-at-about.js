/*
 * About — "About" page Fragment view. App-level class compiled
 * from the Active Theory editor (Hydra fragment authoring).
 * Inherits FragFXScene('About') + XComponent so it boots as a
 * Nuke-rendered scene fragment with editor data binding.
 *
 * Composition:
 *   - `refractionLayer` — FXLayer captures the refraction pass
 *     (writes-only into its own RT).
 *   - `refraction` — SnapshotFrame swap of refractionLayer →
 *     becomes the `tRefraction` sampler on the logo shader.
 *   - `ref_NukePass783` — `AboutComposite` NukePass added to the
 *     parent nuke once all fragments report `__ready`.
 *
 * `_promises[]` accumulates child-fragment ready promises so
 * the parent nuke stays paused (`World.NUKE.paused = true`)
 * until everything is uploaded — avoids first-frame flicker.
 *
 * Per-frame loop:
 *   - Smoothed mouse-drag accumulator drives a slow logo
 *     rotation (Y += deltaX × per-device scalar).
 *   - `logo.position.y` mapped from `scrollProgress ∈ [-1, 1]`
 *     to `[6, -2]` — logo translates as the page scrolls.
 *   - `logo.rotation.y` = -200° × (scroll - 0.5) + 60° + 2×rot.
 *   - `uScrollDelta` uniform lerped toward 100×(prev-cur).
 *
 * GLA11y registration: page and the two text layers ("text"
 * and "copy") are registered so screen readers can announce
 * the rendered content.
 *
 * Responsive layout: on portrait mobile, hand-tuned scale/
 * position overrides for text/copy/logo; landscape restores
 * the original transforms cached at init time.
 *
 * Async wait-for-children pattern (lines 108-114): walks every
 * own property of `self` that has a `.then`, pushes onto
 * `_promises`, and unwraps each on resolution. Once everything
 * is ready, attaches the composite NukePass into the nuke
 * (registering it with ShaderUIL too), unpauses the nuke, and
 * flags `__ready`.
 *
 * `onInit` (called at the end) pulls `ViewController/video`
 * (AppState async slot) and feeds its `uniform` into the logo
 * shader's `tVideo` channel.
 */
Class(function About(_params, ...restArgs) {
  const self = this;
  Inherit(self, FragFXScene, 'About');
  Inherit(self, XComponent);
  self.fragName = 'About';
  self.contexts = 'FragFXScene, "About"';
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
          name: 'Refraction',
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
    self.ref_NukePass783 = self.initClass(
      NukePass,
      AppState.createLocal(
        {
          shader: 'AboutComposite',
        },
        true,
      ),
    );
    self.ref_NukePass783.isFragment && _promises.push(self.wait(self.ref_NukePass783, '__ready'));
    self.params = _params;
    self.args = arguments;
    self.parent?.layers && (self.layers = self.parent.layers);
    self.layout?.getAllLayers && (self.layers = await self.layout.getAllLayers());
    scrollDelta = 0;
    self.layers.logo.shader.addUniforms({
      uScrollDelta: {
        value: 0,
      },
    });
    let rotation = 0,
      delta = new Vector2(),
      zero = new Vector2();
    self.startRender((_) => {
      if (null == self.scrollProgress) return;
      delta.lerp(Mouse.down ? Mouse.delta : zero, 0.07);
      rotation += delta.x * (Device.mobile ? 0.0075 : 0.0025) * 0.5;
      self.layers.logo.position.y = Math.range(self.scrollProgress, -1, 1, 6, -2);
      self.layers.logo.rotation.y =
        -Math.radians(200) * (-0.5 + self.scrollProgress) + Math.radians(60) + 2 * rotation;
      let dif = scrollDelta - self.scrollProgress;
      scrollDelta = self.scrollProgress;
      self.layers.logo.shader.uniforms.uScrollDelta.value = Math.lerp(
        100 * dif,
        self.layers.logo.shader.uniforms.uScrollDelta.value,
        0.1,
      );
    });
    const getText = (text3d) => text3d.text.text.string;
    GLA11y.registerPage(self.scene, 'AboutPage');
    GLA11y.textNode(self.layers.text.group, getText(self.layers.text));
    GLA11y.textNode(self.layers.copy.group, getText(self.layers.copy));
    getText(self.layers.copy);
    self.layers.camera.lock();
    self.layers.logo.shader.set('tRefraction', self.refraction);
    self.onInit = async (_) => {
      let video = await self.get('ViewController/video');
      self.layers.logo.shader.uniforms.tVideo = video.uniform;
    };
    self.layers.text.originTransform = Utils3D.cloneTransform(self.layers.text);
    self.layers.copy.originTransform = Utils3D.cloneTransform(self.layers.copy);
    self.onResize(function updateLayout() {
      Device.mobile && Stage.height > Stage.width
        ? (self.layers.text.group.scale.set(0.65, 0.65, 1),
          self.layers.text.group.position.set(-1.2, 0.6, -5),
          self.layers.copy.group.scale.set(1.1, 1.1, 1),
          self.layers.copy.group.position.set(-1.2, -1, -5),
          self.layers.logo.scale.set(2.1, 2.1, 2.1))
        : (self.layers.text.group.scale.copy(self.layers.text.originTransform.scale),
          self.layers.text.group.position.copy(self.layers.text.originTransform.position),
          self.layers.copy.group.position.copy(self.layers.copy.originTransform.position));
    });
    for (let key in self)
      if (self[key]?.then) {
        let store = self[key];
        store.then((val) => (self[key] = val));
        _promises.push(store);
      }
    _promises.length && (await Promise.all(_promises));
    self.nuke && (self.ref_NukePass783.texture = self.nuke.rttBuffer);
    (self.ref_NukePass783.upload || self.ref_NukePass783.pass) &&
      ((self.nuke || World.NUKE).add(
        self.ref_NukePass783.pass instanceof NukePass
          ? self.ref_NukePass783.pass
          : self.ref_NukePass783,
      ),
      ShaderUIL.add(
        self.ref_NukePass783.pass instanceof NukePass
          ? self.ref_NukePass783.pass
          : self.ref_NukePass783,
      ));
    (self.nuke || World.NUKE).paused = false;
    _promises = null;
    self.flag?.('__ready', true);
    self.onInit?.();
  })();
});

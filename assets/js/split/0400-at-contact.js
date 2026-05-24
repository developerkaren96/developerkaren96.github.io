/*
 * Contact — "Contact" page Fragment (FragFXScene). Counterpart
 * to About (0388) / CleanRoom (0397).
 *
 * Same composite-pipeline shape as the other FragFXScene
 * pages: nuke paused during async child init, custom uniforms
 * for chromatic aberration / volumetric / contrast post
 * controls, then a `HomeComposite` NukePass is attached as the
 * final compositor (with the scene's rttBuffer plugged in as
 * its input texture) and registered with ShaderUIL for editor
 * tweaking. Nuke unpaused once `__ready`.
 *
 * Uniform set (shared design tokens — same names as About/
 * CleanRoom so a single editor folder can tune all three):
 *   - uRGBStrength
 *   - uVolumetricStrength
 *   - uContrast (Vector2)
 *
 * Standard Fragment plumbing.
 */
Class(function Contact(_params, ...restArgs) {
  const self = this;
  Inherit(self, FragFXScene, 'Contact');
  Inherit(self, XComponent);
  self.fragName = 'Contact';
  self.contexts = 'FragFXScene, "Contact"';
  self.params = _params;
  self.args = arguments;
  this.isFragment = true;
  var _promises = [];
  !(async function () {
    self.element && (self.element.onMountedHook = (_) => self.onMounted?.());
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

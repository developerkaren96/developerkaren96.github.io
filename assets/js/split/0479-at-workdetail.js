/*
 * WorkDetail — FragFXScene rendered atop Work when a
 * project card is open. Houses WorkDetailParticles +
 * WorkDetailContent; cube mesh receives tRefraction from
 * the particles RT and tPrevFrame from the global nuke
 * finalTexture for the recursive looking-glass effect.
 *
 * Camera animation: onResize computes the back-off
 * distance so a 5×5×5 cube fits the FOV; when
 * Work/project is set the camera dollies from +5 back to
 * the resting distance, particles camera from z=25 back
 * to z=0, both over 1500ms 'workInOut'. Clearing the
 * project pushes the camera back out (no particles
 * tween).
 *
 * On mobile, camera.still() is called to skip the idle
 * mouse-tilt drift. MouseFluid is applied to the cube
 * shader for the gooey hover-warp.
 *
 * Standard Fragment plumbing.
 */
Class(function WorkDetail(_params, ...restArgs) {
  const self = this;
  Inherit(self, FragFXScene, 'WorkDetail');
  Inherit(self, XComponent);
  self.fragName = 'WorkDetail';
  self.contexts = 'FragFXScene, "WorkDetail"';
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
    self.particles = self.initClass(WorkDetailParticles);
    self.particles.isFragment && _promises.push(self.wait(self.particles, '__ready'));
    self.content = self.initClass(WorkDetailContent);
    self.content.isFragment && _promises.push(self.wait(self.content, '__ready'));
    (self.nuke || World.NUKE).paused = true;
    self.params = _params;
    self.args = arguments;
    self.parent?.layers && (self.layers = self.parent.layers);
    self.layout?.getAllLayers && (self.layers = await self.layout.getAllLayers());
    self.scene.add(self.content.group);
    self.uniforms = {
      uRGBStrength: {
        value: 1,
      },
    };
    var _targetZ = 0;
    let cube = self.layers.cube,
      camera = self.layers.camera;
    self.set('camera', camera);
    camera.lock();
    cube.shader.set('tRefraction', self.particles);
    Device.mobile && camera.still();
    MouseFluid.instance().applyTo(cube.shader);
    GLA11y.registerPage(self.scene, 'WorkDetailPage');
    self.onResize((_) => {
      let width = (Stage.width / Stage.height) * 5;
      cube.scale.set(width, 5, 5).multiplyScalar(1);
      cube.position.z = 0.35 * cube.scale.z;
      const distance = 2.5 / Math.tan(Math.radians(camera.camera.fov / 2));
      camera.group.position.z = distance;
      _targetZ = distance;
    });
    self.onInit = async (_) => {
      await self.wait((_) => !!self.nuke);
      await self.wait(self.nuke, 'finalTexture');
      cube.shader.set('tPrevFrame', self.nuke.finalTexture);
    };
    self.bind('Work/project', (data) => {
      data
        ? (self.fire('WorkDetailContent/updateText', data),
          (self.particles.layers.camera.group.position.z = 25),
          (camera.group.position.z = _targetZ + 5),
          tween(
            camera.group.position,
            {
              z: _targetZ,
            },
            1500,
            'workInOut',
          ),
          tween(
            self.particles.layers.camera.group.position,
            {
              z: 0,
            },
            1500,
            'workInOut',
          ))
        : tween(
            camera.group.position,
            {
              z: _targetZ + 5,
            },
            1500,
            'workInOut',
          );
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
          shader: 'WorkDetailComposite',
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

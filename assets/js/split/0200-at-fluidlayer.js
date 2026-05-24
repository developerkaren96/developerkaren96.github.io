/*
 * FluidLayer — SceneLayout-friendly wrapper around the Fluid solver
 * (0198) that exposes its parameters as a live-tweakable UIL panel
 * and creates a screen-quad mesh that displays the dye output.
 *
 * UIL panel (`Fluid Config`):
 *   - dyeSize         : dye-buffer resolution (default 512).
 *   - simSize         : sim-buffer resolution (default 128).
 *   - velocity        : VELOCITY_DISSIPATION (0–1, default 0.98).
 *   - density         : DENSITY_DISSIPATION  (default 0.97).
 *   - pressure        : PRESSURE_DISSIPATION (default 0.8).
 *   - iterations      : PRESSURE_ITERATIONS  (default 5).
 *   - curl            : CURL strength        (default 30).
 *   - defaultRadius   : SPLAT_RADIUS         (default 25).
 *   - debugMouse      : toggle splatting from mouse for debug.
 *
 * The wildcard `_input.get('wildcard')` may carry a `WxH` rect (e.g.
 * `'1024x576'`) to override the simulation domain from the default
 * `Stage` size.
 *
 * `initMesh()` builds a `Mesh(World.QUAD, ScreenQuad-shader)` that
 * samples `_fluid.rt` (the dye field) and adds it as a child of this
 * Object3D so it renders into whatever scene this layer is dropped
 * into.
 *
 * `drawInput` is delegated straight to the underlying Fluid so
 * external code can splat into the simulation directly through the
 * layer.
 *
 * `applyTo(shader)` is the *consumer* hook: it gives an arbitrary
 * shader access to the live velocity field (`tFluid`) and a back-ref
 * to this layer (`tFluidMask`), so e.g. a refraction shader can warp
 * itself by the simulated flow.
 *
 * `additiveBlending` setter is wired through to the Fluid instance.
 */
Class(function FluidLayer(_input, _group) {
  Inherit(this, Object3D);
  const self = this;
  let _fluid;
  let _config;

  (function initConfig() {
    self.uilInput = _input;
    self.uilGroup = _group;
    _config = InputUIL.create(_input.prefix + 'fluid', _group);
    _config.setLabel('Fluid Config');
    _config.add('dyeSize', 512);
    _config.add('simSize', 128);
    _config.add('velocity', 0.98);
    _config.add('density', 0.97);
    _config.add('pressure', 0.8);
    _config.add('iterations', 5);
    _config.add('curl', 30);
    _config.add('defaultRadius', 25);
    _config.addToggle('debugMouse', false);
  })();

  (function initFluid() {
    let rect = Stage;
    const wildcard = _input.get('wildcard');
    if (wildcard && wildcard.includes('x')) {
      const split = wildcard.split('x');
      rect = { width: Number(split[0]), height: Number(split[1]) };
    }
    _fluid = self.initClass(
      Fluid,
      _config.getNumber('simSize'),
      _config.getNumber('dyeSize'),
      rect,
    );
    self.rt = _fluid.rt;
    self.fbos = _fluid.fbos;
    _config.onUpdate = (key) => {
      switch (key) {
        case 'velocity':
          _fluid.updateConfig('VELOCITY_DISSIPATION', _config.getNumber(key));
          break;
        case 'density':
          _fluid.updateConfig('DENSITY_DISSIPATION', _config.getNumber(key));
          break;
        case 'pressure':
          _fluid.updateConfig('PRESSURE_DISSIPATION', _config.getNumber(key));
          break;
        case 'iterations':
          _fluid.updateConfig('PRESSURE_ITERATIONS', _config.getNumber(key));
          break;
        case 'curl':
          _fluid.updateConfig('CURL', _config.getNumber(key));
          break;
        case 'defaultRadius':
          _fluid.updateConfig('SPLAT_RADIUS', _config.getNumber(key));
          break;
        case 'debugMouse':
          _fluid.updateConfig('DEBUG_MOUSE', _config.get(key));
      }
    };
    ['velocity', 'density', 'pressure', 'iterations', 'curl', 'defaultRadius', 'debugMouse'].forEach(
      _config.onUpdate,
    );
  })();

  this.initMesh = function () {
    const shader = self.initClass(Shader, 'ScreenQuad', { tMap: { value: _fluid.rt } });
    const mesh = new Mesh(World.QUAD, shader);
    self.add(mesh);
    self.mesh = mesh;
  };

  this.drawInput = _fluid.drawInput;
  this.set('additiveBlending', (v) => (_fluid.additiveBlending = v));
  this.applyTo = function (shader) {
    shader.uniforms.tFluid = self.fbos.velocity.uniform;
    shader.uniforms.tFluidMask = { value: self };
  };
});

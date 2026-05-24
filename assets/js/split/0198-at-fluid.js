/*
 * Fluid — GPU implementation of Jos Stam's stable-fluids algorithm
 * (with vorticity confinement) as used in real-time art apps.
 *
 * Two grid resolutions:
 *   - `SIM_WIDTH` / `SIM_HEIGHT`: low-res velocity / pressure /
 *     divergence / curl simulation (typically 128² – cheap).
 *   - `DYE_WIDTH` / `DYE_HEIGHT`: higher-res "dye" (visual colour)
 *     that's advected by the simulated velocity field (typically
 *     512² – pretty).
 *
 * Per-frame `loop()` steps (the canonical stable-fluids sequence):
 *   1. **curl**      : compute scalar curl from velocity → curl FBO.
 *   2. **vorticity** : add curl-driven force back to velocity to
 *                       preserve small-scale swirl.
 *   3. **divergence**: compute scalar divergence from velocity.
 *   4. **clear**     : decay pressure by PRESSURE_DISSIPATION.
 *   5. **pressure**  : `PRESSURE_ITERATIONS` Jacobi iterations on
 *                       (pressure, divergence) — the velocity-field
 *                       projection step that enforces ∇·v = 0.
 *   6. **gradientSubtract** : subtract pressure gradient from
 *                              velocity → divergence-free velocity.
 *   7. **advection** : advect velocity by itself (semi-Lagrangian),
 *                       then advect dye by the new velocity.
 *
 * Dissipation parameters (0–1) decay each field per frame to keep the
 * simulation from running away. `updateParamsHz` re-scales these
 * exponentially against `Render.HZ_MULTIPLIER` so the visual decay
 * is frame-rate-independent.
 *
 * External impulses:
 *   `drawInput(x, y, dx, dy, color, radius)` writes a splat into both
 *   velocity (dx, dy) and dye (color) at the given normalised position.
 *   The host code calls this in response to mouse / touch input.
 *
 * `_simSize` overload: passing an `isAppState` object pulls
 * `simSize`, `dyeSize`, `rect` from it.
 *
 * RT format: HALF_FLOAT on WebGL2/mobile, FLOAT on WebGL1 (when
 * available) — see FluidFBO for the per-buffer construction.
 */
Class(function Fluid(_simSize = 128, _dyeSize = 512, _rect = Stage) {
  Inherit(this, Component);
  const self = this;
  var _fbos = {},
    _scenes = {},
    _tmpVec = new Vector2(),
    _lastSplat = Render.TIME;
  if ('object' == typeof _simSize && _simSize.isAppState) {
    let params = _simSize;
    _simSize = params.simSize || 129;
    _dyeSize = params.dyeSize || 512;
    _rect = params.rect || Stage;
  }
  const DYE_WIDTH = _dyeSize,
    DYE_HEIGHT = _dyeSize,
    SIM_WIDTH = _simSize,
    SIM_HEIGHT = _simSize,
    config = {
      DENSITY_DISSIPATION: 0.97,
      VELOCITY_DISSIPATION: 0.98,
      PRESSURE_DISSIPATION: 0.8,
      PRESSURE_ITERATIONS: 20,
      CURL: 30,
      DEBUG_MOUSE: true,
      SPLAT_RADIUS: 0.25,
    };
  function updateParamsHz(param) {
    return 0 == (param = Math.clamp(param)) ? 0 : Math.exp(Math.log(param) * Render.HZ_MULTIPLIER);
  }
  function loop() {
    _scenes.curl.uniforms.uVelocity.value = _fbos.velocity.read;
    _scenes.curl.render(_fbos.curl.fbo);
    _scenes.vorticity.uniforms.uVelocity.value = _fbos.velocity.read;
    _scenes.vorticity.uniforms.uCurl.value = _fbos.curl.fbo;
    _scenes.vorticity.uniforms.curl.value = config.CURL;
    _scenes.vorticity.render(_fbos.velocity.write);
    _fbos.velocity.swap();
    _scenes.divergence.uniforms.uVelocity.value = _fbos.velocity.read;
    _scenes.divergence.render(_fbos.divergence.fbo);
    _scenes.clear.uniforms.uTexture.value = _fbos.pressure.read;
    _scenes.clear.uniforms.value.value = updateParamsHz(config.PRESSURE_DISSIPATION);
    _scenes.clear.render(_fbos.pressure.write);
    _fbos.pressure.swap();
    _scenes.pressure.uniforms.uDivergence.value = _fbos.divergence.fbo;
    for (let i = 0; i < config.PRESSURE_ITERATIONS; i++) {
      _scenes.pressure.uniforms.uPressure.value = _fbos.pressure.read;
      _scenes.pressure.render(_fbos.pressure.write);
      _fbos.pressure.swap();
    }
    _scenes.gradientSubtract.uniforms.uPressure.value = _fbos.pressure.read;
    _scenes.gradientSubtract.uniforms.uVelocity.value = _fbos.velocity.read;
    _scenes.gradientSubtract.render(_fbos.velocity.write);
    _fbos.velocity.swap();
    _scenes.advection.uniforms.texelSize.value.set(1 / SIM_WIDTH, 1 / SIM_HEIGHT);
    _scenes.advection.uniforms.uVelocity.value = _fbos.velocity.read;
    _scenes.advection.uniforms.uSource.value = _fbos.velocity.read;
    _scenes.advection.uniforms.dissipation.value = updateParamsHz(config.VELOCITY_DISSIPATION);
    _scenes.advection.render(_fbos.velocity.write);
    _fbos.velocity.swap();
    _scenes.advection.uniforms.texelSize.value.set(1 / DYE_WIDTH, 1 / DYE_HEIGHT);
    _scenes.advection.uniforms.uVelocity.value = _fbos.velocity.read;
    _scenes.advection.uniforms.uSource.value = _fbos.density.read;
    _scenes.advection.uniforms.dissipation.value = updateParamsHz(config.DENSITY_DISSIPATION);
    _scenes.advection.render(_fbos.density.write);
    _fbos.density.swap();
    _scenes.display.uniforms.uTexture.value = _fbos.density.read;
    _scenes.display.uniforms.texelSize.value.set(1 / _rect.width, 1 / _rect.height);
    _scenes.display.render(self.rt);
  }
  this.rt = Utils3D.createRT(_rect.width, _rect.height);
  this.fbos = _fbos;
  this.additiveBlending = true;
  self.rt.disableDepth = true;
  (function initFBOs() {
    _fbos.density = self.initClass(FluidFBO, DYE_WIDTH, DYE_HEIGHT, Texture.LINEAR);
    _fbos.velocity = self.initClass(FluidFBO, SIM_WIDTH, SIM_HEIGHT, Texture.LINEAR);
    _fbos.divergence = self.initClass(FluidFBO, SIM_WIDTH, SIM_HEIGHT, Texture.NEAREST);
    _fbos.curl = self.initClass(FluidFBO, SIM_WIDTH, SIM_HEIGHT, Texture.NEAREST);
    _fbos.pressure = self.initClass(FluidFBO, SIM_WIDTH, SIM_HEIGHT, Texture.NEAREST);
  })();
  (function initScenes() {
    _scenes.curl = self.initClass(FluidScene, 'fluidBase', 'curlShader', {
      texelSize: {
        value: new Vector2(1 / SIM_WIDTH, 1 / SIM_HEIGHT),
      },
      uVelocity: {
        value: null,
      },
      depthWrite: false,
    });
    _scenes.vorticity = self.initClass(FluidScene, 'fluidBase', 'vorticityShader', {
      texelSize: {
        value: new Vector2(1 / SIM_WIDTH, 1 / SIM_HEIGHT),
      },
      uVelocity: {
        value: null,
      },
      uCurl: {
        value: null,
      },
      curl: {
        value: config.CURL,
      },
      dt: {
        value: 1 / Render.REFRESH_RATE,
      },
    });
    _scenes.divergence = self.initClass(FluidScene, 'fluidBase', 'divergenceShader', {
      texelSize: {
        value: new Vector2(1 / SIM_WIDTH, 1 / SIM_HEIGHT),
      },
      uVelocity: {
        value: null,
      },
    });
    _scenes.clear = self.initClass(FluidScene, 'fluidBase', 'clearShader', {
      uTexture: {
        value: null,
      },
      value: {
        value: config.PRESSURE_DISSIPATION,
      },
    });
    _scenes.pressure = self.initClass(FluidScene, 'fluidBase', 'pressureShader', {
      texelSize: {
        value: new Vector2(1 / SIM_WIDTH, 1 / SIM_HEIGHT),
      },
      uPressure: {
        value: null,
      },
      uDivergence: {
        value: null,
      },
    });
    _scenes.gradientSubtract = self.initClass(FluidScene, 'fluidBase', 'gradientSubtractShader', {
      texelSize: {
        value: new Vector2(1 / SIM_WIDTH, 1 / SIM_HEIGHT),
      },
      uPressure: {
        value: null,
      },
      uVelocity: {
        value: null,
      },
    });
    _scenes.advection = self.initClass(FluidScene, 'fluidBase', 'advectionShader', {
      texelSize: {
        value: new Vector2(1 / SIM_WIDTH, 1 / SIM_HEIGHT),
      },
      uVelocity: {
        value: null,
      },
      uSource: {
        value: null,
      },
      dt: {
        value: 1 / Render.REFRESH_RATE,
      },
      dissipation: {
        value: config.VELOCITY_DISSIPATION,
      },
    });
    _scenes.display = self.initClass(FluidScene, 'fluidBase', 'displayShader', {
      texelSize: {
        value: new Vector2(1 / _rect.width, 1 / _rect.height),
      },
      uTexture: {
        value: null,
      },
    });
    _scenes.splat = self.initClass(FluidScene, 'fluidBase', 'splatShader', {
      uTarget: {
        value: null,
      },
      aspectRatio: {
        value: _rect.width / _rect.height,
      },
      point: {
        value: new Vector2(),
      },
      prevPoint: {
        value: new Vector2(),
      },
      color: {
        value: new Vector3(),
      },
      bgColor: {
        value: new Color('#000000'),
      },
      radius: {
        value: config.SPLAT_RADIUS / 100,
      },
      canRender: {
        value: 0,
      },
      uAdd: {
        value: 1,
      },
    });
  })();
  self.startRender(loop);
  this.updateConfig = function (key, value) {
    config[key] = value;
  };
  this.drawInput = function (x, y, dx, dy, color, radius = config.SPLAT_RADIUS, independent) {
    _scenes.splat.uniforms.uTarget.value = _fbos.velocity.read;
    _scenes.splat.uniforms.radius.value = radius / 200;
    _scenes.splat.uniforms.aspectRatio.value = _rect.width / _rect.height;
    _tmpVec.set(x / _rect.width, 1 - y / _rect.height);
    let now = Render.TIME,
      delta = now - _lastSplat;
    _lastSplat = now;
    delta > 50 || independent
      ? _scenes.splat.uniforms.prevPoint.value.copy(_tmpVec)
      : _scenes.splat.uniforms.prevPoint.value.copy(_scenes.splat.uniforms.point.value);
    _scenes.splat.uniforms.point.value.copy(_tmpVec);
    _scenes.splat.uniforms.color.value.set(dx, -dy, 1);
    _scenes.splat.uniforms.uAdd.value = 1;
    _scenes.splat.render(_fbos.velocity.write);
    _fbos.velocity.swap();
    _scenes.splat.uniforms.uTarget.value = _fbos.density.read;
    _scenes.splat.uniforms.color.value.set(color.r, color.g, color.b);
    _scenes.splat.uniforms.uAdd.value = self.additiveBlending ? 1 : 0;
    _scenes.splat.render(_fbos.density.write, true);
    _fbos.density.swap();
    _scenes.splat.uniforms.canRender.value = 1;
  };
});

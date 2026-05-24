/*
 * AntimatterSpawn — emission controller for a particle group. Manages
 * a circular-buffer index over a fixed-capacity Antimatter system,
 * writing per-particle birth state (life flag, initial position,
 * velocity, optional color) into AntimatterAttribute textures the
 * AntimatterSpawn pass shader reads on the GPU side.
 *
 * Capacity & cursor:
 *   `_total = particleCount` is the slot count. `_index` is the write
 *   cursor that wraps at _total. Each `emit()` advances the cursor
 *   per-particle. When the user spawns more particles than capacity,
 *   we overwrite the oldest entries (FIFO).
 *
 * Lifecycle buffer layout (`_life`, RGBA per particle):
 *   [0] life flag — set to 1 on emit, GPU pass decays it toward 0.
 *   [1..3] initial position xyz captured at emit time.
 *
 * Decay frame queue (`_releasedA` / `_releasedB`):
 *   When a particle is emitted, its index goes into `_releasedB`.
 *   On the next render frame `loop()` zeros the life flag for every
 *   index in `_releasedA` and rotates the buffers (A ← B). This gives
 *   the GPU exactly one frame to read the "alive=1" pulse before we
 *   zero it back to 0 — i.e. the spawn signal is a single-frame event,
 *   subsequent decay/integration is handled by the simulation kernel.
 *
 * Init (async IIFE):
 *   1. Allocate the lifecycle (RGBA) and velocity (RGB) Float32Array
 *      buffers via the AntimatterUtil worker. `freshCopy=true` so the
 *      worker hands us non-shared arrays.
 *   2. Wrap each as an AntimatterAttribute (DataTexture wrapper).
 *   3. Build the AntimatterSpawn pass with its uniform inputs:
 *        uMaxCount/tAttribs come from the parent behavior pass so the
 *        spawn kernel can read static attribs without re-binding.
 *        uSetup=1 makes the first few ticks no-op (waits for the
 *        ping-pong RTs to fill). `onInit` (fired after first read
 *        wrap; see AntimatterPass.swap) flips uSetup→0 and sets
 *        `canEmit=true` so subsequent emits actually land.
 *        `HZ = Render.HZ_MULTIPLIER` scales decay rate so the system
 *        behaves the same at 60/90/120Hz.
 *   4. Register the pass with the live-edit ShaderUIL panel as
 *      "Life Shader".
 *   5. Plumb tSpawn/tVelocity/tColor into the parent behavior pass so
 *      the simulation kernel can read birth data, and add tLife to the
 *      particle render shader for per-particle alpha/scale fades.
 *   6. Insert the spawn pass at position 0 so it runs before the
 *      simulation pass.
 *
 * `emit(position, velocity, color)`:
 *   Position is a flat XYZ array (length = 3 * particleCount). Velocity
 *   and color (if provided) must match in length. Each particle slot
 *   bumps `_index`, writes life=1+xyz into _life, optional v into
 *   _velocity, optional c into _color, and pushes the index onto
 *   _releasedB for next-frame zeroing.
 *
 * `release(pos, count, radius, velocity, color)`:
 *   Convenience emitter that scatters `count` particles around a single
 *   pivot. Two distributions:
 *     • `pos.spherical`  uniform on the surface of a sphere of radius radX.
 *     • default          uniform within an axis-aligned box, radius
 *                        per-axis if radius is an array else uniform.
 *   Builds the flat arrays in pooled scratch (`_temp0/1/2`) and forwards
 *   to `emit`. Pooled arrays are length-reset after emit so the next
 *   release reuses the same allocation.
 *
 * `useColor(shader)`:
 *   Optional per-particle color channel. Allocates a color buffer +
 *   attribute lazily and wires `tColor` onto the supplied shader (or
 *   the default proton render shader) and into the behavior pass.
 *
 * `applyToShader(shader)`:
 *   Re-export the live tLife/tVelocity/tColor uniform values onto a
 *   different shader (for material variants that read these channels).
 *
 * `ready()` resolves once `canEmit=true`, which gates the spawn pass
 * having completed its warm-up cycle.
 *
 * Read/write of `_index` is exposed via get/set so callers can serialize
 * spawn cursors across scene swaps.
 */
Class(function AntimatterSpawn(_proton, _group, _input) {
  Inherit(this, Component);
  const self = this;

  let _life, _pass, _velocity, _color;
  let _index = -1;
  const _total = _proton.particleCount;

  // Two-frame ping-pong queue: B receives this frame's emit indices,
  // A holds last frame's indices that we zero out this frame.
  let _releasedA = [];
  let _releasedB = [];

  // Scratch arrays for release() — pooled to avoid per-call allocation.
  const _temp0 = [], _temp1 = [], _temp2 = [];
  const _vec   = new Vector3();

  /*
   * Per-frame: zero the life flag of indices that were emitted last
   * frame (giving the simulation kernel exactly one frame to see the
   * birth pulse), then rotate the queues so this frame's emits will
   * be zeroed next frame.
   */
  function loop() {
    const count = _releasedA.length;
    for (let i = count - 1; i > -1; i--) {
      const index = _releasedA[i];
      _life.buffer[4 * index + 0] = 0;
    }
    _releasedA.length = 0;
    if (count) _life.needsUpdate = true;
    const hold = _releasedA;
    _releasedA = _releasedB;
    _releasedB = hold;
  }

  (async function () {
    await (async function initPass() {
      // Build the lifecycle/velocity buffers via the worker pool.
      const [lifeBuffer, velocityBuffer] = await Promise.all([
        _proton.antimatter.createFloatArrayAsync(4, true),
        _proton.antimatter.createFloatArrayAsync(3, true),
      ]);
      _life     = self.initClass(AntimatterAttribute, lifeBuffer,     4);
      _velocity = self.initClass(AntimatterAttribute, velocityBuffer, 3);

      // Spawn pass with full uniform set. uSetup=1 stalls effective
      // behavior until onInit flips it to 0 after warm-up.
      _pass = self.initClass(AntimatterPass, 'AntimatterSpawn', {
        unique:      _input.prefix,
        uMaxCount:   _proton.behavior.uniforms.uMaxCount,
        tAttribs:    _proton.behavior.uniforms.tAttribs,
        tLife:       { value: _life, ignoreUIL: true },
        uSetup:      { value: 1,     ignoreUIL: true },
        decay:       { value: 1 },
        HZ:          { value: Render.HZ_MULTIPLIER, ignoreUIL: true },
        decayRandom: { value: new Vector2(1, 1) },
      });
      ShaderUIL.add(_pass, _group).setLabel('Life Shader');

      // One-shot warm-up callback (fired by AntimatterPass.swap after
      // the read cursor first wraps).
      _pass.onInit = (_) => {
        _pass.setUniform('uSetup', 0);
        self.canEmit = true;
      };

      // Wire spawn/velocity into the simulation pass; tLife into the
      // particle render shader.
      _proton.behavior.addInput('tSpawn',    _pass);
      _proton.behavior.addInput('tVelocity', _velocity);
      _proton.shader.addUniforms({ tLife: { value: _pass.output } });

      // Spawn must run before simulation.
      _proton.antimatter.addPass(_pass, 0);
      self.lifeOutput = _pass.output;
    })();

    self.startRender(loop);
  })();

  /*
   * Write birth state into the lifecycle/velocity/(color) attribute
   * textures. Each particle slot is an XYZW quad in _life:
   *   [0] alive flag (1 this frame, GPU pass decays it down)
   *   [1..3] initial position (read once by the sim kernel on birth).
   */
  this.emit = function (position, velocity, color) {
    if (!self.canEmit) return;
    if (velocity && position.length != velocity.length) {
      throw 'Position and velocity need to be the same length';
    }
    if (color && position.length != color.length) {
      throw 'Position and color need to be the same length';
    }

    const count = position.length / 3;
    for (let i = 0; i < count; i++) {
      let index = ++_index;
      if (_index >= _total) _index = -1;

      _life.buffer[4 * index + 0] = 1;
      _life.buffer[4 * index + 1] = position[3 * i + 0];
      _life.buffer[4 * index + 2] = position[3 * i + 1];
      _life.buffer[4 * index + 3] = position[3 * i + 2];

      if (velocity) {
        _velocity.buffer[3 * index + 0] = velocity[3 * i + 0];
        _velocity.buffer[3 * index + 1] = velocity[3 * i + 1];
        _velocity.buffer[3 * index + 2] = velocity[3 * i + 2];
      }
      if (color && _color) {
        _color.buffer[3 * index + 0] = color[3 * i + 0];
        _color.buffer[3 * index + 1] = color[3 * i + 1];
        _color.buffer[3 * index + 2] = color[3 * i + 2];
      }
      _releasedB.push(index);
    }

    _life.needsUpdate = true;
    if (velocity) _velocity.needsUpdate = true;
    if (color && _color) _color.needsUpdate = true;
  };

  /*
   * Convenience burst emitter around a pivot. `radius` is a number for
   * a uniform box, or [x, y, z] for axis-varying. `pos.spherical=true`
   * places particles uniformly on the surface of a sphere of radius
   * radX. Reuses pooled scratch arrays.
   */
  this.release = function (pos, count = 1, radius = 0, velocity, color) {
    if (!self.canEmit) return;
    const positions  = _temp0;
    const velocities = velocity ? _temp1 : null;
    const colors     = color    ? _temp2 : null;
    const radX = Array.isArray(radius) ? radius[0] : radius;
    const radY = Array.isArray(radius) ? radius[1] : radius;
    const radZ = Array.isArray(radius) ? radius[2] : radius;

    for (let i = 0; i < count; i++) {
      if (pos.spherical) {
        _vec
          .set(Math.random(-1, 1, 4), Math.random(-1, 1, 4), Math.random(-1, 1, 4))
          .normalize()
          .multiplyScalar(radX);
        positions[3 * i + 0] = pos.x + _vec.x;
        positions[3 * i + 1] = pos.y + _vec.y;
        positions[3 * i + 2] = pos.z + _vec.z;
      } else {
        positions[3 * i + 0] = pos.x + Math.random(-1, 1, 4) * radX;
        positions[3 * i + 1] = pos.y + Math.random(-1, 1, 4) * radY;
        positions[3 * i + 2] = pos.z + Math.random(-1, 1, 4) * radZ;
      }
      if (velocities) {
        velocities[3 * i + 0] = velocity.x;
        velocities[3 * i + 1] = velocity.y;
        velocities[3 * i + 2] = velocity.z;
      }
      if (colors) {
        colors[3 * i + 0] = color.r;
        colors[3 * i + 1] = color.g;
        colors[3 * i + 2] = color.b;
      }
    }

    self.emit(positions, velocities, colors);
    _temp0.length = 0;
    _temp1.length = 0;
    _temp2.length = 0;
  };

  this.upload = async function () {
    await _life?.uploadAsync();
    await _velocity?.uploadAsync();
  };

  /*
   * Lazy color channel. Allocates a color buffer + attribute and wires
   * tColor into the supplied shader (default: particle render shader)
   * and into the simulation pass.
   */
  this.useColor = async function (shader) {
    const colorBuffer = await _proton.antimatter.createFloatArrayAsync(3, true);
    _color = self.initClass(AntimatterAttribute, colorBuffer, 3);
    if (!shader) shader = _proton.shader;
    shader.addUniforms({ tColor: { value: _color } });
    _proton.behavior.addInput('tColor', _color);
  };

  // Re-export live uniforms onto an alternate shader.
  this.applyToShader = function (shader) {
    shader.uniforms.tLife = _proton.shader.uniforms.tLife;
    if (_velocity) shader.uniforms.tVelocity = { value: _velocity };
    if (_color)    shader.uniforms.tColor    = { value: _color };
  };

  this.ready = function () { return this.wait('canEmit'); };

  this.get('total', (_) => _total);
  this.get('index', (_) => _index);
  this.set('index', (i) => (_index = i));
});

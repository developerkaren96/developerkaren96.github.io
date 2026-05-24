/*
 * FXSceneCompositor — fullscreen-quad mesh that owns two shaders and
 * switches between them automatically to drive a texture-to-texture
 * cross-fade.
 *
 * Two shaders:
 *   - `_shader`      : the *transition* shader. Has uniforms `tFrom`,
 *                      `tTo`, `uTransition`. Active while a fade is in
 *                      flight.
 *   - `_basicShader` : the *steady-state* shader. Has uniform `tMap`.
 *                      Active when no transition is running.
 *
 * The compositor adds the transition uniforms to whatever shader is
 * supplied, builds a `Mesh(World.QUAD, …)`, and runs a per-frame `loop`
 * that:
 *   - picks the transition shader while `uTransition > 0`,
 *   - swaps back to the basic shader the moment `uTransition >= 1`,
 *     copying the new `tTo` into `tMap` so the steady-state shader
 *     displays the freshly faded-in texture, and resetting
 *     `uTransition` to 0 for the next call.
 *
 * `transition(texture, time, ease, delay)` is async: it tells the
 * parent scene to `lock()` (suspend whatever is feeding `tFrom`),
 * tweens `uTransition` from 0→1 (or jumps if there was no prior
 * `tFrom`), then promotes `tTo` to the new `tFrom`, and `unlock()`s.
 *
 * `manual` setter — opt-out of the auto driver so an outer system can
 * call `swap(showTransition)` and step `uTransition` itself.
 */
Class(function FXSceneCompositor(_shader, _options = {}) {
  Inherit(this, Object3D);
  const self = this;
  let _basicShader;

  function decorateShader(shader) {
    shader.addUniforms({
      tFrom: { value: null },
      tTo: { value: null },
      uTransition: { value: 0 },
    });
  }

  function loop() {
    self.mesh.shader = _shader.uniforms.uTransition.value > 0 ? _shader : _basicShader;
    if (_shader.uniforms.uTransition.value >= 1) {
      self.mesh.shader = _basicShader;
      _basicShader.set('tMap', _shader.get('tTo'));
      _shader.set('uTransition', 0);
    }
  }

  // Normalize the options bag: callers may pass a raw Texture, a wrapped
  // `{ texture }`, a `{ rt }` RT, or a null — all of which mean "use
  // this as the startTexture for the basic shader".
  (function initOptions() {
    if (
      _options === null ||
      _options instanceof Texture ||
      _options.texture ||
      (_options.rt && _options.rt.texture)
    ) {
      _options = { startTexture: _options };
    }
  })();

  decorateShader(_shader);

  (function initMesh() {
    const uniforms = { tMap: { value: _options.startTexture || null } };
    if (_options.basicShader) {
      _basicShader = _options.basicShader;
      _basicShader.addUniforms(uniforms);
    } else {
      _basicShader = self.initClass(Shader, 'ScreenQuad', uniforms);
    }
    self.mesh = new Mesh(World.QUAD, _basicShader);
    self.mesh.frustumCulled = false;
    self.add(self.mesh);
  })();

  self.startRender(loop);

  this.useShader = function (shader) {
    _shader = shader;
    decorateShader(shader);
  };

  this.useBasicShader = function (shader) {
    _basicShader.copyUniformsTo(shader, true);
    _basicShader = shader;
  };

  this.swap = function (showTransition) {
    if (showTransition) {
      self.mesh.shader = _shader;
    } else {
      _basicShader.set('tMap', _shader.get('tTo'));
      self.mesh.shader = _basicShader;
      _shader.set('tFrom', _basicShader.get('tMap'));
    }
  };

  this.set('manual', (v) => {
    if (v) self.stopRender(loop);
    else self.startRender(loop);
  });

  this.transition = async function (texture, time, ease, delay) {
    self.parent.lock && self.parent.lock();
    const from = _shader.get('tFrom');
    _shader.set('tTo', texture);
    texture.visible = true;
    if (from) {
      await _shader.tween('uTransition', 1, time, ease, delay).promise();
    } else {
      _shader.set('uTransition', 1);
    }
    if (from) from.visible = false;
    _shader.set('tFrom', texture);
    self.parent.unlock && self.parent.unlock();
  };
});

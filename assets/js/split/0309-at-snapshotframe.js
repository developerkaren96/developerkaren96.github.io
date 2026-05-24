/*
 * SnapshotFrame — captures a source texture into an FXScene RT
 * once per frame so downstream consumers can sample a stable
 * "previous frame" snapshot (e.g. for motion-trails, temporal
 * blending, ping-pong feedback effects).
 *
 * Constructor overloads:
 *   - `(texture, options)`  — direct form.
 *   - `({texture, ...rest})` — AppState-form: pulls `texture`,
 *     resolves it against the parent if it's a string path, and
 *     copies the rest as options.
 *
 * Nuke wiring:
 *   - `options.nuke` defaults to the texture's owning nuke, then
 *     the parent's, then `World.NUKE`. Ensures the snapshot is
 *     scheduled into the right postfx pipeline.
 *
 * Per-frame `loop`:
 *   - `World.RENDERER.renderSingle(_mesh, self.nuke.camera, self.rt)`
 *     blits the source into `self.rt` via a fullscreen-quad mesh.
 *     `preventRender = true` means the host pipeline doesn't draw
 *     this scene normally — the blit *is* the entire output, so
 *     `loop` produces the RT, and consumers sample `self.rt`.
 *
 * Shader: defaults to `'SnapshotFrame'`; consumers can override
 * via `options.shaderName` (e.g. a custom shader that does
 * temporal accumulation). `depthWrite = false` because the quad
 * is overlay-only.
 */
Class(function SnapshotFrame(_texture, _options = {}) {
  Inherit(this, FXScene);
  const self = this;
  var _mesh;
  if (_texture.isAppState) {
    let params = _texture;
    (_options = params).nuke = self.parent.nuke || params.nuke;
    ('string' == typeof (_texture = params.texture) || _texture instanceof String) &&
      (_texture = self.parent[_texture.trim().split('.').slice(-1)]);
  } else {
    _options.nuke ||
      !_texture.nuke ||
      _texture instanceof FXLayer ||
      (_options.nuke = _texture.nuke);
    _options.nuke || (_options.nuke = World.NUKE);
  }
  function loop() {
    World.RENDERER.renderSingle(_mesh, self.nuke.camera, self.rt);
  }
  !(function () {
    _options.uniforms || (_options.uniforms = {});
    self.create(_options.nuke, _options);
    self.preventRender = true;
    let shader = self.initClass(Shader, _options?.shaderName || 'SnapshotFrame', {
      tMap: {
        value: _texture,
      },
      ..._options.uniforms,
      depthWrite: false,
    });
    self.shader = shader;
    (_mesh = new Mesh(World.QUAD, shader)).frustumCulled = false;
    self.startRender(loop, _options.nuke);
  })();
});

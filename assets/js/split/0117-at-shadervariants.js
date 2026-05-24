/*
 * ShaderVariants — mixin component that gives its parent (a UIL-driven
 * shader user, typically a Material wrapper) three abilities:
 *
 *   1. `createShaderOverride(key, uniforms, active)` — install a one-shot
 *      UIL override that can hot-replace a subset of uniforms without
 *      defining a switchable variant. If `active` is true, the override
 *      is also continuously lerp-applied to the live uniforms so changes
 *      take effect immediately.
 *
 *   2. `createShaderVariant(key, shaderOrUniforms)` — define a named
 *      preset (a snapshot of uniform values exposed in the UIL). Multiple
 *      variants share a single "destination" UIL override that the loop
 *      eases toward the currently-selected variant via
 *      `ShaderUIL.lerpShader`, so switching variants produces a smooth
 *      crossfade rather than a snap.
 *
 *   3. `setShaderVariant(key)` — choose which previously-defined variant
 *      becomes the lerp target. Throws if the key wasn't registered.
 *
 * Internal model:
 *   - `_map[key]` → the UIL override shader for each variant.
 *   - `_target`   → which variant the lerp is heading toward.
 *   - `_destination` → the single live override that gets lerp'd into
 *     `_target` every frame. It's lazily created on first variant.
 *   - LERP — easing speed (default 0.07). Lower = slower crossfade.
 *
 * UIL plumbing:
 *   - `prefix` is derived from the shader's UILPrefix (if any), else
 *     from the parent component's uilInput.prefix, else from its class
 *     name. The literal `_shaderVariants_<key>` segment scopes the
 *     override path so multiple variants don't collide in the UIL tree.
 *   - Uniforms tagged `ignoreVariants` or `ignoreUIL` are filtered out of
 *     the override (e.g. textures that shouldn't be lerped between).
 *   - Numeric-string values are coerced to Number — UIL persistence can
 *     return numbers as strings on reload.
 *   - The override is added to either the shader's own UIL folder or, as
 *     a fallback, the mesh-level __uilGroup.
 */
Class(function ShaderVariants(_params = {}) {
  const self = this;
  const LERP = _params.lerp || 0.07;
  let _target;
  let _destination;
  const _map = {};

  /*
   * Build the (filtered uniforms, UIL prefix, UIL folder) triple used by
   * every variant/override call.
   */
  function generate(key, shaderOrUniforms) {
    let prefix =
      shaderOrUniforms.UILPrefix?.split('/')[0] ||
      self.parent.uilInput?.prefix ||
      Utils.getConstructorName(self.parent);
    prefix += '_shaderVariants_' + key;

    const uniforms =
      Array.isArray(shaderOrUniforms) || shaderOrUniforms.uniforms
        ? shaderOrUniforms.uniforms
        : shaderOrUniforms;

    // Filter out non-lerpable / hidden uniforms; coerce stringified
    // numbers (UIL JSON round-trip artifact).
    const newUniforms = {};
    for (const k in uniforms) {
      const uni = uniforms[k];
      if (typeof uni.value === 'string') uni.value = Number(uni.value);
      if (!uni.ignoreVariants && !uni.ignoreUIL) newUniforms[k] = uniforms[k];
    }

    // Prefer the shader's UIL folder; fall back to the mesh's group.
    let uilFolder = self.parent.uilFolder;
    if (!uilFolder) uilFolder = shaderOrUniforms.mesh?.__uilGroup;

    return [newUniforms, prefix, uilFolder];
  }

  // Per-frame: ease the live destination toward whichever variant is
  // currently selected. No-op until both _destination and _target exist.
  self.parent.startRender(function loop() {
    if (_destination) ShaderUIL.lerpShader(_destination, _target, LERP);
  });

  /*
   * One-shot override (not switchable). `active = true` makes it live —
   * a render loop continuously snaps the override into the live shader.
   */
  self.parent.createShaderOverride = function createShaderOverride(key, inUniforms, active) {
    if (inUniforms.uniforms) {
      throw 'Using an entire shader for createShaderOverride is not what you want. Just pass in the uniforms that are meant to be overriden.';
    }
    const [uniforms, prefix, uilFolder] = generate(key, inUniforms);
    const shader = ShaderUIL.createOverride(prefix, uniforms, null, null, !active);
    ShaderUIL.add(shader, uilFolder).setLabel(`Shader: ${key}`);
    if (active) {
      self.parent.startRender(() => {
        ShaderUIL.lerpShader(shader, uniforms, 1);
      });
    }
  };

  /*
   * Register a named variant. Variants share one _destination shader
   * that the loop crossfades between targets. _target defaults to the
   * first variant added so switching is always defined.
   */
  self.parent.createShaderVariant = function createShaderVariant(key, shaderOrUniforms) {
    const [uniforms, prefix, uilFolder] = generate(key, shaderOrUniforms);
    const shader = ShaderUIL.createOverride(prefix, uniforms, null, null, true);
    ShaderUIL.add(shader, uilFolder).setLabel(`Shader: ${key}`);
    _map[key] = shader;
    if (!_target) _target = shader;
    if (!_destination) {
      _destination = ShaderUIL.createOverride(
        'OverrideDestination' + Utils.uuid(),
        uniforms,
        null,
        null,
      );
    }
  };

  /*
   * Pick which registered variant becomes the lerp target. Throws on
   * unknown key — variant typos shouldn't silently no-op.
   */
  self.parent.setShaderVariant = function setShaderVariant(key) {
    _target = _map[key];
    if (!_target) throw `No Shader variant ${key}`;
  };
});

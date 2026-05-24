/*
 * AreaLightUtil — static helper that loads and binds the LTC
 * (Linearly Transformed Cosines) lookup textures used by physically-
 * based area-light shading. The LTC method needs two 64×64 RGBA
 * float tables (`LTC1`, `LTC2`) that encode the cosine-lobe transform
 * matrices and Fresnel/clamp terms — these are fetched once from
 * `assets/images/_lighting/arealights.json` and wrapped as
 * DataTextures.
 *
 * `append(shader)` is the public surface. For every shader that
 * needs area-light support, the helper:
 *   - Adds `tLTC1` / `tLTC2` uniforms (with `ignoreUIL: true` so the
 *     debug UI doesn't surface them).
 *   - Awaits the singleton `_loaded` promise (the JSON + texture
 *     build happens once, gated by `_init`).
 *   - Sets the textures on the shader.
 *
 * `Lighting.fallbackAreaToPoint` — global escape hatch. When true
 * (e.g. on low-end GPUs where the LTC lookup is too expensive), the
 * helper no-ops and the shader is expected to treat area lights as
 * point lights instead. This skips the fetch entirely.
 *
 * Declared `'static'` so the texture pair is shared across every
 * shader rather than re-allocated per material.
 */
Class(function AreaLightUtil() {
  Inherit(this, Component);
  var _init,
    _loaded = Promise.create(),
    _textures = [];
  this.append = async function (shader) {
    Lighting.fallbackAreaToPoint ||
      (_init ||
        (async function load() {
          _init = true;
          let data = await fetch(Assets.getPath('assets/images/_lighting/arealights.json')),
            json = await data.json();
          _textures[0] = new DataTexture(
            new Float32Array(json.LTC1),
            64,
            64,
            Texture.RGBAFormat,
            Texture.FLOAT,
          );
          _textures[1] = new DataTexture(
            new Float32Array(json.LTC2),
            64,
            64,
            Texture.RGBAFormat,
            Texture.FLOAT,
          );
          _loaded.resolve();
        })(),
      (shader.uniforms.tLTC1 = {
        type: 't',
        value: null,
        ignoreUIL: true,
      }),
      (shader.uniforms.tLTC2 = {
        type: 't',
        value: null,
        ignoreUIL: true,
      }),
      await _loaded,
      shader.set('tLTC1', _textures[0]),
      shader.set('tLTC2', _textures[1]));
  };
}, 'static');

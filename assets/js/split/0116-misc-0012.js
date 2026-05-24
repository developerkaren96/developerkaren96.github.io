/*
 * Shader.createUniforms — factory that installs a Proxy-wrapped uniforms
 * object on a Shader instance.
 *
 * Why a Proxy? GL uniform uploads need a stable, ordered list (parallel
 * key[] / value[] arrays) so the renderer can iterate without
 * `Object.keys` allocs each frame. Every time a uniform is added or
 * replaced (`shader.uniforms.foo = {...}`), the Proxy's `set` trap
 * rebuilds those two arrays from the current uniform map. This keeps the
 * authoring ergonomics ("just assign to .uniforms.foo") while letting
 * the hot path read flat arrays.
 *
 * Returned value is the proxied uniforms map. `_uniformKeys` /
 * `_uniformValues` live on the shader and are what the renderer
 * actually iterates.
 */
Shader.createUniforms = function (shader) {
  const uniforms = {};
  const handler = {
    set(target, property, value) {
      target[property] = value;
      // Rebuild the parallel arrays. `length = 0` reuses the existing
      // arrays so the renderer's references stay valid.
      shader._uniformKeys.length = 0;
      shader._uniformValues.length = 0;
      for (const key in uniforms) {
        shader._uniformKeys.push(key);
        shader._uniformValues.push(uniforms[key]);
      }
      return true;
    },
  };
  shader._uniformValues = [];
  shader._uniformKeys = [];
  return new Proxy(uniforms, handler);
};

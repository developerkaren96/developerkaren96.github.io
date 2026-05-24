/*
 * ShaderUIL — static facade for `ShaderUILConfig` (0330), with
 * extra factory helpers for shader-uniform aggregation and
 * cross-shader uniform animation.
 *
 * Event channels:
 *   - `UPDATE`         — scalar/vector uniform change.
 *   - `TEXTURE_UPDATE` — texture-typed uniform swap.
 *   - `SHADER_UPDATE`  — full shader-source / source-key change.
 *   - `exists` — per-prefix dedup map (populated by config to
 *     prevent duplicate panels for the same shader prefix).
 *
 * `add(shader, group)`:
 *   - Accepts either a Shader or any wrapper with a `.shader`
 *     field. `group === null` keeps the panel detached; otherwise
 *     attaches under the supplied group or `UIL.global`.
 *
 * `createOverride(prefix, obj, group, shaderOnly, newClone)`:
 *   - Aggregates uniforms from one or many shaders (array →
 *     merge each `.uniforms`) into a single proxy shader (test
 *     shader with empty vert/frag). Uniforms flagged `ignoreUIL`
 *     are dropped. With `newClone`, each value is `.clone()`-d so
 *     the proxy can be edited without mutating the live shaders.
 *     Returns either the bare shader (`shaderOnly === null`) or
 *     a fully wired ShaderUILConfig.
 *
 * `createDecorator(shader, prefix, obj, group)`:
 *   - Builds a proxy that exposes ONLY the uniforms named in
 *     `obj`, sharing live references with the source shader.
 *     Useful for splitting a giant shader's editor into smaller
 *     thematic panels.
 *
 * `createClone(prefix, obj)`:
 *   - Returns a standalone proxy shader with cloned uniform
 *     values. No panel — caller handles wiring. `ignoreUIL` is
 *     preserved (with `null === value` also treated as ignored).
 *
 * `lerpShader(from, to, alpha, hz, uniformsFilter)`:
 *   - Frame-rate-corrected interpolation of every matching
 *     uniform from `to` toward `from`'s current value. Handles
 *     number, Color (`type === 'c'`), Vector3 (`'v3'`), Vector2
 *     (`'v2'`), and any value that exposes a `.lerp()` method
 *     (Quaternion, Matrix). `uniformsFilter` (allowlist) gates
 *     which keys are touched.
 */
Class(function ShaderUIL() {
  this.exists = {};
  this.UPDATE = 'shader_update';
  this.TEXTURE_UPDATE = 'shader_texture_update';
  this.SHADER_UPDATE = 'shader_shader_update';
  this.add = function (shader, group) {
    return new ShaderUILConfig(
      shader.shader || shader,
      null === group ? null : group || UIL.global,
    );
  };
  this.createOverride = function (prefix, obj, group, shaderOnly, newClone) {
    let uniforms = {};
    Array.isArray(obj)
      ? obj.forEach((o) => {
          o = o.uniforms || o;
          for (let key in o) o[key].ignoreUIL || (uniforms[key] = o[key]);
        })
      : (uniforms = obj.uniforms || obj);
    let shader = Utils3D.getTestShader();
    if (((shader.vertexShader = shader.fragmentShader = ''), newClone))
      for (let key in uniforms) {
        let value = uniforms[key].value;
        value?.clone && (value = value.clone());
        shader.uniforms[key] = {
          value: value,
          type: uniforms[key].type,
        };
      }
    else for (let key in uniforms) shader.uniforms[key] = uniforms[key];
    return ((shader.UILPrefix = prefix), null === shaderOnly ? shader : this.add(shader, group));
  };
  this.createDecorator = function (shader, prefix, obj, group) {
    let uniforms = {};
    for (let key in obj) uniforms[key] = shader.uniforms[key];
    let nShader = Utils3D.getTestShader();
    return (
      (nShader.vertexShader = shader.fragmentShader = ''),
      (nShader.uniforms = uniforms),
      (nShader.UILPrefix = prefix),
      this.add(nShader, group)
    );
  };
  this.createClone = function (prefix, obj) {
    let uniforms = obj.uniforms || obj,
      shader = Utils3D.getTestShader();
    for (let key in uniforms) {
      let value = uniforms[key].value,
        ignoreUIL = uniforms[key].ignoreUIL || null === value;
      !ignoreUIL && value.clone && (value = value.clone());
      shader.uniforms[key] = {
        value: value,
        ignoreUIL: ignoreUIL,
      };
    }
    return ((shader.UILPrefix = prefix), shader);
  };
  this.lerpShader = function (from, to, alpha, hz, uniformsFilter) {
    from = from.uniforms || from;
    to = to.uniforms || to;
    for (let key in from) {
      let f = from[key],
        t = to[key];
      f &&
        t &&
        ((uniformsFilter && -1 === uniformsFilter.indexOf(key)) ||
          ('number' == typeof t.value
            ? (f.value = Math.lerp(t.value, f.value, alpha, hz))
            : 'c' === f.type
              ? ((f.value.r = Math.lerp(t.value.r, f.value.r, alpha, hz)),
                (f.value.g = Math.lerp(t.value.g, f.value.g, alpha, hz)),
                (f.value.b = Math.lerp(t.value.b, f.value.b, alpha, hz)))
              : 'v3' === f.type
                ? ((f.value.x = Math.lerp(t.value.x, f.value.x, alpha, hz)),
                  (f.value.y = Math.lerp(t.value.y, f.value.y, alpha, hz)),
                  (f.value.z = Math.lerp(t.value.z, f.value.z, alpha, hz)))
                : 'v2' === f.type
                  ? ((f.value.x = Math.lerp(t.value.x, f.value.x, alpha, hz)),
                    (f.value.y = Math.lerp(t.value.y, f.value.y, alpha, hz)))
                  : f.value && f.value.lerp && f.value.lerp(t.value, alpha, hz)));
    }
  };
}, 'static');

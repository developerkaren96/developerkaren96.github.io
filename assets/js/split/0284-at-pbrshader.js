/*
 * PBRShader — convenience constructor that builds a fully-configured
 * Shader instance for physically-based rendering. Sets up the
 * standard PBR texture set + IBL maps + LUT so consumers can just
 * assign maps and go.
 *
 * Constructor overloads:
 *   - `(vertexShader, fragmentShader, params)` — full form.
 *   - `(shaderName, params)`                   — same shader for
 *     vertex and fragment.
 *   - `(params)`                               — both shaders
 *     default to `'PBR'`.
 *
 * Texture slots (all initialised via `Utils3D.getRepeatTexture` so
 * tiled mat maps work without a manual wrap call):
 *   - `tBaseColor`   — albedo (sRGB).
 *   - `tMRO`         — packed Metalness / Roughness / Occlusion
 *     into a single texture's RGB channels.
 *   - `tNormal`      — tangent-space normal map.
 *   - `tEnvDiffuse`  — irradiance / diffuse env map for IBL (no
 *     premultiplied alpha to preserve HDR ranges).
 *   - (continues with tEnvSpecular, tLUT, … below this header).
 *
 * `tLUT`:
 *   - Sourced from `~assets/images/pbr/lut.png` via the lookup
 *     texture helper (LINEAR filter, no mips, clamp).
 *   - `forcePersist = true` so it survives texture-cache eviction —
 *     it's referenced by every PBRShader instance, so eviction
 *     would just thrash.
 *
 * `defineSetter(prop)` wires getters/setters from the wrapper down
 * to the underlying Shader so consumers can do
 * `pbr.transparent = true` without poking `pbr.shader.transparent`.
 *
 * `_params` is merged on top of the default uniform table so
 * callers can override or add their own uniforms in one call.
 */
Class(
  function PBRShader(_vertexShader, _fragmentShader, _params) {
    const self = this;
    function defineSetter(prop) {
      Object.defineProperty(self, prop, {
        set: function (v) {
          self.shader[prop] = v;
        },
        get: function () {
          return self.shader[prop];
        },
      });
    }
    'object' == typeof _vertexShader &&
      ((_params = _vertexShader), (_vertexShader = _fragmentShader = 'PBR'));
    'string' != typeof _fragmentShader &&
      ((_params = _fragmentShader), (_fragmentShader = _vertexShader));
    _vertexShader || (_vertexShader = _fragmentShader = 'PBR');
    (function initShader() {
      let lookup = Utils3D.getLookupTexture('~assets/images/pbr/lut.png');
      lookup.forcePersist = true;
      self.shader = new Shader(
        _vertexShader,
        _fragmentShader,
        Utils.mergeObject(_params || {}, {
          tBaseColor: {
            value: null,
            getTexture: Utils3D.getRepeatTexture,
          },
          tMRO: {
            value: null,
            getTexture: Utils3D.getRepeatTexture,
          },
          tNormal: {
            value: null,
            getTexture: Utils3D.getRepeatTexture,
          },
          tEnvDiffuse: {
            value: null,
            premultiplyAlpha: false,
          },
          tEnvSpecular: {
            value: null,
            premultiplyAlpha: false,
          },
          uEnvOffset: {
            value: new Vector2(0, 0),
          },
          tLightmap: {
            value: null,
            premultiplyAlpha: false,
          },
          tLUT: {
            value: lookup,
            ignoreUIL: true,
          },
          uTint: {
            value: new Color('#FFFFFF'),
          },
          uTiling: {
            value: new Vector2(1, 1),
          },
          uOffset: {
            value: new Vector2(0, 0),
          },
          uMRON: {
            value: new Vector4(1, 1, 1, 1),
          },
          uEnv: {
            value: new Vector3(1, 1, 0),
          },
          uUseLightmap: {
            value: 0,
          },
          uHDR: {
            value: 0,
            ignoreUIL: true,
          },
          uUseTonemapping: {
            value: 1,
            ignoreUIL: true,
          },
          uUseLinearOutput: {
            value: 0,
          },
          uLightmapIntensity: {
            value: 1,
          },
          receiveLight: true,
        }),
      );
      self.shader.parent = self;
      self.lights = self.shader.lights;
      self.uniforms = self.shader.uniforms;
      [
        'side',
        'blending',
        'polygonOffset',
        'polygonOffsetFactor',
        'polygonOffsetUnits',
        'receiveShadow',
        'vertexShader',
        'fragmentShader',
        'depthTest',
        'depthWrite',
        'wireframe',
        'transparent',
        'visible',
        'persists',
        'material',
        'customShadowShader',
      ].forEach(defineSetter);
    })();
  },
  (_) => {
    const prototype = PBRShader.prototype;
    PBRShader.webgl1 = function () {
      return World.RENDERER.type == Renderer.WEBGL1;
    };
    prototype.set = function (key, value) {
      return (
        undefined !== value && (this.shader.uniforms[key].value = value),
        this.shader.uniforms[key].value
      );
    };
    prototype.get = function (key) {
      return this.shader.uniforms[key].value;
    };
    prototype.tween = function (key, value, time, ease, delay, callback, update) {
      return tween(
        this.shader.uniforms[key],
        {
          value: value,
        },
        time,
        ease,
        delay,
        callback,
        update,
      );
    };
    prototype.setPBR = prototype.setOverride = function (key, value, ref = this) {
      switch ((ref.parent instanceof PBRShader && (ref = ref.parent), ref.set(key, value), key)) {
        case 'tEnvDiffuse':
        case 'tEnvSpecular':
        case 'tLUT':
          value.generateMipmaps = false;
          value.minFilter = Texture.LINEAR;
      }
      let src = value.src;
      src &&
        src.toLowerCase().includes('rgbm') &&
        (ref.shader.set('uHDR', 1), ref.shader.set('uEnv', new Vector3(1, 1, 0)));
    };
    prototype.destroy = function () {
      this.shader.destroy();
    };
    prototype.copyUniformsTo = function (shader, linked, ignore) {
      for (let key in this.uniforms)
        undefined !== this.uniforms[key] &&
          ((ignore && ignore.includes?.(key)) ||
            (shader.uniforms[key] = linked
              ? this.uniforms[key]
              : {
                  type: this.uniforms[key].type,
                  value: this.uniforms[key].value,
                }));
    };
    prototype.replicateUniformsTo = function (shader) {
      shader.uniforms = this.uniforms;
      shader._uniformKeys = this._uniformKeys;
      shader._uniformValues = this._uniformValues;
    };
    prototype.addUniforms = function (uniforms) {
      uniforms.UILPrefix && ((this.UILPrefix = uniforms.UILPrefix), delete uniforms.UILPrefix);
      for (let key in uniforms)
        (this.hotReloading && this.uniforms[key]) || (this.uniforms[key] = uniforms[key]);
    };
  },
);

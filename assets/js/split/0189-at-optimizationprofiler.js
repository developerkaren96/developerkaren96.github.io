/*
 * OptimizationProfiler — a build-time / runtime diagnostic that helps
 * authors spot inefficient texture density and excessive vertex
 * counts in the scene.
 *
 * Activation:
 *   - Add `?optimizationProfiler` or `#optimizationProfiler` to the
 *     URL to switch it on. Optionally append `=N` (e.g.
 *     `?optimizationProfiler=200`) to set `texelsPerMeter` — the
 *     target texel density used by the override shader.
 *
 * Two modes:
 *
 *   1. Texture density visualiser (`override(shader, vs, fs)`):
 *      Rewrites the supplied vertex+fragment shader to compute, per
 *      pixel, the ratio of *texture-space* derivatives to
 *      *world-space* derivatives — i.e., texels per square metre of
 *      geometry — and outputs a colour-coded heatmap:
 *        - blue/cyan : under-sampled (low density, texture too coarse)
 *        - white→green : on target (~1× texelsPerMeter)
 *        - yellow/red : over-sampled (texture too dense, wasted memory)
 *      The injection requires a `vUv` varying and skips screen-quads
 *      and meshes without a UV.
 *
 *   2. Texture / vertex enumeration (`logTextures`, `logVertices`):
 *      Walks every registered shader, groups textures by their
 *      max-dimension, and renders a grouped console log per
 *      texture / SceneLayout / shader with a coloured size badge
 *      (green→yellow→red gradient from 512→1024+) and a compression
 *      indicator (✅ ktx2, ⚠️ ktx1, ❌ uncompressed). For vertices,
 *      logs the per-shader vertex count (multiplied by
 *      `maxInstancedCount` for instanced geometries) with a similar
 *      gradient.
 *
 * `setupShader(shader)`:
 *   Registers a shader with the profiler and adds the
 *   `texDimensions` + `texelsPerMeter` uniforms that the override
 *   path samples.
 *
 * `getGradientColor(alpha, ease)`:
 *   Three-stop colour ramp (green #28c913 → yellow #ffde0a → red
 *   #ff0000), interpolated through the supplied TweenManager ease.
 *
 * Marked `static` so a single instance services every shader on the
 * page.
 */
Class(function OptimizationProfiler() {
  Inherit(this, Component);
  const self = this;
  var _shaders, _count, _gradientStops, _color;
  function getGradientColor(alpha, ease = 'Sine') {
    !(function initGradientColors() {
      _gradientStops ||
        (_gradientStops = [new Color('#28c913'), new Color('#ffde0a'), new Color('#ff0000')]);
      _color || (_color = new Color());
    })();
    let lastIndex = _gradientStops.length - 1,
      index = Math.clamp(alpha) * lastIndex;
    if (index >= lastIndex) return _color.copy(_gradientStops[lastIndex]);
    let stop0 = Math.floor(index);
    return (
      (alpha = TweenManager.Interpolation[ease].InOut(Math.fract(index))),
      _color.copy(_gradientStops[stop0]).lerp(_gradientStops[stop0 + 1], alpha, false)
    );
  }
  function getGradientHexString(alpha, ease) {
    return getGradientColor(alpha, ease).getHexString();
  }
  this.active =
    Utils.query('optimizationProfiler') || location.hash?.includes('optimizationProfiler');
  self.active &&
    ((_shaders = []),
    (_count = Number(
      String(Utils.query('optimizationProfiler')) ||
        location.hash.split('optimizationProfiler=')[1]?.split('&')[0],
    )),
    isNaN(_count) && (_count = null));
  this.setupShader = function (shader) {
    shader.addUniforms({
      texDimensions: {
        value: 0,
      },
      texelsPerMeter: {
        value: _count,
      },
    });
    const parse = (_) => {
      for (let key in shader.uniforms) {
        let value = shader.uniforms?.[key]?.value;
        value instanceof Texture &&
          (value.data ||
            (value.dimensions
              ? (shader.uniforms.texDimensions.value = Math.max(
                  shader.uniforms.texDimensions.value,
                  Math.max(value.dimensions.width, value.dimensions.height),
                ))
              : value.promise?.then(parse)));
      }
    };
    _shaders.push(shader);
    parse();
  };
  this.override = function (shader, vsCode, fsCode) {
    let vs = vsCode,
      fs = fsCode,
      enabled = !!_count,
      mesh = shader?.mesh;
    if (
      ((enabled = enabled && mesh instanceof Mesh),
      (enabled = enabled && mesh.geometry !== World.QUAD),
      (enabled = enabled && fsCode.includes('vUv')),
      enabled)
    )
      try {
        !(function () {
          vs = vs.slice(0, -(vs.length - vs.lastIndexOf('}')));
          vs += `vDensityPos = ${vs.includes('vec3 pos ') ? 'pos' : 'position'};\n`;
          vs += '}';
          let split = vs.split('void main');
          split[0] += '\n        out vec3 vDensityPos;\n        ';
          vs = split.join('void main');
        })();
        (function () {
          fs = fs.slice(0, -(fs.length - fs.lastIndexOf('}')));
          fs += 'FragColor = vec4(getDensityColor(), 1.0);\n';
          fs += '}';
          let split = fs.split('void main');
          split[0] +=
            '\n        #define TEXEL_DENSITY_EPSILON 10e-10\n        uniform float texDimensions;\n        uniform float texelsPerMeter;\n        in vec3 vDensityPos;\n \nfloat MipLevel(vec2 uv)\n{\n  vec2 dx = dFdx(uv);\n  vec2 dy = dFdy(uv);\n  float d = max( dot(dx, dx), dot(dy, dy) );\n \n  float maxRange = pow(2., (10.0 - 1.) * 2.);\n  d = clamp(d, 1., maxRange);\n \n  float mipLevel = 0.5 * log2(d);\n  return floor(mipLevel);\n}\n\nvec3 getDensityColor() {\n    vec2 uv = vUv.xy;\n    \n    float texWidth = texDimensions;\n    float texHeight = texDimensions;\n\n    vec2 ddxUV  = dFdx(uv * texWidth  / texelsPerMeter);\n    vec2 ddyUV  = dFdy(uv * texHeight / texelsPerMeter);\n    vec3 ddxPos = dFdx(vDensityPos);\n    vec3 ddyPos = dFdy(vDensityPos);\n\t\n\t// NOTE(jserrano): check LOD ?\n\t//float mipLevel = MipLevel(uv * texDimensions);\n    //float mipSize  = pow(2., mipLevel);\n    \n    //ddxUV /= mipSize;\n    //ddyUV /= mipSize;\n\n    float uvArea   = length( cross(vec3(ddxUV,0), vec3(ddyUV,0)) );\n    float faceArea = length( cross(ddxPos, ddyPos) );\n\tfloat density  = uvArea / max(10e-10, faceArea);\n    \n    const float lowRatioLimit  = 0.8;\n    const float midRatio       = 1.0;\n    const float highRatioLimit = 1.2;\n    \n    vec3 finalColor = vec3(0);\n    \n\tif (density > lowRatioLimit && density < highRatioLimit)\n\t{\n        vec3 lowDensityColor  = vec3( 1., 1., 1. );\n        vec3 midDensityColor  = vec3( 0., 1., 0. );\n        vec3 highDensityColor = vec3( 0., 0., 0. );\n        \n        vec3 lowColorStep = mix( lowDensityColor, midDensityColor, smoothstep(lowRatioLimit, midRatio, density) );\n        finalColor = mix( lowColorStep, highDensityColor, smoothstep(midRatio, highRatioLimit, density) );\n\t}\n    else if (density > highRatioLimit)\n    {\n        vec3 lowDensityColor  = vec3( 1., 1., 0. );\n        vec3 highDensityColor = vec3( 1., 0., 0. );\n        \n        float ratio = smoothstep(highRatioLimit, 2., density);\n        finalColor = mix( lowDensityColor, highDensityColor, ratio );\n    }\n    else\n    {\n        vec3 lowDensityColor  = vec3( 0., 0., 1. );\n        vec3 highDensityColor = vec3( 0., 1., 1. );\n        \n        float ratio = smoothstep(0., lowRatioLimit, density);\n        finalColor = mix( lowDensityColor, highDensityColor, ratio );\n    }\n\n    return finalColor;\n}\n        ';
          fs = split.join('void main');
        })();
      } catch (e) {
        vs = vsCode;
        fs = fsCode;
      }
    return [vs, fs];
  };
  this.logTextures = function () {
    if (!this.active) return void console.log('Add optimizationProfiler in the URL!');
    let map = new Map();
    _shaders?.forEach((shader) => {
      if (!shader._gl) return;
      let sceneLayout,
        uilName = shader.mesh?.uilName;
      if (uilName) {
        let parent = shader.mesh._parent;
        for (; parent; ) {
          if (parent.classRef?.name) {
            sceneLayout = parent.classRef;
            break;
          }
          parent = parent._parent;
        }
      }
      for (let key in shader.uniforms) {
        let value = shader.uniforms?.[key]?.value;
        if (value instanceof Texture && !value.data && value.dimensions) {
          if (!map.has(value)) {
            let size = Math.max(value.dimensions.width, value.dimensions.height);
            map.set(value, {
              sceneLayouts: {},
              shaders: {},
              size: size,
            });
          }
          let info = map.get(value);
          sceneLayout &&
            (info.sceneLayouts[sceneLayout.name] || (info.sceneLayouts[sceneLayout.name] = {}),
            (info.sceneLayouts[sceneLayout.name][uilName] = true));
          info.shaders[shader.fsName] || (info.shaders[shader.fsName] = {});
          info.shaders[shader.fsName][key] = true;
        }
      }
    });
    let textures = Array.from(map.keys());
    textures.sort((a, b) => map.get(b).size - map.get(a).size);
    textures.forEach((texture) => {
      let info = map.get(texture),
        sceneLayouts = Object.keys(info.sceneLayouts),
        shaders = Object.keys(info.shaders),
        name = texture.src;
      if (
        (!name &&
          sceneLayouts.length &&
          (name = Object.keys(info.sceneLayouts[sceneLayouts[0]])[0]),
        !name)
      ) {
        let uniforms = Object.keys(info.shaders[shaders[0]]);
        name = `${shaders[0]}/${uniforms[0]}`;
      }
      console.group(name);
      let compressed,
        bgColor = getGradientHexString(Math.range(info.size, 512, 1024, 0, 0.5), 'Cubic');
      compressed =
        'ktx2' === texture.compressed ? '✅ (ktx2)' : texture.compressed ? '⚠️ (ktx1)' : '❌';
      console.log(
        `%c ${info.size}`,
        `background-color: ${bgColor}; color: #000000;`,
        `Compressed: ${compressed}`,
      );
      for (let sceneLayout in info.sceneLayouts)
        console.log(`${sceneLayout}: ${Object.keys(info.sceneLayouts[sceneLayout]).join(', ')}`);
      for (let shader in info.shaders)
        console.log(`${shader}: ${Object.keys(info.shaders[shader]).join(', ')}`);
      console.groupEnd(name);
    });
  };
  this.logVertices = function (sort = false) {
    if (!_shaders || !_shaders.length) return;
    let total = 0,
      shaders = _shaders
        .filter(
          (shader) =>
            shader._gl && Boolean(shader?.mesh?.geometry) && !(shader?.mesh instanceof Points),
        )
        .map((shader) => ({
          shader: shader,
          count: shader.mesh.geometry.isInstanced
            ? shader.mesh.geometry.attributes.position.count *
              shader.mesh.geometry.maxInstancedCount
            : shader.mesh.geometry.attributes.position.count,
        }));
    sort && (shaders = shaders.sort((a, b) => b.count - a.count));
    shaders.forEach(({ shader: shader, count: count }) => {
      total += count;
      console.group(shader.mesh.uilName || shader.fsName);
      shader.mesh.uilName || console.log(shader.mesh);
      console.log(
        `%c ${shader.mesh.geometry.isInstanced ? 'Instanced' : ''} Vertices ${count}`,
        `background-color: ${(function bgColor(count) {
          return getGradientHexString(Math.range(count, 15e3, 3e4, 0, 0.5));
        })(count)}; color: #000000;`,
      );
      console.groupEnd();
    });
    console.log('%c TOTAL VERTICES ' + total, 'background-color: #ff00ff; color: #000000;');
  };
}, 'static');

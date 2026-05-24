/*
 * ProtonTubes — render mode for Proton (0290) that draws each
 * particle's recent trail as a tube (instanced segments). Each
 * particle owns `segments` history slots and the tube is built
 * by extruding a regular `sides`-gon along the consecutive
 * sampled positions.
 *
 * UIL "Tubes" config:
 *   - `segments`   — history length per particle (more = longer
 *     trails, more memory).
 *   - `sides`      — radial subdivisions per tube cross-section.
 *   - `lerp`       — smoothing factor passed to the behaviour
 *     update shader uniform `uLerp` (how aggressively the new
 *     position blends with the previous).
 *   - `resetDelta` — if the per-frame position delta exceeds this
 *     threshold, the trail "resets" (a particle that teleports
 *     doesn't drag a long ugly line through space).
 *
 * `padding = 1e3` (then `2 * _segments` after init) — bounding box
 * padding used by the Proton culling/sizing pass to account for
 * tube history extending beyond the live particle position.
 *
 * `initBuffers()`:
 *   - Reads `segments` from `parent.parent.data.tubeSegments` if
 *     present (per-scene override), else from the UIL.
 *   - Builds an instance index buffer where each slot's RGBA
 *     encodes:
 *       R: segment index (0..segments-1)  — position along the tube.
 *       G: particle id    (i / segments)  — which particle this
 *         vertex belongs to.
 *       B: head flag      (1 at segment 0, 0 otherwise) — vertex
 *         shader uses it to read the current particle position
 *         rather than the history.
 *       A: (set below)                    — typically the radial
 *         sub-index for the tube cross-section vertex.
 *   - The buffer feeds an instanced draw that pulls per-vertex
 *     particle history out of the position-history RT.
 */
Class(function ProtonTubes(_proton) {
  Inherit(this, Object3D);
  const self = this;
  var _config, _segments, _textureSize, _count, _shader, _geom;
  this.padding = 1e3;
  (async function () {
    !(function initConfig() {
      (_config = InputUIL.create('tubes_' + _proton.prefix, _proton.uilGroup)).setLabel('Tubes');
      _config.add('segments', 5);
      _config.add('sides', 4);
      _config.add('lerp', 0.2);
      _config.add('resetDelta', 10);
      _config.onUpdate = (key) => {
        'lerp' == key && _proton.behavior.setUniform('uLerp', _config.getNumber('lerp'));
        'resetDelta' == key &&
          _proton.behavior.setUniform('uResetDelta', _config.getNumber('resetDelta'));
      };
    })();
    await (async function initBuffers() {
      let segments =
        self.parent.parent.data && self.parent.parent.data.tubeSegments
          ? self.parent.parent.data.tubeSegments
          : _config.getNumber('segments');
      self.padding = 2 * _segments;
      let indexBuffer = await _proton.antimatter.createFloatArrayAsync(4, true),
        count = indexBuffer.length / 4;
      for (let i = 0; i < count; i++) {
        indexBuffer[4 * i + 0] = i % segments;
        indexBuffer[4 * i + 1] = Math.floor(i / segments);
        indexBuffer[4 * i + 2] = i % segments == 0 ? 1 : 0;
        indexBuffer[4 * i + 3] = 1;
      }
      _textureSize = _proton.antimatter.textureSize;
      _segments = segments;
      _count = count / segments;
      let indices = self.initClass(AntimatterAttribute, indexBuffer, 4);
      _proton.behavior.addInput('tIndices', indices);
      _proton.behavior.addUniforms({
        uLerp: {
          value: _config.getNumber('lerp'),
          ignoreUIL: true,
        },
        uResetDelta: {
          value: _config.getNumber('resetDelta'),
          ignoreUIL: true,
        },
        textureSize: {
          value: _textureSize,
          ignoreUIL: true,
        },
        lineSegments: {
          value: segments,
          ignoreUIL: true,
        },
      });
    })();
    await self.wait(_proton.spawn, 'lifeOutput');
    (function initGeometry() {
      let shape = require('GenerateTube')(_config.getNumber('sides'), _segments - 1, false),
        geom = new Geometry();
      geom.addAttribute('cNumber', new GeometryAttribute(new Float32Array(_count), 1, 1));
      for (let key in shape.attributes) geom.addAttribute(key, shape.attributes[key]);
      for (let i = 0; i < _count; i++) geom.attributes.cNumber.array[i] = i;
      _geom = geom;
    })();
    (function initShader() {
      let shaderName = _proton.uilConfig.get('shader') || '',
        modifyShader = true;
      const attr = {
        noAttributes: true,
        unique: shaderName,
        thickness: {
          type: 'f',
          value: 1,
        },
        textureSize: {
          type: 'f',
          value: _textureSize,
          ignoreUIL: true,
        },
        lineSegments: {
          type: 'f',
          value: _segments,
          ignoreUIL: true,
        },
        radialSegments: {
          type: 'f',
          value: _config.getNumber('sides'),
          ignoreUIL: true,
        },
        taper: {
          type: 'f',
          value: 0,
        },
        tLife: {
          type: 't',
          value: _proton.spawn.lifeOutput,
          ignoreUIL: true,
        },
        tRandom: {
          type: 't',
          value: _proton.antimatter.random,
          ignoreUIL: true,
        },
      };
      shaderName.includes('ProtonCustom')
        ? ((_shader = self.initClass(Shader, shaderName, attr)), (modifyShader = false))
        : (_shader = self.initClass(
            shaderName && shaderName.includes('PBR') ? PBRShader : Shader,
            'ProtonTube',
            shaderName || 'ProtonTube',
            attr,
          ));
      if (
        (self.wait(_proton.shader.uniforms, 'tLifeData').then((_) => {
          _shader.addUniforms({
            tLifeData: _proton.shader.uniforms.tLifeData,
            tRandom: _proton.shader.uniforms.tRandom,
          });
        }),
        _shader.addUniforms(_proton.parseUniforms(_proton.uilConfig.get('uniforms'))),
        shaderName && modifyShader)
      ) {
        let vs = Shaders.getShader(shaderName + '.vs');
        if (vs && _shader.vertexShader) {
          if (((vs = vs.split('void main() {')), vs[0].includes('extrudeTube'))) {
            let extrude = vs[0].split('void extrudeTube() {')[1].split('}')[0];
            vs[0] = vs[0].replace('void extrudeTube() {' + extrude + '}', '');
            _shader.vertexShader = _shader.vertexShader.replace('//neutrinovs', extrude);
          }
          let params = vs[0].split('\n'),
            main = vs[1].slice(0, vs[1].lastIndexOf('}')),
            paramOutput = [];
          for (let line of params)
            (_shader.vertexShader.includes(line) && '}' != line.trim()) || paramOutput.push(line);
          _shader.vertexShader = _shader.vertexShader.replace(
            '//neutrinoparams',
            paramOutput.join('\n'),
          );
          _shader.vertexShader = _shader.vertexShader.replace('//neutrinovspost', main);
        }
        window[shaderName] && self.initClass(window[shaderName], _shader, _shader);
      }
      ShaderUIL.add(_shader, _proton.uilGroup).setLabel('Tube Shader');
      _proton.applyToShader(_shader);
      self.shader = _shader;
      (function completeShader(shader) {
        let transparent = _proton.uilInput.get('transparent'),
          depthWrite = _proton.uilInput.get('depthWrite'),
          depthTest = _proton.uilInput.get('depthTest'),
          blending = _proton.uilInput.get('blending'),
          castShadow = _proton.uilInput.get('castShadow'),
          receiveShadow = _proton.uilInput.get('receiveShadow');
        'boolean' == typeof depthWrite && (shader.depthWrite = depthWrite);
        'boolean' == typeof depthTest && (shader.depthTest = depthTest);
        'boolean' == typeof transparent && (shader.transparent = transparent);
        'boolean' == typeof castShadow && defer((_) => (self.mesh.castShadow = castShadow));
        'boolean' == typeof receiveShadow && (shader.receiveShadow = receiveShadow);
        blending && (shader.blending = blending);
      })(_shader);
    })();
    (function initMesh() {
      let mesh = new Mesh(_geom, _shader);
      mesh.frustumCulled = false;
      self.add(mesh);
      self.mesh = mesh;
      mesh.visible = false;
    })();
    self.canEmit = true;
  })();
  this.overrideShader = function (code) {
    let uniforms = Shaders.getShader('ProtonTubesUniforms.fs'),
      main = Shaders.getShader('ProtonTubesMain.fs'),
      movement = (code = code.replace('//uniforms', uniforms))
        .split('//abovespawn')[1]
        .split('//code')[0];
    return (
      (main = main.replace('//main', movement)),
      (main = main.split('main() {')[1].slice(0, -1)),
      (code = code.replace(movement, main))
    );
  };
  this.release = function (pos, count = 1, radius = 0, velocity, color) {
    if (!self.canEmit) return;
    let positions = [],
      velocities = velocity ? [] : null,
      colors = color ? [] : null;
    _proton.spawn.index > _proton.spawn.total - self.padding && (_proton.spawn.index = -1);
    for (let i = 0; i < count; i++) {
      let x = pos.x + Math.random(-1, 1, 4) * radius,
        y = pos.y + Math.random(-1, 1, 4) * radius,
        z = pos.z + Math.random(-1, 1, 4) * radius;
      for (let j = 0; j < _segments; j++) {
        positions.push(x, y, z);
        velocities && velocities.push(velocity.x, velocity.y, velocity.z);
        colors && colors.push(color.r, color.g, color.b);
      }
    }
    _proton.spawn.emit(positions, velocities, colors);
  };
  this.useColor = async function () {
    await this.ready();
    await _proton.spawn.useColor();
    _proton.spawn.applyToShader(_shader);
  };
  this.ready = async function () {
    return (await _proton.spawn.ready(), self.wait('canEmit'));
  };
  this.upload = async function () {
    await self.wait('mesh');
    await self.mesh.geometry.uploadBuffersAsync();
  };
  this.uploadSync = async function () {
    await self.wait('mesh');
    await self.mesh.upload();
  };
});

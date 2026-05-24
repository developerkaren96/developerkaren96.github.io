/*
 * HexagonGrid — Object3D-derived XComponent that builds the
 * tiled hexagon floor inside CleanRoom. Loads
 * `hexagon_gem.bin` once and uses MeshBatch + per-instance
 * attributes (`side` ∈ {0..5}) to mark edge/corner tiles for
 * the PhysicalShader to special-case.
 *
 * Grid is 25 rows × ⌊(16/9)·25⌋ = 44 cols, hexagon width =
 * 0.08·√3. Even rows offset by half a hexagon (standard
 * hex-grid staggering). `side` flagging:
 *   1 = top edge (i==0)
 *   3 = bottom edge (i==24)
 *   4 = left edge   (j==0 on even row)
 *   2 = right edge  (j==WIDTH-1 on odd row)
 *   5 = corner (overrides — i∈{0,24} && j==0)
 *
 * Shader is the global `PhysicalShader` with full PBR uniform
 * set: tBaseColor / tMRO / tNormal (damaged_road textures),
 * tEnvDiffuse / tEnvSpecular (RGBM-encoded corsica beach
 * cubemaps), tLightmap (per-instance), tLUT (color grading,
 * `ignoreUIL`), tVideo (lab.gif). uMRON Vector4 packs
 * metallic/roughness/occlusion/normal scalars.
 *
 * MouseFluid fluid-sim wired into the shader for ripple
 * response to the cursor. `uHold` triple-LERP'd (0.03→0.03)
 * for inertial mouse-down hold. Scroll.createUnlimited()
 * arms the scroll source (parent CleanRoom drives the
 * uniform actually).
 *
 * Per-frame startRender:
 *   - Portrait orientation rotates grid 90° on Z.
 *   - uUVScale.x = 2 in portrait (compress textures).
 *   - group.scale: landscape 0.75×0.6, portrait 0.32×0.4.
 *   - uTime: idle drift (0.025·HZ_MULTIPLIER) + 2× hover
 *     boost when Global.LOGO_HOVERED.
 *   - uScroll mirrors CleanRoom's scrollProgress.
 *
 * Standard Fragment plumbing.
 */
Class(function HexagonGrid(_input, _group) {
  const self = this;
  Inherit(self, Object3D);
  Inherit(self, XComponent);
  self.fragName = 'HexagonGrid';
  self.contexts = 'Object3D';
  self.uilInput = _input;
  self.uilFolder = _group;
  this.isFragment = true;
  var _promises = [];
  !(async function () {
    self.element && (self.element.onMountedHook = (_) => self.onMounted?.());
    self.mouseFluid = self.initClass(MouseFluid);
    self.mouseFluid.isFragment && _promises.push(self.wait(self.mouseFluid, '__ready'));
    self.batch = self.initClass(MeshBatch);
    self.batch.isFragment && _promises.push(self.wait(self.batch, '__ready'));
    self.uilInput = _input;
    self.uilFolder = _group;
    self.parent?.layers && (self.layers = self.parent.layers);
    self.layout?.getAllLayers && (self.layers = await self.layout.getAllLayers());
    const WIDTH = Math.floor((16 / 9) * 25);
    var _hold = {
        value: 0,
        v1: 0,
        v2: 0,
      },
      _time = {
        value: 0,
        v: 0,
      };
    self.shaderUniforms = {
      tBaseColor: {
        value: Utils3D.getRepeatTexture('assets/images/pbr/damaged_road_basecolor.png'),
        getTexture: Utils3D.getRepeatTexture,
      },
      tMRO: {
        value: Utils3D.getRepeatTexture('assets/images/pbr/damaged_road_mro.png'),
        getTexture: Utils3D.getRepeatTexture,
      },
      tNormal: {
        value: Utils3D.getRepeatTexture('assets/images/pbr/damaged_road_normal.png'),
        getTexture: Utils3D.getRepeatTexture,
      },
      tEnvDiffuse: {
        value: Utils3D.getRepeatTexture('assets/images/pbr/corsica_beach-diffuse-RGBM.png'),
        premultiplyAlpha: false,
      },
      tEnvSpecular: {
        value: Utils3D.getRepeatTexture('assets/images/pbr/corsica_beach-specular-RGBM.png'),
        premultiplyAlpha: false,
      },
      tLightmap: {
        value: null,
        premultiplyAlpha: false,
      },
      tLUT: {
        value: Utils3D.getLookupTexture('assets/images/pbr/lut.png'),
        ignoreUIL: true,
      },
      tVideo: {
        value: Utils3D.getTexture('assets/images/lab.gif'),
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
        value: new Vector4(1, 0.4, 0.5, 0.04),
      },
      uEnv: {
        value: new Vector2(1, 0),
      },
      uEnvRotation: {
        value: 0,
      },
      uScroll: {
        value: 0,
      },
      uVisible: {
        value: 1,
      },
      uHold: _hold,
      uTime: _time,
      uRotation: {
        value: 0,
      },
      uUVScale: {
        value: new Vector2(1, 1),
      },
      uParams: {
        value: new Vector4(1, 1, 1, 1),
      },
      uFogColor: {
        value: new Color(),
      },
      uUseLightmap: {
        value: 0,
      },
      uHDR: {
        value: 1,
      },
      uUseTonemapping: {
        value: 1,
        ignoreUIL: true,
      },
      uUseLinearOutput: {
        value: 0,
        ignoreUIL: true,
      },
    };
    self.group.add(self.batch.group);
    (async function initGrid() {
      await self.wait((_) => !!self.shader);
      ShaderUIL.add(self.shader, self.uilFolder);
      const hexagonWidth = 0.08 * Math.sqrt(3);
      await self.mouseFluid.applyTo(self.shader);
      let geometry = await GeomThread.loadGeometry('assets/geometry/hexgrid/hexagon_gem.bin');
      for (let i = 0; i < 25; i++)
        for (let j = 0; j < WIDTH; j++) {
          let side = 0;
          0 == i
            ? (side = 1)
            : 24 == i
              ? (side = 3)
              : 0 == j && i % 2 == 0
                ? (side = 4)
                : j == WIDTH - 1 && i % 2 != 0 && (side = 2);
          ((0 == i && 0 == j) || (24 == i && 0 == j)) && (side = 5);
          let mesh = new Mesh(geometry, self.shader);
          mesh.attributes = {
            side: side,
          };
          mesh.position.x = hexagonWidth * j - hexagonWidth * WIDTH * 0.5;
          mesh.position.x += 0.5 * hexagonWidth * (i % 2);
          mesh.position.y = 0.12 * i - 1.5 + 0.06;
          mesh.scale.setScalar(0.08);
          self.batch.add(mesh);
        }
    })();
    Scroll.createUnlimited();
    var _hoverV = 0,
      _timeV = 0;
    let root = self.findParent('CleanRoom');
    self.startRender((_) => {
      _hold.v1 = Mouse.down ? 1 : 0;
      _hold.v2 = Math.lerp(_hold.v1, _hold.v2, 0.03);
      _hold.value = Math.lerp(_hold.v2, _hold.value, 0.03);
      Math.abs(_hold.v1 - _hold.value);
      self.group.rotation.z = Stage.width > Stage.height ? 0 : Math.radians(90);
      root.scrollProgress && (self.shader.uniforms.uScroll.value = root.scrollProgress);
      self.shader.set('uRotation', self.group.rotation.z);
      self.shader.uniforms.uUVScale.value.x = Stage.width > Stage.height ? 1 : 2;
      self.group.scale.x = Stage.width > Stage.height ? 0.75 : 0.32;
      self.group.scale.y = Stage.width > Stage.height ? 0.6 : 0.4;
      _timeV += 0.025 * Render.HZ_MULTIPLIER;
      _hoverV = Math.lerp(Global.LOGO_HOVERED ? 1 : 0, _hoverV, 0.025);
      _time.value = 2 * _hoverV + _timeV;
    });
    for (let key in self)
      if (self[key]?.then) {
        let store = self[key];
        store.then((val) => (self[key] = val));
        _promises.push(store);
      }
    _promises.length && (await Promise.all(_promises));
    self.shader = self.initClass(
      Shader,
      AppState.createLocal(
        {
          name: 'PhysicalShader',
          uniforms: self.shaderUniforms,
        },
        true,
      ),
    );
    self.shader.isFragment && _promises.push(self.wait(self.shader, '__ready'));
    _promises = null;
    self.flag?.('__ready', true);
    self.onInit?.();
  })();
});

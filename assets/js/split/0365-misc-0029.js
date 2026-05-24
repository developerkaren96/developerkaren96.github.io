/*
 * FX.VolumetricLight — god-rays / volumetric light shaft post-
 * process. Two-stage pipeline:
 *   1. Render an "occluder pass" into `_layer` (FXLayer or
 *      FXScene depending on `options.useFXScene`). Caller adds
 *      black silhouette meshes via `addOccluder(mesh)` and a
 *      light-source mesh via `addLight(mesh)`.
 *   2. Project the light's world position into screen space,
 *      pass as `lightPos` (normalised UV) to the `VolumetricLight`
 *      NukePass which marches from each fragment toward
 *      `lightPos` accumulating sampled-radial-blur of the layer.
 *      Two `LightBlur` passes (1.5dpr horizontal/vertical) feed
 *      a soft pre-blur into the radial march.
 *
 * Per-frame render handler:
 *   - Hooked to `Nuke.RENDER` of the parent `_nuke`. Resizes the
 *     internal `_scene.nuke` to the current stage, projects
 *     `_light.matrixWorld` position via `ScreenProjection`,
 *     normalises to [0,1] UV (with Y flip), writes to
 *     `_volume.uniforms.lightPos`, then `_scene.render()`.
 *
 * Uniforms (radial-march parameters, exposed in ShaderUIL as
 * "Volumetric Light"):
 *   - fExposure 0.2, fDecay 0.93, fDensity 0.96, fWeight 0.4,
 *     fClamp 1.
 *   - `lightPos` is `ignoreUIL: true` because the editor must
 *     not save the runtime-driven value back.
 *
 * Construction polymorphism:
 *   - `(nuke, unique, options)` — full form.
 *   - `(appStateParams)` — params bag with `nuke`, `unique`,
 *     remaining keys merged into options.
 *   - `(nuke, options)` — `unique` omitted (object in slot 2 →
 *     re-assign as options).
 *   - `enabled: false` short-circuits all init so the component
 *     can be cheaply present-but-off.
 *
 * Public surface:
 *   - `addOccluder(mesh)` / `addLight(mesh)`.
 *   - `setResolution(v)` / `setDPR(v)` — both passes track.
 *   - `setComposite(texture)` — replace the input texture on
 *     the screen-quad shader (e.g. to plug another post chain
 *     in front of the volumetric pass).
 *   - `uniforms.tVolumetricBlur` — `{value: _scene}` so other
 *     shaders can sample the volumetric output as a texture.
 *   - `upload()` — Initializer3D.uploadNukeAsync warmup.
 *   - `render(stage, camera)` — manual driver: unsubscribes from
 *     Nuke.RENDER and calls `render(_obj)` directly (used when
 *     the caller owns the render schedule).
 *   - `onInvisible` / `onVisible` toggle `_invisible` so the
 *     handler short-circuits when off-screen.
 */
FX.Class(function VolumetricLight(_nuke = World.NUKE, _unique, _options = {}) {
  Inherit(this, Component);
  const self = this;
  var _scene, _layer, _volume, _light, _invisible;
  if ('object' == typeof _nuke && _nuke.isAppState) {
    let params = _nuke;
    _nuke = params.nuke || self.parent.nuke || World.NUKE;
    _unique = params.unique;
    _options = params;
  }
  var _obj = {},
    _blurs = [],
    _projection = new ScreenProjection(_nuke.camera),
    _lightPos = new Vector3();
  function render({ stage: stage, camera: camera }) {
    if (!_light || !self.enabled || _invisible) return;
    _scene.nuke.setSize(stage.width, stage.height);
    _scene.nuke.stage = stage;
    _scene.nuke.camera = camera;
    _projection.camera = camera;
    _lightPos.setFromMatrixPosition(_light.matrixWorld);
    let screen = _projection.project(_lightPos, stage);
    screen.x /= stage.width;
    screen.y /= stage.height;
    _volume.uniforms.lightPos.value.set(screen.x, 1 - screen.y);
    _scene.render();
  }
  !(function polymorph() {
    'object' == typeof _unique && ((_options = _unique), (_unique = undefined));
    self.enabled = undefined === _options.enabled || _options.enabled;
  })();
  self.enabled &&
    ((function initLayer() {
      (_layer = self.initClass(_options.useFXScene ? FXScene : FXLayer, _nuke, _options)).name =
        (_unique ? _unique.capitalize() : '') + 'VolumetricLight';
      self.startRender((_) => _layer.render());
      _layer.setDPR(1);
      self.fxLayer = _layer;
    })(),
    (function initScene() {
      (_scene = self.initClass(FXScene, _nuke)).setDPR(_options.dpr || 1);
      self.rt = _scene.rt;
      let shader = self.initClass(Shader, _options.screenQuadShader || 'ScreenQuad', {
          customCompile: 'volumetricLight',
          tMap: {
            value: _layer,
          },
          depthWrite: false,
        }),
        mesh = new Mesh(World.QUAD, shader);
      mesh.frustumCulled = false;
      _scene.scene.add(mesh);
      self.screenQuadMesh = mesh;
      self.fxScene = _scene;
    })(),
    (function initPasses() {
      [new Vector2(1.5 * _scene.nuke.dpr, 0), new Vector2(0, 1.5 * _scene.nuke.dpr)].forEach(
        (dir) => {
          let pass = new NukePass('LightBlur', {
            uDir: {
              value: dir,
            },
          });
          _blurs.push(pass);
          _scene.nuke.add(pass);
        },
      );
      _volume = new NukePass('VolumetricLight', {
        unique: _unique,
        lightPos: {
          value: new Vector2(),
          ignoreUIL: true,
        },
        fExposure: {
          type: 'f',
          value: 0.2,
        },
        fDecay: {
          type: 'f',
          value: 0.93,
        },
        fDensity: {
          type: 'f',
          value: 0.96,
        },
        fWeight: {
          type: 'f',
          value: 0.4,
        },
        fClamp: {
          type: 'f',
          value: 1,
        },
      });
      _scene.nuke.add(_volume);
      ShaderUIL.add(_volume).setLabel('Volumetric Light');
      self.volumeShader = _volume;
      self.uniforms = {
        tVolumetricBlur: {
          value: _scene,
        },
      };
    })(),
    (function addListeners() {
      self.events.sub(_nuke, Nuke.RENDER, render);
    })());
  this.addOccluder = function (mesh) {
    self.enabled && _layer.add(mesh);
  };
  this.addLight = function (mesh) {
    self.enabled && (_light = mesh);
  };
  this.set('resolution', (v) => {
    self.enabled && (_layer.setResolution(v), _scene.setResolution(v));
  });
  this.set('dpr', (v) => {
    self.enabled && (_layer.setDPR(v), _scene.setDPR(v));
  });
  this.onInvisible = function () {
    _invisible = true;
  };
  this.onVisible = function () {
    _invisible = false;
  };
  this.upload = async function () {
    _scene && _scene.nuke && (await Initializer3D.uploadNukeAsync(_scene.nuke));
  };
  this.setComposite = function (texture) {
    self.enabled && self.screenQuadMesh.shader.set('tMap', texture);
  };
  this.render = function (stage, camera) {
    self.enabled &&
      (self.events.unsub(_nuke, Nuke.RENDER, render),
      (_obj.stage = stage),
      (_obj.camera = camera),
      render(_obj));
  };
});

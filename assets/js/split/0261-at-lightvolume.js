/*
 * LightVolume — volumetric light shaft / god-ray effect built from
 * a stack of parallel translucent quads (or concentric spheres)
 * sampled against a light texture + tiling mask. Cheap analogue to
 * raymarched volumetrics: each "layer" is a quad (or sphere shell)
 * with the light cookie texture, and parallax between layers gives
 * the volumetric impression at low cost.
 *
 * Config (InputUIL "Light Config"):
 *   - `layers` (default 5) — slice count. More slices ⇒ smoother
 *     volume, higher fill cost.
 *   - `sphere` (toggle)    — switch between billboard quad stack
 *     and spherical shell stack (for omni-directional volumes).
 *
 * Geometry sourced from static helpers `LightVolume.getGeometry(n)`
 * / `getSphereGeometry(n)` (created later in the file or in a
 * sibling) — these build the layered mesh with vertex attributes
 * the LightVolume shader needs.
 *
 * Shader `LightVolume` (per-instance via `unique: _input.prefix` so
 * multiple volumes don't share state):
 *   - `tMap`   — light cookie / colour profile (e.g. soft white
 *     gradient).
 *   - `tMask`  — repeating noise/cloud texture for the volumetric
 *     break-up (sampled with REPEAT wrap).
 *   - `uScale` — texture tiling rate.
 *   - `uSeparation` — distance between consecutive layers (controls
 *     visible parallax).
 *   - `uAlpha` and friends — per-volume tuning (continues below).
 *
 * `_input.get('billboard')` is consumed by the shader / geometry to
 * decide whether each slice should auto-face the camera.
 */
Class(
  function LightVolume(_input, _group) {
    Inherit(this, Object3D);
    const self = this;
    var _data;
    !(function initInput() {
      (_data = InputUIL.create(`Light_${_input.prefix}`, _group)).setLabel('Light Config');
      _data.add('layers', 5);
      _data.addToggle('sphere');
    })();
    (function initGeometry() {
      let sphere = _data.get('sphere'),
        layers = _data.getNumber('layers'),
        geom = sphere ? LightVolume.getSphereGeometry(layers) : LightVolume.getGeometry(layers),
        billboard = _input.get('billboard'),
        shader = self.initClass(Shader, 'LightVolume', {
          unique: _input.prefix,
          tMap: {
            value: Utils3D.getTexture('assets/images/_lightvolume/light.jpg'),
          },
          tMask: {
            value: Utils3D.getRepeatTexture('assets/images/_lightvolume/light-mask.jpg'),
          },
          uScale: {
            value: 1,
          },
          uSeparation: {
            value: 0.1,
          },
          uAlpha: {
            value: 1,
          },
          uMaskScale: {
            value: 1,
          },
          uRotateSpeed: {
            value: 1,
          },
          uRotateTexture: {
            value: 0,
          },
          uNoiseScale: {
            value: 0,
          },
          uNoiseSpeed: {
            value: 0,
          },
          uNoiseRange: {
            value: 0,
          },
          uOffset: {
            value: 0,
          },
          uScrollX: {
            value: 1,
          },
          uScrollY: {
            value: 1,
          },
          uHueShift: {
            value: 0,
          },
          uDPR: {
            value: World.DPR,
          },
          uNoiseMin: {
            value: 1,
          },
          uColor: {
            value: new Color(),
          },
          transparent: true,
          depthWrite: false,
          blending: Shader.ADDITIVE_BLENDING,
          side: _input.get('side'),
        });
      ShaderUIL.add(shader, _group).setLabel('Shader');
      let mesh = new Mesh(geom, shader);
      mesh.frustumCulled = false;
      self.add(mesh);
      self.shader = shader;
      self.mesh = mesh;
      let renderOrder = _input.getNumber('renderOrder');
      'number' != typeof renderOrder ||
        isNaN(renderOrder) ||
        (mesh.renderOrder = self.parent.baseRenderOrder + renderOrder);
      false === _input.get('depthTest') && (shader.depthTest = false);
      billboard && JSON.parse(billboard) && self.startRender((_) => Utils3D.billboard(mesh));
    })();
    this.set('dpr', (v) => {
      self.shader.set('uDPR', v);
    });
    this.set('noise', (v) => {
      self.shader.set('uNoiseMin', v);
    });
    this.set('needsUpdate', (v) => {
      self.shader.ubo && (self.shader.ubo.needsUpdate = true);
    });
  },
  (_) => {
    var _quad,
      _sphere,
      _geom = {};
    LightVolume.getGeometry = function (layers) {
      if ((_quad || (_quad = new PlaneGeometry(1, 1).toNonIndexed()), !_geom[layers])) {
        let geom = new Geometry();
        for (let key in _quad.attributes) geom.addAttribute(key, _quad.attributes[key]);
        let offset = new Float32Array(3 * layers),
          attribs = new Float32Array(4 * layers);
        for (let i = 0; i < layers; i++) {
          offset[3 * i + 2] = i;
          attribs[4 * i + 0] = Math.random(0, 1, 5);
          attribs[4 * i + 1] = Math.random(0, 1, 5);
          attribs[4 * i + 2] = Math.random(0, 1, 5);
          attribs[4 * i + 3] = Math.random(0, 1, 5);
        }
        geom.addAttribute('offset', new GeometryAttribute(offset, 3, 1));
        geom.addAttribute('attribs', new GeometryAttribute(attribs, 4, 1));
        _geom[layers] = geom;
      }
      return _geom[layers];
    };
    LightVolume.getSphereGeometry = function (layers) {
      if (
        (_sphere || (_sphere = new SphereGeometry(1, 32, 32).toNonIndexed()),
        !_geom[`sphere_${layers}`])
      ) {
        let geom = new Geometry();
        for (let key in _sphere.attributes) geom.addAttribute(key, _sphere.attributes[key]);
        let offset = new Float32Array(3 * layers),
          attribs = new Float32Array(4 * layers);
        for (let i = 0; i < layers; i++) {
          offset[3 * i + 2] = i;
          attribs[4 * i + 0] = Math.random(0, 1, 5);
          attribs[4 * i + 1] = Math.random(0, 1, 5);
          attribs[4 * i + 2] = Math.random(0, 1, 5);
          attribs[4 * i + 3] = Math.random(0, 1, 5);
        }
        geom.addAttribute('offset', new GeometryAttribute(offset, 3, 1));
        geom.addAttribute('attribs', new GeometryAttribute(attribs, 4, 1));
        _geom[`sphere_${layers}`] = geom;
      }
      return _geom[`sphere_${layers}`];
    };
  },
);

/*
 * ProtonPresets — the dropdown catalogue of named behaviour
 * presets the Proton (0290) editor surfaces in its "Behavior"
 * select. Each entry is `{label, value}`:
 *   - `label` is the human name shown in the UIL list.
 *   - `value` is the string key used both to look up the preset's
 *     compiled shader / parameter table and to identify it in the
 *     saved JSON config.
 *
 * Presets cover the common particle behaviours: curl-noise drift,
 * sine wave motion, plane-shape emission, 3D-shape emission, point-
 * cloud playback, force-field driven, and the "Custom Code" escape
 * hatch (`value: 'custom'`) that lets a designer type shader code
 * directly in the editor instead of picking a preset.
 *
 * The full list continues below — each preset's runtime mapping
 * lives in the Proton update-shader switch / behaviour modules
 * loaded on demand.
 */
Class(function ProtonPresets() {
  const self = this,
    LIST = [
      {
        label: 'Custom Code',
        value: 'custom',
      },
      {
        label: 'Curl Noise',
        value: 'curl',
      },
      {
        label: 'Sine Move',
        value: 'sine',
      },
      {
        label: 'Plane Shape',
        value: 'planeshape',
      },
      {
        label: '3D Shape',
        value: '3dshape',
      },
      {
        label: 'Point Cloud',
        value: 'pointcloud',
      },
      {
        label: 'Force',
        value: 'force',
      },
      {
        label: 'Follow',
        value: 'follow',
      },
      {
        label: 'Mouse Fluid',
        value: 'fluid',
      },
    ],
    CALLBACKS = {
      custom: function customCode(input) {
        input.setValue('name', 'Custom Code');
        input.setLabel('Custom Code');
      },
      curl: function curlNoise(input) {
        input.setValue('name', 'Curl Noise');
        input.setLabel('Curl Noise');
        input.setValue(
          'uniforms',
          '\n        uCurlNoiseScale: 1\n        uCurlTimeScale: 0\n        uCurlNoiseSpeed: 0\n        ',
        );
        setPresetCodeIfRequired(
          input,
          '#require(curl.glsl)\n\nvec3 curl = curlNoise(pos * uCurlNoiseScale*0.1 + (time * uCurlTimeScale * 0.1));\npos += curl * uCurlNoiseSpeed * 0.01 * HZ;',
          'uCurlNoise',
        );
      },
      sine: function sineMove(input) {
        input.setValue('name', 'Sine Move');
        input.setLabel('Sine Move');
        input.setValue('uniforms', '\n        uSinSpeed: 1\n        uSinMovement: 0\n        ');
        setPresetCodeIfRequired(
          input,
          'pos = origin;\npos.x += sin(time*uSinSpeed + radians(360.0 * random.x)) * 0.03 * random.z * uSinMovement * HZ;\npos.y += sin(time*uSinSpeed + radians(360.0 * random.y)) * 0.03 * random.w * uSinMovement * HZ;\npos.z += sin(time*uSinSpeed + radians(360.0 * random.w)) * 0.03 * random.x * uSinMovement * HZ;',
          'uSinSpeed',
        );
      },
      planeshape: function planeShape(input) {
        input.setValue('name', 'Plane Shape');
        input.setLabel('Plane Shape');
        input.setValue(
          'uniforms',
          '\n        uTakePlaneShape: 1\n        uPlaneScale: 1\n        tPlaneTexture: Csampler2D\n        ',
        );
        setPresetCodeIfRequired(
          input,
          'vec2 planeLookup = texture2D(tPlaneTexture, uv).xy;\nvec3 plane;\nplane.x = uPlaneScale * 0.5 * range(planeLookup.x, 0.0, 1.0, -1.0, 1.0);\nplane.y = uPlaneScale * 0.5 * -range(planeLookup.y, 0.0, 1.0, -1.0, 1.0);\nif (uTakePlaneShape > 0.5) pos = plane;',
          'uPlaneScale',
        );
        input.customPresetCallback = (proton) => {
          proton.behavior.addUniforms({
            tPlaneTexture: {
              value: null,
            },
          });
        };
      },
      '3dshape': function shape3D(input) {
        input.setValue('name', '3D Shape');
        input.setLabel('3D Shape');
        input.add('geometry');
        let geometry = input.get('geometry');
        input.setValue('uniforms', '\n        tShape3D: Csampler2D\n        ');
        setPresetCodeIfRequired(input, 'vec3 shape3d = texture2D(tShape3D, uv).xyz;', 'tShape3D');
        input.customPresetCallback = (proton) => {
          let create = async (g) => {
            let geom = await GeomThread.loadGeometry(g),
              distribution = await ParticleDistributor.generate(
                geom,
                proton.antimatter.particleCount,
              ),
              attribute = new AntimatterAttribute(distribution, 3);
            proton.behavior.addInput('tShape3D', attribute);
          };
          geometry && create(geometry);
          proton.set3DShape = create;
        };
      },
      pointcloud: function pointCloud(input) {
        input.setValue('name', 'Point Cloud');
        input.setLabel('Point Cloud');
        input.add('file');
        let file = input.get('file');
        input.setValue('uniforms', '\n        tPointCloud: Csampler2D\n        ');
        setPresetCodeIfRequired(
          input,
          'vec3 pointShape = texture2D(tPointCloud, uv).xyz;',
          'tPointCloud',
        );
        input.customPresetCallback = (proton) => {
          let create = async (filePath) => {
            let data;
            'string' == typeof filePath
              ? ((filePath += '-' + proton.antimatter.powerOf2),
                (self.cachePointCloud = self.cachePointCloud || {}),
                self.cachePointCloud[filePath] ||
                  (self.cachePointCloud[filePath] = ParticleDistributor.generatePointCloud(
                    filePath,
                    proton.antimatter.textureSize,
                  )),
                (data = await self.cachePointCloud[filePath]))
              : (data = filePath);
            proton.behavior.shader.uniforms.tPointCloud &&
              (proton.behavior.shader.uniforms.tPointCloud.value.destroy(),
              proton.shader.uniforms.tPointColor.value.destroy());
            proton.behavior.addInput('tPointCloud', data.positions);
            proton.shader.addUniforms({
              tPointColor: {
                value: data.colors,
              },
            });
          };
          file || (file = proton.parent.data ? proton.parent.data.pointCloudFile : undefined);
          file && create(file);
          proton.setPointCloud = create;
        };
      },
      force: function force(input) {
        input.setValue('name', 'Force');
        input.setLabel('Force');
        input.setValue(
          'uniforms',
          '\n        uForceDir: [0, 1, 0]\n        uForceScale: 1\n        ',
        );
        setPresetCodeIfRequired(
          input,
          'vec3 force = normalize(uForceDir) * uForceScale * 0.1;\npos += force * HZ;',
          'uForceDir',
        );
      },
      follow: function follow(input) {
        input.setValue('name', 'Follow');
        input.setLabel('Follow');
        input.setValue(
          'uniforms',
          '\n        uFollowPos: [0, 0, 0]\n        uFollowRadius: 2\n        uFollowLerp: 0.7\n        ',
        );
        setPresetCodeIfRequired(
          input,
          'float speed = range(random.x, 0.0, 1.0, 0.5, 1.5);\nvec3 followPos = uFollowPos;\nfollowPos.x += range(random.y, 0.0, 1.0, -1.0, 1.0) * uFollowRadius;\nfollowPos.y += range(random.z, 0.0, 1.0, -1.0, 1.0) * uFollowRadius;\nfollowPos.z += range(random.w, 0.0, 1.0, -1.0, 1.0) * uFollowRadius;\npos += (followPos - pos) * (uFollowLerp*0.1*speed*HZ);',
          'followPos',
        );
      },
      fluid: function fluid(input) {
        input.setValue('name', 'Mouse Fluid');
        input.setLabel('Mouse Fluid');
        input.setValue(
          'uniforms',
          '\n        uProjMatrix: Cmat4\n        uProjNormalMatrix: Cmat4\n        uModelMatrix: Cmat4\n        tFluidMask: Csampler2D\n        tFluid: Csampler2D\n        uMouseStrength: 1\n        ',
        );
        setPresetCodeIfRequired(
          input,
          '#require(glscreenprojection.glsl)\n\nvec3 mpos = vec3(uModelMatrix * vec4(pos, 1.0));\nvec2 screenUV = getProjection(mpos, uProjMatrix);\nvec3 flow = vec3(texture2D(tFluid, screenUV).xy, 0.0);\napplyNormal(flow, uProjNormalMatrix);\npos += flow * 0.0001 * HZ * uMouseStrength * texture2D(tFluidMask, screenUV).r;',
          'glscreenprojection',
        );
        let findCamera = (proton) => {
          let camera = World.CAMERA,
            p = proton.group._parent;
          for (; p; ) {
            p instanceof Scene && p.nuke && (camera = p.nuke.camera);
            p = p._parent;
          }
          return camera;
        };
        input.customPresetCallback = async (proton) => {
          if (!('MouseFluid' in window))
            return void alert(
              "'mousefluid' module not found. To use Mouse Fluid preset, import module, load the MouseFluid class, and add a layer named 'fluid' with customCLass FluidLayer.",
            );
          let camera = findCamera(proton),
            projection = proton.initClass(GLScreenProjection, camera);
          projection.start();
          proton.projection = projection;
          Render.start(function camLoop() {
            if (!proton.group) return void Render.stop(camLoop);
            let newCamera = findCamera(proton);
            newCamera != camera && ((camera = newCamera), (projection.camera = camera));
          }, 10);
          proton.wait('behavior').then((_) => {
            proton.behavior.addUniforms({
              uProjMatrix: projection.uniforms.projMatrix,
              uModelMatrix: projection.uniforms.modelMatrix,
              uProjNormalMatrix: projection.uniforms.normalMatrix,
            });
            MouseFluid.instance().applyTo(proton.behavior);
          });
        };
      },
    };
  function setPresetCodeIfRequired(input, presetCode, keyShaderComponentString) {
    const editorCode = input.get('code');
    (editorCode && editorCode.includes(keyShaderComponentString)) ||
      input.setValue('code', presetCode);
  }
  this.register = function (name, callback) {
    let key = name.replace(/ /g, '').toLowerCase();
    LIST.push({
      label: name,
      value: key,
    });
    CALLBACKS[key] = callback;
  };
  this.bind = function (input) {
    input.add('code', 'hidden');
    input.add('uniforms', 'hidden');
    input.addSelect('preset', LIST);
    let callback = CALLBACKS[input.get('preset')];
    callback && callback(input);
    input.addButton('btn', {
      actions: [
        {
          title: 'Edit Code',
          callback: (_) => {
            let editor = new UILExternalEditor(input.get('name') || 'Code', 300);
            editor.setCode(input.get('code'), 'c');
            editor.onSave = (value) => {
              input.setValue('code', value);
              self.onCodeEdit?.();
            };
            UIL.add(editor);
          },
        },
      ],
      hideLabel: true,
    });
  };
}, 'static');

/*
 * SceneLayout — the central declarative scene engine in this
 * framework. Given a layout name, loads a JSON description that
 * lists meshes, groups, layers, animations, and per-object class
 * bindings, then instantiates the corresponding scene graph plus
 * the editor UI (UIL folders, timelines, gizmos) that drives it.
 *
 * State (top of file):
 *   - `_dataStore`     — persisted edit state for this layout.
 *   - `_data`          — parsed layout JSON (the authored content).
 *   - `_timeline`      — keyframe timeline editor (if enabled).
 *   - `_breakpoint`    — current responsive breakpoint.
 *   - `_stateData`     — AppState-driven runtime overrides.
 *   - `_gizmo`         — in-scene editor gizmo (transform handles)
 *     unless suppressed.
 *
 * Collections:
 *   - `_initializers` — class registrations awaiting init.
 *   - `_promises`     — outstanding async setup promises that
 *     `Initializer3D` should await on `uploadAll(layout)`.
 *   - `_breakpoints`  — responsive layout cut points (width ranges
 *     and the per-range overrides to apply).
 *   - `_folders`      — UIL folder registry, keyed by `sl_${name}_${folder}`.
 *   - `_groups`       — Object3D groups keyed by layout id.
 *   - `_custom`       — user-class instances mounted on objects.
 *   - `_meshes`       — instantiated meshes keyed by layout id.
 *   - `_exists`       — id presence map (avoids double-init).
 *   - `_layers`       — named visibility layers (toggle whole
 *     groups together).
 *   - `_uil`          — root UIL panel (`UIL.sidebar`).
 *   - `_graph`        — node graph editor handle (if any).
 *   - `_config`       — top-level layout config inputs (animation
 *     duration, layout breakpoint controls).
 *   - `_groupIndex`   — running counter for unnamed groups.
 *   - `_groupsSynced` — promise that resolves once the initial
 *     group sync (from layout JSON) is complete.
 *
 * Lifecycle:
 *   - `initialize(promise)` queues an async init promise (called by
 *     children to mark themselves as "still loading").
 *   - `initGizmo()` mounts the editor gizmo unless the URL has
 *     `?nogizmo`, `_options.noGizmo` is set, or the renderer isn't
 *     in NORMAL mode (no gizmos in VR / AR).
 *   - `createFolder(name)` builds a hidden UIL folder under this
 *     layout's namespace so per-object editor panels can be docked
 *     into it.
 *   - `initConfig()` adds the layout-level config inputs
 *     ("Animation", "Layout", …) that drive timeline / breakpoint
 *     behaviour.
 *
 * The file is large because it implements the whole authoring
 * pipeline (JSON → instances → editor wiring). The rest of this
 * header is intentionally brief — substantive walkthroughs live on
 * the helper classes (SceneLayoutGizmo, SceneLayoutPreloader,
 * Frag3D, FragFXScene).
 */
Class(
  function SceneLayout(_name, _options = {}) {
    Inherit(this, Object3D);
    const self = this;
    var _dataStore, _data, _timeline, _breakpoint, _stateData, _gizmo;
    const ZERO = new Vector3();
    var _initializers = [],
      _promises = [],
      _breakpoints = [],
      _folders = {},
      _groups = {},
      _custom = {},
      _meshes = {},
      _exists = {},
      _layers = {},
      _uil = UIL.sidebar,
      _graph,
      _config,
      _groupIndex = 0,
      _groupsSynced = Promise.create();
    function initialize(promise) {
      _promises.push(promise);
    }
    function initGizmo() {
      _options.noGizmo ||
        Utils.query('nogizmo') ||
        RenderManager.type != RenderManager.NORMAL ||
        (_gizmo = self.initClass(SceneLayoutGizmo));
    }
    function createFolder(name) {
      let folder = new UILFolder(`sl_${_name}_${name}`, {
        label: name,
        closed: true,
      });
      return (folder.hide(), (_folders[`sl_${_name}_${name}`] = folder), folder);
    }
    async function initConfig() {
      let input = InputUIL.create(`CONFIG_sl_${_name}`, _uil);
      input.add('Animation');
      input.add('Layout');
      input.add('Cinema Config');
      _graph && _graph.addSpecial('Config', `Config (${_name})`, 'Config');
      input.setLabel('Config');
      let animation = input.get('Animation'),
        layout = input.get('Layout');
      animation &&
        (await ready(),
        _groupsSynced.then(async () => {
          if (
            ((animation = animation.replace(/^\//g, '')),
            (self.animation = self.initClass(HierarchyAnimation, animation, linkObjects)),
            _timeline)
          )
            self.startRender((_) => {
              self.animation.elapsed = _timeline.elapsed;
              self.animation.update();
            });
          else if (_uil) {
            let range = new UILControlRange('Animation', {
              min: 0,
              max: 1,
              step: 0.001,
            });
            range.onChange((val) => {
              self.animation.elapsed = val;
              self.animation.update();
            });
            _uil.add(range);
          }
          await self.animation.ready();
          self.animation.update();
        }));
      layout &&
        (await ready(),
        (self.layout = self.initClass(HierarchyLayout, layout, linkObjects)),
        await self.layout.ready());
      _config = input;
      await defer();
      self.configured = true;
    }
    async function linkObjects(data) {
      let array = [];
      for (let i = 0; i < data.length; i++) {
        let name = data[i].name,
          exists = self.exists(name);
        exists ||
          'null' == name.toLowerCase() ||
          console.warn(`linkAnimation :: ${name} does not exist`);
        let group = new Group(),
          mesh = exists ? await self.getLayer(name) : null;
        mesh &&
          (self.layout && mesh instanceof Mesh
            ? (mesh._parent.add(group), group.add(mesh))
            : (group = mesh.group || mesh));
        group.name = name;
        array.push(group);
      }
      return array;
    }
    async function initGraph() {
      if (_options.noGraph || !window.UILGraph || SceneLayout.noGraph)
        return ((_uil = null), void _groupsSynced.resolve());
      (_graph = UILGraph.instance().getGraph(_name, self))
        ? (UIL.sidebar.element.show(),
          await self.ready(),
          _graph.syncVisibility(_layers),
          _graph.syncGroupNames(_groups, _folders),
          _groupsSynced.resolve(),
          Global.PLAYGROUND &&
            Utils.getConstructorName(self.parent) == Global.PLAYGROUND &&
            _graph.open())
        : _groupsSynced.resolve();
    }
    function ssReflectionsEnabled() {
      if (undefined !== self.cachedSSReflections) return self.cachedSSReflections;
      let p = self,
        has = false;
      for (; p; ) {
        p.ssgiEnabled && (has = true);
        p = p.parent;
      }
      return ((self.cachedSSReflections = has), has);
    }
    function generateScreenSpaceReflectionsPanel(shader) {
      let texturePath = 'assets/images/_scenelayout/mask.jpg';
      shader.addUniforms({
        tReflectivity: {
          value: Utils3D.getTexture(texturePath),
        },
        tRoughness: {
          value: Utils3D.getTexture(texturePath),
        },
        ssReflectivity: {
          value: 1,
        },
        ssIORrefl: {
          value: 1,
        },
        ssRougness: {
          value: 0,
        },
        ssgiIntensity: {
          value: 1,
        },
      });
    }
    function initParams() {
      if (
        (_options.rootPath
          ? '/' != _options.rootPath.charAt(_options.rootPath.length - 1) &&
            (_options.rootPath += '/')
          : (_options.rootPath = ''),
        (self.timeline = _timeline = _options.timeline),
        _timeline &&
          (_timeline.add(
            {
              v: 0,
            },
            {
              v: 1,
            },
            100,
            'linear',
          ),
          _uil))
      ) {
        let range = new UILControlRange('Timeline', {
          min: 0,
          max: 1,
          step: 0.001,
        });
        range.onChange((val) => {
          _timeline.elapsed = val;
          _timeline.update();
        });
        _uil.add(range);
        range.hide();
        _graph && _graph.addSpecial('Timeline', 'Timeline');
      }
      self.baseRenderOrder = _options.baseRenderOrder || 0;
      self.data = _options.data;
      _breakpoint = _options.breakpoint || SceneLayout.breakpoint;
      _options.breakpoint && (self.localBreakpoint = true);
      _options.uil && (_uil = _options.uil);
    }
    async function initData() {
      if (
        (await UILStorage.ready(),
        (_dataStore = InputUIL.create(`scenelayout_${_name}`, null)),
        undefined === (_data = JSON.parse(_dataStore.get('data') || '{}')).layers &&
          (_data.layers = -1),
        (_stateData = await UILGroupBridge.createSceneLayout(_name, self)),
        _options.perFrame)
      )
        _data.layers > 0 ? createLayers() : (self.loaded = true);
      else {
        for (let i = 0, c = _data.layers + 1; i < c; i++) initialize(createLayer(i));
        self.loaded = true;
      }
    }
    function createShader(shaderName, input, params = {}) {
      let shader;
      try {
        shader = self.initClass(Shader, shaderName, {
          unique: `Element_${input.id}_${_name}`,
          ...params,
        });
      } catch (e) {
        if ('SceneLayout' === shaderName) throw e;
        return (
          console.error(e, ', replacing with default UV tile.'),
          createShader('SceneLayout', input, params)
        );
      }
      if ('SceneLayout' === shaderName || !window[shaderName]) {
        let texturePath = input.getImage('texture');
        texturePath
          ? texturePath.includes('assets/images') || (texturePath = _options.rootPath + texturePath)
          : (texturePath = 'assets/images/_scenelayout/uv.jpg');
        shader.addUniforms({
          tMap: {
            value: Utils3D.getTexture(texturePath),
          },
          uAlpha: {
            value: 1,
          },
        });
      }
      return shader;
    }
    function createLayers() {
      let index = 0,
        renderWorker = new Render.Worker(function () {
          initialize(createLayer(index));
          index++ == _data.layers && (renderWorker.stop(), (self.loaded = true));
        }, _options.perFrame);
    }
    function getGroup(name, index) {
      if (!name) return self.group;
      if (name == _name) return self.group;
      if (!_groups[name]) {
        let uilGroup = _uil ? createFolder(name) : null;
        uilGroup &&
          (uilGroup.setLabel(`${name} (Group)`),
          _uil.add(uilGroup),
          _graph && _graph.addGroup(uilGroup.id, name));
        let config = InputUIL.create(`GROUP_${_name}_${name}`, uilGroup);
        config.setLabel('Parameters');
        config.addToggle('occlusionCulling');
        _timeline && config.add('tween');
        config.addToggle('billboard');
        config.add('breakpoints');
        config.add('name', 'hidden');
        let breakpoints = config.get('breakpoints');
        breakpoints && (breakpoints = breakpoints.replace(/ /g, '').split(','));
        let breakpoint = breakpoints && _breakpoint ? '-' + _breakpoint : '';
        '-' == breakpoint.charAt(breakpoint.length - 1) && (breakpoint = '');
        let group = new Group();
        group.name = name;
        _groups[name] = group;
        _layers[name] = group;
        _exists[name] = 'group';
        group.prefix = `${name}_${_name}${breakpoint}`;
        let meshUIL = MeshUIL.add(group, uilGroup);
        meshUIL.setLabel('Mesh');
        self.add(group);
        UIL.global && (group._meshUIL = meshUIL);
        uilGroup && (uilGroup.params = config);
        breakpoints && _breakpoints.push(group);
        config.get('billboard') && updateBillboard(true, mesh);
        let occlusionCulling = config.get('occlusionCulling');
        'boolean' == typeof occlusionCulling &&
          occlusionCulling &&
          _groups[name].generateOcclusionMesh();
        let appState = _stateData.getGroup(index || _groupIndex);
        appState ||
          ((appState = _stateData.syncGroup(index || _groupIndex, name)),
          self.flag('needsGroupFixing', true));
        self.flag('needsGroupFixing') && (group.fixStateBinding = appState.id);
        appState.scene = _name;
        self.bindState(appState, 'name', (name) => {
          _groups[name] = group;
          _layers[name] = group;
          _exists[name] = 'group';
          for (let key in _layers)
            key != name &&
              _layers[key] == _layers[name] &&
              (delete _layers[key], delete _exists[key], delete _groups[key]);
        });
        self.bindState(appState, 'visible', (bool) => {
          group.visible = bool;
        });
        self.bindState(appState, 'deleted', (bool) => {
          bool &&
            (delete _groups[name],
            delete _layers[name],
            delete _exists[name],
            group._parent.remove(group));
        });
        appState.slGroup = group;
      }
      return (
        undefined === index &&
          ((_data.groups = _groupIndex),
          _groupIndex++,
          _dataStore.setValue('data', JSON.stringify(_data))),
        self.flag('needsGroupFixing') && Utils.debounce(healGroups, 100),
        _groups[name]
      );
    }
    function healGroups() {
      _stateData.healGroups(_groupIndex);
    }
    async function createLayer(index, groupName, returnName) {
      let created = false,
        input,
        id = 'number' == typeof index ? index : ++_data.layers,
        graphGroupName = groupName;
      if (graphGroupName) {
        let nameLabel = UILStorage.get(`INPUT_GROUP_${_name}_${groupName}_name`);
        nameLabel && (groupName = nameLabel);
      }
      let appState = _stateData.layers[id];
      if (appState?.deleted) return;
      if (
        self.preventLayerCreation &&
        self.preventLayerCreation(UILStorage.get(`INPUT_Config_${id}_${_name}_name`))
      )
        return;
      let group = _uil ? createFolder(id) : null,
        shader,
        mesh;
      appState &&
        (self.bindState(appState, 'visible', (bool) => {
          mesh && (mesh.visible = bool);
        }),
        self.bindState(appState, 'parent', async (parentName) => {
          let parent;
          if (
            (await self.wait((_) => !!mesh),
            parentName?.includes?.('group') && (parent = Number(parentName.split('group_')[1])),
            null == parentName)
          )
            return (self.group.add(mesh), (mesh.position.y += 1), void (mesh.position.y -= 1));
          if (parentName.includes('_env_')) {
            let groupName = parentName.split('_env_')[1];
            return (
              _groups[groupName].add(mesh),
              (mesh.position.y += 1),
              void (mesh.position.y -= 1)
            );
          }
          if (parentName.startsWith('sl_')) {
            let groupName = parentName.split('_').pop();
            if (isNaN(groupName)) {
              return (
                _groups[groupName].add(mesh),
                (mesh.position.y += 1),
                void (mesh.position.y -= 1)
              );
            }
          }
          if (parent > -1) {
            let obj = _stateData.getGroup(parent);
            obj?.slGroup && obj.slGroup.add(mesh);
            mesh.position.y += 1;
            mesh.position.y -= 1;
          } else self.group.add(mesh);
        }));
      Hydra.LOCAL &&
        self.delayedCall((_) => {
          created ||
            console.error(
              `SceneLayout :: 5 second timer expired creating ${_name} ${input.get('name')}`,
            );
        }, 5e3);
      input = InputUIL.create(`Config_${id}_${_name}`, group);
      input.setLabel('Parameters');
      input
        .add('name', 'hidden')
        .add('sortIndex', 'hidden')
        .addFile('geometry', {
          relative: 'assets/geometry',
        })
        .addToggle('visible', true)
        .addToggle('transparent')
        .addToggle('depthWrite', true)
        .addToggle('depthTest', true)
        .addToggle('occlusionCulling', false)
        .addToggle('castShadow')
        .addToggle('receiveShadow')
        .addToggle('receiveLight')
        .addToggle('billboard')
        .addToggle('animates', true)
        .add('shader')
        .add('custom', null, 'customClass')
        .add('script', null, 'scriptClass')
        .add('wildcard')
        .add('renderOrder', 'hidden')
        .add('group', 'hidden')
        .add('breakpoints')
        .addSelect('side', [
          {
            label: 'Front Side',
            value: 'shader_front_side',
          },
          {
            label: 'Back Side',
            value: 'shader_back_side',
          },
          {
            label: 'Double Side',
            value: 'shader_double_side',
          },
          {
            label: 'Double Side Transparent',
            value: 'shader_double_side_trasparency',
          },
        ])
        .addSelect('blending', [
          {
            label: 'Normal',
            value: 'shader_normal_blending',
          },
          {
            label: 'Additive',
            value: 'shader_additive_blending',
          },
          {
            label: 'Premultiplied Alpha',
            value: 'shader_premultiplied_alpha_blending',
          },
        ]);
      window.FX.ScreenSpaceRaytracer && input.addToggle('ssgi');
      input.name = _name;
      input.prefix = `Element_${id}_${_name}`;
      input.id = id;
      group && (group.params = input);
      _timeline && input.addToggle('tween');
      _options.physics &&
        (input.addToggle('physics'),
        input.add('physicsCode'),
        input.addFile('physicsBounds', {
          relative: 'assets/geometry',
        }));
      let name = input.get('name') || id,
        shaderName = input.get('shader') || 'SceneLayout',
        geomPath = input.getFilePath('geometry'),
        visible = input.get('visible'),
        transparent = input.get('transparent'),
        depthWrite = input.get('depthWrite'),
        depthTest = input.get('depthTest'),
        occlusionCulling = input.get('occlusionCulling'),
        billboard = input.get('billboard'),
        animates = input.get('animates'),
        doTween = input.get('tween'),
        renderOrder = input.getNumber('renderOrder'),
        blending = input.get('blending'),
        side = input.get('side'),
        physics = input.get('physics'),
        castShadow = input.get('castShadow'),
        receiveShadow = input.get('receiveShadow'),
        receiveLight = input.get('receiveLight'),
        ssReflections = input.get('ssgi');
      ssReflections && !ssReflectionsEnabled() && (ssReflections = false);
      appState &&
        ((appState.scene = _name),
        self.bindState(appState, 'sortIndex', async (index) => {
          if ((mesh || (await self.wait((_) => mesh)), appState.parent)) {
            let [fraction, groupSortIndex] = await _stateData.calculateRenderFraction(id),
              renderOrder = self.baseRenderOrder + groupSortIndex + fraction;
            input.setValue('renderOrder', renderOrder - self.baseRenderOrder);
            mesh.renderOrder = renderOrder;
            mesh.classRef?.setRenderOrder && mesh.classRef.setRenderOrder(renderOrder);
          } else {
            let renderOrder = self.baseRenderOrder + index;
            input.setValue('renderOrder', renderOrder - self.baseRenderOrder);
            input.setValue('sortIndex', index);
            mesh.renderOrder = renderOrder;
            mesh.classRef?.setRenderOrder && mesh.classRef.setRenderOrder(renderOrder);
          }
        }));
      let breakpoints = input.get('breakpoints');
      breakpoints && (breakpoints = breakpoints.replace(/ /g, '').split(','));
      let breakpoint = breakpoints && _breakpoint ? '-' + _breakpoint : '';
      '-' == breakpoint.charAt(breakpoint.length - 1) && (breakpoint = '');
      name && group && group.setLabel(name);
      groupName && input.setValue('group', groupName);
      let groupParent = getGroup(input.get('group'));
      if (group) {
        let groupName = input.get('group'),
          groupId = groupName ? `sl_${_name}_${graphGroupName || groupName}` : undefined;
        _graph && _graph.addLayer(group.id, name || id + '', groupId);
      }
      if ((_uil && _uil.add(group), 'ignore' == name)) return (created = true);
      let customClass = input.get('custom') || input.get('customClass'),
        scriptClass = input.get('script') || input.get('scriptClass'),
        customCompile;
      if (
        (shaderName.includes('|') && ([shaderName, customCompile] = shaderName.split('|')),
        (_exists[name] = customClass ? 'custom' : 'mesh'),
        customClass)
      ) {
        if (customClass === self.parent.constructor.name)
          return console.warn(`Tried to recursively initialize ${customClass}`);
        if (!window[customClass])
          return console.warn(`Tried to initialize ${customClass} but it doesn't  exist!`);
        let obj = self.initClass(window[customClass], input, group, id, null);
        if (
          ((mesh = obj.group),
          (obj.wildcard = input.get('wildcard')),
          (obj.animates = input.get('animates')),
          'boolean' == typeof visible && mesh && (mesh.visible = visible),
          (_custom[name] = obj),
          (_layers[name] = obj),
          appState &&
            self.bindState(appState, 'name', (name) => {
              _layers[name] = obj;
              _exists[name] = 'custom';
              for (let key in _layers)
                key != name &&
                  _layers[key] == _layers[name] &&
                  (delete _layers[key], delete _exists[key]);
            }),
          self.onCreateLayer)
        ) {
          let capture = (cb) => (self.delayedCall((_) => cb(obj, name), 32), true);
          if (true === self.onCreateLayer(name, group, capture)) return;
        }
        if (
          (obj.group &&
            (groupParent.add(obj.group),
            groupParent &&
              groupParent.fixStateBinding &&
              (appState.parent = groupParent.fixStateBinding)),
          (obj.renderOrder = self.baseRenderOrder + renderOrder),
          mesh)
        ) {
          let meshUIL;
          obj.camera ||
            ((mesh.prefix = `Element_${id}_${_name}${breakpoint}`),
            (meshUIL = MeshUIL.add(mesh, group)),
            meshUIL.setLabel('Mesh'),
            UIL.global && (mesh._meshUIL = meshUIL));
          breakpoints && _breakpoints.push(mesh);
          scriptClass &&
            false !== visible &&
            (scriptClass.includes(',')
              ? ((scriptClass = scriptClass.replace(/ /g, '').split(',')),
                scriptClass.forEach((script) => {
                  window[script]
                    ? ((mesh.scriptClass = mesh.scriptClass || []),
                      mesh.scriptClass.push(
                        self.initClass(window[script], mesh, shader, group, input),
                      ))
                    : console.warn(`scriptClass ${script} not found`);
                }))
              : window[scriptClass]
                ? (mesh.scriptClass = self.initClass(
                    window[scriptClass],
                    mesh,
                    shader,
                    group,
                    input,
                  ))
                : console.warn(`scriptClass ${scriptClass} not found`));
          UIL.global &&
            (mesh._sceneLayout = input._sceneLayout =
              {
                meshUIL: meshUIL,
                mesh: mesh,
                shader: shader,
                name: name,
                input: input,
              });
        }
        return ((created = true), input);
      }
      if (self.onCreateLayer) {
        let capture = (cb) => {
          let mesh = new Group();
          return (
            (mesh.prefix = `Element_${id}_${_name}${breakpoint}`),
            MeshUIL.add(mesh, group),
            (_meshes[name] = mesh),
            (_layers[name] = mesh),
            self.delayedCall((_) => cb(mesh, name), 32),
            (created = true),
            true
          );
        };
        if (true === self.onCreateLayer(name, group, capture)) return (created = true);
      }
      let geom = World.PLANE;
      geomPath &&
        geomPath.includes(['World', 'SceneLayout']) &&
        ((geom = eval(geomPath)), (geomPath = null));
      shaderName.includes('.shader') &&
        ((shader = await resolveShaderRef(shaderName, name)),
        shader || (shaderName = 'SceneLayout'));
      shader ||
        (shaderName.includes('PBR')
          ? (shader = self.initClass(PBRShader, shaderName, {
              unique: `Element_${id}_${_name}`,
            }))
          : ((shader = createShader(shaderName, input, {
              customCompile: customCompile,
              ssReflections: ssReflections,
            })),
            defer((_) => {
              for (let key in shader.uniforms) {
                let uniform = shader.uniforms[key];
                uniform && uniform.value instanceof Texture && initialize(uniform.value.promise);
              }
            })));
      'boolean' == typeof depthWrite && (shader.depthWrite = depthWrite);
      'boolean' == typeof depthTest && (shader.depthTest = depthTest);
      'boolean' == typeof transparent && (shader.transparent = transparent);
      ssReflections && generateScreenSpaceReflectionsPanel(shader);
      self.onCreateGeometry && (geomPath = self.onCreateGeometry(geomPath, input.get('wildcard')));
      let gltfNodes = null;
      if (geomPath)
        if (String(geomPath).indexOf('.glb') > 0 || String(geomPath).indexOf('.gltf') > 0) {
          let loader = new GLTFLoader();
          gltfNodes = await loader.parse(geomPath, self, name);
          geom = new PlaneGeometry(0, 0);
        } else geom = await GeomThread.loadGeometry(geomPath);
      if (
        ((mesh = new Mesh(geom, shader)),
        'boolean' == typeof occlusionCulling && (mesh.occlusionCulled = occlusionCulling),
        gltfNodes)
      )
        for (let i = 0; i < gltfNodes.length; i++) mesh.add(gltfNodes[i]);
      'boolean' == typeof _options.frustumCulled && (mesh.frustumCulled = _options.frustumCulled);
      'boolean' == typeof visible && (mesh.visible = visible);
      groupParent.add(mesh);
      groupParent.fixStateBinding && (appState.parent = groupParent.fixStateBinding);
      mesh.prefix = `Element_${id}_${_name}${breakpoint}`;
      mesh.uilName = name;
      mesh.uilGroup = group;
      mesh.uilGraph = _graph;
      mesh.wildcard = input.get('wildcard');
      mesh.animates = input.get('animates');
      let meshUIL = MeshUIL.add(mesh, group);
      if ((meshUIL.setLabel('Mesh'), UIL.global && (mesh._meshUIL = meshUIL), physics)) {
        let path = input.getFilePath('physicsBounds'),
          obj;
        if (path) {
          const shapes = await PhysicsBounds.parsePhysicsBoundsShapes(Assets.getPath(path));
          shapes && (obj = Physics.instance().createFromShapes(shapes, {}, mesh));
        }
        obj || (obj = Physics.instance().create(mesh));
        obj.prefix = `Physics_${id}_${_name}`;
        PhysicsUIL.add(obj, group).setLabel('Physics');
        let physicsCodeClassName = input.get('physicsCode'),
          physicsCodeClass;
        physicsCodeClassName &&
          ((physicsCodeClass = window[physicsCodeClassName]),
          physicsCodeClass || console.warn(`physicsCode class ${physicsCodeClassName} not found`));
        physicsCodeClass && self.initClass(physicsCodeClass, obj, mesh, group, input);
      }
      if (
        ((_meshes[name] = mesh),
        (_layers[name] = mesh),
        appState &&
          self.bindState(appState, 'name', (name) => {
            _layers[name] = mesh;
            _exists[name] = customClass ? 'custom' : mesh;
            for (let key in _layers)
              key != name &&
                _layers[key] == _layers[name] &&
                (delete _layers[key], delete _exists[key]);
          }),
        breakpoints && _breakpoints.push(mesh),
        (mesh.renderOrder = self.baseRenderOrder + (renderOrder || 0)),
        billboard && updateBillboard(true, mesh),
        'SceneLayout' != shaderName &&
          window[shaderName] &&
          (mesh.shaderClass = self.initClass(window[shaderName], mesh, shader, group, input)),
        shader._copied ||
          (shader !== mesh.shader && !shaderName.includes('PBR')) ||
          ShaderUIL.add(shader, group).setLabel('Shader'),
        shader._copied &&
          shader._copied.shaderClass &&
          shader._copied.shaderClass.applyClone &&
          shader._copied.shaderClass.applyClone(mesh),
        'number' != typeof index && _dataStore.setValue('data', JSON.stringify(_data)),
        blending && (shader.blending = blending),
        side && (shader.side = side),
        castShadow && (mesh.castShadow = castShadow),
        (receiveShadow = receiveShadow || Shader.shouldReceiveShadow(shader)),
        receiveShadow && (shader.receiveShadow = receiveShadow),
        receiveLight && (shader.receiveLight = receiveLight),
        scriptClass &&
          (scriptClass.includes(',')
            ? ((scriptClass = scriptClass.replace(/ /g, '').split(',')),
              scriptClass.forEach((script) => {
                window[script]
                  ? ((mesh.scriptClass = mesh.scriptClass || []),
                    mesh.scriptClass.push(
                      self.initClass(window[script], mesh, shader, group, input),
                    ))
                  : console.warn(`scriptClass ${script} not found`);
              }))
            : window[scriptClass]
              ? (mesh.scriptClass = self.initClass(window[scriptClass], mesh, shader, group, input))
              : console.warn(`scriptClass ${scriptClass} not found`)),
        (input.onUpdate = (key) => {
          switch (key) {
            case 'name':
              break;
            case 'visible':
              mesh.visible = input.get(key);
              break;
            case 'renderOrder':
              mesh.renderOrder = self.baseRenderOrder + input.getNumber(key);
              break;
            case 'transparent':
              shader.transparent = input.get(key);
              break;
            case 'depthWrite':
              shader.depthWrite = input.get(key);
              break;
            case 'depthTest':
              shader.depthTest = input.get(key);
              break;
            case 'side':
              shader.side = input.get(key);
              break;
            case 'blending':
              shader.blending = input.get(key);
              break;
            case 'geometry':
              updateGeometry(input.getFilePath(key), mesh);
              break;
            case 'shader':
              updateShader(input.get(key), mesh, group, input);
              break;
            case 'scriptClass':
              updateScriptClass(input.get(key), mesh, group, input);
              break;
            case 'receiveShadow':
              updateShadow(input.get(key), mesh);
              break;
            case 'receiveLight':
              updateLighting(input.get(key), mesh);
              break;
            case 'billboard':
              updateBillboard(input.get(key), mesh);
          }
          UIL.global &&
            ((World.SCENE.displayNeedsUpdate = true),
            window?.view?.scene && (view.scene.displayNeedsUpdate = true));
        }),
        Hydra.LOCAL && Global.PLAYGROUND)
      ) {
        self.events.sub(SceneLayout.HOTLOAD_GEOMETRY, ({ file: file }) => {
          mesh.geometry?._src?.includes(file) && updateGeometry(file, mesh);
        });
        const scriptClassNeedsUpdate = (inst, file) => (
          inst.__cacheName || (inst.__cacheName = Utils.getConstructorName(inst)),
          !!file.includes(inst.__cacheName) && inst.__cacheName
        );
        self.events.sub(SceneLayout.HOTLOAD_SCRIPT, ({ file: file }) => {
          if (
            (file.includes(mesh.shader?.vsName) &&
              ((shader.hotReloading = true),
              'SceneLayout' !== shaderName &&
                window[shaderName] &&
                (mesh.shaderClass = self.initClass(window[shaderName], mesh, shader, group, input)),
              group.remove(shader.UILPrefix),
              delete ShaderUIL.exists[shader.UILPrefix],
              ShaderUIL.add(shader, group).setLabel('Shader'),
              (shader.hotReloading = false)),
            mesh.scriptClass)
          )
            if (Array.isArray(mesh.scriptClass))
              mesh.scriptClass.every((inst, index) => {
                let name = scriptClassNeedsUpdate(inst, file);
                return (
                  !name ||
                  (mesh.scriptClass.remove(inst),
                  updateScriptClass(name, mesh, group, input),
                  false)
                );
              });
            else {
              let name = scriptClassNeedsUpdate(mesh.scriptClass, file);
              name && updateScriptClass(name, mesh, group, input);
            }
        });
      }
      return (
        UIL.global &&
          (mesh._sceneLayout = input._sceneLayout =
            {
              meshUIL: meshUIL,
              mesh: mesh,
              input: input,
              name: name,
              get shaderUIL() {
                return this.mesh.shader.shaderUIL;
              },
            }),
        (created = true),
        returnName ? name : input
      );
    }
    async function updateGeometry(geomPath, mesh) {
      let geom = World.PLANE;
      geomPath && geomPath.includes(['World', 'SceneLayout'])
        ? ((geom = eval(geomPath)), (geomPath = null))
        : geomPath && (geom = await GeomThread.loadGeometry(geomPath + '?' + Utils.timestamp()));
      mesh.geometry = geom;
    }
    async function resolveShaderRef(shaderName, layerName) {
      let shaderLayer = shaderName.split('.shader')[0],
        promise = self.getLayer(shaderLayer);
      Hydra.LOCAL &&
        (promise = Promise.race([
          promise,
          (async () => {
            await self.loadedAllLayers();
          })(),
        ]));
      let layer = await promise;
      if (layer) {
        let shader = layer.shader;
        return ((shader._copied = layer), shader);
      }
      Hydra.LOCAL &&
        console.error(
          `Couldn’t find shader “${shaderName}” for layer “${layerName}” in SceneLayout “${_name}”, because layer “${shaderLayer}” doesn't exist`,
        );
    }
    async function updateShader(shaderName = '', mesh, group, input) {
      let shader;
      shaderName.includes('.shader') &&
        ((shader = await resolveShaderRef(shaderName, mesh.uilName)),
        shader || (shaderName = 'SceneLayout'));
      shader ||
        (shader = shaderName.includes('PBR')
          ? self.initClass(PBRShader, shaderName, {
              unique: `Element_${input.id}_${_name}`,
            })
          : createShader(shaderName, input));
      group.remove(mesh.shader.UILPrefix);
      for (let key in mesh.shader.uniforms) {
        if ('t' === mesh.shader.uniforms[key].type)
          try {
            mesh.shader.shaderUIL.copyTexture(key, shader);
          } catch (e) {
            console.error(e);
          }
      }
      mesh.shader = shader;
      'SceneLayout' !== shaderName &&
        window[shaderName] &&
        (mesh.shaderClass = self.initClass(window[shaderName], mesh, shader, group, input));
      ShaderUIL.add(shader, group).setLabel('Shader');
    }
    function updateLighting(bool, mesh) {
      mesh.shader.customCompile = Utils.uuid();
      mesh.shader.receiveLight = bool;
      mesh.shader.resetProgram();
      mesh.shader.upload();
    }
    function updateShadow(bool, mesh) {
      mesh.shader.customCompile = Utils.uuid();
      mesh.shader.receiveShadow = bool;
      mesh.shader.resetProgram();
      mesh.shader.upload();
    }
    function updateBillboard(bool, mesh) {
      bool
        ? ((mesh._billboardLoop = (_) => Utils3D.billboard(mesh)),
          self.startRender(mesh._billboardLoop))
        : (mesh.rotation.set(0, 0, 0), self.stopRender(mesh._billboardLoop));
    }
    function updateScriptClass(scriptClass, mesh, group, input) {
      scriptClass &&
        (scriptClass.includes(',')
          ? (scriptClass = scriptClass.replace(/ /g, '').split(',')).forEach((script) => {
              window[script]
                ? ((mesh.scriptClass = mesh.scriptClass || []),
                  mesh.scriptClass.push(
                    self.initClass(window[script], mesh, mesh.shader, group, input),
                  ))
                : console.warn(`scriptClass ${script} not found`);
            })
          : window[scriptClass]
            ? (mesh.scriptClass = self.initClass(
                window[scriptClass],
                mesh,
                mesh.shader,
                group,
                input,
              ))
            : console.warn(`scriptClass ${scriptClass} not found`));
    }
    function addListeners() {
      self.events.sub(SceneLayout.BREAKPOINT, (e) =>
        self.localBreakpoint ? null : setBreakpoint(e),
      );
    }
    function setBreakpoint({ value: value }) {
      value != _breakpoint &&
        ((_breakpoint = value),
        _breakpoints.forEach((mesh) => {
          if (!mesh.prefix) return;
          mesh.prefix = mesh.prefix.split('-')[0] + '-' + _breakpoint;
          '-' == mesh.prefix.charAt(mesh.prefix.length - 1) &&
            (mesh.prefix = mesh.prefix.slice(0, -1));
          let meshUIL = new MeshUILConfig(mesh);
          UIL.global && (mesh._meshUIL = meshUIL);
        }));
    }
    async function ready() {
      await self.wait(self, 'loaded');
      UIL.sidebar && UIL.sidebar.toolbar.hideAll();
    }
    function copyFolderProps(from, to) {
      let mesh, params, shader;
      to.forEachFolder((child) => {
        switch (child.label) {
          case 'Parameters':
            params = child;
            break;
          case 'Mesh':
            mesh = child;
            break;
          case 'Shader':
            shader = child;
        }
      });
      let allowed = ['Parameters', 'Mesh', 'Shader'];
      from.forEachFolder((child) => {
        if (!(allowed.indexOf(child.label) < 0))
          switch ((child.toClipboard(), child.label)) {
            case 'Parameters':
              params.fromClipboard();
              break;
            case 'Mesh':
              mesh.fromClipboard();
              break;
            case 'Shader':
              shader.fromClipboard();
          }
      });
    }
    this.isSceneLayout = true;
    this.name = _name;
    (async function () {
      window.Physics && (_options.physics = true);
      self.group.sceneLayout = self;
      await initialize(defer());
      SceneLayout.getTexture || (SceneLayout.getTexture = Utils3D.getTexture);
      initGraph();
      initParams();
      initialize(initConfig());
      initData();
      addListeners();
      ready();
      UIL.global && initGizmo();
    })();
    this.ready = async function (early) {
      if ((await self.wait(self, 'loaded'), await self.wait(self, 'configured'), early))
        return true;
      await defer();
      await defer();
    };
    this.getLayer = async function (name) {
      let timer;
      return (
        Hydra.LOCAL &&
          (timer = self.delayedCall((_) => {
            _exists[name] || console.warn(`${name} doesn't exist in SceneLayout ${_name}`);
          }, 1e3)),
        await self.wait(_layers, name),
        timer && clearTimeout(timer),
        _layers[name]
      );
    };
    this.getLayers = async function () {
      let array = [];
      for (let i = 0; i < arguments.length; i++) array.push(self.getLayer(arguments[i]));
      return Promise.all(array);
    };
    this.getAllLayers = async function () {
      return (await this.ready(), await this.loadedAllLayers(), _layers);
    };
    this.getAllMatching = async function (label) {
      let layers = await self.getAllLayers(),
        array = [];
      for (let key in layers)
        key.includes(label) && ((layers[key].layerName = key), array.push(layers[key]));
      return array;
    };
    this.exists = function (name) {
      return _exists[name];
    };
    this._createLayer = function (parentId, returnName = false) {
      return createLayer(null, parentId, returnName);
    };
    this._createGroup = function () {
      return (getGroup(`group_${_groupIndex}`), _groupIndex);
    };
    this._deleteGroup = function () {};
    this._getGroup = function (name, index) {
      return getGroup(name, index);
    };
    this._rename = function (id, name, value) {
      let folder = _folders[id] || _folders[`sl_${_name}_${id}`];
      folder &&
        (folder.setLabel(value),
        folder.params && folder.params.setValue('name', value),
        [_groups, _custom, _meshes, _exists, _layers].forEach(function (store) {
          store[name] && ((store[value] = store[name]), (store[name] = null), delete store[name]);
        }));
    };
    this._deleteLayer = function (id, name, coded) {
      id.includes('_') && (id = (id = id.split('_'))[id.length - 1]);
      let folder = _folders[id] || _folders[`sl_${_name}_${id}`],
        layer = _layers[id] || _layers[name];
      return layer && layer.isGroup && layer.length > 1
        ? (alert("Can't delete a group that has nested layers."), false)
        : !(!coded && !confirm('Are you sure you want to delete this layer?')) &&
            (layer && layer._parent && (layer._parent.remove(layer), (layer._parent = null)),
            folder && folder.parent && folder.parent.remove(folder),
            UILStorage.set(`sl_${_name}_${id}_deleted`, true),
            true);
    };
    this._changeParent = function (childId, childName, parentId, parentName) {
      let child = _layers[childId] || _layers[childName],
        parent = _layers[parentId] || _layers[parentName] || self;
      if (!child) return;
      let folder = _folders[childId] || _folders[`sl_${_name}_${childName}`];
      folder && folder.params && folder.params.setValue('group', parentName || null);
      let parentObject = parent.group || parent,
        childObject = child.group || child;
      parentObject.isObject3D && childObject.isObject3D && parentObject.add(childObject);
      child.updateMatrix && child.updateMatrix();
    };
    this._visible = function (name, visible) {
      let mesh = _layers[name];
      mesh && (mesh.group && (mesh = mesh.group), (mesh.visible = visible));
    };
    this._focus = function (name) {
      UIL.sidebar.toolbar.filterSingle(name);
    };
    this._blur = function (name) {
      let folder = _folders[name] || _folders[`sl_${_name}_${name}`];
      folder && folder.forEachFolder && (folder.forEachFolder((f) => f.close()), folder.close());
    };
    this._sort = function (order) {
      order.forEach((label, index) => {
        label.children &&
          label.children.forEach(function (child, j, all) {
            let folder = _folders[child];
            if (!folder || !folder.params) return;
            let renderOrder = self.baseRenderOrder + index + (j + 1) / (all.length + 1);
            folder.params.setValue('renderOrder', renderOrder - self.baseRenderOrder);
            let mesh = _layers[child] || _layers[folder.label];
            mesh && (mesh.renderOrder = renderOrder);
          });
        let folder = _folders[label];
        if (!folder || !folder.params) return;
        let renderOrder = self.baseRenderOrder + index;
        folder.params.setValue('renderOrder', renderOrder - self.baseRenderOrder);
        let mesh = _layers[label] || _layers[folder.label];
        mesh && (mesh.renderOrder = renderOrder);
      });
    };
    this._duplicateLayer = function (id, parentId) {
      let folder = _folders[id] || _folders[`sl_${_name}_${id}`];
      if (!folder) return;
      createLayer(null, parentId);
      let copyShader,
        copy = Object.values(_folders).last();
      folder.forEachControl((input) => {
        'shader' === input.label && (copyShader = input.value);
      });
      copyShader &&
        (console.log(copyShader),
        copy.forEachControl((input) => {
          'shader' === input.label && input.force(copyShader);
        }));
      copyFolderProps(folder, copy);
    };
    this._duplicateGroup = function (id, children) {
      let folder = _folders[id] || _folders[`sl_${_name}_${id}`];
      if (!folder) return;
      let copyId = `group_${_groupIndex + 1}`;
      getGroup(copyId);
      copyFolderProps(folder, Object.values(_folders).last());
      children.forEach((childId) => {
        self._duplicateLayer(childId, copyId);
      });
    };
    this._getCinemaConfig = async function () {
      let _cinemaConfig = _config.get('Cinema Config').replace('.json', '');
      return await get(Assets.getPath(`assets/geometry/${_cinemaConfig}.json`));
    };
    this._applyCinemaConfig = function (id, params) {
      let folder = _folders[id] || _folders[`sl_${_name}_${id}`];
      if (!folder) return;
      let mesh = folder.getAll().filter((sub) => 'Mesh' == sub.label)[0];
      if (
        (params.geometry &&
          folder.params.setValue('geometry', params.geometry.replace('assets/geometry/', '')),
        ['position', 'quaternion', 'scale'].forEach((transform) => {
          if (params[transform]) {
            let value = JSON.parse(params[transform]);
            if ('quaternion' == transform) {
              let quat = new Quaternion().fromArray(value);
              value = new Euler()
                .setFromQuaternion(quat)
                .toArray()
                .slice(0, 3)
                .map((angle) => (180 * angle) / Math.PI);
              transform = 'rotation';
            }
            mesh
              .getAll()
              .filter((control) => control.label == transform)[0]
              .force(value);
          }
        }),
        params.visible &&
          'false' === params.visible &&
          !params.geometry &&
          (folder.params.setValue('geometry', 'World.PLANE'),
          folder.params.setValue('side', 'shader_double_side'),
          !Global.PLAYGROUND))
      ) {
        _meshes[folder.params.get('name')].shader.neverRender = true;
      }
      params.shader && folder.params.setValue('shader', params.shader);
    };
    this.loadedAllLayers = async function () {
      return (await self.ready(), Promise.catchAll(_promises));
    };
    this.set('breakpoint', (value) => {
      self.localBreakpoint = true;
      setBreakpoint({
        value: value,
      });
    });
    this.get('breakpoint', (_) => _breakpoint);
    this.get('layers', (_) => _layers);
    this.get('layerCount', (_) => _data.layers);
    this.onDestroy = function () {
      _graph?.destroy?.();
      self.textures &&
        !_options.persistTextures &&
        self.textures.forEach((t) => {
          t.destroy && t.destroy();
        });
    };
    this.addInitializer = function (callback) {
      _initializers.push(callback);
    };
    this._completeInitialization = async function (sync) {
      if (!_initializers.length) return true;
      for (let i = 0; i < _initializers.length; i++) await _initializers[i](sync);
      _initializers.length = 0;
    };
  },
  (_) => {
    SceneLayout.BREAKPOINT = 'sl_breakpoint';
    SceneLayout.HOTLOAD_GEOMETRY = 'sl_hotload_geom';
    SceneLayout.HOTLOAD_SCRIPT = 'sl_hotload_script';
    SceneLayout.setBreakpoint = function (value) {
      SceneLayout.breakpoint !== value &&
        ((SceneLayout.breakpoint = value),
        Events.emitter._fireEvent(SceneLayout.BREAKPOINT, {
          value: value,
        }));
    };
  },
);

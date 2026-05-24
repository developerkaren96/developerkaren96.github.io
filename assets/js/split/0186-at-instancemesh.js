/*
 * InstanceMesh — wraps a single mesh and turns it into N instanced
 * copies driven by a per-instance offset/orientation/scale file.
 *
 * The instance attribute file (`<path>.json` or `<path>.bin`) is
 * authored externally and contains a flat array of `offset` (vec3)
 * and optionally `orientation` (vec4 quaternion) and `scale` (vec3),
 * plus any additional named per-instance attributes.
 *
 * On creation:
 *   1. `InputUIL` panel exposes `json` (path), `test` (eval expression
 *      for tweaking maxInstancedCount), `dynamic` (mark as needing
 *      per-frame attribute updates).
 *   2. Source `_mesh` is hidden and replaced with a Group containing
 *      both an internal `_blankShader`-rendered Mesh per instance
 *      (purely for UIL hover/selection) and a `MeshBatch` that owns
 *      the GPU-side instanced draw.
 *   3. Binary (`.bin`) paths go through DracoThread for decode;
 *      JSON paths go through the per-thread `parseInstanceMesh`
 *      (registered on the static side below).
 *
 * Hot-reload (Hydra.LOCAL):
 *   - `initHotReload` watches `SceneLayout.HOTLOAD_GEOMETRY` so when
 *     the user edits either the underlying geometry or the instance
 *     file, the batch is rebuilt in place.
 *
 * UIL bridges:
 *   - `MeshUIL.UPDATE`         : applies position / rotation / scale
 *                                 edits to the live instance mesh.
 *   - `UILGraphNode.TOGGLE…`   : sync visibility of the parent UIL
 *                                 group to the batch.
 *   - `InputUIL.UPDATE`        : direct toggle from the input panel.
 *
 * `applyToShader(shader)` lets external code register additional
 * shaders against the same batch so they pick up the instance
 * attributes during compile.
 */
Class(
  function InstanceMesh(_mesh, _shader, _group, _input) {
    Inherit(this, Component);
    const self = this;
    var _config,
      _frustumCulled = false,
      _blankShader,
      _instanceGroup;
    function initHotReload() {
      _mesh.cacheGeom = _mesh.geometry.clone();
      self.events.sub(SceneLayout.HOTLOAD_GEOMETRY, ({ file: file }) => {
        _mesh.geometry?._src?.includes(file) &&
          GeomThread.loadGeometry(file).then((_) => {
            createInstanceMesh(_config.getFilePath('json'));
          });
        file.includes(_config.getFilePath('json')) &&
          createInstanceMesh(_config.getFilePath('json'));
      });
    }
    async function createInstanceMesh(file) {
      if (!file) return;
      let isBinary = file.includes('.bin'),
        data;
      file.includes('assets/geometry') || (file = `assets/geometry/${file}`);
      isBinary || file.includes('.json') || (file += '.json');
      _mesh.cacheGeom && (file += '?' + Utils.timestamp());
      _mesh.instanceMesh && (_mesh.instanceMesh.visible = false);
      isBinary
        ? (await GeomThread.loadDracoLib(),
          (data = await Thread.shared().loadDraco({
            type: 'decode',
            path: Thread.absolutePath(Assets.getPath(file)),
          })))
        : (data = await Thread.shared().parseInstanceMesh({
            url: Thread.absolutePath(Assets.getPath(file)),
          }));
      let isStatic = !_config.get('dynamic');
      if (
        ((self.batch = self.initClass(MeshBatch, {
          visibilityCheck: !isStatic,
        })),
        _mesh._parent.add(self.batch.group),
        (self.batch.static = isStatic),
        (self.batch.frustumCulled = _frustumCulled),
        (self.batch.onMeshCreated = (mesh) => {
          let geom = mesh.geometry;
          for (let key in data) {
            if (['_type', 'userData', 'offset', 'orientation', 'scale'].includes(key)) continue;
            let itemSize = data[`${key}ItemSize`];
            'number' == typeof itemSize &&
              geom.addAttribute(
                key,
                new GeometryAttribute(data[key], itemSize, 1, self.batch.useDynamic),
              );
          }
          let instances = [];
          for (let i = 0; i < count; i++) instances.push(i);
          geom.addAttribute('instance', new GeometryAttribute(new Float32Array(instances), 1, 1));
          _mesh.instanceMesh = mesh;
          mesh.position.copy(_mesh.position);
          mesh.quaternion.copy(_mesh.quaternion);
          mesh.scale.copy(_mesh.scale);
          mesh.geometry.maxInstancedCount = self.maxInstancedCount * self.instanceMultiplier;
          _mesh.instanceMeshReady.resolve();
        }),
        !data.offsetItemSize)
      )
        return;
      let count = data.offset.length / data.offsetItemSize;
      for (let i = 0; i < count; ++i) {
        let m = new Mesh(_mesh.cacheGeom || _mesh.geometry, _mesh.shader);
        m.position.fromArray(data.offset, i * data.offsetItemSize);
        data.orientation && m.quaternion.fromArray(data.orientation, i * data.orientationItemSize);
        data.scale && m.scale.fromArray(data.scale, i * data.scaleItemSize);
        m.renderOrder = _mesh.renderOrder;
        m.castShadow = _mesh.castShadow;
        m.frustumCulled = false;
        m.renderOrder = _mesh.renderOrder;
        m.castShadow = _mesh.castShadow;
        m.receiveLight = _mesh.receiveLight;
        m.shader.neverRender = false;
        self.batch.add(m);
        m.shader.neverRender = false;
        m.shader = _blankShader;
        _instanceGroup.add(m);
      }
      let test = _config.get('test');
      test && (self.instanceMultiplier = eval(test));
      undefined === self.maxInstancedCount && (self.maxInstancedCount = count);
      isStatic && (await self.batch.staticReady(), (_instanceGroup.matrixAutoUpdate = false));
    }
    function addHandlers() {
      self.events.sub(MeshUIL.UPDATE, handleMeshUpdate);
      Hydra.LOCAL &&
        UIL.global &&
        (self.events.sub(UILGraphNode.TOGGLE_VISIBILITY, handleToggleVisibility),
        self.events.sub(InputUIL.UPDATE, handleUILUpdate));
    }
    function handleMeshUpdate({ key: key, prefix: prefix, val: val }) {
      if (_mesh.instanceMesh && (prefix = prefix.substring(5)) === _mesh.prefix)
        switch (key) {
          case 'position':
            _mesh.instanceMesh.position.fromArray(val);
            break;
          case 'rotation':
            _mesh.instanceMesh.rotation.fromArray(val);
            break;
          case 'scale':
            _mesh.instanceMesh.scale.fromArray(val);
        }
    }
    function handleToggleVisibility({ id: id, visible: visible }) {
      self.batch && id === _mesh.uilGroup.id && (self.batch.group.visible = visible);
    }
    function handleUILUpdate(e) {
      self.batch &&
        e.group === _input &&
        'visible' === e.key &&
        (self.batch.group.visible = _input.get('visible'));
    }
    this.instanceMultiplier = 1;
    (_config = InputUIL.create('im_' + _input.prefix, _group)).addFile('json', {
      relative: 'assets/geometry',
    });
    _config.add('test');
    _config.addToggle('dynamic', false);
    _config.setLabel('Instance');
    false !== _input.get('visible') &&
      ((self._config = _config),
      ((_blankShader = Utils3D.getTestShader()).visible = false),
      ((_instanceGroup = new Group()).doNotProject = true),
      _mesh._parent.add(_instanceGroup),
      _mesh._parent.remove(_mesh),
      (_mesh.visible = false),
      (_mesh.instanceMeshReady = Promise.create()),
      (_mesh.instanceMeshBeforeReady = Promise.create()),
      createInstanceMesh(_config.getFilePath('json')),
      (_config.onUpdate = (_) => {
        createInstanceMesh(_config.getFilePath('json'));
      }),
      addHandlers(),
      Hydra.LOCAL && initHotReload());
    this.applyToShader = function (shader) {
      self.batch.applyToShader(shader);
    };
    this.get('frustumCulled', () => (self.batch ? self.batch.frustumCulled : _frustumCulled));
    this.set('frustumCulled', async (b) => {
      self.batch && (self.batch.frustumCulled = b);
      _frustumCulled = b;
    });
  },
  (_) => {
    Thread.upload(function parseInstanceMesh({ url: url }, id) {
      get(url).then((data) => {
        let bufferList = {},
          buffers = [];
        if (data.data && data.metadata?.type) {
          bufferList._type = data.metadata.type;
          let jsonData = data.data;
          for (let key in jsonData.attributes) {
            let attrib = jsonData.attributes[key];
            bufferList[key] = new Geometry.TYPED_ARRAYS[attrib.type](attrib.array);
            bufferList[`${key}ItemSize`] = attrib.itemSize;
            buffers.push(bufferList[key].buffer);
          }
        } else {
          bufferList._type = 'BufferGeometry';
          for (let key in data) {
            let attrib = data[key];
            bufferList[key] = new Float32Array(attrib.buffer);
            bufferList[`${key}ItemSize`] = attrib.components;
            buffers.push(bufferList[key].buffer);
          }
        }
        resolve(bufferList, id, buffers);
      });
    });
  },
);

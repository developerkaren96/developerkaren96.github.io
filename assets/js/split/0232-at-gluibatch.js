/*
 * GLUIBatch — collapses many `GLUIObject`s that share the same
 * underlying Shader into a single instanced draw call. Each member
 * object stops issuing its own draw (`shader.neverRender = true`)
 * and instead has its per-instance state (position, scale,
 * rotation, plus any scalar/vec2/vec3/vec4/color uniforms) packed
 * into instance attributes on a cloned Geometry.
 *
 * Constructor signature:
 *   - `globalUniforms` — extra uniforms merged into the batched
 *     Shader (or a `boolean` to set _useWorldCoords as the first
 *     positional arg — handled by the small reassignment line
 *     after `this.group = new Group()`).
 *   - `_useWorldCoords` — if true, the per-instance attributes
 *     track each child's world-space position/rotation/scale
 *     (recomputed every frame from `getWorldPosition`/etc.).
 *     If false, the local `group.position/rotation/scale` is used.
 *   - `cacheSuffix` — added to the shader cache key so the same
 *     underlying fsName can be batched with different uniform
 *     sets (e.g. two batches with different blend modes).
 *
 * Lifecycle:
 *   - `add(obj)` is debounced with a 50ms timeout: subsequent adds
 *     collapse into a single `createMesh()` call, so callers can
 *     push many objects synchronously without paying for repeated
 *     mesh rebuilds.
 *   - `createMesh()` is the heavy step:
 *       1. Reads the first child's Shader to detect which
 *          uniforms should become instance attributes (by type:
 *          Color → c/3, Vector4 → v4/4, Vector3 → v3/3, Vector2 →
 *          v/2, number → f/1).
 *       2. Pre-allocates per-instance "buffer" slots for the
 *          standard transform attributes (`scale`, `rotation`,
 *          `offset` — offset.z carries `mesh.renderOrder` so the
 *          GPU can do depth-style sorting).
 *       3. Builds GLSL attribute / varying declarations and patches
 *          them into the cached shader text, rewriting any
 *          fragment-shader uniforms (other than samplers) into
 *          varyings fed from instance attributes. Uses a marker
 *          string `//vdefines` for assignment insertion and
 *          `__ACTIVE_THEORY_LIGHTS__` as a split anchor (same
 *          marker pattern used by InstanceMesh/MeshBatch).
 *       4. Adds the instance attributes (`new GeometryAttribute(
 *          ..., components, /*meshPerVertex=* /1)`) onto a cloned
 *          Geometry via `instanceFrom`.
 *       5. Caches the patched Shader by `fsName + cacheSuffix` —
 *          subsequent batches with the same fragment shader reuse
 *          the compiled program.
 *       6. Replicates uniform references (`replicateUniformsTo`)
 *          so non-instanced uniforms still update.
 *
 * Per-frame `loop()`:
 *   - Walks up the group's parents; if any has `isRenderingCheck()`
 *     returning false (e.g. a culled subtree), skips the whole
 *     update — saves the per-instance dirty-check work.
 *   - For each member object:
 *       * Calls its `mesh.onBeforeRender` so its transform values
 *         are fresh.
 *       * If `_useWorldCoords`, refreshes worldPosition/Rotation/
 *         Scale from the mesh's matrixWorld.
 *       * Diffs `buffer.value` against `buffer.lookup` and, on
 *         change, writes the new value into the right slot of the
 *         instance attribute array and marks `needsUpdate`.
 *       * Same dirty-check for each pulled uniform.
 *
 * Public:
 *   - `add(obj)`   — schedule into the batch.
 *   - `setZ(z)`    — set render order once the mesh exists.
 *   - `onDestroy`  — cleans up the merged mesh.
 *   - `group`      — parent Group; consumers add this to the scene.
 *
 * Cache:
 *   - `GLUIBatch.cache` is the per-shader cache, keyed by
 *     `fsName + cacheSuffix`.
 */
Class(function GLUIBatch(globalUniforms = {}, _useWorldCoords, cacheSuffix = '') {
  Inherit(this, Component);
  const self = this;
  var _timer,
    _geometry,
    _shader,
    _objects = [];
  function loop() {
    if (!_geometry) return;
    let parent = self.group._parent;
    for (; parent; ) {
      if (parent.isRenderingCheck && !parent.isRenderingCheck()) return;
      parent = parent._parent;
    }
    let len = _objects.length;
    for (let i = 0; i < len; i++) {
      let obj = _objects[i];
      if (obj._buffers) {
        obj.mesh.onBeforeRender();
        _useWorldCoords &&
          (obj.group.updateMatrixWorld(),
          obj.mesh.getWorldPosition(obj.worldPosition),
          obj.worldRotation.setFromQuaternion(obj.mesh.getWorldQuaternion()),
          obj.mesh.getWorldScale(obj.worldScale));
        for (let j = obj._buffers.length - 1; j > -1; j--) {
          let buffer = obj._buffers[j],
            dirty = false;
          if (
            ((dirty = !buffer.value.equals(buffer.lookup)), buffer.value.copy(buffer.lookup), dirty)
          ) {
            let attribute = _geometry.attributes[buffer.key],
              array = attribute.array;
            switch (buffer.key) {
              case 'scale':
                _useWorldCoords
                  ? ((array[2 * i + 0] = obj.worldScale.x), (array[2 * i + 1] = obj.worldScale.y))
                  : ((array[2 * i + 0] = obj.group.scale.x * obj.mesh.scale.x),
                    (array[2 * i + 1] = obj.group.scale.y * obj.mesh.scale.y));
                break;
              case 'rotation':
                array[i] = buffer.lookup.z;
                break;
              default:
                _useWorldCoords
                  ? ((array[3 * i + 0] = obj.worldPosition.x),
                    (array[3 * i + 1] = obj.worldPosition.y))
                  : ((array[3 * i + 0] = obj.group.position.x),
                    (array[3 * i + 1] = obj.group.position.y));
                array[3 * i + 2] = obj.mesh.renderOrder;
            }
            attribute.needsUpdate = true;
          }
        }
        for (let j = obj._uniforms.length - 1; j > -1; j--) {
          let uniform = obj._uniforms[j],
            dirty = false;
          if (
            ('f' == uniform.type
              ? ((dirty = obj.mesh.shader.uniforms[uniform.key].value != uniform.value),
                (uniform.value = obj.mesh.shader.uniforms[uniform.key].value))
              : ((dirty = !obj.mesh.shader.uniforms[uniform.key].value.equals(uniform.value)),
                uniform.value.copy(obj.mesh.shader.uniforms[uniform.key].value)),
            dirty)
          ) {
            let attribute = _geometry.attributes['a_' + uniform.key],
              array = attribute.array;
            'f' == uniform.type
              ? (array[i] = uniform.value)
              : uniform.value.toArray(array, i * uniform.components);
            attribute.needsUpdate = true;
          }
        }
      }
    }
  }
  function getTypeFromSize(size) {
    switch (size) {
      case 1:
        return 'float';
      case 2:
        return 'vec2';
      case 3:
        return 'vec3';
      case 4:
        return 'vec4';
    }
  }
  function createMesh() {
    let shader = _objects[0].mesh.shader;
    _geometry = new Geometry().instanceFrom(_objects[0].mesh.geometry.clone());
    let map = {},
      arrays = {};
    _objects.forEach((obj, i) => {
      obj.mesh.onBeforeRender();
      let buffers = [],
        uniforms = [];
      for (let key in shader.uniforms) {
        let uniform = shader.uniforms[key];
        uniform &&
          (uniform.value instanceof Color &&
            uniforms.push({
              key: key,
              type: 'c',
              components: 3,
            }),
          uniform.value instanceof Vector4 &&
            uniforms.push({
              key: key,
              type: 'v4',
              components: 4,
            }),
          uniform.value instanceof Vector3 &&
            uniforms.push({
              key: key,
              type: 'v3',
              components: 3,
            }),
          uniform.value instanceof Vector2 &&
            uniforms.push({
              key: key,
              type: 'v',
              components: 2,
            }),
          'number' == typeof uniform.value &&
            uniforms.push({
              key: key,
              type: 'f',
              components: 1,
            }));
      }
      _useWorldCoords &&
        ((obj.worldScale = new Vector3()),
        (obj.worldRotation = new Euler()),
        (obj.worldPosition = new Vector3()));
      buffers.push({
        key: 'scale',
        lookup: _useWorldCoords ? obj.worldScale : obj.group.scale,
        components: 2,
      });
      buffers.push({
        key: 'rotation',
        lookup: _useWorldCoords ? obj.worldRotation : obj.group.rotation,
        components: 1,
      });
      buffers.push({
        key: 'offset',
        lookup: _useWorldCoords ? obj.worldPosition : obj.group.position,
        components: 3,
      });
      uniforms.forEach((uniform) => {
        arrays['a_' + uniform.key] || (arrays['a_' + uniform.key] = []);
        map['a_' + uniform.key] || (map['a_' + uniform.key] = uniform);
        let value = shader.uniforms[uniform.key].value;
        'object' == typeof value
          ? ((uniform.value = value.clone()),
            uniform.value.toArray(arrays['a_' + uniform.key], i * uniform.components))
          : ((uniform.value = shader.uniforms[uniform.key].value),
            arrays['a_' + uniform.key].push(uniform.value));
      });
      buffers.forEach((buffer) => {
        switch (
          (arrays[buffer.key] || (arrays[buffer.key] = []),
          map[buffer.key] || (map[buffer.key] = buffer),
          (buffer.value = buffer.lookup.clone()),
          buffer.key)
        ) {
          case 'scale':
            arrays[buffer.key].push(
              obj.group.scale.x * obj.mesh.scale.x,
              obj.group.scale.y * obj.mesh.scale.y,
            );
            break;
          case 'rotation':
            arrays[buffer.key].push(buffer.lookup.z);
            break;
          default:
            arrays[buffer.key].push(buffer.lookup.x, buffer.lookup.y, obj.mesh.renderOrder);
        }
      });
      obj._buffers = buffers;
      obj._uniforms = uniforms;
      obj.shader.neverRender = true;
    });
    let attributes = [],
      defines = [];
    for (let key in map)
      key.includes('a_') &&
        (attributes.push(`% ${getTypeFromSize(map[key].components)} ${key};`),
        defines.push(`${key.replace('a_', 'v_')} = ${key};`));
    attributes = attributes.join('\n');
    defines = defines.join('\n');
    for (let key in arrays)
      _geometry.addAttribute(
        key,
        new GeometryAttribute(new Float32Array(arrays[key]), map[key].components, 1),
      );
    let cacheKey = shader.fsName + cacheSuffix;
    if (GLUIBatch.cache[cacheKey]) _shader = GLUIBatch.cache[cacheKey];
    else {
      (_shader = self.initClass(
        Shader,
        'GLUIBatch',
        shader.fsName,
        Object.assign(
          {},
          {
            transparent: true,
            depthWrite: false,
            depthTest: false,
            customCompile: Utils.uuid(),
          },
          globalUniforms,
        ),
      )).vertexShader || _shader.resetProgram();
      let vsSplit = _shader.vertexShader.split('__ACTIVE_THEORY_LIGHTS__'),
        fsSplit = _shader.fragmentShader.split('__ACTIVE_THEORY_LIGHTS__'),
        definitions = [];
      fsSplit[1].split('\n').forEach((line) => {
        if (line.includes('uniform')) {
          if (line.includes('sampler2D')) return;
          let data = line.split(' ');
          definitions.push(`${data[2].replace(';', '')} = a_${data[2]}`);
          vsSplit[1] =
            `\nattribute ${data[1]} a_${data[2]}\nvarying ${data[1]} ${data[2]}` + vsSplit[1];
          vsSplit[1] = vsSplit[1].replace(line, '');
          fsSplit[1] = fsSplit[1].replace(line, `varying ${data[1]} ${data[2]}`);
        }
      });
      vsSplit[1] = vsSplit[1].replace('//vdefines', '\n' + definitions.join('\n'));
      _shader.vertexShader = vsSplit.join('__ACTIVE_THEORY_LIGHTS__');
      _shader.fragmentShader = fsSplit.join('__ACTIVE_THEORY_LIGHTS__');
      GLUIBatch.cache[cacheKey] = _shader;
    }
    shader.replicateUniformsTo(_shader);
    self.mesh = new Mesh(_geometry, _shader);
    self.mesh.frustumCulled = false;
    self.group.add(self.mesh);
  }
  this.group = new Group();
  'boolean' == typeof globalUniforms && ((_useWorldCoords = globalUniforms), (globalUniforms = {}));
  GLUIBatch.cache || (GLUIBatch.cache = {});
  self.startRender(loop);
  this.add = function (obj) {
    if ((clearTimeout(_timer), (_timer = self.delayedCall(createMesh, 50)), _useWorldCoords)) {
      let getAlpha = obj.getAlpha;
      getAlpha &&
        (obj.getAlpha = () => (self.parent ? self.parent.getAlpha() : 1) * getAlpha.call(obj));
    } else self.parent?.add?.(obj);
    _objects.push(obj);
  };
  this.setZ = async function (z) {
    await self.wait('mesh');
    self.mesh.renderOrder = z;
  };
  this.onDestroy = function () {
    self.mesh && self.mesh.destroy();
  };
});

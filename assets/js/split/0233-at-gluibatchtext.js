/*
 * GLUIBatchText — text-specialised sibling of GLUIBatch (0232).
 * Whereas GLUIBatch collapses many single-quad GLUIObjects into
 * one instanced draw, GLUIBatchText concatenates many GLText
 * meshes (each one a strip of N glyph quads) into a single
 * non-instanced merged Geometry. Per-instance state is fanned out
 * across the N glyph vertices of each child, indexed by
 * `[obj._offset … obj._offset + obj._count)` so a per-child
 * transform/uniform tweak only touches that contiguous slice.
 *
 * Why two classes:
 *   - GLUIBatch: instanced rendering — one base quad, N instances.
 *   - GLUIBatchText: merged rendering — N glyph strips appended
 *     into one big geometry, walked with `updateRange` per attribute
 *     so GL can re-upload only the dirty slice rather than the
 *     whole buffer.
 *
 * Constructor:
 *   - `globalUniforms` — uniform overrides merged into the batched
 *     Shader (also accepts a boolean to set _useWorldCoords).
 *   - `_useWorldCoords` — see GLUIBatch.
 *   - `_shaderName` — optional override for the source GLSL pair
 *     (default uses the first child's shader names).
 *
 * `add(obj)` flow (gated by the `canLoad` flag so concurrent adds
 * serialise cleanly):
 *   1. Wait for the new GLText's `loaded()` to resolve.
 *   2. Mark its private mesh as `neverRender = true`.
 *   3. Detect which uniforms should become per-glyph attributes
 *      (same type table as GLUIBatch). Allocate Float32 buffers
 *      sized `count * components` for each, pre-filled with the
 *      child's current values.
 *   4. Push the child's offset/scale/rotation as standard
 *      attributes.
 *   5. Either `_geometry.merge(obj.mesh.geometry)` (subsequent
 *      adds) or `initGeometry(mesh)` (first add):
 *      `initGeometry` clones the first geometry, builds the batched
 *      Shader (cache key `${vsName}|${fsName}|instance`), and
 *      patches the GLSL the same way GLUIBatch does. Additionally,
 *      if the base vertex shader contains a `//start batch main`
 *      block, that block replaces the default `//custommain` body
 *      and the surrounding "before main" preamble is merged in
 *      (sans the per-text `tMap`/`vUv` declarations that the
 *      batched shader already provides) — this lets text-specific
 *      vertex math (e.g. SDF kerning fixups) survive the batch.
 *   6. Schedule (debounced 50ms) `createMesh` which finally builds
 *      the actual `Mesh`.
 *
 * Per-frame `loop()`:
 *   - Clears every attribute's `updateRange` array.
 *   - For every member, refreshes world transforms (if requested)
 *     and dirty-diffs each buffer/uniform. On change, writes the
 *     new value across the child's `[offset, offset+count)` slice
 *     and pushes a {offset, count} range into the attribute's
 *     `updateRange` array, then sets `needsUpdate`.
 *   - After the per-member pass, walks each attribute's range list
 *     and collapses adjacent ranges (where prev.offset + prev.count
 *     == cur.offset) into one — keeps the GL re-upload count low
 *     when many neighbouring glyphs change in the same frame.
 *
 * Public:
 *   - `add(obj)`         — append a GLText.
 *   - `forceUpdate()`    — bypass uniform dirty-check on next tick
 *     (re-uploads everything once; used after a shader uniform
 *     mutation that GLUIBatchText would otherwise miss).
 *   - `enable3D()`       — no-op placeholder (batched text is 2D-
 *     by-construction; the hook keeps the GLUIObject API surface).
 *   - `onDestroy`        — cleans up the merged mesh.
 *   - `group`            — Group consumers add to the scene.
 */
Class(function GLUIBatchText(globalUniforms = {}, _useWorldCoords, _shaderName) {
  Inherit(this, Component);
  const self = this;
  var _geometry,
    _shader,
    _timer,
    _forceUpdate,
    _promises = [],
    _toSplice = [],
    _objects = [],
    _offset = 0;
  function loop() {
    if (!_geometry) return;
    let updated = false;
    for (let key in _geometry.attributes) {
      let attrib = _geometry.attributes[key];
      attrib.updateRange.length && (attrib.updateRange.length = 0);
    }
    let len = _objects.length;
    for (let i = 0; i < len; i++) {
      let obj = _objects[i];
      obj.mesh.onBeforeRender();
      _useWorldCoords &&
        (obj.group.updateMatrixWorld(),
        obj.mesh.getWorldPosition(obj.worldPosition),
        obj.worldRotation.setFromQuaternion(obj.mesh.getWorldQuaternion()),
        obj.mesh.getWorldScale(obj.worldScale));
      let offset = obj._offset,
        count = obj._count,
        end = offset + count;
      obj._buffers.forEach((buffer) => {
        let dirty = false;
        if (
          ((dirty = !buffer.value.equals(buffer.lookup)), buffer.value.copy(buffer.lookup), dirty)
        ) {
          let array = _geometry.attributes[buffer.key].array;
          for (let j = offset; j < end; j++)
            switch (buffer.components) {
              case 4:
                array[4 * j + 0] = buffer.lookup.x;
                array[4 * j + 1] = buffer.lookup.y;
                array[4 * j + 2] = buffer.lookup.z;
                array[4 * j + 3] = buffer.lookup.w;
                break;
              case 3:
                array[3 * j + 0] = buffer.lookup.x;
                array[3 * j + 1] = buffer.lookup.y;
                array[3 * j + 2] = buffer.lookup.z;
                break;
              case 2:
                array[2 * j + 0] = buffer.lookup.x;
                array[2 * j + 1] = buffer.lookup.y;
                break;
              case 1:
                array[j] = buffer.lookup.z;
            }
          updated = true;
          buffer.updateRange.offset = offset * buffer.components;
          buffer.updateRange.count = count * buffer.components;
          _geometry.attributes[buffer.key].updateRange.push(buffer.updateRange);
          _geometry.attributes[buffer.key].needsUpdate = true;
        }
      });
      obj._uniforms.forEach((uniform) => {
        let dirty = false;
        if (
          ('f' == uniform.type
            ? ((dirty = obj.mesh.shader.uniforms[uniform.key].value != uniform.value),
              (uniform.value = obj.mesh.shader.uniforms[uniform.key].value))
            : ((dirty = !obj.mesh.shader.uniforms[uniform.key].value.equals(uniform.value)),
              uniform.value.copy(obj.mesh.shader.uniforms[uniform.key].value)),
          dirty || _forceUpdate)
        ) {
          let array = _geometry.attributes['a_' + uniform.key].array;
          for (let j = offset; j < end; j++)
            'f' == uniform.type
              ? (array[j] = obj.mesh.shader.uniforms[uniform.key].value)
              : obj.mesh.shader.uniforms[uniform.key].value.toArray(array, j * uniform.components);
          updated = true;
          uniform.updateRange.offset = offset * uniform.components;
          uniform.updateRange.count = count * uniform.components;
          _geometry.attributes['a_' + uniform.key].updateRange.push(uniform.updateRange);
          _geometry.attributes['a_' + uniform.key].needsUpdate = true;
        }
      });
    }
    if (updated)
      for (let key in _geometry.attributes) {
        let bottom,
          attrib = _geometry.attributes[key];
        if (!attrib.updateRange.length) continue;
        let toSplice = _toSplice;
        toSplice.length = 0;
        for (let i = 0; i < attrib.updateRange.length; i++) {
          let current = attrib.updateRange[i],
            prev = attrib.updateRange[i - 1];
          prev
            ? prev.offset + prev.count == current.offset
              ? ((bottom.count += current.count), toSplice.push(i))
              : (bottom = current)
            : (bottom = current);
        }
        for (let i = toSplice.length - 1; i > -1; i--) attrib.updateRange.splice(toSplice[i], 1);
      }
    _forceUpdate = false;
  }
  async function createMesh() {
    if (self.flag('mesh')) return;
    self.flag('mesh', true);
    await Promise.all(_promises);
    await self.wait(100);
    let mesh = new Mesh(_geometry, _shader);
    self.mesh = mesh;
    mesh.frustumCulled = false;
    self.group.add(mesh);
  }
  this.group = new Group();
  this.enable3D = () => {};
  'boolean' == typeof globalUniforms && ((_useWorldCoords = globalUniforms), (globalUniforms = {}));
  self.flag('canLoad', true);
  self.startRender(loop);
  self.add = async function (obj) {
    if ((await self.flag('canLoad'), self.destroy)) {
      if (
        (self.flag('canLoad', false),
        await obj.loaded(),
        (obj.mesh.shader.neverRender = true),
        _promises.push(obj.loaded()),
        (function addAttributes(obj, mesh) {
          let { geometry: geometry, shader: shader } = mesh,
            count = geometry.attributes.uv.count;
          mesh.onBeforeRender();
          let buffers = [],
            uniforms = [];
          for (let key in shader.uniforms) {
            let uniform = shader.uniforms[key];
            uniform.value instanceof Color &&
              uniforms.push({
                key: key,
                type: 'c',
                components: 3,
              });
            uniform.value instanceof Vector3 &&
              uniforms.push({
                key: key,
                type: 'v3',
                components: 3,
              });
            uniform.value instanceof Vector4 &&
              uniforms.push({
                key: key,
                type: 'v4',
                components: 4,
              });
            uniform.value instanceof Vector2 &&
              uniforms.push({
                key: key,
                type: 'v',
                components: 2,
              });
            'number' == typeof uniform.value &&
              uniforms.push({
                key: key,
                type: 'f',
                components: 1,
              });
          }
          _useWorldCoords &&
            ((obj.worldScale = new Vector3()),
            (obj.worldRotation = new Euler()),
            (obj.worldPosition = new Vector3()));
          buffers.push({
            key: 'offset',
            lookup: _useWorldCoords ? obj.worldPosition : obj.group.position,
            components: 3,
          });
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
          uniforms.forEach((uniform) => {
            uniform.updateRange = {};
            uniform.value = shader.uniforms[uniform.key].value;
            'object' == typeof uniform.value && (uniform.value = uniform.value.clone());
            uniform.buffer = new Float32Array(count * uniform.components);
          });
          buffers.forEach((buffer) => {
            buffer.updateRange = {};
            buffer.value = buffer.lookup.clone();
            buffer.buffer = new Float32Array(count * buffer.components);
          });
          for (let i = 0; i < count; i++) {
            buffers.forEach((buffer) => {
              switch (buffer.components) {
                case 4:
                  buffer.buffer[4 * i + 0] = buffer.lookup.x;
                  buffer.buffer[4 * i + 1] = buffer.lookup.y;
                  buffer.buffer[4 * i + 2] = buffer.lookup.z;
                  buffer.buffer[4 * i + 3] = buffer.lookup.w;
                  break;
                case 3:
                  buffer.buffer[3 * i + 0] = buffer.lookup.x;
                  buffer.buffer[3 * i + 1] = buffer.lookup.y;
                  buffer.buffer[3 * i + 2] = buffer.lookup.z;
                  break;
                case 2:
                  buffer.buffer[2 * i + 0] = buffer.lookup.x;
                  buffer.buffer[2 * i + 1] = buffer.lookup.y;
                  break;
                case 1:
                  buffer.buffer[i] = buffer.lookup.z;
              }
            });
            uniforms.forEach((uniform) => {
              'f' == uniform.type
                ? (uniform.buffer[i] = shader.uniforms[uniform.key].value)
                : shader.uniforms[uniform.key].value.toArray(
                    uniform.buffer,
                    i * uniform.components,
                  );
            });
          }
          buffers.forEach((buffer) => {
            geometry.addAttribute(
              buffer.key,
              new GeometryAttribute(buffer.buffer, buffer.components),
            );
          });
          uniforms.forEach((uniform) => {
            geometry.addAttribute(
              'a_' + uniform.key,
              new GeometryAttribute(uniform.buffer, uniform.components),
            );
          });
          obj._offset = _offset;
          obj._count = count;
          obj._uniforms = uniforms;
          obj._buffers = buffers;
          _objects.push(obj);
          _offset += count;
        })(obj, obj.mesh),
        _useWorldCoords)
      ) {
        let getAlpha = obj.getAlpha;
        getAlpha &&
          (obj.getAlpha = () => (self.parent ? self.parent.getAlpha() : 1) * getAlpha.call(obj));
      } else self.parent.add(obj);
      _geometry
        ? _geometry.merge(obj.mesh.geometry)
        : (function initGeometry(mesh) {
            (_shader = self.initClass(
              Shader,
              _shaderName || 'GLUIBatchText',
              _shaderName || mesh.shader.fsName,
              Object.assign(
                {},
                {
                  transparent: true,
                  depthWrite: false,
                  customCompile: `${mesh.shader.vsName}|${mesh.shader.fsName}|instance`,
                },
                globalUniforms,
              ),
            )).vertexShader || _shader.resetProgram();
            let vsSplit = _shader.vertexShader.split('__ACTIVE_THEORY_LIGHTS__'),
              fsSplit = _shader.fragmentShader.split('__ACTIVE_THEORY_LIGHTS__'),
              definitions = [],
              definitionSplit = [];
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
            definitions.forEach((def) => definitionSplit.push(def.split(' =')[0].trim()));
            let baseVS = Shaders.getShader(mesh.shader.vsName + '.vs');
            if (baseVS.includes('//start batch main')) {
              let main = baseVS.split('//start batch main')[1].split('//end batch main')[0];
              vsSplit[1] = vsSplit[1].replace('//custommain', main);
              let beforeMain = baseVS.split('void main() {')[0];
              beforeMain = beforeMain.replace('uniform sampler2D tMap;', '');
              beforeMain = beforeMain.replace('varying vec2 vUv;', '');
              beforeMain.split('\n').forEach((line) => {
                definitionSplit.forEach((def) => {
                  line.includes(def) &&
                    line.includes(['uniform', 'varying']) &&
                    (beforeMain = beforeMain.replace(line, ''));
                });
              });
              vsSplit[0] += beforeMain;
            }
            vsSplit[1] = vsSplit[1].replace('//vdefines', '\n' + definitions.join('\n'));
            _shader.vertexShader = vsSplit.join('__ACTIVE_THEORY_LIGHTS__');
            _shader.fragmentShader = fsSplit.join('__ACTIVE_THEORY_LIGHTS__');
            mesh.shader.copyUniformsTo(_shader);
            _geometry = mesh.geometry.clone();
            for (let key in _geometry.attributes) _geometry.attributes[key].updateRange = [];
          })(obj.mesh);
      self.flag('canLoad', true);
      clearTimeout(_timer);
      _timer = self.delayedCall(createMesh, 50);
      obj.isDirty = true;
    }
  };
  self.forceUpdate = function () {
    _forceUpdate = true;
  };
  self.onDestroy = function () {
    self.mesh && self.mesh.destroy();
  };
});

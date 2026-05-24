/*
 * UBO — WebGL2 Uniform Buffer Object wrapper. Packs a set of named uniforms
 * into a single GPU-side buffer and binds it to a shader's "global" block.
 *
 * Used by `Renderer` to avoid setting the same per-frame uniforms (projection,
 * view, time, …) once per shader — they're packed once and bound by handle.
 *
 * Std140 layout (simplified):
 *   - Each element occupies a "chunk" up to 16 bytes (a vec4 slot).
 *   - Smaller members can pack into the same chunk left-to-right; bigger
 *     ones force the cursor to the next 16-byte boundary.
 *   - Matrices use one chunk per column (mat3 → 48 bytes, mat4 → 64).
 * `calculate` reproduces that packing — each `object.offset` is recorded in
 * *floats* (bytes/4) so `compileData` can splat values directly.
 *
 * Lifecycle:
 *   1. `push(uniform, …)` to register members (mutation after upload throws).
 *   2. `upload()` creates the GL buffer, calls `bindBufferBase`, marks data.
 *   3. Each frame: `update()` re-packs and `bufferSubData`s; `bind(program,
 *      blockName)` ties the block index of `program` to this UBO's binding
 *      point. Both cache their last lookup to skip redundant GL calls.
 *
 * The `_array` scratch pool: 30 reusable arrays cycled by `arrayIndex` so
 * we don't allocate fresh arrays in `_getValues`/`compileData` per frame.
 */
class UBO {
  constructor(location, gl = Renderer.context) {
    this.gl       = gl;
    this.arrays   = [];
    for (let i = 0; i < 30; i++) this.arrays.push([]);
    this.arrayIndex = 0;
    this.objects    = [];
    this.location   = location;   // binding point index
    this.data       = null;
    this.lastUpdate = 0;
  }

  /**
   * Size of `uniform.value` in BYTES (post-std140 chunking).
   *   - Array with `components` → matrix-array: 16 bytes per slot, slot
   *     count = array.length / components.
   *   - Plain array → 16 bytes per element (assumed vec4-padded).
   *   - Vec2 → 8, Vec3/Vec4/Color → 16, Mat3 → 48, Mat4 → 64, Quat → 16.
   *   - Anything else → 4 (scalar).
   */
  _getSize(uniform) {
    const obj = uniform.value;
    if (Array.isArray(obj)) {
      return uniform.components ? (obj.length / uniform.components) * 16 : 16 * obj.length;
    }
    if (obj instanceof Vector2)    return 8;
    if (obj instanceof Vector3 || obj instanceof Vector4 || obj instanceof Color) return 16;
    if (obj instanceof Matrix4)    return 64;
    if (obj instanceof Matrix3)    return 48;
    if (obj instanceof Quaternion) return 16;
    return 4;
  }

  /** Flatten `uniform.value` into a (pooled) array of floats. */
  _getValues(uniform) {
    const obj = uniform.value;
    if (Array.isArray(obj))                        return obj;
    if (obj instanceof Vector2)                    return this._array(obj.x, obj.y);
    if (obj instanceof Vector3)                    return this._array(obj.x, obj.y, obj.z);
    if (obj instanceof Matrix4 || obj instanceof Matrix3) return obj.elements;
    if (obj instanceof Color)                      return this._array(obj.r, obj.g, obj.b);
    if (obj instanceof Quaternion)                 return this._array(obj.x, obj.y, obj.z, obj.w);
    return this._array(obj);
  }

  /** Cycle through the pool — gives us a fresh empty array seeded with args. */
  _array() {
    if (this.arrayIndex++ >= this.arrays.length - 1) this.arrayIndex = 0;
    const array = this.arrays[this.arrayIndex];
    array.length = 0;
    array.push.apply(array, arguments);
    return array;
  }

  clear() {
    for (let i = 0; i < this.arrays.length; i++) this.arrays[i].length = 0;
  }

  /**
   * Reproduce std140 layout, recording each member's offset + length (in
   * *floats*). Returns total buffer length in floats.
   *
   *   `chunk`  — bytes remaining in the current 16-byte slot
   *   `offset` — bytes consumed so far
   * If the next member doesn't fit and we're mid-chunk, we advance to a
   * fresh chunk (and grow the previous member's `chunkLen` to absorb the
   * padding — that's what shader code expects when reading back).
   */
  calculate() {
    const len = this.objects.length;
    let chunk = 16, tsize = 0, offset = 0, size = 0;
    for (let i = 0; i < len; i++) {
      const obj = this.objects[i];
      size  = this._getSize(obj);
      tsize = chunk - size;
      if (tsize < 0 && chunk < 16) {
        // Doesn't fit — pad current chunk, advance to next.
        offset += chunk;
        if (i > 0) this.objects[i - 1].chunkLen += chunk;
        chunk = 16;
      } else if (!(tsize < 0 && 16 == chunk)) {
        if (0 == tsize) chunk = 16;
        else            chunk -= size;
      }
      obj.offset   = offset / 4;
      obj.chunkLen = size / 4;
      obj.dataLen  = size / 4;
      offset += size;
    }
    // Pad to a full 16-byte chunk if needed.
    if (offset % 16 != 0) {
      this.objects[this.objects.length - 1].chunkLen += chunk / 4;
      offset += chunk;
    }
    return offset / 4;
  }

  /** Build the packed float array (zero-fill + splat each member's values). */
  compileData() {
    const array = this._array();
    const len = this.calculate();
    for (let i = 0; i < len; i++) array[i] = 0;
    for (let i = 0; i < this.objects.length; i++) {
      const obj    = this.objects[i];
      const values = this._getValues(obj);
      for (let j = 0; j < values.length; j++) array[obj.offset + j] = values[j];
    }
    return array;
  }

  /** Allocate + initial upload. After this, `push()` is locked out. */
  upload() {
    if (this.data) return;
    const gl = Renderer.context;
    const array = this.compileData();
    if (!array.length) return;
    this.data   = new Float32Array(array);
    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.UNIFORM_BUFFER, this.buffer);
    gl.bufferData(gl.UNIFORM_BUFFER, this.data, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.UNIFORM_BUFFER, null);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, this.location, this.buffer);
  }

  /**
   * Connect `program`'s named uniform block `name` to this UBO's binding
   * point. Caches the (program, name) → blockIndex lookup. -1 / huge index
   * means the program doesn't actually use this block — skip silently.
   */
  bind(program, name) {
    if (!this.data) this.upload();
    if (this.needsUpdate) this.update();

    const gl = Renderer.context;
    let location;
    if (program == this.lastProgram && name == this.lastName && this.lastLocation !== undefined) {
      location = this.lastLocation;
    } else {
      location = gl.getUniformBlockIndex(program, name);
    }
    if (location > 99999 || -1 == location) return;
    gl.uniformBlockBinding(program, location, this.location);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, this.location, this.buffer);
    this.lastProgram  = program;
    this.lastName     = name;
    this.lastLocation = location;
  }

  /**
   * Re-pack values and upload via `bufferSubData`. If the packed size
   * changed (member array grew/shrank), reallocate the GL buffer entirely.
   */
  update() {
    if (!this.data) this.upload();
    if (!this.data) return;
    const gl    = Renderer.context;
    const array = this.compileData();
    if (array.length != this.data.length) {
      this.data = new Float32Array(array);
      this.upload();
    }
    this.data.set(array);
    gl.bindBuffer(gl.UNIFORM_BUFFER, this.buffer);
    gl.bufferSubData(gl.UNIFORM_BUFFER, 0, this.data);
    gl.bindBuffer(gl.UNIFORM_BUFFER, null);
    this.needsUpdate = false;
  }

  /** No-op — binding-base semantics mean we don't need to unbind to switch programs. */
  unbind() {}

  /** Register one or more uniforms. Must happen before `upload()`. */
  push() {
    if (this.data) throw "Can't modify UBO after initial upload!";
    for (let i = 0; i < arguments.length; i++) this.objects.push(arguments[i]);
  }

  destroy() { this.gl.deleteBuffer(this.buffer); }
}

/*
 * GeometryRendererWebGL — WebGL backend for `Geometry` / `Mesh`.
 *
 * Owns: VAO allocation, vertex/index buffer upload + partial updates, the
 * dispatch (`draw`) that picks `drawArrays` / `drawElements` (instanced or
 * not), and the occlusion-query path on WebGL2.
 *
 *   Geometry.renderer = new GeometryRendererWebGL(gl);
 *
 * VAO cache: keyed by `${geometry.id}_${shader.programId}` — the same
 * geometry rendered with the same shader can share a single VAO across
 * many Mesh instances. `count` ref-counts how many meshes reuse it; the
 * VAO is freed when the last mesh detaches.
 *
 * Per-attribute buffer flow:
 *   - First upload  → `_gl.buffer` created, `bufferData` for full upload.
 *   - `needsUpdate` → `updateBuffer` (sub-data, optionally sub-range).
 *   - `needsNewBuffer` (size grew/shrank) → full `bufferData` again.
 *   - `updateRange` may be a single { offset, count } or an array of those
 *     for batched scatter updates.
 *
 * Async path (`uploadBuffersAsync`) chunks the upload across worker frames
 * so a huge buffer doesn't stall the main loop.
 */
Class(function GeometryRendererWebGL(_gl) {
  const _cache = {};
  const _isDebbugingShader = Utils.query('displayShaderError');
  const WEBGL2 = Renderer.type == Renderer.WEBGL2;
  const { getGLTypeForTypedArray } = require('GLTypes');

  /**
   * Push a (possibly partial) update to `attrib`'s GL buffer.
   *   - `updateRange.count === -1`        → full upload (the default).
   *   - `Array.isArray(updateRange)`      → multiple disjoint sub-ranges.
   *   - else                              → single { offset, count } sub-range.
   *
   * The `needsNewBuffer` flag forces a full `bufferData` (instead of
   * `bufferSubData`) when the array's size has changed.
   */
  function updateBuffer(attrib) {
    if (!attrib._gl) return;
    attrib.needsUpdate = false;
    _gl.bindBuffer(_gl.ARRAY_BUFFER, attrib._gl.buffer);
    RenderStats.update('BufferUpdates');

    const array       = attrib.array;
    const updateRange = attrib.updateRange;
    if (-1 === updateRange.count) {
      if (attrib.needsNewBuffer) {
        _gl.bufferData(_gl.ARRAY_BUFFER, attrib.array, _gl.DYNAMIC_DRAW);
        attrib.needsNewBuffer = false;
      } else {
        _gl.bufferSubData(_gl.ARRAY_BUFFER, 0, array);
      }
    } else if (Array.isArray(updateRange)) {
      for (let i = updateRange.length - 1; i > -1; i--) {
        const { offset, count } = updateRange[i];
        _gl.bufferSubData(_gl.ARRAY_BUFFER,
          offset * array.BYTES_PER_ELEMENT,
          array.subarray(offset, offset + count));
      }
      updateRange.length = 0;
    } else {
      _gl.bufferSubData(_gl.ARRAY_BUFFER,
        updateRange.offset * array.BYTES_PER_ELEMENT,
        array.subarray(updateRange.offset, updateRange.offset + updateRange.count));
    }
    _gl.bindBuffer(_gl.ARRAY_BUFFER, null);
  }

  /** Tally drawn primitives by mode for the RenderStats overlay. */
  function renderingCount(count, mode, instanceCount = 1) {
    if (!RenderStats.active) return;
    switch (mode) {
      case _gl.TRIANGLES:  RenderStats.update('Triangles', instanceCount * (count / 3));      break;
      case _gl.LINES:      RenderStats.update('Lines',     instanceCount * (count / 2));      break;
      case _gl.LINE_STRIP: RenderStats.update('LineStrip', instanceCount * (count - 1));      break;
      case _gl.LINE_LOOP:  RenderStats.update('LineLoop',  instanceCount * count);            break;
      case _gl.POINTS:     RenderStats.update('Points',    instanceCount * count);            break;
    }
  }

  /**
   * Main draw entry — called from `Mesh.geometry.draw(mesh, shader, isQuery)`.
   * Steps:
   *   1. Lazy upload if buffers haven't been allocated for this (geom, mesh).
   *   2. Resolve attribute locations (cached when the shader program is unchanged).
   *   3. Re-upload any attributes flagged `needsUpdate` or `dynamic`.
   *   4. Refresh the index buffer if `indexNeedsUpdate`.
   *   5. Bind VAO; pick primitive mode; compute draw range.
   *   6. Either:
   *        - `isQuery` (WebGL2 only): wrap the draw in `ANY_SAMPLES_PASSED_CONSERVATIVE`
   *          query, no color/depth writes; poll the previous query result and
   *          set `occluded` flag.
   *        - normal path: drawArrays / drawElements (instanced variants if so).
   */
  this.draw = function (geom, mesh, shader, isQuery) {
    if (!(geom._gl && !geom.needsUpdate && mesh._gl && mesh._gl.geomInit)) {
      this.upload(geom, mesh, shader);
    }
    if (RenderStats.active) {
      RenderStats.update('DrawCalls', 1, shader.vsName + '|' + shader.fsName, mesh);
    }

    // Lookup attribute locations (cached per-program-per-mesh).
    for (let i = geom._attributeKeys.length - 1; i > -1; i--) {
      const key    = geom._attributeKeys[i];
      const attrib = geom._attributeValues[i];
      if (!(mesh._gl.program == shader._gl.program && mesh._gl[key] !== undefined)) {
        mesh._gl[key] = _gl.getAttribLocation(shader._gl.program, key);
      }
      if (mesh._gl[key] !== -1) {
        if (attrib.isInterleaved && attrib.data.needsUpdate) {
          updateBuffer(attrib.data);
        } else if (attrib.needsUpdate || attrib.dynamic) {
          updateBuffer(attrib);
        }
      }
    }
    mesh._gl.program = shader._gl.program;

    // Refresh index buffer if needed.
    if (geom.indexNeedsUpdate) {
      geom._gl.indexType = geom.index instanceof Uint16Array ? _gl.UNSIGNED_SHORT : _gl.UNSIGNED_INT;
      _gl.bindBuffer(_gl.ELEMENT_ARRAY_BUFFER, geom._gl.index);
      if (geom.indexUpdateRange) {
        const updateRange = geom.indexUpdateRange;
        _gl.bufferSubData(_gl.ELEMENT_ARRAY_BUFFER,
          updateRange.offset * geom.index.BYTES_PER_ELEMENT,
          geom.index.subarray(updateRange.offset, updateRange.offset + updateRange.count));
      } else {
        _gl.bufferData(_gl.ELEMENT_ARRAY_BUFFER, geom.index, _gl.STATIC_DRAW);
      }
      _gl.bindBuffer(_gl.ELEMENT_ARRAY_BUFFER, null);
      geom.indexNeedsUpdate = false;
    }

    mesh._gl.vao.bind();
    let mode = mesh._gl.mode;
    if (!mode) {
      mesh._gl.mode = mode = (function getMode(mesh, shader) {
        if (mesh.isPoints)     return _gl.POINTS;
        if (mesh.isLine)       return _gl.LINE_STRIP;
        if (shader.wireframe)  return _gl.LINES;
        return _gl.TRIANGLES;
      })(mesh, shader);
    }

    let drawStart = geom.drawRange.start || 0;
    const drawEnd = geom.drawRange.end
      || (geom.index ? geom.index.length : geom.attributes.position.count);

    // Indexed start needs to be in BYTES, not elements.
    if (geom.index) drawStart *= geom._gl.indexType === _gl.UNSIGNED_SHORT ? 2 : 4;

    if (isQuery && WEBGL2) {
      // ── Occlusion-query draw (no color/depth writes) ────────────────
      const queryMesh = mesh._queryMesh;
      if (queryMesh._gl === undefined) return;

      // Poll previous query; if available, latch result into `occluded`.
      if (queryMesh._gl.queryInProgress
          && _gl.getQueryParameter(queryMesh._gl.query, _gl.QUERY_RESULT_AVAILABLE)) {
        queryMesh._gl.occluded = !_gl.getQueryParameter(queryMesh._gl.query, _gl.QUERY_RESULT);
        queryMesh._gl.queryInProgress = false;
      }

      // Only start a new query if no query is currently in flight.
      if (!queryMesh._gl.queryInProgress) {
        _gl.beginQuery(_gl.ANY_SAMPLES_PASSED_CONSERVATIVE, queryMesh._gl.query);
        _gl.colorMask(false, false, false, false);
        _gl.depthMask(false);
        if (geom.index) {
          _gl.bindBuffer(_gl.ELEMENT_ARRAY_BUFFER, geom._gl.index);
          _gl.drawElements(mode, drawEnd, geom._gl.indexType, drawStart);
        } else {
          _gl.drawArrays(mode, drawStart, drawEnd);
        }
        _gl.colorMask(true, true, true, true);
        _gl.depthMask(true);
        _gl.endQuery(_gl.ANY_SAMPLES_PASSED_CONSERVATIVE);
        queryMesh._gl.queryInProgress = true;
      }
      // (note: original code falls through the unbind below for `isQuery`)
    } else {
      // ── Normal draw ────────────────────────────────────────────────
      if (geom.isInstanced) {
        // Effective instance count = min(mesh cap, geom cap, shader cap).
        let maxInstancedCount = mesh.maxInstancedCount
          ? Math.min(mesh.maxInstancedCount, geom.maxInstancedCount)
          : geom.maxInstancedCount;
        if (shader.maxInstancedCount) {
          maxInstancedCount = Math.min(maxInstancedCount || 9999, shader.maxInstancedCount);
        }
        if (WEBGL2) {
          if (geom.index) {
            _gl.drawElementsInstanced(mode, drawEnd, geom._gl.indexType, drawStart, maxInstancedCount);
          } else {
            _gl.drawArraysInstanced(mode, drawStart, drawEnd, maxInstancedCount);
          }
        } else {
          const ext = Renderer.extensions.instancedArrays;
          if (geom.index) {
            ext.drawElementsInstancedANGLE(mode, drawEnd, geom._gl.indexType, drawStart, maxInstancedCount);
          } else {
            ext.drawArraysInstancedANGLE(mode, drawStart, drawEnd, maxInstancedCount);
          }
        }
        renderingCount(geom.index ? geom.index.length : drawEnd, mode, maxInstancedCount);
      } else if (!mesh.hideByOcclusion) {
        if (geom.index) _gl.drawElements(mode, drawEnd, geom._gl.indexType, drawStart);
        else            _gl.drawArrays(mode, drawStart, drawEnd);
        renderingCount(geom.index ? geom.index.length : drawEnd, mode, 1);
      }

      if (_isDebbugingShader && _gl.getError() != _gl.NO_ERROR) console.log(mesh, shader);
      mesh._gl.vao.unbind();
      if (WEBGL2 && RenderMonitor.active) shader?.renderTimeQuery?.endTest?.();
    }
  };

  /**
   * Allocate buffers + VAO for `(geom, mesh, shader)`. If another mesh has
   * already built a VAO for the same (geom, shader) pair, the VAO is reused
   * (with a ref-count bump) — see `_cache`.
   *
   * Set up steps:
   *   1. Per-attribute GL buffer (DYNAMIC_DRAW if `dynamic`, else STATIC_DRAW).
   *      Interleaved attributes share one buffer via `attrib.data`.
   *   2. Index buffer (STATIC_DRAW; type chosen from Uint16/Uint32).
   *   3. Bind VAO; for each attribute, call `vertexAttribPointer` (or
   *      `vertexAttribIPointer` for integer types) with the correct
   *      stride/offset; enable, set instancing divisor if instanced.
   */
  this.upload = function (geom, mesh, shader, hotload) {
    if (!mesh) return;
    if (!geom._gl) geom._gl = { id: Utils.timestamp() };
    if (!mesh._gl) mesh._gl = {};
    mesh._gl.geomInit = true;
    geom.uploaded = true;

    // Occlusion queries are per-mesh and only allocated for non-helper meshes.
    if (!mesh.isOcclusionMesh && WEBGL2) {
      mesh._gl.query           = _gl.createQuery();
      mesh._gl.queryInProgress = false;
      mesh._gl.occluded        = false;
    }

    const KEY = `${geom._gl.id}_${shader._gl._id}`;
    const cached = _cache[KEY];
    if (cached && !hotload) {
      cached.count++;
      mesh._gl.vao    = cached.vao;
      mesh._gl.lookup = KEY;
      return;
    }
    if (Utils.query('debugUpload')) console.log('?debugUpload – upload geometry', geom);
    RenderCount.add('geometry');
    if (mesh._gl.vao) mesh._gl.vao.destroy();
    mesh._gl.vao = new VAO(_gl);
    if (!geom.distributeBufferData) RenderCount.add('geom_upload', geom);

    // ── Per-attribute buffer creation ──────────────────────────────
    for (let i = geom._attributeKeys.length - 1; i > -1; i--) {
      const key    = geom._attributeKeys[i];
      const attrib = geom._attributeValues[i];
      const location = (mesh._gl.program === shader._gl.program && mesh._gl[key])
        || _gl.getAttribLocation(shader._gl.program, key);
      mesh._gl[key] = location;

      if (attrib._gl) continue;
      attrib._gl = {};
      let array   = attrib.array;
      let dynamic = attrib.dynamic;
      if (attrib.isInterleaved) {
        if (!attrib.data._gl) attrib.data._gl = attrib._gl;
        attrib._gl = attrib.data._gl;
        array      = attrib.data.array;
        dynamic    = attrib.data.dynamic;
      }
      if (!attrib._gl.buffer) {
        attrib._gl.buffer         = _gl.createBuffer();
        // `distributeBufferData`: allocate empty storage now, upload later via
        // `uploadBuffersAsync` (chunked across worker frames).
        attrib._gl.bufferUploaded = !geom.distributeBufferData;
        _gl.bindBuffer(_gl.ARRAY_BUFFER, attrib._gl.buffer);
        _gl.bufferData(_gl.ARRAY_BUFFER,
          geom.distributeBufferData ? array.length * array.BYTES_PER_ELEMENT : array,
          dynamic ? _gl.DYNAMIC_DRAW : _gl.STATIC_DRAW);
        _gl.bindBuffer(_gl.ARRAY_BUFFER, null);
      }
      attrib.needsUpdate = false;
    }

    // ── Index buffer ───────────────────────────────────────────────
    if (geom.index && !geom._gl.index) {
      geom._gl.index     = _gl.createBuffer();
      geom._gl.indexType = geom.index instanceof Uint16Array ? _gl.UNSIGNED_SHORT : _gl.UNSIGNED_INT;
      _gl.bindBuffer(_gl.ELEMENT_ARRAY_BUFFER, geom._gl.index);
      _gl.bufferData(_gl.ELEMENT_ARRAY_BUFFER, geom.index, _gl.STATIC_DRAW);
      _gl.bindBuffer(_gl.ELEMENT_ARRAY_BUFFER, null);
    }

    // ── VAO setup (vertexAttribPointer calls happen between bind/unbind) ──
    mesh._gl.vao.bind();
    for (let i = geom._attributeKeys.length - 1; i > -1; i--) {
      const key      = geom._attributeKeys[i];
      const attrib   = geom._attributeValues[i];
      const location = mesh._gl[key];
      if (location == -1) continue;

      let stride = 0, offset = 0;
      if (attrib.isInterleaved) {
        const bytes = attrib.data.array.BYTES_PER_ELEMENT;
        stride = attrib.data.stride * bytes;
        offset = attrib.offset      * bytes;
      }
      _gl.bindBuffer(_gl.ARRAY_BUFFER, attrib._gl.buffer);
      // Float arrays go through the standard pointer; integer types use the
      // I-pointer variant so they're kept as integers in the shader.
      if (attrib.array instanceof Float32Array) {
        _gl.vertexAttribPointer(location, attrib.itemSize, _gl.FLOAT, false, stride, offset);
      } else {
        _gl.vertexAttribIPointer(location, attrib.itemSize,
          getGLTypeForTypedArray(attrib.array), false, stride, offset);
      }
      _gl.enableVertexAttribArray(location);

      if (geom.isInstanced) {
        if (WEBGL2) {
          _gl.vertexAttribDivisor(location, attrib.meshPerAttribute);
        } else {
          Renderer.extensions.instancedArrays.vertexAttribDivisorANGLE(location, attrib.meshPerAttribute);
        }
      }
    }
    if (geom.index) _gl.bindBuffer(_gl.ELEMENT_ARRAY_BUFFER, geom._gl.index);
    mesh._gl.vao.unbind();

    _cache[KEY] = { count: 1, vao: mesh._gl.vao };
  };

  /**
   * Tear down GL resources for `(geom, mesh)`. The VAO is ref-counted so
   * shared VAOs only get freed when the last mesh detaches.
   */
  this.destroy = function (geom, mesh) {
    for (let i = geom._attributeKeys.length - 1; i > -1; i--) {
      const attrib = geom._attributeValues[i];
      if (attrib._gl) {
        _gl.deleteBuffer(attrib._gl.buffer);
        attrib._gl = null;
      }
    }
    if (geom._gl?.index) _gl.deleteBuffer(geom._gl.index);
    RenderCount.remove('geometry');

    if (mesh && mesh._gl && mesh._gl.vao) {
      const cache = _cache[mesh._gl.lookup];
      if (cache) {
        cache.count--;
        if (cache.count == 0) {
          cache.vao.destroy();
          delete _cache[mesh._gl.lookup];
        }
      } else {
        mesh._gl.vao.destroy();
      }
      delete mesh._gl.vao;
    }
    delete geom._gl;
  };

  /** Mark `mesh`'s geometry as needing re-initialization on the next draw. */
  this.resetMeshGeom = function (mesh) {
    if (mesh._gl) mesh._gl.geomInit = false;
  };

  /**
   * Async chunked buffer upload. Splits each attribute into ~4 chunks and
   * uploads one chunk per worker tick (`Render.Worker`) so a huge buffer
   * upload doesn't block the main loop. Returns when all chunks are done.
   *
   * `geom.distributeBufferData` flips the original full-buffer upload into
   * an "allocate empty + fill async" path.
   */
  this.uploadBuffersAsync = async function (geom) {
    if (geom._gl && geom._gl.uploadedAsync) return;

    const upload = (attrib) => {
      const array   = attrib.array;
      const buffer  = attrib._gl.buffer;
      const promise = Promise.create();
      let amt = 4, match = false;
      // Pick the largest divisor ≤4 that divides the array evenly.
      while (!match) { amt--; if (array.length % amt == 0) match = true; }
      const chunk = array.length / amt;
      let i = 0;
      const worker = new Render.Worker(function uploadBuffersAsync() {
        const offset   = i * chunk;
        const subarray = array.subarray(offset, offset + chunk);
        if (!attrib._gl) { worker.stop(); return promise.resolve(); }
        if (subarray.length) {
          _gl.bindBuffer(_gl.ARRAY_BUFFER, buffer);
          _gl.bufferSubData(_gl.ARRAY_BUFFER, offset * array.BYTES_PER_ELEMENT, subarray);
          _gl.bindBuffer(_gl.ARRAY_BUFFER, null);
        }
        if (++i == amt) { promise.resolve(); worker.stop(); }
      });
      return promise;
    };

    let uploaded = false;
    for (let i = geom._attributeKeys.length - 1; i > -1; i--) {
      const attrib = geom._attributeValues[i];
      // First-time: allocate empty storage, the actual data goes via the worker.
      if (!attrib._gl) {
        geom.distributeBufferData = true;
        let array   = attrib.array;
        let dynamic = attrib.dynamic;
        attrib._gl = {};
        if (attrib.isInterleaved) {
          if (!attrib.data._gl) attrib.data._gl = attrib._gl;
          attrib._gl = attrib.data._gl;
          array      = attrib.data.array;
          dynamic    = attrib.data.dynamic;
        }
        if (!attrib._gl.buffer) {
          attrib._gl.buffer         = _gl.createBuffer();
          attrib._gl.bufferUploaded = !geom.distributeBufferData;
          if (attrib.array.length) {
            _gl.bindBuffer(_gl.ARRAY_BUFFER, attrib._gl.buffer);
            _gl.bufferData(_gl.ARRAY_BUFFER,
              array.length * array.BYTES_PER_ELEMENT,
              dynamic ? _gl.DYNAMIC_DRAW : _gl.STATIC_DRAW);
            _gl.bindBuffer(_gl.ARRAY_BUFFER, null);
          }
        }
        attrib.needsUpdate = false;
        geom.needsUpdate   = true;
      }
      if (!attrib._gl.bufferUploaded) {
        attrib._gl.bufferUploaded = true;
        uploaded = true;
        await upload(attrib);
        attrib.needsUpdate = false;
      }
    }
    geom._gl.uploadedAsync = true;
    if (uploaded) RenderCount.add('geom_uploadAsync', geom);
  };
});

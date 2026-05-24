/*
 * DracoThread — Web Worker companion that runs Google's Draco
 * geometry decoder off the main thread.
 *
 * Draco compresses meshes very aggressively (10-20x over raw
 * Float32Array attributes) but the decoder is heavy (~600KB wasm)
 * and blocks the thread, so it lives in a Thread.upload() worker.
 *
 * Pipeline:
 *   1. `decodeGeometry(draco, decoder, decoderBuffer, taskConfig)`
 *      reads the compressed buffer, picks `Mesh` vs `PointCloud`
 *      based on header, and runs the relevant DecodeBufferToMesh /
 *      DecodeBufferToPointCloud call.
 *   2. Iterates `taskConfig.attributeIDs` (a map of friendly name →
 *      DRACO_ATTRIBUTE constant or unique ID), extracting each
 *      attribute via `decodeAttribute`. `useUniqueIDs` switches
 *      between unique-ID lookup and built-in attribute lookup.
 *   3. For triangular meshes, also extracts the index buffer via
 *      `GetTrianglesUInt32Array` (the decoder writes raw memory into
 *      the wasm heap, we slice() out a Uint32Array copy and free).
 *   4. `computeBounding` re-derives a JS-side bounding box/sphere
 *      from the decoded position attribute so consumers don't have
 *      to wait for upload-time bounds.
 *
 * Error handling:
 *   - `onError` substitutes a flat PlaneGeometry as a fallback when
 *     the decode raises. If the failure was a preload (not yet shown
 *     to user), it's warn-logged; otherwise the host code can decide.
 *
 * Memory hygiene:
 *   - Every `dracoGeometry` and every malloc'd buffer is freed
 *     explicitly to avoid wasm heap leaks (the wasm runtime won't
 *     GC for us).
 *
 * The decoder library itself (`decoderConfig`, `decoderPending`) is
 * lazy-loaded on the first decode request — see the rest of the file
 * for the lazy init / fetch / instantiate flow.
 */
Class(function DracoThread() {
  let decoderConfig, decoderPending;
  function onError(opts) {
    opts.message.preloading && console.warn(opts.er);
    let plane = new PlaneGeometry(1, 1).toNonIndexed(),
      buff = [],
      data = {};
    for (let key in plane.attributes) {
      data[key] = plane.attributes[key].array;
      buff.push(data[key].buffer);
    }
    computeBounding(data);
    opts?.resolve(data, opts.id, buff);
  }
  function decodeGeometry(draco, decoder, decoderBuffer, taskConfig) {
    const attributeIDs = taskConfig.attributeIDs,
      attributeTypes = taskConfig.attributeTypes;
    let dracoGeometry, decodingStatus;
    const geometryType = decoder.GetEncodedGeometryType(decoderBuffer);
    if (geometryType === draco.TRIANGULAR_MESH) {
      dracoGeometry = new draco.Mesh();
      decodingStatus = decoder.DecodeBufferToMesh(decoderBuffer, dracoGeometry);
    } else {
      if (geometryType !== draco.POINT_CLOUD)
        throw new Error('DRACOLoader: Unexpected geometry type.');
      dracoGeometry = new draco.PointCloud();
      decodingStatus = decoder.DecodeBufferToPointCloud(decoderBuffer, dracoGeometry);
    }
    if (!decodingStatus.ok() || 0 === dracoGeometry.ptr)
      throw new Error('DRACOLoader: Decoding failed: ' + decodingStatus.error_msg());
    const geometry = {
      index: null,
      attributes: [],
    };
    for (const attributeName in attributeIDs) {
      const attributeType = attributeTypes[attributeName];
      let attribute, attributeID;
      if (taskConfig.useUniqueIDs) {
        attributeID = attributeIDs[attributeName];
        attribute = decoder.GetAttributeByUniqueId(dracoGeometry, attributeID);
      } else {
        if (
          ((attributeID = decoder.GetAttributeId(
            dracoGeometry,
            draco[attributeIDs[attributeName]],
          )),
          -1 === attributeID)
        )
          continue;
        attribute = decoder.GetAttribute(dracoGeometry, attributeID);
      }
      geometry.attributes.push(
        decodeAttribute(draco, decoder, dracoGeometry, attributeName, attributeType, attribute),
      );
    }
    return (
      geometryType === draco.TRIANGULAR_MESH &&
        (geometry.index = decodeIndex(draco, decoder, dracoGeometry)),
      draco.destroy(dracoGeometry),
      geometry
    );
  }
  function decodeIndex(draco, decoder, dracoGeometry) {
    const numIndices = 3 * dracoGeometry.num_faces(),
      byteLength = 4 * numIndices,
      ptr = draco._malloc(byteLength);
    decoder.GetTrianglesUInt32Array(dracoGeometry, byteLength, ptr);
    const index = new Uint32Array(draco.HEAPF32.buffer, ptr, numIndices).slice();
    return (
      draco._free(ptr),
      {
        array: index,
        itemSize: 1,
      }
    );
  }
  function decodeAttribute(draco, decoder, dracoGeometry, attributeName, attributeType, attribute) {
    const numComponents = attribute.num_components(),
      numValues = dracoGeometry.num_points() * numComponents,
      byteLength = numValues * attributeType.BYTES_PER_ELEMENT,
      dataType = getDracoDataType(draco, attributeType),
      ptr = draco._malloc(byteLength);
    decoder.GetAttributeDataArrayForAllPoints(dracoGeometry, attribute, dataType, byteLength, ptr);
    const array = new attributeType(draco.HEAPF32.buffer, ptr, numValues).slice();
    return (
      draco._free(ptr),
      {
        name: attributeName,
        array: array,
        itemSize: numComponents,
      }
    );
  }
  function getDracoDataType(draco, attributeType) {
    switch (attributeType) {
      case Float32Array:
        return draco.DT_FLOAT32;
      case Int8Array:
        return draco.DT_INT8;
      case Int16Array:
        return draco.DT_INT16;
      case Int32Array:
        return draco.DT_INT32;
      case Uint8Array:
        return draco.DT_UINT8;
      case Uint16Array:
        return draco.DT_UINT16;
      case Uint32Array:
        return draco.DT_UINT32;
    }
  }
  this.loadDraco = function (e, id) {
    const message = e;
    switch (message.type) {
      case 'init':
        decoderConfig = message.decoderConfig;
        decoderPending = new Promise(function (pendingResolve) {
          decoderConfig.onModuleLoaded = function (draco) {
            pendingResolve({
              draco: draco,
            });
            resolve({}, id);
          };
          DracoDecoderModule(decoderConfig);
        });
        break;
      case 'decode_buffer_gltf':
        ((dracoBuffer, dataAttrib) => {
          const buffer = dracoBuffer,
            attributeIDs = {},
            attributeTypes = {},
            TYPE_ARRAY = {
              5121: Uint8Array,
              5122: Int16Array,
              5123: Uint16Array,
              5125: Uint32Array,
              5126: Float32Array,
              'image/jpeg': Uint8Array,
              'image/png': Uint8Array,
            };
          dataAttrib.forEach((att) => {
            const name = att.name;
            attributeIDs[name] = att.id;
            attributeTypes[name] = TYPE_ARRAY[att.type];
          });
          const taskConfig = {
            attributeIDs: attributeIDs,
            attributeTypes: attributeTypes,
            useUniqueIDs: true,
          };
          decoderPending.then((module) => {
            const draco = module.draco,
              decoder = new draco.Decoder(),
              decoderBuffer = new draco.DecoderBuffer();
            decoderBuffer.Init(new Int8Array(buffer), buffer.byteLength);
            try {
              const geometry = decodeGeometry(draco, decoder, decoderBuffer, taskConfig),
                buffers = geometry.attributes.map((attr) => attr.array.buffer);
              geometry.index && buffers.push(geometry.index.array.buffer);
              const response = {};
              geometry.index && (response.index = geometry.index.array);
              geometry.attributes.forEach((att) => {
                response[att.name] = att.array;
                response[`${att.name}ItemSize`] = att.itemSize;
              });
              response.position && computeBounding(response);
              resolve(response, id, buffers);
            } catch (error) {
              onError({
                message: message,
                er: `Parsing error on Draco file ${message.path}.`,
                resolve: resolve,
                id: id,
              });
            } finally {
              draco.destroy(decoderBuffer);
              draco.destroy(decoder);
            }
          });
        })(message.buffer, message.dataAttrib);
        break;
      case 'decode':
        fetch(message.path)
          .then((res) => {
            if (!res.ok) throw new Error();
            return res.arrayBuffer();
          })
          .then((dracoBuffer) => {
            const decoder = new TextDecoder(),
              jsonSize = parseInt(decoder.decode(dracoBuffer.slice(0, 10))),
              jsonData = JSON.parse(decoder.decode(dracoBuffer.slice(10, 10 + jsonSize))),
              buffer = dracoBuffer.slice(10 + jsonSize),
              TYPED_ARRAYS = Object.values(Geometry.TYPED_ARRAYS),
              attributeIDs = {},
              attributeTypes = {};
            jsonData.attributes.forEach((att, i) => {
              const name = att[0];
              attributeIDs[name] = i;
              attributeTypes[name] = TYPED_ARRAYS[att[1]];
            });
            const taskConfig = {
                attributeIDs: attributeIDs,
                attributeTypes: attributeTypes,
                useUniqueIDs: true,
              },
              isMesh = 0 === jsonData.type;
            decoderPending.then((module) => {
              const draco = module.draco,
                decoder = new draco.Decoder(),
                decoderBuffer = new draco.DecoderBuffer();
              decoderBuffer.Init(new Int8Array(buffer), buffer.byteLength);
              try {
                const geometry = decodeGeometry(draco, decoder, decoderBuffer, taskConfig),
                  buffers = geometry.attributes.map((attr) => attr.array.buffer);
                isMesh && geometry.index && buffers.push(geometry.index.array.buffer);
                const response = {
                  _type: 'BufferGeometry',
                  userData: jsonData.userData || {},
                };
                response.userData.dracoType = jsonData.type;
                isMesh && geometry.index && (response.index = geometry.index.array);
                geometry.attributes.forEach((att) => {
                  response[att.name] = att.array;
                  response[`${att.name}ItemSize`] = att.itemSize;
                });
                isMesh && response.position && computeBounding(response);
                resolve(response, id, buffers);
              } catch (error) {
                onError({
                  message: message,
                  er: `Parsing error on Draco file ${message.path}.`,
                  resolve: resolve,
                  id: id,
                });
              } finally {
                draco.destroy(decoderBuffer);
                draco.destroy(decoder);
              }
            });
          })
          .catch(() => {
            onError({
              message: message,
              er: `Network error: Draco file (${message.path}) could not be loaded.`,
              resolve: resolve,
              id: id,
            });
          });
    }
  };
  this.decodeGeometry = decodeGeometry;
  this.decodeIndex = decodeIndex;
  this.decodeAttribute = decodeAttribute;
  this.getDracoDataType = getDracoDataType;
  this.onError = onError;
}, 'static');

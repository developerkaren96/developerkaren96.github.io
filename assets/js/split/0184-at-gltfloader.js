/*
 * GLTFLoader — Hydra-flavoured glTF 2.0 importer that parses both
 * `.gltf` (JSON + external buffers) and `.glb` (binary container)
 * files, materialising them as an Active Theory SceneLayout.
 *
 * Supported pieces of the spec (per the constants at top):
 *   - Component types: 5121 UInt8, 5122 Int16, 5123 UInt16,
 *     5125 UInt32, 5126 Float32; plus image MIME → Uint8Array.
 *   - Type sizes: SCALAR/VEC2/VEC3/VEC4 and MAT2/3/4 (with the
 *     standard 4/9/16 component counts).
 *   - Attribute remap: glTF semantic names (POSITION, NORMAL, TANGENT,
 *     TEXCOORD_0/1, COLOR_0, WEIGHTS_0, JOINTS_0) → Hydra attribute
 *     names (position, normal, tangent, uv, uv2, color, skinWeight,
 *     skinIndex).
 *   - Extension: `KHR_draco_mesh_compression` triggers lazy load of
 *     the Draco decoder library (see DracoThread).
 *
 * Parse flow (`self.parse(path, sceneLayout)`):
 *   1. Derive `_id` and `_path` from the URL; build a parent
 *      SceneLayout if requested.
 *   2. For `.glb`: read the binary container, splitting out the JSON
 *      chunk and the binary chunk via `self.loadBinary`.
 *   3. For `.gltf`: fetch JSON, then fetch each referenced buffer in
 *      parallel.
 *   4. If `extensionsRequired` lists KHR_draco_mesh_compression,
 *      block on `loadDracoLib()` so the worker is ready.
 *   5. Walk `desc.nodes` recursively to build the scene graph,
 *      decoding each mesh primitive's accessors / images / materials.
 *
 * The rest of the file (~500 lines) implements accessor decoding,
 * image loading, material → Shader mapping, node → Base3D mapping,
 * skinning, and asset path resolution. Long and intricate but
 * stateless w.r.t. the rest of the engine — owned by this module.
 */
Class(function GLTFLoader() {
  Inherit(this, Component);
  const self = this,
    TYPE_ARRAY = {
      5121: Uint8Array,
      5122: Int16Array,
      5123: Uint16Array,
      5125: Uint32Array,
      5126: Float32Array,
      'image/jpeg': Uint8Array,
      'image/png': Uint8Array,
    },
    TYPE_SIZE = {
      SCALAR: 1,
      VEC2: 2,
      VEC3: 3,
      VEC4: 4,
      MAT2: 4,
      MAT3: 9,
      MAT4: 16,
    },
    ATTRIBUTES = {
      POSITION: 'position',
      NORMAL: 'normal',
      TANGENT: 'tangent',
      TEXCOORD_0: 'uv',
      TEXCOORD_1: 'uv2',
      COLOR_0: 'color',
      WEIGHTS_0: 'skinWeight',
      JOINTS_0: 'skinIndex',
    };
  let _sceneLayout, _path, _id;
  new Matrix4();
  self.textures = null;
  let _dracoLoaded = null;
  self.parse = async function (path, sceneLayout) {
    let name = (path = Assets.getPath(path)).split('/');
    name = name[name.length - 1];
    console.log(name);
    name = name.split('.')[0];
    _id = name;
    _path = path;
    sceneLayout && (_sceneLayout = self.initClass(SceneLayout, name));
    let json,
      binary,
      nodes = null;
    if (String(path).indexOf('.glb') > 0) {
      let data = await self.loadBinary(_path);
      json = data.json;
      binary = data.binary;
    }
    String(path).indexOf('.gltf') > 0 &&
      ((json = await fetch(path).then((res) => res.json())),
      (binary = await Promise.all(
        json.buffers.map((buffer) => {
          const uri = this.resolveURI(buffer.uri);
          return fetch(uri).then((res) => res.arrayBuffer());
        }),
      )),
      (binary = binary[0]));
    const desc = json,
      buffers = binary;
    let dracoRequired = false;
    desc.extensionsRequired &&
      desc.extensionsRequired.forEach((extension) => {
        'KHR_draco_mesh_compression' === extension && (dracoRequired = true);
      });
    dracoRequired &&
      (!(function loadDracoLib() {
        _dracoLoaded = Promise.create();
        const useJS = 'object' != typeof WebAssembly,
          libFolder = '~assets/js/lib/_draco/',
          libs = useJS
            ? [`${libFolder}draco_decoder.js`]
            : [`${libFolder}draco_wasm_wrapper.js`, `${libFolder}draco_decoder.wasm`];
        Promise.all(
          libs.map((url, i) =>
            fetch(Assets.getPath(url)).then((res) => {
              if (!res.ok) throw new Error();
              return 0 === i ? res.text() : res.arrayBuffer();
            }),
          ),
        )
          .then(async (loadedLibs) => {
            Thread.upload(
              [
                'function loadDraco() {',
                '/* draco decoder */',
                loadedLibs[0],
                '',
                '/* worker */',
                '',
                'let decoderConfig, decoderPending;',
                '',
                DracoThread.onError.toString(),
                DracoThread.decodeGeometry.toString(),
                DracoThread.decodeIndex.toString(),
                DracoThread.decodeAttribute.toString(),
                DracoThread.getDracoDataType.toString(),
                '',
                'return ' + DracoThread.loadDraco.toString(),
                '};',
              ].join('\n'),
            );
            const pool = Thread.shared(true).array,
              decoderConfig = useJS
                ? {}
                : {
                    wasmBinary: loadedLibs[1],
                  };
            pool.forEach((t) => t.importCode('self.loadDraco = loadDraco();'));
            await Promise.all(
              pool.map((t) =>
                t.loadDraco({
                  type: 'init',
                  decoderConfig: decoderConfig,
                }),
              ),
            );
            _dracoLoaded.resolve();
          })
          .catch(() => {
            console.warn('Draco libs could not be loaded. Fallback to .json');
            _dracoLoaded.reject();
          });
      })(),
      await _dracoLoaded);
    const bufferViews = self.parseBufferViews(desc, buffers),
      images = await self.parseImages(desc, bufferViews),
      textures = await self.parseTextures(desc, images);
    await Promise.all(textures).then((values) => {
      self.textures = values;
    });
    const materials = await self.parseMaterials(desc, textures);
    return (
      (meshes = await self.parseMeshes(desc, bufferViews, materials)),
      (nodes = await self.parseNodes(desc, meshes)),
      nodes
    );
  };
  this.loadBinary = async function (path) {
    let json,
      binary,
      result = Promise.create();
    return (
      fetch(path)
        .then((res) => {
          if (!res.ok) throw new Error();
          return res.arrayBuffer();
        })
        .then(async (gltfBuffer) => {
          const BINARY_EXTENSION_CHUNK_TYPES_JSON = 1313821514,
            BINARY_EXTENSION_CHUNK_TYPES_BIN = 5130562,
            headerView = new DataView(gltfBuffer, 0, 12),
            decoder = new TextDecoder();
          let header_magic = decoder.decode(gltfBuffer.slice(0, 4)),
            header_version = headerView.getUint32(4, true),
            header_length = headerView.getUint32(8, true);
          if ('glTF' !== header_magic)
            throw new Error('GLTFLoader: Unsupported glTF-Binary header.');
          if (header_version < 2) throw new Error('GLTFLoader: Legacy binary file detected.');
          const chunkContentsLength = header_length - 12,
            chunkView = new DataView(gltfBuffer, 12);
          let chunkIndex = 0,
            _content = null;
          for (; chunkIndex < chunkContentsLength; ) {
            const chunkLength = chunkView.getUint32(chunkIndex, true);
            chunkIndex += 4;
            const chunkType = chunkView.getUint32(chunkIndex, true);
            if (((chunkIndex += 4), chunkType === BINARY_EXTENSION_CHUNK_TYPES_JSON)) {
              const contentArray = new Uint8Array(gltfBuffer, 12 + chunkIndex, chunkLength);
              _content = decoder.decode(contentArray);
            } else if (chunkType === BINARY_EXTENSION_CHUNK_TYPES_BIN) {
              const byteOffset = 12 + chunkIndex;
              binary = gltfBuffer.slice(byteOffset, byteOffset + chunkLength);
            }
            chunkIndex += chunkLength;
          }
          if (null === _content) throw new Error('GLTFLoader: JSON content not found.');
          json = JSON.parse(_content);
          console.log(json);
          undefined === json.asset || json.asset.version[0] < 2
            ? onError &&
              onError(
                new Error('GLTFLoader: Unsupported asset. glTF versions >=2.0 are supported.'),
              )
            : result.resolve();
        }),
      await result,
      {
        json: json,
        binary: binary,
      }
    );
  };
  this.parseBufferViews = function (desc, buffers) {
    if (!desc.bufferViews) return null;
    const bufferViews = desc.bufferViews.map((o) => Object.assign({}, o));
    return (
      desc.accessors.forEach(({ bufferView: i, componentType: componentType }) => {
        i < bufferViews.length && (bufferViews[i].componentType = componentType);
      }),
      bufferViews.forEach(
        ({ byteOffset = 0, byteLength: byteLength, componentType: componentType }, i) => {
          bufferViews[i].data = buffers.slice(byteOffset, byteOffset + byteLength);
        },
      ),
      bufferViews
    );
  };
  this.parseMeshes = function (desc, bufferViews, materials) {
    return desc.meshes
      ? desc.meshes.map(({ name: name, primitives: primitives }, index1) => {
          let shader = Utils3D.getTestShader();
          return (
            (shader.side = Shader.DOUBLE_SIDE),
            (primitives = this.parsePrimitives(primitives, desc, bufferViews, materials).map(
              async ({ geometry: geometry, materialDefinition: materialDefinition }, index2) => {
                let setupShader = (el) => {
                  if (!materialDefinition) return;
                  let shader = el.shader;
                  materialDefinition.baseColorTexture &&
                    materialDefinition.baseColorTexture.texture.then((res) => {
                      shader.get('tMap') && shader.set('tMap', res);
                      shader.get('tBaseColor') && shader.set('tBaseColor', res);
                    });
                  materialDefinition.normalTexture &&
                    materialDefinition.normalTexture.texture.then((res) => {
                      shader.get('tNormal') && shader.set('tNormal', res);
                    });
                  materialDefinition.metallicRoughnessTexture &&
                    materialDefinition.metallicRoughnessTexture.texture.then((res) => {
                      shader.get('tMRO') && shader.set('tMRO', res);
                    });
                };
                if ((await geometry.ready, _sceneLayout)) {
                  let naming = `${_id}_mesh_${index1}_${index2}`;
                  name && (naming = naming.concat(`_${name}`));
                  naming = naming.replace(/ /g, '_');
                  let mesh =
                    undefined !== _sceneLayout.exists(naming)
                      ? await _sceneLayout.getLayer(naming)
                      : null;
                  if (mesh) mesh.geometry = geometry;
                  else {
                    let id = await _sceneLayout._createLayer(`${_id}_meshes`, true);
                    mesh = await _sceneLayout.getLayer(String(id));
                    mesh.geometry = geometry;
                    _sceneLayout._rename(id, String(id), naming);
                  }
                  return (setupShader(mesh), mesh);
                }
                {
                  let mesh = new Mesh(geometry, shader);
                  return (setupShader(mesh), mesh);
                }
              },
            )),
            primitives
          );
        })
      : null;
  };
  this.parsePrimitives = function (primitives, desc, bufferViews, materials) {
    return primitives.map(
      ({
        attributes: attributes,
        indices: indices,
        material: materialIndex,
        extensions: extensions,
      }) => {
        let materialDefinition = null;
        undefined !== materialIndex && (materialDefinition = materials[materialIndex]);
        let geometry = new Geometry();
        if (
          ((geometry.ready = Promise.create()), extensions && extensions.KHR_draco_mesh_compression)
        ) {
          const attribs = extensions.KHR_draco_mesh_compression.attributes;
          let dataAttrib = [];
          for (let attribute in attributes) {
            let index = attributes[attribute],
              id = attribs[attribute],
              { componentType: componentType } = desc.accessors[index];
            dataAttrib.push({
              name: attribute,
              id: id,
              type: componentType,
            });
          }
          const { data: data } = bufferViews[extensions.KHR_draco_mesh_compression.bufferView];
          Thread.shared()
            .loadDraco({
              type: 'decode_buffer_gltf',
              buffer: data,
              dataAttrib: dataAttrib,
            })
            .then((res) => {
              for (let att in res) {
                if (res[att].length > 0 && 'index' !== att) {
                  let attributeName = ATTRIBUTES[att],
                    info = new GeometryAttribute(res[att], res[`${att}ItemSize`]);
                  geometry.addAttribute(attributeName, info);
                }
                'index' === att && (geometry.index = res[att]);
              }
              geometry.ready.resolve();
            });
        } else {
          for (let attr in attributes) {
            let buffer = this.parseAccessor(attributes[attr], desc, bufferViews),
              data = new GeometryAttribute(buffer.data, buffer.size);
            geometry.addAttribute(ATTRIBUTES[attr], data);
          }
          if (undefined !== indices) {
            let buffer = this.parseAccessor(indices, desc, bufferViews);
            geometry.index = buffer.data;
          }
          geometry.ready.resolve();
        }
        return {
          geometry: geometry,
          materialDefinition: materialDefinition,
        };
      },
    );
  };
  this.parseAccessor = function (index, desc, bufferViews, _bufferViewIndex = null) {
    let {
      bufferView: bufferViewIndex,
      byteOffset = 0,
      componentType: componentType,
      normalized = false,
      count: count,
      type: type,
      min: min,
      max: max,
    } = desc.accessors[index];
    null !== _bufferViewIndex && (bufferViewIndex = _bufferViewIndex);
    const { data: data, buffer: buffer, byteStride = 0 } = bufferViews[bufferViewIndex],
      size = TYPE_SIZE[type];
    return {
      data: new (0, TYPE_ARRAY[componentType])(data, byteOffset),
      size: size,
      type: componentType,
      normalized: normalized,
      buffer: buffer,
      stride: byteStride,
      offset: byteOffset,
      count: count,
      min: min,
      max: max,
    };
  };
  this.parseNodes = async function (desc, meshes) {
    if (!desc.nodes) return null;
    let nodes = desc.nodes.map(
      async (
        {
          matrix: matrix,
          mesh: meshIndex,
          rotation: rotation,
          scale: scale,
          translation: translation,
          name: name,
        },
        index,
      ) => {
        let node = new Group();
        if (_sceneLayout) {
          let naming = `${_id}_hierarchy_${index}`;
          name && (naming = naming.concat(`_${name}`));
          naming = naming.replace(/ /g, '_');
          let exists = _sceneLayout.exists(naming);
          if (((node = exists ? await _sceneLayout.getLayer(naming) : null), !node)) {
            let ref = await _sceneLayout._createLayer(`${_id}_hierarchy`, true);
            node = await _sceneLayout.getLayer(String(ref));
            _sceneLayout._rename(ref, String(ref), naming);
          }
          node.geometry = new PlaneGeometry(0, 0, 1, 1);
          node._parent = null;
        }
        if ((name && (node.name = name), matrix)) {
          let m = new Matrix4().set(...matrix);
          m = m.transpose();
          node.matrix.copy(m);
          node.matrix.decompose(node.position, node.quaternion, node.scale);
        } else
          (rotation || scale || translation) &&
            (rotation && node.quaternion.set(...rotation),
            scale && node.scale.set(...scale),
            translation && node.position.set(...translation),
            node.updateMatrix());
        return (
          undefined !== meshIndex &&
            meshes[meshIndex].forEach(async (mesh) => {
              mesh.then((res) => {
                node.add(res);
              });
            }),
          node
        );
      },
    );
    return (
      await Promise.all(nodes).then((values) => {
        nodes = values;
      }),
      desc.nodes.forEach(({ children = [] }, i) => {
        children.forEach((childIndex) => {
          nodes[i].add(nodes[childIndex]);
        });
      }),
      nodes.filter((node) => {
        if (null == node._parent) return node;
      })
    );
  };
  this.parseTextures = function (desc, images) {
    return desc.textures
      ? desc.textures.map((textureInfo) => self.createTexture(desc, images, textureInfo))
      : null;
  };
  this.createTexture = async function (
    desc,
    images,
    {
      sampler: samplerIndex,
      source: sourceIndex,
      name: name,
      extensions: extensions,
      extras: extras,
    },
  ) {
    if (undefined === sourceIndex && extensions)
      return void console.warn('extensions required to load texture');
    const image = images[sourceIndex];
    if (image.texture) return image.texture;
    const sampler = undefined !== samplerIndex ? desc.samplers[samplerIndex] : null;
    let options = {};
    sampler &&
      ['magFilter', 'minFilter', 'wrapS', 'wrapT'].forEach((prop) => {
        sampler[prop] && (options[prop] = sampler[prop]);
      });
    await image.ready;
    const texture = new Texture(image);
    return (
      (texture.name = name),
      (texture.flipY = false),
      (texture.wrapS = texture.wrapT = Texture.REPEAT),
      (image.texture = texture),
      texture
    );
  };
  this.parseImages = async function (desc, bufferViews) {
    return desc.images
      ? await Promise.all(
          desc.images.map(
            async ({ uri: uri, bufferView: bufferViewIndex, mimeType: mimeType, name: name }) => {
              if ('image/ktx2' === mimeType)
                return (
                  console.warn('image type is ktx2, update the loader to support this type'),
                  null
                );
              const image = new Image();
              if (((image.name = name), uri)) image.src = this.resolveURI(uri);
              else if (undefined !== bufferViewIndex) {
                const { data: data } = bufferViews[bufferViewIndex],
                  blob = new Blob([data], {
                    type: mimeType,
                  });
                image.src = URL.createObjectURL(blob);
              }
              return (
                (image.ready = new Promise((res) => {
                  image.onload = () => res();
                })),
                image
              );
            },
          ),
        )
      : null;
  };
  this.resolveURI = function (uri) {
    let dir = _path.split('/');
    return (
      dir.pop(),
      (dir = dir.join('/')),
      'string' != typeof uri || '' === uri
        ? ''
        : (/^https?:\/\//i.test(dir) &&
            /^\//.test(uri) &&
            (dir = dir.replace(/(^https?:\/\/[^\/]+).*/i, '$1')),
          /^(https?:)?\/\//i.test(uri) || /^data:.*,.*$/i.test(uri) || /^blob:.*$/i.test(uri)
            ? uri
            : dir + '/' + uri)
    );
  };
  this.parseMaterials = function (desc, textures) {
    return desc.materials
      ? desc.materials.map(
          ({
            name: name,
            extensions: extensions,
            extras: extras,
            pbrMetallicRoughness = {},
            normalTexture: normalTexture,
            occlusionTexture: occlusionTexture,
            emissiveTexture: emissiveTexture,
            emissiveFactor = [0, 0, 0],
            alphaMode = 'OPAQUE',
            alphaCutoff = 0.5,
            doubleSided = false,
          }) => {
            const {
              baseColorFactor = [1, 1, 1, 1],
              baseColorTexture: baseColorTexture,
              metallicFactor = 1,
              roughnessFactor = 1,
              metallicRoughnessTexture: metallicRoughnessTexture,
            } = pbrMetallicRoughness;
            return (
              baseColorTexture && (baseColorTexture.texture = textures[baseColorTexture.index]),
              normalTexture && (normalTexture.texture = textures[normalTexture.index]),
              metallicRoughnessTexture &&
                (metallicRoughnessTexture.texture = textures[metallicRoughnessTexture.index]),
              occlusionTexture && (occlusionTexture.texture = textures[occlusionTexture.index]),
              emissiveTexture && (emissiveTexture.texture = textures[emissiveTexture.index]),
              {
                name: name,
                extensions: extensions,
                extras: extras,
                baseColorFactor: baseColorFactor,
                baseColorTexture: baseColorTexture,
                metallicFactor: metallicFactor,
                roughnessFactor: roughnessFactor,
                metallicRoughnessTexture: metallicRoughnessTexture,
                normalTexture: normalTexture,
                occlusionTexture: occlusionTexture,
                emissiveTexture: emissiveTexture,
                emissiveFactor: emissiveFactor,
                alphaMode: alphaMode,
                alphaCutoff: alphaCutoff,
                doubleSided: doubleSided,
              }
            );
          },
        )
      : null;
  };
});

/*
 * ParticleDistributor — off-main-thread helpers that turn an input
 * mesh / volume into a flat list of particle positions (plus
 * optional normals, UVs, skinning data, per-particle scales and
 * orientations).
 *
 * `init()` (lazy, guarded by `initGenerate` flag) uploads three
 * worker entry points to the Thread pool so the heavy distribution
 * loops don't block the main thread:
 *
 *   1. `distributeParticles({position, count, normal, uv, skinIndex,
 *      skinWeight, offset, scale, orientation})` — picks `count`
 *      random points uniformly distributed on the surface of a
 *      triangle-soup mesh. Triangles are picked proportional to
 *      area (so spawn density is uniform), then a barycentric
 *      random point is sampled. Optional attributes
 *      (normal / uv / skinIndex / skinWeight) are interpolated by
 *      the same barycentric weights. Per-particle `offset`, `scale`,
 *      and `orientation` (quaternion) channels are produced if
 *      requested. All outputs are typed Float32Arrays so the worker
 *      → main transfer is zero-copy via Transferable.
 *   2. `generatePointCloud` — voxelised volume fill (point cloud
 *      from a SDF or AABB).
 *   3. `generatePointGrid`  — regular lattice of points.
 *
 * Scratch vectors / quaternions (`v3`, `v32`, `v33`, `q`) are
 * declared inside the worker function so they're closed over per
 * Thread invocation — no main-thread allocations on each particle
 * call.
 */
Class(function ParticleDistributor() {
  Inherit(this, Component);
  const self = this;
  function init() {
    self.flag('initGenerate') ||
      (self.flag('initGenerate', true),
      Thread.upload(distributeParticles),
      Thread.upload(generatePointCloud),
      Thread.upload(generatePointGrid));
  }
  function distributeParticles(e, id) {
    let {
        position: position,
        count: count,
        normal: normal,
        uv: uv,
        skinIndex: skinIndex,
        skinWeight: skinWeight,
        offset: offset,
        scale: scale,
        orientation: orientation,
      } = e,
      vertices = position.length / 3,
      v3 = new Vector3(),
      v32 = new Vector3(),
      v33 = new Vector3(),
      q = new Quaternion(),
      outputPosition = new Float32Array(3 * count),
      outputNormal = normal ? new Float32Array(3 * count) : null,
      outputUV = uv ? new Float32Array(3 * count) : null,
      outputSkinIndex = skinIndex ? new Float32Array(4 * count) : null,
      outputSkinWeight = skinWeight ? new Float32Array(4 * count) : null;
    for (let i = 0; i < count; i++) {
      let j = 3 * Math.random(0, vertices / 3);
      v3.set(Math.random(0, 100), Math.random(0, 100), Math.random(0, 100));
      let m = 1 / (v3.x + v3.y + v3.z);
      if (
        (v3.set(v3.x * m, v3.y * m, v3.z * m),
        (outputPosition[3 * i + 0] =
          position[3 * j + 0] * v3.x + position[3 * j + 3] * v3.y + position[3 * j + 6] * v3.z),
        (outputPosition[3 * i + 1] =
          position[3 * j + 1] * v3.x + position[3 * j + 4] * v3.y + position[3 * j + 7] * v3.z),
        (outputPosition[3 * i + 2] =
          position[3 * j + 2] * v3.x + position[3 * j + 5] * v3.y + position[3 * j + 8] * v3.z),
        offset)
      ) {
        let randomInstance = Math.random(0, offset.length / 3 - 1);
        v32.fromArray(outputPosition, 3 * i);
        v33.fromArray(scale, 3 * randomInstance);
        v32.multiplyScalar(v33);
        q.fromArray(orientation, 4 * randomInstance);
        v32.applyQuaternion(q);
        v33.fromArray(offset, 3 * randomInstance);
        v32.add(v33);
        v32.toArray(outputPosition, 3 * i);
      }
      if (
        (outputNormal &&
          ((outputNormal[3 * i + 0] =
            normal[3 * j + 0] * v3.x + normal[3 * j + 3] * v3.y + normal[3 * j + 6] * v3.z),
          (outputNormal[3 * i + 1] =
            normal[3 * j + 1] * v3.x + normal[3 * j + 4] * v3.y + normal[3 * j + 7] * v3.z),
          (outputNormal[3 * i + 2] =
            normal[3 * j + 2] * v3.x + normal[3 * j + 5] * v3.y + normal[3 * j + 8] * v3.z)),
        outputUV &&
          ((outputUV[3 * i + 0] =
            uv[2 * j + 0] * v3.x + uv[2 * j + 2] * v3.y + uv[2 * j + 4] * v3.z),
          (outputUV[3 * i + 1] =
            uv[2 * j + 1] * v3.x + uv[2 * j + 3] * v3.y + uv[2 * j + 5] * v3.z)),
        outputSkinIndex)
      ) {
        let skinCluster1 = {};
        skinCluster1[skinIndex[4 * j + 0]] = skinWeight[4 * j + 0];
        skinCluster1[skinIndex[4 * j + 1]] = skinWeight[4 * j + 1];
        skinCluster1[skinIndex[4 * j + 2]] = skinWeight[4 * j + 2];
        skinCluster1[skinIndex[4 * j + 3]] = skinWeight[4 * j + 3];
        let skinCluster2 = {};
        skinCluster2[skinIndex[4 * j + 4]] = skinWeight[4 * j + 4];
        skinCluster2[skinIndex[4 * j + 5]] = skinWeight[4 * j + 5];
        skinCluster2[skinIndex[4 * j + 6]] = skinWeight[4 * j + 6];
        skinCluster2[skinIndex[4 * j + 7]] = skinWeight[4 * j + 7];
        let skinCluster3 = {};
        skinCluster3[skinIndex[4 * j + 8]] = skinWeight[4 * j + 8];
        skinCluster3[skinIndex[4 * j + 9]] = skinWeight[4 * j + 9];
        skinCluster3[skinIndex[4 * j + 10]] = skinWeight[4 * j + 10];
        skinCluster3[skinIndex[4 * j + 11]] = skinWeight[4 * j + 11];
        let indices = [];
        for (let k = 0; k < 12; k++) {
          let index = skinIndex[4 * j + k];
          -1 === indices.indexOf(index) && indices.push(index);
        }
        let clusters = [];
        for (let k = 0; k < indices.length; k++) {
          let index = indices[k];
          clusters.push([
            index,
            (skinCluster1[index] || 0) * v3.x +
              (skinCluster2[index] || 0) * v3.y +
              (skinCluster3[index] || 0) * v3.z,
          ]);
        }
        clusters.sort(function (a, b) {
          return b[1] - a[1];
        });
        for (let l = clusters.length - 1; l < 4; l++) clusters.push([0, 0]);
        let sum = clusters[0][1] + clusters[1][1] + clusters[2][1] + clusters[3][1];
        outputSkinIndex[4 * i + 0] = clusters[0][0];
        outputSkinIndex[4 * i + 1] = clusters[1][0];
        outputSkinIndex[4 * i + 2] = clusters[2][0];
        outputSkinIndex[4 * i + 3] = clusters[3][0];
        outputSkinWeight[4 * i + 0] = clusters[0][1] * (1 / sum);
        outputSkinWeight[4 * i + 1] = clusters[1][1] * (1 / sum);
        outputSkinWeight[4 * i + 2] = clusters[2][1] * (1 / sum);
        outputSkinWeight[4 * i + 3] = clusters[3][1] * (1 / sum);
      }
    }
    let output = {},
      buffer = [];
    output.position = outputPosition;
    buffer.push(outputPosition.buffer);
    outputNormal && ((output.normal = outputNormal), buffer.push(outputNormal.buffer));
    outputUV && ((output.uv = outputUV), buffer.push(outputUV.buffer));
    outputSkinIndex &&
      ((output.skinIndex = outputSkinIndex),
      (output.skinWeight = outputSkinWeight),
      buffer.push(outputSkinIndex.buffer),
      buffer.push(outputSkinWeight.buffer));
    resolve(output, id, buffer);
  }
  function generatePointCloud({ path: path, textureSize: textureSize }, id) {
    !(async function () {
      try {
        let data = await get(path),
          totalParticles = textureSize * textureSize,
          positions = new Float32Array(3 * totalParticles),
          colors = new Float32Array(3 * totalParticles);
        for (let i = 0; i < totalParticles; i++) {
          positions[3 * i + 0] = data.data.attributes.positions.array[3 * i + 0];
          positions[3 * i + 1] = data.data.attributes.positions.array[3 * i + 1];
          positions[3 * i + 2] = data.data.attributes.positions.array[3 * i + 2];
          colors[3 * i + 0] = data.data.attributes.colors.array[3 * i + 0];
          colors[3 * i + 1] = data.data.attributes.colors.array[3 * i + 1];
          colors[3 * i + 2] = data.data.attributes.colors.array[3 * i + 2];
        }
        data.positions = positions;
        data.colors = colors;
        resolve(data, id, [data.positions.buffer, data.colors.buffer]);
      } catch (e) {
        throw (console.log(e), `Could not load Point Cloud for ${path}`);
      }
    })();
  }
  function generatePointGrid({ path: path, particleCount: particleCount }, id) {
    let split = path.split('generateGrid-')[1].split('-'),
      dir = split[0],
      scale = Number(split[1]),
      textureSize = (Number(split[2]), Number(split[split.length - 1].split('.')[0])),
      totalParticles = particleCount,
      positions = new Float32Array(3 * totalParticles),
      colors = new Float32Array(3 * totalParticles);
    for (let i = 0; i < totalParticles; i++) {
      let p0 = i / textureSize,
        y = Math.floor(p0),
        x = p0 - y;
      y /= textureSize;
      x = Math.range(x, 0, 1, -scale / 2, scale / 2);
      y = Math.range(y, 0, 1, -scale / 2, scale / 2);
      'xz' == dir
        ? ((positions[3 * i + 0] = x), (positions[3 * i + 1] = 0), (positions[3 * i + 2] = y))
        : ((positions[3 * i + 0] = x), (positions[3 * i + 1] = y), (positions[3 * i + 2] = 0));
      colors[3 * i + 0] = 1;
      colors[3 * i + 1] = 1;
      colors[3 * i + 2] = 1;
    }
    resolve(
      {
        colors: colors,
        positions: positions,
      },
      id,
      [colors.buffer, positions.buffer],
    );
  }
  this.generate = async function (geom, count) {
    init();
    let position = new Float32Array(geom.attributes.position.array);
    return (
      await Thread.shared().distributeParticles(
        {
          position: position,
          count: count,
        },
        [position.buffer],
      )
    ).position;
  };
  this.generateInstanced = async function (geom, count) {
    init();
    let position = new Float32Array(geom.attributes.position.array),
      offset = new Float32Array(geom.attributes.offset.array),
      scale = new Float32Array(geom.attributes.scale.array),
      orientation = new Float32Array(geom.attributes.orientation.array);
    return (
      await Thread.shared().distributeParticles(
        {
          position: position,
          offset: offset,
          scale: scale,
          orientation: orientation,
          count: count,
        },
        [position.buffer, offset.buffer, scale.buffer, orientation.buffer],
      )
    ).position;
  };
  this.generateAll = async function (geom, count) {
    init();
    let position = new Float32Array(geom.attributes.position.array),
      normal = new Float32Array(geom.attributes.normal.array),
      uv = new Float32Array(geom.attributes.uv.array);
    return await Thread.shared().distributeParticles(
      {
        position: position,
        normal: normal,
        uv: uv,
        count: count,
      },
      [position.buffer, normal.buffer, uv.buffer],
    );
  };
  this.generateSkinned = async function (geom, count) {
    init();
    let position = new Float32Array(geom.attributes.position.array),
      normal = new Float32Array(geom.attributes.normal.array),
      uv = new Float32Array(geom.attributes.uv.array),
      skinIndex = new Float32Array(geom.attributes.skinIndex.array),
      skinWeight = new Float32Array(geom.attributes.skinWeight.array);
    return await Thread.shared().distributeParticles(
      {
        position: position,
        normal: normal,
        uv: uv,
        skinIndex: skinIndex,
        skinWeight: skinWeight,
        count: count,
      },
      [position.buffer, normal.buffer, uv.buffer, skinIndex.buffer, skinWeight.buffer],
    );
  };
  this.generatePointCloud = async function (path, textureSize) {
    path.includes('assets/geometry') || (path = 'assets/geometry/' + path);
    path.includes('.json') || path.includes('.bin') || (path += '.bin');
    let data,
      isBinary = path.includes('.bin');
    if (((path = Assets.getPath(path)), init(), isBinary)) {
      await GeomThread.loadDracoLib();
      data = await Thread.shared().loadDraco({
        type: 'decode',
        path: Thread.absolutePath(path),
      });
    } else {
      let fn = path.includes('generateGrid')
        ? Thread.shared().generatePointGrid
        : Thread.shared().generatePointCloud;
      data = await fn({
        path: Thread.absolutePath(path),
        textureSize: textureSize,
      });
    }
    return {
      positions: new AntimatterAttribute(data.positions, 3),
      colors: new AntimatterAttribute(data.colors, 3),
    };
  };
}, 'static');

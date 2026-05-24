/*
 * Skin — skeletal-mesh primitive. Extends Mesh with a bone
 * hierarchy and a GPU-uploaded matrix palette so the vertex shader
 * can transform each vertex by its weighted bone matrices.
 *
 * Construction (geometry, shader, bones=geometry.bones):
 *   - `isSkin = true` — duck-type flag used elsewhere.
 *   - `createBones`        — instantiates Base3D nodes for every
 *     bone, parents them per the input data's `parent` indices
 *     (-1 → root), normalises quaternions, then captures
 *     `bindInverse = inverse(matrixWorld)` for each — the inverse
 *     bind pose that turns the bone's runtime world matrix into a
 *     skinning offset.
 *   - `createBoneTexture`  — chooses the smallest square texture
 *     side ≥ 4 that fits `4*bones` floats (each bone matrix = 4×4
 *     floats = 16 floats = 4 RGBA texels). The `Float32Array`
 *     `boneMatrices` is shared between three DataTextures
 *     (`boneTextureA/B/C`) so the GPU upload can be triple-buffered.
 *
 * Shader integration:
 *   - `boneTexture` / `boneTextureSize` uniforms are added to the
 *     shader so the skinning code can sample the palette.
 *
 * Animation:
 *   - `addAnimation(data)` constructs a `SkinAnimation` (0307);
 *     `loadAnimation(path)` fetches `assets/geometry/...json` (the
 *     extension is added if missing).
 *   - `update()` is the per-frame driver: sums every animation's
 *     `weight`, then ticks each with the total so they blend by
 *     proportion. The first animation is the "set" base (the
 *     `0 === i` flag passes into `update(total, isSet)`).
 *
 * `updateMatrixWorld(force)`:
 *   - Cascades into the parent Mesh, then propagates through the
 *     internal bone hierarchy (`root.updateMatrixWorld(true)`).
 *   - Builds each bone's skinning matrix: `tempMat4 = boneWorld *
 *     bindInverse`, then writes 16 floats into `boneMatrices` at
 *     offset `16*i`.
 *   - Triple-buffer rotation via `pingPong` (0 / 1 / 2): the
 *     current frame draws from one texture while the next pair is
 *     `manualUpdateDynamic`-uploaded, dodging the GPU stall that
 *     would happen if you re-uploaded the same texture each frame
 *     while it was still being sampled.
 */
class Skin extends Mesh {
  constructor(geometry, shader, bones = geometry.bones) {
    super(geometry, shader);
    this.isSkin = true;
    this.createBones(bones);
    this.createBoneTexture();
    this.animations = [];
    this.pingPong = -1;
    Object.assign(this.shader.uniforms, {
      boneTexture: {
        value: this.boneTextureA,
      },
      boneTextureSize: {
        value: this.boneTextureSize,
      },
    });
  }
  createBones(bonesData) {
    this.root = new Base3D();
    this.bones = [];
    bonesData.forEach((data) => {
      const bone = new Base3D();
      bone.name = data.name;
      bone.position.set(...data.pos);
      bone.quaternion.set(...data.rot);
      bone.quaternion.normalize();
      bone.scale.set(...data.scl);
      this.bones.push(bone);
    });
    bonesData.forEach((data, i) => {
      if (-1 === data.parent) return this.root.add(this.bones[i]);
      this.bones[data.parent].add(this.bones[i]);
    });
    this.root.updateMatrixWorld(true);
    this.bones.forEach((bone) => {
      bone.bindInverse = new Matrix4().copy(bone.matrixWorld);
      bone.bindInverse = bone.bindInverse.getInverse(bone.bindInverse);
    });
  }
  createBoneTexture() {
    const size = Math.max(
      4,
      Math.pow(2, Math.ceil(Math.log(Math.sqrt(4 * this.bones.length)) / Math.LN2)),
    );
    this.boneMatrices = new Float32Array(size * size * 4);
    this.boneTextureSize = size;
    this.boneTextureA = new DataTexture(this.boneMatrices, size, size);
    this.boneTextureB = new DataTexture(this.boneMatrices, size, size);
    this.boneTextureC = new DataTexture(this.boneMatrices, size, size);
  }
  addAnimation(data) {
    const animation = new SkinAnimation(this, data);
    return (this.animations.push(animation), animation);
  }
  async loadAnimation(path) {
    path.includes('assets/geometry/') || (path = 'assets/geometry/' + path);
    path.includes('.') || (path += '.json');
    path = Thread.absolutePath(Assets.getPath(path));
    const data = await get(path);
    return this.addAnimation(data);
  }
  update() {
    let total = 0;
    this.animations.forEach((animation) => (total += animation.weight));
    this.animations.forEach((animation, i) => {
      animation.update(total || 1, 0 === i);
    });
  }
  updateMatrixWorld(force) {
    switch (
      (super.updateMatrixWorld(force),
      this.root.updateMatrixWorld(true),
      this.bones.forEach((bone, i) => {
        Skin.tempMat4.multiplyMatrices(bone.matrixWorld, bone.bindInverse);
        this.boneMatrices.set(Skin.tempMat4.elements, 16 * i);
      }),
      this.pingPong++,
      this.pingPong > 2 && (this.pingPong = 0),
      this.pingPong)
    ) {
      case 0:
        this.shader.uniforms.boneTexture.value = this.boneTextureA;
        Texture.renderer.manualUpdateDynamic(this.boneTextureB);
        break;
      case 1:
        this.shader.uniforms.boneTexture.value = this.boneTextureB;
        Texture.renderer.manualUpdateDynamic(this.boneTextureC);
        break;
      case 2:
        this.shader.uniforms.boneTexture.value = this.boneTextureC;
        Texture.renderer.manualUpdateDynamic(this.boneTextureA);
    }
  }
}

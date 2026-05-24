/*
 * MirrorRenderer — math-heavy reflection camera. Computes the
 * virtual camera that, when rendered, produces the correct
 * reflection of the world across a planar mirror surface.
 *
 * Inputs:
 *   - `camera`           — the real (eye) camera to reflect.
 *   - `options.width/height` — RT size for the reflection (default
 *     512² ).
 *   - `options.clipBias` — small offset away from the mirror plane
 *     to avoid self-occlusion / Z-fighting near the surface.
 *   - `options.sx/tx`    — UV scale/translate applied when projecting
 *     the reflection RT onto the mirror surface. Default sx=0.5,
 *     tx=0 (typical [0..1] → [-1..1] mapping).
 *   - `options.mipmaps`  — generate mipmaps + LINEAR_MIPMAP filter
 *     (glossy / blurred reflections).
 *   - `options.format`   — RGB by default; RGBA available for
 *     compositing.
 *   - `options.renderTarget` — bring-your-own RT (lets several
 *     mirrors share one big RT atlas).
 *
 * State (all reusable scratch — never reallocated per frame):
 *   - `mirrorPlane`         — `Plane` representing the mirror in
 *     world space (computed each frame from mirror transform).
 *   - `normal` / `normalDir` — surface normal (Z+ by default, since
 *     the canonical mirror is a Z-facing quad).
 *   - `mirrorWorldPosition`, `cameraWorldPosition`,
 *     `rotationMatrix`, `lookAtPosition` — used while computing the
 *     reflected camera's position and orientation.
 *   - `clipPlane` — Vector4 packed plane equation for the oblique
 *     near-clipping that culls geometry behind the mirror.
 *   - `textureMatrix` — the projector matrix the host shader uses
 *     to sample the reflection RT in screen space.
 *   - `mirrorCamera` — clone of the eye camera, repositioned each
 *     frame to the reflected viewpoint.
 *
 * The render flow (later in the file): compute the mirror plane
 * from the renderer's world transform → mirror the eye camera about
 * that plane → build the oblique projection matrix that uses the
 * mirror plane itself as the near-clip → render the scene from the
 * mirror camera into `renderTarget`.
 */
class MirrorRenderer extends Base3D {
  constructor(camera, options = {}) {
    super();
    this._camera = camera;
    this.autoClear = options.autoClear ?? true;
    this.width = options.width || 512;
    this.height = options.height || 512;
    this.clipBias = options.clipBias || 0;
    this.sx = options.sx || 0.5;
    this.tx = options.tx || 0;
    this.renderer = World.RENDERER;
    this.mirrorPlane = new Plane();
    this.normalDir = new Vector3(0, 0, 1);
    this.normal = new Vector3(0, 0, 1);
    this.mirrorWorldPosition = new Vector3();
    this.cameraWorldPosition = new Vector3();
    this.rotationMatrix = new Matrix4();
    this.lookAtPosition = new Vector3(0, 0, -1);
    this.clipPlane = new Vector4();
    this.textureMatrix = new Matrix4();
    this.mirrorCamera = this._camera.clone();
    let filter = options.mipmaps ? Texture.LINEAR_MIPMAP : Texture.LINEAR;
    this.renderTarget =
      options.renderTarget ||
      new RenderTarget(this.width, this.height, {
        minFilter: filter,
        magFilter: filter,
        format: options.format || Texture.RGBFormat,
        generateMipmaps: options.mipmaps || false,
      });
    this.viewVec = new Vector3();
    this.targetVec = new Vector3();
    this.q = new Quaternion();
    this.updateTextureMatrix();
  }
  updateTextureMatrix() {
    this.updateMatrixWorld();
    this._camera.updateMatrixWorld();
    this.mirrorWorldPosition.setFromMatrixPosition(this.matrixWorld);
    this.cameraWorldPosition.setFromMatrixPosition(this._camera.matrixWorld);
    this.rotationMatrix.extractRotation(this.matrixWorld);
    this.normal.copy(this.normalDir);
    this.normal.applyMatrix4(this.rotationMatrix);
    this.viewVec.copy(this.mirrorWorldPosition).sub(this.cameraWorldPosition);
    this.viewVec.reflect(this.normal).negate();
    this.viewVec.add(this.mirrorWorldPosition);
    this.rotationMatrix.extractRotation(this._camera.matrixWorld);
    this.lookAtPosition.set(0, 0, -1);
    this.lookAtPosition.applyMatrix4(this.rotationMatrix);
    this.lookAtPosition.add(this.cameraWorldPosition);
    this.targetVec.copy(this.mirrorWorldPosition).sub(this.lookAtPosition);
    this.targetVec.reflect(this.normal).negate();
    this.targetVec.add(this.mirrorWorldPosition);
    this.up.set(0, -1, 0);
    this.up.applyMatrix4(this.rotationMatrix);
    this.up.reflect(this.normal).negate();
    this.mirrorCamera.position.copy(this.viewVec);
    this.mirrorCamera.up = this.up;
    this.mirrorCamera.lookAt(this.targetVec);
    this.mirrorCamera.updateMatrixWorld();
    this.mirrorCamera.projectionMatrix.copy(this._camera.projectionMatrix);
    this.textureMatrix.set(
      this.sx,
      0,
      0,
      this.sx + this.tx,
      0,
      0.5,
      0,
      0.5,
      0,
      0,
      0.5,
      0.5,
      0,
      0,
      0,
      1,
    );
    this.textureMatrix.multiply(this.mirrorCamera.projectionMatrix);
    this.textureMatrix.multiply(this.mirrorCamera.matrixWorldInverse);
    this.mirrorPlane.setFromNormalAndCoplanarPoint(this.normal, this.mirrorWorldPosition);
    this.mirrorPlane.applyMatrix4(this.mirrorCamera.matrixWorldInverse);
    this.clipPlane.set(
      this.mirrorPlane.normal.x,
      this.mirrorPlane.normal.y,
      this.mirrorPlane.normal.z,
      this.mirrorPlane.constant,
    );
    let projectionMatrix = this.mirrorCamera.projectionMatrix,
      q = this.q;
    q.x =
      (Math.sign(this.clipPlane.x) + projectionMatrix.elements[8]) / projectionMatrix.elements[0];
    q.y =
      (Math.sign(this.clipPlane.y) + projectionMatrix.elements[9]) / projectionMatrix.elements[5];
    q.z = -1;
    q.w = (1 + projectionMatrix.elements[10]) / projectionMatrix.elements[14];
    let c = this.clipPlane.multiplyScalar(2 / this.clipPlane.dot(q));
    projectionMatrix.elements[2] = c.x;
    projectionMatrix.elements[6] = c.y;
    projectionMatrix.elements[10] = c.z + 1 - this.clipBias;
    projectionMatrix.elements[14] = c.w;
  }
  render(scene) {
    this.updateTextureMatrix();
    FX.Mirror.isMirrorUniform.value = 1;
    let autoClear = this.renderer.autoClear;
    this.renderer.autoClear = this.autoClear;
    this.renderer.render(scene, this.mirrorCamera, this.renderTarget);
    this.renderer.autoClear = autoClear;
    FX.Mirror.isMirrorUniform.value = 0;
  }
  destroy() {
    this.renderTarget.destroy();
  }
  set camera(c) {
    this._camera = c;
    this.mirrorCamera = c.clone();
  }
  get camera() {
    return this._camera;
  }
}

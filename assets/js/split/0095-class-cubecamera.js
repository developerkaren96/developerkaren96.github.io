/*
 * CubeCamera — six perspective cameras arranged on the six face normals
 * of a cube, rendering into a CubeRenderTarget. Used to capture an
 * environment map of the scene from a single world-space position
 * (reflections, refractions, IBL probes, dynamic skyboxes).
 *
 * Layout:
 *   px / nx → ±X, py / ny → ±Y, pz / nz → ±Z
 * Each sub-camera has a 90° fov and 1:1 aspect (a cube face). Their
 * `up` vectors are chosen so the resulting faces stitch together with
 * the standard cubemap orientation:
 *   - +X / -X / +Z / -Z look horizontally, `up = (0, -1, 0)` (so the
 *     world's +Y stays "down" in the captured face — this matches the
 *     legacy OpenGL cubemap convention used by Three.js / WebGL).
 *   - +Y / -Y look straight up/down, with `up = (0, 0, ±1)`.
 *
 * Per-frame `render(scene, renderer)`:
 *   1. Refresh world matrices so each sub-camera tracks the
 *      CubeCamera's parent transform.
 *   2. For each face (0..5), set `rt.activeFace` so the FBO binding
 *      attaches the correct cube-map slice, then render. Optional
 *      `beforeRender`/`afterRender` hooks let callers tweak per-face
 *      state (e.g. disabling certain meshes, swapping environment).
 *
 * The `rt` (`CubeRenderTarget`) is `cubeResolution`² per face. After
 * `render()`, `rt` is ready to be sampled as a `samplerCube` uniform.
 */
class CubeCamera extends Base3D {
  constructor(near = 0.1, far = 1e3, cubeResolution = 512) {
    super();

    // +X face: look down the +X axis. up=(0,-1,0) flips so the cubemap
    // convention is respected when sampled.
    this.px = new PerspectiveCamera(90, 1, near, far);
    this.px.up.set(0, -1, 0);
    this.px.lookAt(new Vector3(1, 0, 0));
    this.add(this.px);

    // -X
    this.nx = new PerspectiveCamera(90, 1, near, far);
    this.nx.up.set(0, -1, 0);
    this.nx.lookAt(new Vector3(-1, 0, 0));
    this.add(this.nx);

    // +Y face: looking straight up; up vector along +Z to keep stitching.
    this.py = new PerspectiveCamera(90, 1, near, far);
    this.py.up.set(0, 0, 1);
    this.py.lookAt(new Vector3(0, 1, 0));
    this.add(this.py);

    // -Y face: looking down; up along -Z.
    this.ny = new PerspectiveCamera(90, 1, near, far);
    this.ny.up.set(0, 0, -1);
    this.ny.lookAt(new Vector3(0, -1, 0));
    this.add(this.ny);

    // +Z
    this.pz = new PerspectiveCamera(90, 1, near, far);
    this.pz.up.set(0, -1, 0);
    this.pz.lookAt(new Vector3(0, 0, 1));
    this.add(this.pz);

    // -Z
    this.nz = new PerspectiveCamera(90, 1, near, far);
    this.nz.up.set(0, -1, 0);
    this.nz.lookAt(new Vector3(0, 0, -1));
    this.add(this.nz);

    this.rt = new CubeRenderTarget(cubeResolution, cubeResolution);
  }

  /*
   * Capture all six faces into `rt`. activeFace indices follow the cube
   * map ordering: 0=+X, 1=-X, 2=+Y, 3=-Y, 4=+Z, 5=-Z.
   */
  render(scene = World.SCENE, renderer = World.RENDERER) {
    const rt = this.rt;
    this.updateMatrixWorld(true);

    const renderFace = (camera, faceIndex) => {
      if (this.beforeRender) this.beforeRender(camera);
      rt.activeFace = faceIndex;
      renderer.render(scene, camera, rt);
      if (this.afterRender) this.afterRender(rt);
    };

    renderFace(this.px, 0);
    renderFace(this.nx, 1);
    renderFace(this.py, 2);
    renderFace(this.ny, 3);
    renderFace(this.pz, 4);
    renderFace(this.nz, 5);
  }
}

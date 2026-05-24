/*
 * CubemapToEquirectangular — utility that re-projects a Three.js cube
 * render-target (6 faces) into a single 2:1 equirectangular texture
 * (sphere unwrap, latitude-longitude layout). Used for:
 *   • Saving a 360° panoramic screenshot of the scene
 *     (toBlob → PNG download).
 *   • Feeding the equirect texture into systems that expect that
 *     format (e.g., baking a skybox, IBL preprocessing).
 *
 * Constructor `(_size, _cube)`:
 *   _size — output width in pixels. Output height is _size/2 (2:1).
 *   _cube — either a render-target or a wrapper exposing `.rt`. The
 *           cube's six faces are sampled by the shader at runtime.
 *
 * Pipeline:
 *   1. Create a `_size × _size/2` render target (_output) via
 *      Utils3D.createRT.
 *   2. Build a fullscreen quad (World.QUAD) with the 'Cube2Equi'
 *      shader. The shader takes uniform `tCube` (the cube RT) and
 *      remaps each output texel (u,v) → (longitude, latitude) →
 *      direction vector → cube sample.
 *   3. Position the quad in an OrthographicCamera scene sized to
 *      width × height. The quad scale (width/2, height/2, 1) matches
 *      the ortho frustum so it covers the screen exactly.
 *   4. `render()` — renders the scene into _output. _output.rt is
 *      exposed as `this.rt`.
 *
 * `toBlob()`:
 *   Pull pixels back to CPU via `readPixels` (GPU → typed array), wrap
 *   in ImageData, blit into a 2D canvas, then canvas.toBlob → PNG.
 *   Triggers a click on a hidden <a download> to save with a name like
 *   `pano-<doc-title>-<timestamp>.png`.
 *
 *   The anchor is briefly appended to DOM (some browsers refuse to
 *   click links not attached to document); the setTimeout(0) defers
 *   the click+remove past the current tick.
 *
 *   Performance note: readPixels is a GPU→CPU sync barrier; expensive
 *   on large outputs. Suitable for user-triggered snapshots, not
 *   per-frame.
 */
Class(function CubemapToEquirectangular(_size, _cube) {
  Inherit(this, Component);
  const self = this;

  let _quad;
  const _scene  = new Scene();
  const _camera = new OrthographicCamera(-0.5, 0.5, 0.5, -0.5, -10000, 10000);
  const _output = Utils3D.createRT(_size, _size / 2);
  this.rt = _output;

  (function buildScene() {
    const width  = _size;
    const height = _size / 2;

    // Cube2Equi: GLSL sampler that maps (u,v) → spherical direction.
    const shader = self.initClass(Shader, 'Cube2Equi', {
      tCube: { value: _cube.rt || _cube },
      side:  Shader.DOUBLE_SIDE,
    });

    _quad = new Mesh(World.QUAD, shader);
    _quad.frustumCulled = false;
    _scene.add(_quad);
    _quad.scale.set(width / 2, height / 2, 1);

    _camera.left   = width  / -2;
    _camera.right  = width  /  2;
    _camera.top    = height /  2;
    _camera.bottom = height / -2;
    _camera.updateProjectionMatrix();
  })();

  this.render = function () {
    World.RENDERER.render(_scene, _camera, _output);
  };

  /*
   * Render → readPixels → ImageData → 2D canvas → PNG blob → download.
   * Synchronous GPU readback; only safe for user-triggered captures.
   */
  this.toBlob = function () {
    self.render();
    const pixels    = World.RENDERER.readPixels(_output, 0, 0, _size, _size / 2);
    const imageData = new ImageData(new Uint8ClampedArray(pixels), _size, _size / 2);
    const canvas    = document.createElement('canvas');
    canvas.width  = _size;
    canvas.height = _size / 2;
    canvas.getContext('2d').putImageData(imageData, 0, 0);

    canvas.toBlob(function (blob) {
      const url      = URL.createObjectURL(blob);
      const fileName = 'pano-' + document.title + '-' + Date.now() + '.png';
      const anchor   = document.createElement('a');
      anchor.href = url;
      anchor.setAttribute('download', fileName);
      anchor.className = 'download-js-link';
      anchor.innerHTML = 'downloading...';
      anchor.style.display = 'none';
      document.body.appendChild(anchor);

      // Defer click → removal past the current tick (some browsers
      // require the anchor to be in DOM at click-dispatch time).
      setTimeout(function () {
        anchor.click();
        document.body.removeChild(anchor);
      }, 1);
    }, 'image/png');
  };
});

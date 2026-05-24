/*
 * RenderManagerCamera — singleton holding the default world camera.
 * Picks the `THREE.PerspectiveCamera` constructor if Three.js is
 * loaded (some builds delegate to Three for the camera math),
 * otherwise the internal `PerspectiveCamera`. fov=30°, near=0.1,
 * far=1000. Subscribes to `Events.RESIZE` so the aspect ratio
 * tracks the Stage automatically.
 */
Class(function RenderManagerCamera() {
  Inherit(this, Component);
  const self = this;
  this.worldCamera = window.THREE
    ? new THREE.PerspectiveCamera(30, Stage.width / Stage.height, 0.1, 1e3)
    : new PerspectiveCamera(30, Stage.width / Stage.height, 0.1, 1e3);
  self.events.sub(Events.RESIZE, () => {
    self.worldCamera.aspect = Stage.width / Stage.height;
    self.worldCamera.updateProjectionMatrix();
  });
});

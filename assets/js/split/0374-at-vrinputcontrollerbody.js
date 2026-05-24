/*
 * VRInputControllerBody — default visual body for a VR
 * controller (used by VRInputController when no custom `body`
 * Class is supplied via setControllerObject).
 *
 * Async init: loads `~assets/geometry/hand_indexed.bin` via
 * GeomThread (worker-side indexed-geometry decoder), builds the
 * `VRInputControllerDefault` shader (semi-transparent, double-
 * sided, depthWrite off, uAlpha 0.5), and attaches a renderOrder
 * 9999 mesh to `self.group`. The mesh is exposed as `self.mesh`
 * for outer code (e.g. UserInputVRController) to reference.
 */
Class(function VRInputControllerBody() {
  Inherit(this, Object3D);
  const self = this;
  !(async function () {
    let geom = await GeomThread.loadGeometry(Assets.getPath('~assets/geometry/hand_indexed.bin')),
      shader = self.initClass(Shader, 'VRInputControllerDefault', {
        uAlpha: {
          value: 0.5,
        },
        transparent: true,
        depthWrite: false,
        side: Shader.DOUBLE_SIDE,
      }),
      mesh = new Mesh(geom, shader);
    self.group.add(mesh);
    self.mesh = mesh;
    mesh.renderOrder = 9999;
  })();
});

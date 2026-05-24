/*
 * LightDebug — editor-only visual gizmo for a Light. Renders a
 * small sphere at the light's origin (colored to match the light)
 * plus a type-dependent influence indicator:
 *
 *   - type 0 / 1 / -1 (point / dir): wireframe icosahedron scaled
 *     by `_light.distance`, animated to follow distance changes via
 *     `startRender`. The icosphere shows the falloff radius.
 *   - type 2 (spot): just the origin sphere (cone visualisation is
 *     handled elsewhere or omitted in this build).
 *   - type 3 (area): a double-sided plane scaled to `(width,
 *     height, 1)`, also live-tracking the light's dimensions per
 *     frame.
 *
 * All visualisations use `Utils3D.getTestShader(color)` with
 * `depthTest: false` so they always render on top, and either
 * `transparent` + low alpha (for the falloff bound) or solid color
 * (origin sphere) so the visuals don't occlude the scene.
 *
 * `onDestroy` un-parents the gizmo's group from its parent — used
 * by the editor when toggling debug visuals off.
 */
Class(function LightDebug(_type, _light, _folder) {
  Inherit(this, Object3D);
  const self = this;
  function createLight() {
    let geom = World.SPHERE,
      shader = Utils3D.getTestShader(_light.color);
    shader.set('color', _light.color);
    shader.depthTest = false;
    shader.transparent = true;
    let mesh = new Mesh(geom, shader);
    mesh.scale.setScalar(0.5);
    self.add(mesh);
  }
  !(function () {
    switch (_type) {
      case -1:
      case 1:
      case 0:
        !(function initPoint() {
          createLight();
          let geom = new IcosahedronGeometry(1, 1),
            shader = Utils3D.getTestShader(_light.color);
          shader.set('color', _light.color);
          shader.wireframe = true;
          shader.transparent = true;
          shader.set('alpha', 0.2);
          let mesh = new Mesh(geom, shader);
          mesh.scale.setScalar(_light.distance);
          self.add(mesh);
          self.startRender((_) => mesh.scale.setScalar(_light.distance));
        })();
        break;
      case 2:
        !(function initSpot() {
          createLight();
        })();
        break;
      case 3:
        !(function initArea() {
          let geom = World.PLANE,
            shader = Utils3D.getTestShader(_light.color);
          shader.set('color', _light.color);
          shader.transparent = true;
          shader.side = Shader.DOUBLE_SIDE;
          let mesh = new Mesh(geom, shader);
          self.add(mesh);
          self.startRender((_) => mesh.scale.set(_light.width, _light.height, 1));
        })();
    }
  })();
  this.onDestroy = function () {
    self.parent.group.remove(self.group);
  };
});

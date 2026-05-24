/*
 * TriangleInstance — XComponent renderer module for a Proton
 * particle system. Builds a single equilateral-triangle
 * Geometry (sideLength 0.5, height = side·√3/2), pipes it
 * through proton.applyToInstancedGeometry so each particle
 * spawns one triangle instance, and binds 'TriangleParticleShader'.
 *
 * Standard Fragment plumbing.
 */
Class(function TriangleInstance(_proton, _group, _input) {
  const self = this;
  Inherit(self, Component);
  Inherit(self, Object3D);
  Inherit(self, XComponent);
  self.fragName = 'TriangleInstance';
  self.contexts = 'Component,Object3D';
  self.proton = _proton;
  self.uilInput = _input;
  self.uilFolder = _group;
  this.isFragment = true;
  var _promises = [];
  !(async function () {
    self.element && (self.element.onMountedHook = (_) => self.onMounted?.());
    self.proton = _proton;
    self.uilInput = _input;
    self.uilFolder = _group;
    self.parent?.layers && (self.layers = self.parent.layers);
    self.layout?.getAllLayers && (self.layers = await self.layout.getAllLayers());
    let geom = (function createEquilateralTriangleGeometry(sideLength) {
      const height = (sideLength * Math.sqrt(3)) / 2,
        vertices = new Float32Array([0, height, 0, -sideLength / 2, 0, 0, sideLength / 2, 0, 0]),
        geometry = new Geometry();
      return (
        geometry.addAttribute('position', new GeometryAttribute(vertices, 3)),
        geometry.computeVertexNormals(),
        geometry
      );
    })(0.5);
    self.proton.applyToInstancedGeometry(geom);
    let shader = self.createFragment(Shader, 'TriangleParticleShader', {}),
      mesh = new Mesh(geom, shader);
    self.add(mesh);
    for (let key in self)
      if (self[key]?.then) {
        let store = self[key];
        store.then((val) => (self[key] = val));
        _promises.push(store);
      }
    _promises.length && (await Promise.all(_promises));
    _promises = null;
    self.flag?.('__ready', true);
    self.onInit?.();
  })();
});

/*
 * VRInputControllerBeam — the laser pointer mesh for a VR
 * controller. A tapered cylinder (radius 0.005 → 0, length 2)
 * laid forward (z = -1, rotated 90° around X), rendered with
 * the `VRInputControllerBeam` shader at renderOrder 9999 so it
 * sits over everything.
 *
 * Class-level state: `_color` (default '#ffffff') and
 * `setColor`/`getColor` statics — share a default across all
 * controllers so newly-spawned ones pick up the last colour set.
 *
 * Reactive `color` getter/setter pushes the value into both the
 * class-level cache and the shader's `uColor` uniform.
 */
Class(
  function VRInputControllerBeam() {
    Inherit(this, Object3D);
    const self = this;
    var _geom, _shader, _mesh, _color;
    !(function initGeom() {
      _geom = new CylinderGeometry(0.005, 0, 2);
    })();
    (function initShader() {
      _color = VRInputControllerBeam.getColor();
      _shader = self.initClass(Shader, 'VRInputControllerBeam', {
        uColor: {
          value: new Color(_color),
        },
        transparent: true,
      });
    })();
    (function initMesh() {
      (_mesh = new Mesh(_geom, _shader)).renderOrder = 9999;
    })();
    (function position() {
      self.group.rotation.x = 0.5 * Math.PI;
      self.group.position.z = -1;
      self.group.add(_mesh);
    })();
    this.set('color', function (color) {
      VRInputControllerBeam.setColor(color);
      _shader.set('uColor', new Color(color));
      _color = color;
    });
    this.get('color', function () {
      return _color;
    });
  },
  (_) => {
    var _color = '#ffffff';
    VRInputControllerBeam.setColor = function (color) {
      return (_color = color);
    };
    VRInputControllerBeam.getColor = function () {
      return _color;
    };
  },
);

/*
 * VRInputControllerPoint — reticle/dot mesh placed at the
 * raycast hit point on the surface being pointed at by a VR
 * controller's beam. Built on `World.PLANE` (a 1×1 quad), scaled
 * to 0.02, rendered with the `VRInputControllerPoint` shader
 * (depth test off, transparent, renderOrder 1e4 so it floats
 * above everything including the beam).
 *
 * Shader uniforms:
 *   - uColor       — inner dot colour.
 *   - uBorderColor — ring border colour (drawn by the shader).
 *   - uAlpha       — overall alpha (constant 1 here).
 *
 * Class-level colour cache (`_color` '#ffffff' / `_borderColor`
 * '#000000') and getter/setter statics so newly-instantiated
 * controllers inherit the last-chosen palette.
 *
 * Starts hidden (`self.group.visible = false`); visibility is
 * driven each frame by VRInputController (0372) based on whether
 * a hit was reported.
 */
Class(
  function VRInputControllerPoint() {
    Inherit(this, Object3D);
    const self = this;
    var _geom, _shader, _mesh, _color, _borderColor;
    !(function initGeom() {
      _color = VRInputControllerPoint.getColor();
      _borderColor = VRInputControllerPoint.getBorderColor();
      _geom = World.PLANE;
    })();
    (function initShader() {
      _shader = self.initClass(Shader, 'VRInputControllerPoint', {
        uColor: {
          value: new Color(_color),
        },
        uBorderColor: {
          value: new Color(_borderColor),
        },
        uAlpha: {
          value: 1,
        },
        depthTest: false,
        transparent: true,
      });
    })();
    (function initMesh() {
      (_mesh = new Mesh(_geom, _shader)).scale.setScalar(0.02);
      _mesh.renderOrder = 1e4;
      self.group.visible = false;
      self.group.add(_mesh);
    })();
    this.set('color', function (color) {
      VRInputControllerPoint.setColor(color);
      _shader.set('uColor', new Color(color));
      _color = color;
    });
    this.get('color', function () {
      return _color;
    });
    this.set('borderColor', function (color) {
      VRInputControllerPoint.setBorderColor(color);
      _shader.set('uBorderColor', new Color(color));
      _borderColor = color;
    });
    this.get('borderColor', function () {
      return _borderColor;
    });
  },
  (_) => {
    var _color = '#ffffff',
      _borderColor = '#000000';
    VRInputControllerPoint.setColor = function (color) {
      return (_color = color);
    };
    VRInputControllerPoint.getColor = function () {
      return _color;
    };
    VRInputControllerPoint.setBorderColor = function (color) {
      return (_borderColor = color);
    };
    VRInputControllerPoint.getBorderColor = function () {
      return _borderColor;
    };
  },
);

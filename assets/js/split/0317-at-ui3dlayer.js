/*
 * UI3DLayer — SceneLayout "layer" node that instantiates a named
 * UI3D subclass and attaches its `$gluiObject` to the scene as a
 * textured Object3D. The editor exposes a class name + an optional
 * gate, then this constructs the named class and copies a battery
 * of shader/mesh flags from the layer's UIL inputs.
 *
 * UIL config (`${prefix}ui3d` → "Config" folder):
 *   - class           — `window[name]` of a UI3D subclass.
 *   - visibilityTest  — JS expression eval'd at create time; if
 *     present and falsy the layer is skipped entirely (no class
 *     instantiated, no GPU resources allocated). Cheap conditional
 *     mounting from the editor without rebuilding the layout.
 *   - retina (toggle) — pass to `GLUIUtils.setRetinaMode`; can also
 *     be globally forced via `UI3DLayer.overrideRetina`.
 *
 * Flow:
 *   - Build config; bail on `visibilityTest` failure, missing
 *     `class`, or `_input.visible == 0`.
 *   - Throw if `window[className]` is undefined.
 *   - `initClass(window[className], {data, uil:{input, group, id}})`
 *     mounts the UI3D, which must expose `$gluiObject` (and have
 *     called `create()` already) — otherwise throw a developer-
 *     friendly error.
 *   - `completeShader` copies `transparent`, `depthWrite`,
 *     `depthTest`, `blending`, `castShadow`, `receiveShadow`,
 *     `side`, `renderOrder` from `_input` onto the shader/mesh.
 *   - Apply retina mode. If retina (texture-based), set a flag so
 *     `onDestroy` can remove it from `GLUI.Scene`; otherwise call
 *     `$gluiObject.enable3D()` to attach it under this Object3D.
 *
 * `renderOrder` getter/setter proxies the underlying mesh's
 * renderOrder so the SceneLayout timeline can tween it.
 */
Class(function UI3DLayer(_input, _group, _id) {
  Inherit(this, Object3D);
  const self = this;
  var _config, _obj;
  function completeShader(shader) {
    let transparent = _input.get('transparent'),
      depthWrite = _input.get('depthWrite'),
      depthTest = _input.get('depthTest'),
      blending = _input.get('blending'),
      castShadow = _input.get('castShadow'),
      side = _input.get('side'),
      receiveShadow = _input.get('receiveShadow'),
      renderOrder = _input.getNumber('renderOrder');
    'boolean' == typeof depthWrite && (shader.depthWrite = shader.mesh.depthWrite = depthWrite);
    'boolean' == typeof depthTest && (shader.depthTest = shader.mesh.depthTest = depthTest);
    'boolean' == typeof transparent && (shader.transparent = transparent);
    'boolean' == typeof castShadow && (shader.mesh.castShadow = castShadow);
    'boolean' == typeof receiveShadow && (shader.receiveShadow = receiveShadow);
    'number' == typeof renderOrder && (shader.mesh.renderOrder = renderOrder);
    blending && (shader.blending = blending);
    side && (shader.side = side);
  }
  (function () {
    _config = InputUIL.create(_input.prefix + 'ui3d', _group);
    _config.add('class');
    _config.add('visibilityTest');
    _config.addToggle('retina');
    _config.setLabel('Config');
    let testString = _config.get('visibilityTest');
    if (testString && testString.length && !eval(testString)) return;
    let className = _config.get('class');
    if (!className || 0 == _input.get('visible')) return;
    let wildcard = _input.get('wildcard');
    if (!window[className]) throw `UI3DLayer :: ${className} doesn't exist!`;
    let obj = self.initClass(window[className], {
      data: wildcard,
      uil: {
        input: _input,
        group: _group,
        id: _id,
      },
    });
    if (!obj.$gluiObject)
      throw `UI3DLayer :: ${className} not instance of UI3D (or create() hasn't been called)`;
    completeShader(obj.$gluiObject.shader);
    GLUIUtils.setRetinaMode(
      obj.$gluiObject,
      _config.get('retina') || UI3DLayer.overrideRetina,
      self,
    );
    GLUIUtils.isRetinaMode(obj.$gluiObject)
      ? self.flag('retina', true)
      : obj.$gluiObject.enable3D();
    _obj = obj;
  })();
  self.getObject = function () {
    return _obj;
  };
  this.onDestroy = function () {
    self.flag('retina') && GLUI.Scene.remove(_obj.$gluiObject);
  };
  self.get('renderOrder', () => _obj?.$gluiObject.shader.mesh.renderOrder);
  self.set('renderOrder', (renderOrder) => {
    _obj && (_obj.$gluiObject.shader.mesh.renderOrder = renderOrder);
  });
});

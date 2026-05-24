/*
 * ShadowInspector — debug helper that pulls a shadow light's depth
 * RT onto the 2D GLUI stage so developers can see what the shadow
 * map actually contains. Scales the preview to 1/4 size of the
 * underlying RT to keep the overlay manageable. Uses a custom
 * `ShadowInspector` shader (which typically remaps the depth into
 * grayscale because raw shadow-map depth isn't directly visible).
 *
 * The `_shadow.classRef || _shadow` unwrap is so the helper
 * accepts either a raw ShadowLight instance or a wrapper component
 * that points at one.
 */
Class(function ShadowInspector(_shadow) {
  Inherit(this, Component);
  var self = this;
  _shadow = _shadow.classRef || _shadow;
  (function () {
    let rt = _shadow.light.shadow.rt,
      $obj = $gl(rt.width / 4, rt.height / 4, rt.texture);
    GLUI.Stage.add($obj);
    let shader = self.initClass(Shader, 'ShadowInspector', {
      tMap: {
        value: rt.texture,
      },
    });
    $obj.useShader(shader);
  })();
});

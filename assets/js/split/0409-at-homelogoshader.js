/*
 * HomeLogoShader — XComponent decorator for the AT logo mesh
 * shared between Home and Footer scenes. Superset of
 * HomeColumnShader (0408): adds tNormal + uFooter +
 * uScrollDelta + uNormalScale + uPhone (1 on mobile.phone)
 * so the same compiled shader can branch for the footer
 * placement and adjust normal-mapped highlights when
 * scrolling.
 *
 * Uniforms added:
 *   - tMap (matcap-test.jpg)
 *   - tRefraction / tVideo / tNormal (Utils3D.getRepeatTexture)
 *   - uVisible (start 0 — logo invisible until reveal)
 *   - uFooter (0 by default, set 1 by Footer.startRender)
 *   - uAlpha / uPhone / uScrollDelta / uNormalScale
 *   - transparent: true
 *
 * onInit binds tVideo to ViewController/video.uniform.
 *
 * Standard Fragment plumbing.
 */
Class(function HomeLogoShader(_mesh, _shader, _input, _group) {
  const self = this;
  if (
    (Inherit(self, Component),
    Inherit(self, XComponent),
    (self.fragName = 'HomeLogoShader'),
    (self.contexts = 'Component'),
    (self.mesh = _mesh),
    (self.shader = _shader),
    (self.uilInput = _input),
    (self.uilFolder = _group),
    self.uilFolder?.addButton)
  ) {
    let a = self.uilFolder;
    self.uilFolder = self.uilInput;
    self.uilInput = a;
  }
  this.isFragment = true;
  var _promises = [];
  !(async function () {
    if (
      (self.element && (self.element.onMountedHook = (_) => self.onMounted?.()),
      (self.mesh = _mesh),
      (self.shader = _shader),
      (self.uilInput = _input),
      (self.uilFolder = _group),
      self.uilFolder?.addButton)
    ) {
      let a = self.uilFolder;
      self.uilFolder = self.uilInput;
      self.uilInput = a;
    }
    self.parent?.layers && (self.layers = self.parent.layers);
    self.layout?.getAllLayers && (self.layers = await self.layout.getAllLayers());
    fbr(self.shader);
    self.shader.addUniforms({
      tMap: {
        value: Utils3D.getTexture('assets/images/room/matcap-test.jpg'),
        getTexture: Utils3D.getRepeatTexture,
      },
      tRefraction: {
        value: null,
        getTexture: Utils3D.getRepeatTexture,
      },
      tVideo: {
        value: null,
        getTexture: Utils3D.getRepeatTexture,
      },
      tNormal: {
        value: null,
        getTexture: Utils3D.getRepeatTexture,
      },
      uVisible: {
        value: 0,
      },
      uFooter: {
        value: 0,
      },
      uAlpha: {
        value: 1,
      },
      uPhone: {
        value: Device.mobile.phone ? 1 : 0,
      },
      uScrollDelta: {
        value: 0,
      },
      uNormalScale: {
        value: 1,
      },
      transparent: true,
    });
    self.onInit = async (_) => {
      let video = await self.get('ViewController/video');
      self.shader.uniforms.tVideo = video.uniform;
    };
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

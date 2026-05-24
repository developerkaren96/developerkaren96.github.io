/*
 * WorkItemShader — Component wrapper attached by fbr to the
 * Work/pane mesh on each WorkItem clone. Declares the full
 * refraction-pane uniform set:
 *   tMap            still thumbnail
 *   tVideo          reel video texture
 *   uVideoBlend     0..1 cross-fade tMap→tVideo
 *   tRefraction     refresh per-frame from Work/refraction
 *                   (SnapshotFrame of WorkRefraction layer)
 *   tEnv            env reflection
 *   tNormal         repeat-tiled normal map
 *   uDistortStrength refraction distortion magnitude
 *   uFresnelPow     fresnel edge falloff
 *   uRefractionRatio IOR scaling for refraction sample
 *   uScale (Vec2)   pane mesh stretch (1,1 normal /
 *                   1.6,0.9 portrait mobile)
 *   uColor          batchUnique per-item project color
 *   uHover          0..1 hover lerp (driven by WorkItem)
 *   uMouse          lerped Mouse.normal
 *   uPhone          portrait-mobile flag (1/0)
 *
 * startRender pulls latest Work/refraction each frame and
 * re-evaluates uPhone (rotates between portrait/landscape).
 *
 * Standard Fragment plumbing (UIL input/folder arg-swap
 * shim for batched-renderer constructor compat).
 */
Class(function WorkItemShader(_mesh, _shader, _input, _group) {
  const self = this;
  if (
    (Inherit(self, Component),
    Inherit(self, XComponent),
    (self.fragName = 'WorkItemShader'),
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
    let mouse = new Vector2();
    self.shader.addUniforms({
      tMap: {
        value: null,
      },
      tVideo: {
        value: null,
      },
      uVideoBlend: {
        value: 0,
      },
      tRefraction: {
        value: null,
      },
      tEnv: {
        value: null,
      },
      tNormal: {
        value: null,
        getTexture: Utils3D.getRepeatTexture,
      },
      uDistortStrength: {
        value: 1,
      },
      uFresnelPow: {
        value: 1,
      },
      uRefractionRatio: {
        value: 1,
      },
      uScale: {
        value: new Vector2(1, 1),
      },
      uColor: {
        value: new Color(Utils.randomColor()),
        batchUnique: true,
      },
      uHover: {
        value: 0,
      },
      uMouse: {
        value: mouse,
      },
      uPhone: {
        value: Device.mobile && Stage.height > Stage.width ? 1 : 0,
      },
    });
    self.startRender(async (_) => {
      let refraction = await self.get('Work/refraction');
      self.shader.set('tRefraction', refraction);
      self.shader.set('uPhone', Device.mobile && Stage.height > Stage.width ? 1 : 0);
    });
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

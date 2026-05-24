/*
 * UI3D — adapter that turns a GLUI capture (either a StageLayout
 * or a raw GLUITexture) into a textured Object3D quad sized to
 * the capture's aspect ratio. Lets 2D UI compositions render into
 * an RT that the 3D scene can sample as a planar billboard.
 *
 * `create(width, height, dpr?, data?)`:
 *   - If `data` is passed, instantiates a `StageLayout` so the UI
 *     is built from the SceneLayout data tree (and brings its own
 *     graph editor unless `isPlayground()` is true → suppress it).
 *     Otherwise creates a bare `GLUITexture` you can draw into.
 *   - In both cases the underlying texture is pulled from
 *     `UI3D.getRTPool(width, height, dpr)` — a per-size cached
 *     `RTPool` of three RGBA8 RTs.
 *   - `self.$gluiObject = $gl(unit.x, unit.y, capture)` is the
 *     output quad. Unit-size keeps the long side at 1.
 *
 * `setSize(size)`:
 *   - Recomputes the quad's unit aspect and applies a fill ratio
 *     so the capture resizes while keeping the wider dimension
 *     filled (no distortion).
 *
 * `linkMesh(mesh, test)`:
 *   - Polls 24× per second: while `mesh._drawing` is true (and
 *     optional `test()` agrees), the UI3D is shown; otherwise it's
 *     hidden. Saves GPU when the linked mesh is off-screen / faded.
 *
 * AppState ctor form: passing `{name, width, height, dpr, data}`
 * with `isAppState = true` lets SceneLayout build a UI3D directly
 * from JSON without an intermediate factory.
 *
 * Static:
 *   - `getRTPool(w, h, dpr)` memoises an `RTPool` per `width height`
 *     key, applying `dpr * size`.
 *   - `findStageLayoutCapture(p)` walks parents until it finds a
 *     `capture` field — used by descendants to locate their owning
 *     UI3D's render target.
 */
Class(
  function UI3D(_name = '') {
    Inherit(this, Component);
    const self = this,
      _rtSize = new Vector2(),
      _captureUnitSize = new Vector2();
    if (
      ((this.create = function (width = 512, height = 512, dpr, data) {
        _rtSize.set(width, height);
        _captureUnitSize.set(
          width > height ? 1 : width / height,
          width > height ? height / width : 1,
        );
        'number' != typeof dpr && ((data = dpr), (dpr = undefined));
        data
          ? ((self.layout = self.initClass(StageLayout, Utils.getConstructorName(self) + _name, {
              glui: true,
              data: data,
              noGraph: !self.isPlayground(),
            })),
            (self.root = self.layout.element),
            (self.capture = self.initClass(
              StageLayoutCapture,
              self.layout,
              width,
              height,
              UI3D.getRTPool(width, height, dpr),
            )))
          : ((self.capture = self.initClass(
              GLUITexture,
              width,
              height,
              UI3D.getRTPool(width, height, dpr),
            )),
            (self.root = self.capture.root));
        self.root.capture = self.capture;
        self.$gluiObject = $gl(_captureUnitSize.x, _captureUnitSize.y, self.capture);
        self.capture.object3d = self.$gluiObject;
      }),
      (this.setSize = function (size) {
        const fillRatio = new Vector2().copy(size).divide(_rtSize);
        fillRatio.divideScalar(Math.max(fillRatio.x, fillRatio.y, 1));
        _captureUnitSize.set(
          size.x > size.y ? 1 : size.x / size.y,
          size.x > size.y ? size.y / size.x : 1,
        );
        _captureUnitSize.multiplyScalar(Math.max(fillRatio.x, fillRatio.y));
        self.capture.setSize(size.x, size.y);
        self.$gluiObject.size(_captureUnitSize.x, _captureUnitSize.y);
      }),
      (this.useShader = function (shader) {
        self.$gluiObject.useShader(shader);
      }),
      (this.ready = function () {
        return self.wait(self, 'isReady');
      }),
      (this.hide = function () {
        self.capture.visible = false;
        self.capture.enabled = false;
        self.capture.scene.visible = false;
        self.$gluiObject.hide();
        self.capture.mouseEnabled = false;
      }),
      (this.show = function () {
        self.capture.visible = true;
        self.capture.enabled = true;
        self.capture.scene.visible = true;
        self.$gluiObject.show();
        self.capture.mouseEnabled = true;
      }),
      (this.linkMesh = function (mesh, test) {
        self.hide();
        self.startRender((_) => {
          let drawing = mesh._drawing;
          drawing && test && (drawing = test());
          drawing
            ? self.flag('drawing') || (self.flag('drawing', true), self.show())
            : self.flag('drawing') && (self.flag('drawing', false), self.hide());
        }, 24);
      }),
      'object' == typeof _name && _name.isAppState)
    ) {
      let props = _name;
      _name = props.name;
      null == props.dpr && (props.dpr = 1);
      props.width && props.height && this.create(props.width, props.height, props.dpr, props.data);
    }
  },
  (_) => {
    var _pools = {};
    UI3D.getRTPool = function (width, height, dpr = World.DPR) {
      let key = width + ' ' + height;
      return (
        _pools[key] ||
          ((_pools[key] = RTPool.instance().clone(Texture.UNSIGNED_BYTE, 3, Texture.RGBAFormat)),
          _pools[key].setSize(width * dpr, height * dpr)),
        _pools[key]
      );
    };
    UI3D.findStageLayoutCapture = function (p) {
      for (; p; ) {
        if (p.capture) return p.capture;
        p = p.parent;
      }
    };
  },
);

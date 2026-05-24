/*
 * GLUIText — text-flavoured sibling of GLUIObject (0237). Wraps a
 * `GLText` (0226) and exposes the same layout/property surface
 * (x/y/z/scale/scaleX/scaleY/rotation/alpha) so callers can treat
 * `$glText(...)` the same as `$gl(...)` in the GLUI tree.
 *
 * Construction:
 *   - Maps the positional shorthand `(text, fontName, fontSize)`
 *     plus `options` and `customCompile` onto a single GLText
 *     options object (color is normalised through `new Color`).
 *   - Group starts empty; the actual `GLText.mesh` is attached
 *     when its `ready()` promise resolves.
 *   - Schedules SEO mirror creation via `defer` so the parent
 *     chain is wired up before `GLSEO.textNode` walks it.
 *   - Once GLText is loaded, replaces the mesh's
 *     `onBeforeRender` with the same alpha + transform sync used
 *     by GLUIObject (see 0237) — minus the dimension/scale-around-
 *     centre logic (text positions itself per glyph; the group
 *     just provides translation/rotation/scale).
 *
 * Dimensions:
 *   - `dimensions` is a lazy getter that returns the GLText
 *     geometry's boundingBox, augmented with `.width` / `.height`
 *     derived from min/max X and Y. Invalidated by `setText` /
 *     `resize` (via `this._dimensions = null`).
 *
 * Interaction:
 *   - `interact(over, click, camera?, seoLink?, options?)` builds
 *     a hidden hit-area mesh sized to the text's bounding box on
 *     first call and registers it with the appropriate stage's
 *     interaction system. Hit area position compensates for
 *     `align` (center/right shifts the centre).
 *   - `clearInteract()` removes the hit area and stubs the
 *     `_onClick`/`_onOver` slots to `GLUIObject.noop`.
 *
 * SEO mirror:
 *   - `seoText(text, sortOrder?)` calls `GLSEO.textNode` so screen
 *     readers / search crawlers see real text.
 *   - `seoSortOrder` getter/setter routes through the live SEO
 *     node if one exists, otherwise stashes the value on `_seoSortOrder`
 *     to be picked up on first `defer` mirror creation.
 *
 * Text update:
 *   - `setText(text, options)` awaits `GLText.ready()` then calls
 *     into `GLText.setText` (which re-runs the worker layout and
 *     reuses the geometry buffers via setArray). Also re-mirrors
 *     the SEO node unless `options.seoText === false`.
 *   - `setColor`/`tweenColor` proxy through GLText. `resize(opts)`
 *     is a shorthand setText that drops `dimensions` so the next
 *     read recomputes.
 *
 * 3D / depth:
 *   - `enable3D(style2d)` opts into 3D anchoring; mirrors the
 *     anchor pattern used by GLUIObject so retina-mode swap works
 *     identically.
 *   - `depthTest(bool)`, `setZ(z)`, `show()`/`hide()` all wait for
 *     `text.ready()` then forward to the underlying mesh.
 *
 * Lifecycle:
 *   - `remove(param)` warns if called with a truthy arg (see the
 *     same note in GLUIObject — `remove()` deletes *this* from its
 *     parent). Cleans up the hit area and nulls every owned ref.
 *   - `loaded()` exposes the GLText `ready()` promise for callers
 *     who want to wait on font/layout.
 *   - `upload()` warms up the GPU buffers before first show.
 *
 * Shader swap:
 *   - `useShader(shader)` carries the GLText `tMap`/`uAlpha`/
 *     `uColor` uniform references onto a custom shader, mirroring
 *     the GLUIObject pattern (used by `mask()` and effect shaders).
 *
 * DOM mirror activation:
 *   - `_divFocus`/`_divBlur`/`_divSelect` — fired by the SEO `<a>`
 *     wrapper on keyboard focus/blur/select; replays the
 *     equivalent GLUI hover/click into the interact handlers.
 */
class GLUIText {
  constructor(text, fontName, fontSize, options = {}, customCompile) {
    options.font = fontName || options.font;
    options.text = text;
    options.seoText = options.seoText ?? text;
    options.width = options.width;
    options.align = options.align || 'left';
    options.size = fontSize || options.size;
    options.lineHeight = options.lineHeight;
    options.letterSpacing = options.letterSpacing;
    options.wordSpacing = options.wordSpacing;
    options.wordBreak = options.wordBreak;
    options.langBreak = options.langBreak;
    options.indent = options.indent;
    options.color = new Color(options.color);
    options.customCompile = customCompile;
    this.text = new GLText(options);
    this.group = new Group();
    this.group.asyncPromise = this.text.text.fontLoaded;
    this.alpha = 1;
    this._x = 0;
    this._y = 0;
    this._z = 0;
    this._scaleX = 1;
    this._scaleY = 1;
    this._scale = 1;
    this._rotation = 0;
    this.multiTween = true;
    const self = this;
    text &&
      defer((_) => {
        !self.seo &&
          options.seoText &&
          self.seoText(options.seoText, this._seoSortOrder ?? options.seoSortOrder);
      });
    this.text.ready().then((_) => {
      let mesh = self.text.mesh;
      mesh.glui = self;
      mesh.shader.visible = false;
      self.mesh = mesh;
      self.group.add(mesh);
      self._3d && !self._style2d && self.text.centerY();
      self._3d || (self.text.mesh.shader.depthTest = false);
      mesh.shader.mesh = mesh;
      mesh.onBeforeRender = (_) => {
        if (!mesh.determineVisible() && self.firstRender) return;
        let alpha = self.getAlpha();
        if (
          (mesh.shader.uniforms.uAlpha && (mesh.shader.uniforms.uAlpha.value = alpha),
          alpha < 0.001)
        ) {
          if (
            ((mesh.shader.visible = false),
            (mesh.neverRender = true),
            !self.isDirty && self.firstRender)
          )
            return;
        } else {
          mesh.neverRender = false;
          mesh.shader.visible = true;
        }
        (!self.isDirty && self.firstRender) ||
          (RenderStats.active &&
            RenderStats.update('GLUIText', 1, mesh.shader.vsName + '|' + mesh.shader.fsName, mesh),
          (self.group.position.x = self._x),
          (self.group.position.y = self._3d ? self._y : -self._y),
          (self.group.position.z = self._z),
          self.group.scale.set(self._scaleX * self._scale, self._scaleY * self._scale, 1),
          self._3d
            ? self.anchor && self.anchor._parent
              ? (self.anchor.position.copy(self.group.position),
                self.anchor.scale.copy(self.group.scale),
                self.anchor.quaternion.setFromEuler(self._rotation))
              : self.group.quaternion.setFromEuler(self._rotation)
            : (self.group.rotation.z = Math.radians(self._rotation)),
          self.firstRender ||
            (self.group.updateMatrixWorld(true),
            (self.firstRender = true),
            (mesh.shader.visible = true)),
          self.onInternalUpdate && self.onInternalUpdate(),
          (self.isDirty = false));
      };
    });
  }
  get x() {
    return this._x;
  }
  set x(v) {
    Math.abs(this._x - v) > Base3D.DIRTY_EPSILON && (this.isDirty = true);
    this._x = v;
  }
  get y() {
    return this._y;
  }
  set y(v) {
    Math.abs(this._y - v) > Base3D.DIRTY_EPSILON && (this.isDirty = true);
    this._y = v;
  }
  get z() {
    return this._z;
  }
  set z(v) {
    Math.abs(this._z - v) > Base3D.DIRTY_EPSILON && (this.isDirty = true);
    this._z = v;
  }
  get scale() {
    return this._scale;
  }
  set scale(v) {
    Math.abs(this._scale - v) > Base3D.DIRTY_EPSILON && (this.isDirty = true);
    this._scale = v;
  }
  get scaleX() {
    return this._scaleX;
  }
  set scaleX(v) {
    Math.abs(this._scaleX - v) > Base3D.DIRTY_EPSILON && (this.isDirty = true);
    this._scaleX = v;
  }
  get scaleY() {
    return this._scaleY;
  }
  set scaleY(v) {
    Math.abs(this._scaleY - v) > Base3D.DIRTY_EPSILON && (this.isDirty = true);
    this._scaleY = v;
  }
  get rotation() {
    return this._rotation;
  }
  set rotation(v) {
    Math.abs(this._rotation - v) > Base3D.DIRTY_EPSILON && (this.isDirty = true);
    this._rotation = v;
  }
  get dimensions() {
    return (
      this._dimensions || (this._dimensions = {}),
      this.text &&
        this.text.geometry &&
        !this._dimensions.max &&
        ((this._dimensions = this.text.geometry.boundingBox),
        (this._dimensions.width = Math.abs(this._dimensions.min.x - this._dimensions.max.x)),
        (this._dimensions.height = Math.abs(this._dimensions.min.y - this._dimensions.max.y))),
      this._dimensions
    );
  }
  interact(over, click, camera = World.CAMERA, seoLink, options) {
    'string' == typeof camera && ((options = seoLink), (seoLink = camera), (camera = World.CAMERA));
    this._onOver = over;
    this._onClick = click;
    this._interactCamera = camera;
    let stage = this._3d ? GLUI.Scene : GLUI.Stage;
    const self = this;
    return (
      self.text.ready().then((_) => {
        if (over) {
          if (
            (self.text.geometry.boundingBox || self.text.geometry.computeBoundingBox(),
            !self.hitArea)
          ) {
            let bb = self.text.geometry.boundingBox,
              shader = Utils3D.getTestShader();
            if (
              ((shader.visible = false),
              (self.hitArea = new Mesh(World.PLANE, shader)),
              (self.hitArea.glui = self),
              self.hitArea.scale.set(
                Math.abs(bb.min.x) + Math.abs(bb.max.x),
                Math.abs(bb.min.y) + Math.abs(bb.max.y),
                1,
              ),
              (self._3d && !self._style2d) || (self.hitArea.position.x = (bb.max.x - bb.min.x) / 2),
              (self.hitArea.position.y = (bb.min.y - bb.max.y) / 2),
              self._3d)
            )
              switch (self.text.getData().align) {
                case 'center':
                  self.hitArea.position.x = 0;
                  break;
                case 'right':
                  self.hitArea.position.x = (bb.min.x - bb.max.x) / 2;
              }
            else
              switch (self.text.getData().align) {
                case 'center':
                  self.hitArea.position.x = 0;
                  break;
                case 'right':
                  self.hitArea.position.x = -(bb.max.x - bb.min.x) / 2;
              }
            self.text.mesh.add(self.hitArea);
          }
          stage.interaction.add(self.hitArea, camera);
        } else stage.interaction.remove(self.hitArea, camera);
      }),
      defer((_) => {
        seoLink && self.seo && self.seo.aLink && self.seo.aLink(seoLink, options);
      }),
      this
    );
  }
  clearInteract() {
    if (this._onOver) {
      (this._3d ? GLUI.Scene : GLUI.Stage).interaction.remove(this.hitArea, this._interactCamera);
      this._onClick = GLUIObject.noop;
      this._onOver = GLUIObject.noop;
    }
    return this;
  }
  remove(param) {
    param &&
      console.warn('GLUIObject.remove removes ITSELF from its parent. use removeChild instead');
    let stage = this._3d ? GLUI.Scene : GLUI.Stage;
    this.mesh && this.mesh.parent ? this.group.parent.remove(this.group) : stage.remove(this);
    this.hitArea && stage.interaction.remove(this.hitArea, this._interactCamera);
    this.text && this.text.destroy && this.text.destroy();
    Utils.nullObject(this.mesh);
    Utils.nullObject(this);
  }
  tween(obj, time, ease, delay) {
    return tween(this, obj, time, ease, delay);
  }
  enable3D(style2d) {
    this._3d = true;
    this._style2d = style2d;
    this._rotation = new Euler();
    const self = this;
    return (
      self._rotation.onChange((_) => {
        self.isDirty = true;
      }),
      self.text.ready().then((_) => {
        self.text.mesh.shader.depthTest = true;
      }),
      this.anchor || (this.anchor = new Group()),
      (this.anchor.onMatrixDirty = (_) => {
        self.isDirty = true;
      }),
      (self.isDirty = true),
      this
    );
  }
  depthTest(bool) {
    const self = this;
    return (
      self.text.ready().then((_) => {
        self.text.mesh.shader.depthTest = bool;
      }),
      this
    );
  }
  setZ(z) {
    const self = this;
    return (
      self.text.ready().then((_) => {
        self.text.mesh.renderOrder = z;
      }),
      this
    );
  }
  height() {
    return this.mesh ? this.text.height : 0;
  }
  async setText(text, options) {
    if (text && ((text = text.toString()), false !== options?.seoText)) {
      let seoText = options?.seoText;
      seoText = seoText && 'boolean' != typeof seoText ? seoText.toString() : text;
      this.seoText(seoText, options?.seoSortOrder);
    }
    return (
      await this.text.ready(),
      await this.text.setText(text, options),
      (this._dimensions = null),
      this
    );
  }
  seoText(text, sortOrder = this._seoSortOrder) {
    window.GLSEO && (GLSEO.textNode(this, text, sortOrder), delete this._seoSortOrder);
  }
  get seoSortOrder() {
    return this.seo ? this.seo.sortOrder : this._seoSortOrder;
  }
  set seoSortOrder(sortOrder) {
    this.seo ? GLSEO.textNode(this, this.seo.text(), sortOrder) : (this._seoSortOrder = sortOrder);
  }
  getTextString() {
    return this.text.string;
  }
  setColor(color) {
    const self = this;
    return (self.text.ready().then((_) => self.text.setColor(color)), this);
  }
  tweenColor(color, time, ease, delay) {
    const self = this;
    return (self.text.ready().then((_) => self.text.tweenColor(color, time, ease, delay)), this);
  }
  async resize(options) {
    await this.text.ready();
    await this.text.resize(options);
    this._dimensions = null;
  }
  show() {
    return (
      this.text.ready().then((_) => {
        this.text.mesh.visible = true;
        this.text.mesh.updateMatrixWorld(true);
      }),
      this
    );
  }
  async mask(obj, shader) {
    await defer();
    let dimensions = {},
      p = this._parent;
    for (; p; ) {
      p.stageLayoutCapture &&
        ((dimensions.width = p.stageLayoutCapture.width),
        (dimensions.height = p.stageLayoutCapture.height));
      p = p._parent;
    }
    dimensions.width || ((dimensions.width = Stage.width), (dimensions.height = Stage.height));
    obj.group.updateMatrixWorld(true);
    obj.mesh.onBeforeRender();
    let box = new Box3().setFromObject(obj.mesh),
      minX = box.min.x / dimensions.width,
      minY = box.max.y / dimensions.height,
      maxX = box.max.x / dimensions.width,
      maxY = -box.min.y / dimensions.height;
    this.shader &&
      (this.useShader(shader),
      this.shader.addUniforms({
        uMaskValues: {
          value: new Vector4(minX, minY, maxX, maxY),
        },
      }));
    obj.hide();
    this.group.traverse((o) => {
      o.glui && o.glui != this && o.glui.mask(obj, shader);
    });
  }
  hide() {
    const self = this;
    return (self.text.ready().then((_) => (self.text.mesh.visible = false)), this);
  }
  loaded() {
    return this.text.ready();
  }
  length() {
    return this.text.charLength;
  }
  deferRender(parent) {
    this.deferred = true;
    parent || (this.anchor || (this.anchor = new Group()), GLUI.Scene.addDeferred(this));
  }
  getAlpha() {
    if (this._gluiParent) {
      let alpha = this._gluiParent.getAlpha();
      return ((this.alpha = alpha), alpha);
    }
    let alpha = this.alpha,
      $parent = this.parent;
    for (; $parent; ) {
      alpha *= $parent.alpha;
      $parent = $parent.parent;
    }
    return alpha;
  }
  size() {}
  upload() {
    const self = this;
    return (self.text.ready().then((_) => self.text.mesh.upload()), this);
  }
  _divFocus() {
    this._onOver &&
      this._onOver({
        action: 'over',
        object: this,
      });
    this.onDivFocus && this.onDivFocus();
  }
  _divBlur() {
    this._onOver &&
      this._onOver({
        action: 'out',
        object: this,
      });
    this.onDivBlur && this.onDivBlur();
  }
  _divSelect() {
    this._onClick &&
      this._onClick({
        action: 'click',
        object: this,
      });
    this.onDivBlurSelect && this.onDivSelect();
  }
  get _parent() {
    return this.parent;
  }
  async useShader(shader) {
    await this.text.ready();
    shader.uniforms.tMap = this.text.shader.uniforms.tMap;
    shader.uniforms.uAlpha = this.text.shader.uniforms.uAlpha;
    shader.uniforms.uColor = this.text.shader.uniforms.uColor;
    shader.transparent = true;
    (!this._3d || this._3d || this.parent) && (shader.depthTest = false);
    this.text.mesh.shader = shader || this.text.shader;
    this.text.shader = shader;
    this.text.mesh.shader.mesh = this.text.mesh;
  }
}

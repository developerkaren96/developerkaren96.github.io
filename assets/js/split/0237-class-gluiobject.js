/*
 * GLUIObject — the workhorse GLUI primitive: a single textured/
 * coloured quad with 2D layout properties (x/y/z/scale/rotation/
 * width/height/alpha), a parent/child tree, hit-testing hooks,
 * SEO/a11y mirroring, optional 3D anchoring, optional CornerPin
 * deformation, and optional alpha-masked rendering.
 *
 * Construction:
 *   - Builds a `GLUIObject` Shader (`tMap`, `uAlpha`, transparent,
 *     depthTest=false) and uses `GLUIObject.getGeometry('2d')` —
 *     a shared 1×1 plane translated so its origin sits at the
 *     top-left corner (see 0238). The mesh is added to `this.group`.
 *   - `bg(map)` then chooses between three paths:
 *       * `#…` / `0x…` short string → use `GLUIColor` Shader with
 *         a `uColor` uniform.
 *       * `'empty'` / `''`         → invisible (no map).
 *       * otherwise treat as a texture path/key → load via
 *         `Utils3D.getTexture(path, { premultiplyAlpha: false })`.
 *   - Registers itself in the SEO mirror through `GLSEO.objectNode`.
 *   - Installs `mesh.onBeforeRender` as the per-frame update step.
 *
 * `mesh.onBeforeRender`:
 *   - Short-circuits if invisible *and* this is not the first
 *     render (`firstRender` gate ensures the initial transform
 *     reaches matrixWorld at least once).
 *   - Pushes `uAlpha`. If alpha < 0.001, sets `mesh.neverRender`
 *     and hides the shader to avoid pointless draws.
 *   - Returns early if not dirty (transform-stable frames are free).
 *   - Otherwise writes group.position from `_x/_y/_z` (Y is
 *     inverted for 2D HUD, kept upright for 3D anchored mode),
 *     applies the scale around the centre when `scale != 1`,
 *     updates `calcMask` mask rect, scales the mesh to `dimensions`
 *     (unless a CornerPin is active — corners encode size
 *     directly), and applies rotation (Euler for 3D, Z-only
 *     radians for 2D).
 *   - In 3D + anchor mode the transform is mirrored to the
 *     `anchor` group (used by retina-mode / FX scenes).
 *   - On the first run, forces a `updateMatrixWorld` and fires
 *     `onMountedHook`.
 *
 * Dirty tracking:
 *   - Every setter (x/y/z/scale/scaleX/scaleY/rotation, width,
 *     height) compares against `Base3D.DIRTY_EPSILON`. On change
 *     it sets `isDirty = true` and calls `__internalDirty` (if any)
 *     so descendant batches (GLUIBatch/Text, RT capture) can
 *     re-upload only the affected attributes.
 *
 * Tree:
 *   - `add($obj)` reparents the child, propagates 3D-mode,
 *     defer-render, and any active mask down the chain.
 *   - `remove()` removes *itself* (note the warning when called
 *     with an arg — `removeChild(obj)` is the API for parent
 *     removing a specific child). Cascades destroy through all
 *     descendants and destroys any owned textures.
 *   - `create(w, h, map, customCompile)` is the chainable factory
 *     for a child GLUIObject.
 *
 * Interaction:
 *   - `interact(over, click, camera?, url?, label?, options?)`
 *     registers handlers and, if `url`/`label` provided, also
 *     creates a semantic `<a>` mirror through GLSEO.
 *   - Hover/click bubble up through `_parent` chain via
 *     `_onChildHover`/`_onChildClick` (stopPropagation supported).
 *   - `clearInteract()` un-registers and removes the SEO link.
 *
 * Shader swapping:
 *   - `useShader(shader)` carries `tMap`/`uAlpha` references onto
 *     the new shader (for textured replacements). Used by:
 *       * `bg()` to switch between color/texture shaders.
 *       * `mask()` to install a shader that samples `uMaskValues`.
 *   - `updateMap(src)` overrides just `tMap.value` without changing
 *     the active shader.
 *
 * Masking:
 *   - `mask(obj, shader)` computes the mask object's screen-space
 *     box (via Box3.setFromObject) normalised to the stage layout
 *     dimensions (honours `stageLayoutCapture` from an RT-bound
 *     ancestor) and installs `uMaskValues` on the swapped shader.
 *     Then traverses children and propagates the mask down.
 *
 * 3D mode:
 *   - `enable3D(style2d)` switches the geometry to `getGeometry(
 *     style2d ? '2d' : '3d')`, turns depthTest back on, replaces
 *     `_rotation` scalar with an Euler (dirty-on-change), and
 *     creates `this.anchor` for retina/scene mirroring.
 *
 * Misc helpers:
 *   - `getAlpha()` walks the parent chain multiplying alphas (or
 *     defers to `_gluiParent.getAlpha()` if the parent isn't a
 *     direct GLUI ancestor — e.g. inside a Batch).
 *   - `setZ(z)`        — set renderOrder.
 *   - `forceUpdate()`  — clear `firstRender` and re-run
 *                         onBeforeRender.
 *   - `tween(obj, time, ease, delay)` — convenience tween wrapper.
 *   - `_divFocus`/`_divBlur`/`_divSelect` — DOM-mirror events from
 *     the SEO `<a>`/`<button>` propagate back into the interact
 *     handlers, so keyboard tab/space activates the GLUI element.
 *
 * Bookkeeping fields:
 *   - `firstRender`         — true after first onBeforeRender.
 *   - `isDirty`             — pending transform/alpha changes.
 *   - `multiTween = true`   — Tween supports x/y/scale together.
 *   - `_3d`/`anchor`        — 3D-mode markers.
 */
class GLUIObject {
  constructor(width, height, map, customCompile) {
    let shader = (this.textureShader = new Shader('GLUIObject', {
      tMap: {
        value: null,
      },
      uAlpha: {
        type: 'f',
        value: 1,
      },
      transparent: true,
      depthTest: false,
      customCompile: customCompile,
    }));
    shader.persists = true;
    map || (shader.visible = false);
    this.usingMap = null != map && 'empty' != map && '' != map;
    this.tMap = shader.uniforms.tMap;
    this.group = new Group();
    this.alpha = 1;
    this._x = 0;
    this._y = 0;
    this._z = 0;
    this._scaleX = 1;
    this._scaleY = 1;
    this._scale = 1;
    this._rotation = 0;
    this.multiTween = true;
    this.children = [];
    this.dimensions = new Vector3(width, height, 1);
    this._shader = shader;
    this.mesh = new Mesh(GLUIObject.getGeometry('2d'), shader);
    this.mesh.glui = this;
    this.group.add(this.mesh);
    shader.mesh = this.mesh;
    window.GLSEO && GLSEO.objectNode(this);
    this.bg(
      'string' == typeof map
        ? map.includes(['#', '0x'])
          ? map
          : 'empty' === map || '' === map
            ? null
            : Utils3D.getTexture(map, {
                premultiplyAlpha: false,
              })
        : map,
    );
    const self = this;
    this.mesh.onBeforeRender = (_) => {
      if (!self.mesh.determineVisible() && self.firstRender) return;
      let alpha = self.getAlpha();
      if (
        (self.mesh.shader.uniforms.uAlpha && (self.mesh.shader.uniforms.uAlpha.value = alpha),
        self.usingMap)
      )
        if (alpha < 0.001) {
          if (
            ((self.mesh.neverRender = true),
            (self.mesh.shader.visible = false),
            !self.isDirty && self.firstRender)
          )
            return;
        } else {
          self.mesh.neverRender = false;
          self.mesh.shader.visible = true;
        }
      if (!self.isDirty && self.firstRender) return;
      RenderStats.active &&
        RenderStats.update(
          'GLUIObject',
          1,
          self.mesh.shader.vsName + '|' + self.mesh.shader.fsName,
          self.mesh,
        );
      self.group.position.x = self._x;
      self.group.position.y = self._3d ? self._y : -self._y;
      self.group.position.z = self._z;
      1 != self.scale &&
        ((self.group.position.x += (self.dimensions.x - self.dimensions.x * self.scale) / 2),
        (self.group.position.y -= (self.dimensions.y - self.dimensions.y * self.scale) / 2));
      self.mesh.shader;
      if (self.calcMask) {
        let v = self.isMasked;
        v.copy(v.origin);
        self.group.localToWorld(v);
        v.z = v.width;
        v.w = v.height;
      }
      map
        ? self.corners ||
          (self.mesh.scale.set(1, 1, 1).multiply(self.dimensions),
          (self.group.scale.x = self._scaleX * self._scale),
          (self.group.scale.y = self._scaleY * self._scale))
        : self.group.scale.set(self._scaleX * self._scale, self._scaleY * self._scale, 1);
      self._3d
        ? self.anchor && self.anchor._parent
          ? (self.anchor.position.copy(self.group.position),
            self.anchor.scale.copy(self.group.scale),
            self.anchor.quaternion.setFromEuler(self._rotation),
            (self.anchor.isDirty = true))
          : (self.group.quaternion.setFromEuler(self._rotation), (self.group.matrixDirty = true))
        : (self.group.rotation.z = Math.radians(self._rotation));
      self.firstRender ||
        (self.group.updateMatrixWorld(true),
        (self.firstRender = true),
        self.onMountedHook && self.onMountedHook());
      self.isDirty = false;
    };
    self.isDirty = true;
  }
  get width() {
    return this.dimensions.x;
  }
  set width(w) {
    let dirty = Math.abs(this.dimensions.x - w) > Base3D.DIRTY_EPSILON;
    this.dimensions.x = w;
    dirty && ((this.isDirty = true), this.__internalDirty && this.__internalDirty());
  }
  get height() {
    return this.dimensions.y;
  }
  set height(h) {
    let dirty = Math.abs(this.dimensions.y - h) > Base3D.DIRTY_EPSILON;
    this.dimensions.y = h;
    dirty && ((this.isDirty = true), this.__internalDirty && this.__internalDirty());
  }
  get x() {
    return this._x;
  }
  set x(v) {
    let dirty = Math.abs(this._x - v) > Base3D.DIRTY_EPSILON;
    this._x = v;
    dirty && ((this.isDirty = true), this.__internalDirty && this.__internalDirty());
  }
  get y() {
    return this._y;
  }
  set y(v) {
    let dirty = Math.abs(this._y - v) > Base3D.DIRTY_EPSILON;
    this._y = v;
    dirty && ((this.isDirty = true), this.__internalDirty && this.__internalDirty());
  }
  get z() {
    return this._z;
  }
  set z(v) {
    let dirty = Math.abs(this._z - v) > Base3D.DIRTY_EPSILON;
    this._z = v;
    dirty && ((this.isDirty = true), this.__internalDirty && this.__internalDirty());
  }
  get scale() {
    return this._scale;
  }
  set scale(v) {
    let dirty = Math.abs(this._scale - v) > Base3D.DIRTY_EPSILON;
    this._scale = v;
    dirty && ((this.isDirty = true), this.__internalDirty && this.__internalDirty());
  }
  get scaleX() {
    return this._scaleX;
  }
  set scaleX(v) {
    let dirty = Math.abs(this._scaleX - v) > Base3D.DIRTY_EPSILON;
    this._scaleX = v;
    dirty && ((this.isDirty = true), this.__internalDirty && this.__internalDirty());
  }
  get scaleY() {
    return this._scaleY;
  }
  set scaleY(v) {
    let dirty = Math.abs(this._scaleY - v) > Base3D.DIRTY_EPSILON;
    this._scaleY = v;
    dirty && ((this.isDirty = true), this.__internalDirty && this.__internalDirty());
  }
  get rotation() {
    return this._rotation;
  }
  set rotation(v) {
    let dirty = Math.abs(this._rotation - v) > Base3D.DIRTY_EPSILON;
    this._rotation = v;
    dirty && ((this.isDirty = true), this.__internalDirty && this.__internalDirty());
  }
  style(props) {
    for (let prop in props) undefined !== this[prop] && (this[prop] = props[prop]);
    return this;
  }
  size(w, h) {
    return ((this.width = w), (this.height = h), this.corners && this.corners.update(), this);
  }
  add($obj) {
    return (
      $obj?.parent?.children?.remove($obj),
      ($obj.parent = this),
      this.group.add($obj.group),
      this.children.push($obj),
      this.isMasked && $obj.mask(this.isMasked, this.maskShader),
      this._3d && !$obj._3d && $obj.enable3D(),
      this.deferred &&
        ($obj.deferRender(true), $obj.anchor && this.anchor && this.anchor.add($obj.anchor)),
      this
    );
  }
  interact(over, click, camera = World.CAMERA, url, label, options) {
    'string' == typeof camera &&
      ((options = label), (label = url), (url = camera), (camera = World.CAMERA));
    const bubble = (e, fn) => {
      e.stopPropagation = function () {
        e._stopProp = true;
      };
      let parent = this._parent;
      for (; parent; ) {
        if (e._stopProp) return;
        parent[fn]?.(e);
        parent = parent.parent;
      }
    };
    if (
      ((this._onOver = (e) => {
        bubble(e, '_onChildHover');
        over(e);
      }),
      (this._onClick = (e) => {
        bubble(e, '_onChildClick');
        click(e);
      }),
      (this._interactCamera = camera),
      over ? this.interaction.add(this, camera) : this.interaction.remove(this, camera),
      'string' == typeof url && 'string' == typeof label)
    ) {
      const self = this;
      defer((_) => {
        !self.seo && window.GLSEO && GLSEO.objectNode(self);
        self.seo && self.seo.aLink && self.seo.aLink(url, label, options);
      });
    }
    return this;
  }
  clearInteract() {
    return (
      this._onOver &&
        (this.interaction.remove(this, this._interactCamera),
        (this._onClick = GLUIObject.noop),
        (this._onOver = GLUIObject.noop)),
      this.seo && this.seo.unlink(),
      this
    );
  }
  remove(param) {
    param &&
      console.warn('GLUIObject.remove removes ITSELF from its parent. use removeChild instead');
    this.children.slice().forEach((child) => {
      child.remove ? child.remove() : child.destroy && child.destroy();
    });
    this.clearInteract();
    this.parent &&
      (this.parent.children ? this.parent.children?.remove(this) : GLUI.Stage.remove(this));
    this.mesh._parent
      ? this.group._parent?.remove(this.group)
      : this._3d
        ? GLUI.Scene.remove(this)
        : GLUI.Stage.remove(this);
    let textureShader = this.textureShader;
    for (let key in textureShader.uniforms) {
      let uniform = textureShader.uniforms[key];
      uniform && uniform.value && uniform.value.destroy && uniform.value.destroy();
    }
  }
  create(width, height, map, customCompile) {
    let $obj = $gl(width, height, map, customCompile);
    return (this.add($obj), this._3d && $obj.enable3D(), $obj);
  }
  removeChild(obj) {
    return (this.group.remove(obj.group), this);
  }
  tween(obj, time, ease, delay) {
    return tween(this, obj, time, ease, delay);
  }
  enable3D(style2d) {
    this._3d = true;
    this.mesh.geometry = GLUIObject.getGeometry(style2d ? '2d' : '3d');
    this.mesh.shader.depthTest = true;
    this._rotation = new Euler();
    this.anchor || (this.anchor = new Group());
    this.anchor.onMatrixDirty = (_) => {
      self.isDirty = true;
    };
    const self = this;
    return (
      self._rotation.onChange((_) => {
        self.isDirty = true;
      }),
      this
    );
  }
  loaded() {
    return true;
  }
  setZ(z) {
    return ((this.mesh.renderOrder = z), this);
  }
  bg(path) {
    if (undefined !== path)
      return (
        'string' == typeof path
          ? path.length <= 10 && (path.startsWith('0x') || path.startsWith('#'))
            ? (this.colorShader ||
                (this.colorShader = new Shader('GLUIColor', {
                  transparent: true,
                  uAlpha: {
                    type: 'f',
                    value: 1,
                  },
                  uColor: {
                    value: new Color(path),
                  },
                })),
              this.colorShader.set('uColor', new Color(path)),
              this._shader.uniforms.uColor || this.useShader(this.colorShader))
            : ((this.textureShader.uniforms.tMap.value = Utils3D.getTexture(path, {
                premultiplyAlpha: false,
              })),
              this._shader.uniforms.tMap || this.useShader(this.textureShader))
          : (this._shader.uniforms.tMap || this.useShader(this.textureShader),
            (this._shader.uniforms.tMap.value = path)),
        this
      );
  }
  show() {
    return (
      (this.group.matrixDirty = true),
      (this.mesh.matrixDirty = true),
      (this.group.visible = true),
      this.anchor && (this.anchor.visible = true),
      this
    );
  }
  hide() {
    return ((this.group.visible = false), this.anchor && (this.anchor.visible = false), this);
  }
  useShader(shader) {
    return (
      shader &&
        (shader != this.textureShader &&
          shader != this.colorShader &&
          ((shader.uniforms.tMap = this.mesh.shader.uniforms.tMap),
          (shader.uniforms.uAlpha = this.mesh.shader.uniforms.uAlpha)),
        this._3d || (shader.depthTest = false),
        (shader.transparent = true)),
      (this._shader = shader),
      (this.mesh.shader = shader || this._shader),
      (shader.mesh = this.mesh),
      this
    );
  }
  depthTest(bool) {
    this.mesh.shader.depthTest = bool;
  }
  childInteract(hover, click) {
    this._onChildHover = hover;
    this._onChildClick = click;
  }
  useGeometry(geom) {
    return ((this.mesh.geometry = geom), this);
  }
  updateMap(src) {
    this._shader.uniforms.tMap.value = 'string' == typeof src ? Utils3D.getTexture(src) : src;
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
  deferRender(parent) {
    this.deferred = true;
    parent || ((this.anchor = new Group()), GLUI.Scene.addDeferred(this));
  }
  clearTween() {
    return (
      this._mathTweens &&
        this._mathTweens.forEach((t) => {
          t.tween.stop();
        }),
      this
    );
  }
  createCorners() {
    this.corners = new GLUICornerPin(this);
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
  get shader() {
    return this._shader;
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
    this.onDivSelect && this.onDivSelect();
  }
  get _parent() {
    return this.parent;
  }
  get interaction() {
    return (this._3d ? GLUI.Scene : GLUI.Stage).interaction;
  }
  forceUpdate() {
    this.firstRender = false;
    this.mesh.onBeforeRender();
  }
}

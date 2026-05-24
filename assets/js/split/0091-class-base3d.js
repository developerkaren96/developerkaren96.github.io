/*
 * Base3D — the scene-graph node base class. Every renderable, camera,
 * group, and light extends this. Roughly the Hydra analogue of THREE.Object3D.
 *
 * Transform model
 * ---------------
 * Local TRS:  `position` (Vector3D), `rotation` (Euler), `scale` (Vector3D);
 *             `quaternion` (Quaternion) is the canonical rotation — Euler is
 *             kept in sync via onChange.
 * Local matrix:    `matrix`        — composed from TRS by `updateMatrix`.
 * World matrix:    `matrixWorld`   — parent * local, walked by `updateMatrixWorld`.
 * Render matrices: `modelViewMatrix` + `normalMatrix` — set per-frame by the
 *                  camera/renderer pair.
 *
 * Dirty tracking
 * --------------
 * `matrixDirty`           — local components changed; needs recompose.
 * `matrixWorldNeedsUpdate`— after updateMatrix, world must be rebuilt.
 * `decomposeDirty`        — world matrix used; the cached worldPos/worldQuat
 *                           need to be re-extracted.
 * `matrixAutoUpdate`      — caller-controlled escape hatch; when false, the
 *                           local matrix is treated as authoritative and TRS
 *                           is ignored (e.g. when feeding raw matrices from a
 *                           physics engine).
 *
 * Each of position/quaternion/rotation/scale has an `onChange` callback set
 * in the constructor that flips `matrixDirty` and `decomposeDirty`, mirrors
 * between Quaternion and Euler (so they stay in sync), and notifies the
 * shader/UBO layer through the optional `onMatrixDirty` hook.
 *
 * Children + parent
 * -----------------
 * `_parent` + `children` form a doubly-linked tree. `add` re-parents (yanks
 * from the old parent first), `attach` re-parents while preserving world
 * transform, `remove` detaches. Adds/removes propagate a
 * `displayNeedsUpdate` flag up to the owning Scene so it can re-sort its
 * render lists.
 *
 * `renderOrder` propagates ADDITIVELY down to descendants (so bumping a
 * group's renderOrder pushes its whole subtree later in draw order) and
 * also dirties the owning Scene.
 *
 * Visibility / dirtiness queries
 * ------------------------------
 * `determineVisible` — walks up; any ancestor with `visible=false` or
 *   `hidden=true` short-circuits to false.
 * `determineDirty`   — walks up; any dirty ancestor means our world matrix
 *   is also stale.
 * `determineNoTransform` — walk up checking `matrix.isIdentity()`; lets
 *   `updateMatrixWorld` skip the multiplyMatrices and just copy `matrix`
 *   when there's nothing to transform.
 *
 * Scratch vectors / matrices (this.V1, this.M1, this.Q1 etc.) are lazy
 * per-instance reusable buffers — avoids allocations in hot paths like
 * lookAt, worldToLocal, getWorldPosition.
 */
class Base3D {
  constructor() {
    // Local TRS. Vector3D adds a parent-aware onChange channel on top of Vector3.
    this.position   = new Vector3D();
    this.rotation   = new Euler();
    this.quaternion = new Quaternion();
    this.scale      = new Vector3D(1, 1, 1);

    this._parent  = null;
    this.up       = new Vector3(0, 1, 0);
    this.isObject3D = true;

    this.children       = [];
    this.childrenLength = 0;

    // Render matrices (filled in by camera per draw call).
    this.modelViewMatrix = new Matrix4();
    this.normalMatrix    = new Matrix3();

    // Local & world matrix + dirty flags.
    this.matrix                 = new Matrix4();
    this.matrixWorld            = new Matrix4();
    this.matrixAutoUpdate       = true;
    this.matrixWorldNeedsUpdate = false;
    this.matrixDirty            = true;
    this.decomposeDirty         = true;

    // Visibility / culling switches.
    this.visible          = true;
    this.hidden           = false;
    this.castShadow       = false;
    this.frustumCulled    = true;
    this.occlusionCulled  = false;
    this._renderOrder     = 0;

    // Cached extracted world values (filled lazily by getters).
    this.worldPos  = new Vector3();
    this.worldQuat = new Quaternion();

    // ── TRS change channels ────────────────────────────────────────────────
    // Each setter dirties matrix + decompose. quaternion <-> rotation are
    // kept mirrored so callers can use whichever is convenient.
    const self = this;
    this.quaternion.onChange((_) => {
      self.matrixDirty    = true;
      self.decomposeDirty = true;
      if (self.onMatrixDirty) self.onMatrixDirty();
      self.rotation.setFromQuaternion(self.quaternion, undefined, false);
    });
    this.rotation.onChange((_) => {
      self.matrixDirty    = true;
      self.decomposeDirty = true;
      if (self.onMatrixDirty) self.onMatrixDirty();
      self.quaternion.setFromEuler(self.rotation, false);
    });
    this.scale.onChange((_) => {
      self.matrixDirty    = true;
      self.decomposeDirty = true;
      if (self.onMatrixDirty) self.onMatrixDirty();
    });
    this.position.onChange((_) => {
      self.matrixDirty    = true;
      self.decomposeDirty = true;
      if (self.onMatrixDirty) self.onMatrixDirty();
    });
  }

  // renderOrder is additive down the subtree — bumping a group bumps every
  // child by the same amount, and dirties the owning Scene so its render
  // list can be re-sorted.
  get renderOrder() { return this._renderOrder; }
  set renderOrder(value) {
    this._renderOrder = value;
    for (let p = this._parent; p; p = p._parent) {
      if (p instanceof Scene) p.displayNeedsUpdate = true;
    }
    for (let i = 0; i < this.children.length; i++) this.children[i].renderOrder += value;
  }

  /* Multiply-on-the-left by `matrix` then decompose back into TRS. Used when
   * a parent transform has been collapsed into a child (e.g. after `attach`). */
  applyMatrix(matrix) {
    this.matrix.multiplyMatrices(matrix, this.matrix);
    this.matrix.decompose(this.position, this.quaternion, this.scale);
    return this;
  }

  applyQuaternion(q) { this.quaternion.premultiply(q); return this; }

  setRotationFromAxisAngle(axis, angle) { this.quaternion.setFromAxisAngle(axis, angle); }
  setRotationFromMatrix(m)               { this.quaternion.setFromRotationMatrix(m); }
  setRotationFromQuaternion(q)           { this.quaternion.copy(q); }

  localToWorld(v) { return v.applyMatrix4(this.matrixWorld); }
  worldToLocal(v) {
    const m1 = this.M1 || new Matrix4();
    this.M1 = m1;
    return v.applyMatrix4(m1.getInverse(this.matrixWorld));
  }

  /*
   * Aim this node so that its +Z (or -Z, for cameras) points at the target.
   * Cameras flip the look-at convention (camera looks "down -Z"), hence the
   * isCamera branch.
   */
  lookAt(x, y, z) {
    const m1 = this.M1 || new Matrix4(); this.M1 = m1;
    const v  = this.V1 || new Vector3(); this.V1 = v;
    if (x.isVector3) v.copy(x); else v.set(x, y, z);
    if (this.isCamera) m1.lookAt(this.position, v, this.up);
    else                m1.lookAt(v, this.position, this.up);
    this.quaternion.setFromRotationMatrix(m1);
  }

  /*
   * Append a child (or many). Re-parents — yanks `object` from its old
   * parent before pushing into this one. Adds bubble a Scene
   * `displayNeedsUpdate` so render lists rebuild.
   * `add(this)` is a no-op (no self-cycles).
   */
  add(object) {
    if (arguments.length > 1) {
      for (let i = 0; i < arguments.length; i++) this.add(arguments[i]);
      return this;
    }
    if (object === this) return this;
    if (object && object.isScene) throw "You can't add a scene to a group";

    if (object && object.isObject3D) {
      if (null !== object._parent) object._parent.remove(object);
      object._parent = this;
      this.children.push(object);
      this.childrenLength = this.children.length;
    } else {
      console.error('Object is not instance of Object3D', object);
    }

    if (this.isScene) this.displayNeedsUpdate = true;
    else {
      for (let p = this._parent; p; p = p._parent) {
        if (p instanceof Scene) p.displayNeedsUpdate = true;
      }
    }
    return this;
  }

  /*
   * Re-parent `object` to this node while keeping its world transform
   * intact. We compute the change-of-basis = (this.matrixWorld)^-1 *
   * (object._parent.matrixWorld), apply it to the object, then add.
   */
  attach(object) {
    this.updateMatrixWorld(true);
    const m1 = this.M1 || new Matrix4(); this.M1 = m1;
    const worldInverse = this.M1.getInverse(this.matrixWorld);
    if (null !== object._parent) {
      object._parent.updateMatrixWorld(true);
      worldInverse.multiply(object._parent.matrixWorld);
    }
    object.applyMatrix(worldInverse);
    this.add(object);
    object.updateMatrixWorld(true);
  }

  remove(object) {
    if (arguments.length > 1) {
      for (let i = 0; i < arguments.length; i++) this.remove(arguments[i]);
      return this;
    }
    if (this.isScene) this.displayNeedsUpdate = true;
    else {
      for (let p = this._parent; p; p = p._parent) {
        if (p instanceof Scene) p.displayNeedsUpdate = true;
      }
    }
    this.children.remove(object);
    this.childrenLength = this.children.length;
  }

  /*
   * Extract world-space data from `matrixWorld`. `sleep=true` skips the
   * `updateMatrixWorld` call — caller is asserting the world matrix is
   * already fresh (e.g. inside a render loop after a global update).
   */
  getWorldPosition(target, sleep) {
    const v = this.V1 || new Vector3(); this.V1 = v;
    if (!target) target = v;
    if (!sleep) this.updateMatrixWorld();
    const el = this.matrixWorld.elements;
    target.x = el[12]; target.y = el[13]; target.z = el[14];
    return target;
  }

  getWorldScale(target) {
    const v  = this.V1S || new Vector3(); this.V1S = v;
    const v2 = this.V12 || new Vector3(); this.V2  = v2;
    const q  = this.Q1  || new Quaternion(); this.Q1 = q;
    if (!target) target = v2;
    this.updateMatrixWorld();
    this.matrixWorld.decompose(v, q, target);
    return target;
  }

  getWorldQuaternion(target) {
    const v = this.V1Q || new Vector3();    this.V1Q = v;
    const q = this.Q1  || new Quaternion(); this.Q1  = q;
    if (!target) target = q;
    this.updateMatrixWorld();
    this.matrixWorld.decompose(v, target, v);
    return target;
  }

  traverse(callback) {
    callback(this);
    const children = this.children;
    for (let i = 0; i < children.length; i++) children[i].traverse(callback);
  }

  /* Recompose `matrix` from local TRS — only if autoUpdate is on. Marks the
   * world matrix stale. */
  updateMatrix() {
    if (false === this.matrixAutoUpdate) return;
    this.matrix.compose(this.position, this.quaternion, this.scale);
    this.matrixWorldNeedsUpdate = true;
  }

  /*
   * Walk down and rebuild world matrices.
   *   - Skip whole subtree if invisible (force overrides for one-shot
   *     refresh like attach()).
   *   - If our world matrix needs an update: copy the local matrix if there
   *     is no parent or the parent chain has no real transform; otherwise
   *     parent.matrixWorld * matrix. Reports the multiply to RenderStats
   *     for profiling.
   *   - Recurse into children.
   *
   * Children are iterated last-to-first — matches the original splat order
   * and lets a child re-parent itself during traversal without skipping.
   */
  updateMatrixWorld(force) {
    if (false === this.matrixAutoUpdate) return;
    if (!force && !this.determineVisible()) return;

    if ((this.determineDirty() || force) && true === this.matrixAutoUpdate) this.updateMatrix();

    if (true === this.matrixWorldNeedsUpdate || true === force) {
      if (null === this._parent || this.determineNoTransform()) {
        this.matrixWorld.copy(this.matrix);
      } else {
        this.matrixWorld.multiplyMatrices(this._parent.matrixWorld, this.matrix);
        if (RenderStats.active) RenderStats.update('updateMatrixWorld');
      }
      this.decomposeDirty         = true;
      this.matrixWorldNeedsUpdate = false;
    }

    const children = this.children;
    for (let i = this.childrenLength - 1; i > -1; i--) children[i].updateMatrixWorld(force);
    this.matrixDirty = false;
  }

  /*
   * Clone via the most-derived constructor — so `Mesh#clone` ends up calling
   * `new Mesh()` even though the implementation lives on Base3D.
   * NOTE: original mistakenly omitted `return`; preserved to avoid behavioural
   * drift in subclasses that override clone().
   */
  clone(recursive) {
    new this.constructor().copy(this, recursive);
  }

  copy(source, recursive) {
    this.name = source.name;
    this.up.copy(source.up);
    this.position.copy(source.position);
    this.quaternion.copy(source.quaternion);
    this.scale.copy(source.scale);
    this.matrix.copy(source.matrix);
    this.matrixWorld.copy(source.matrixWorld);
    this.matrixAutoUpdate       = source.matrixAutoUpdate;
    this.matrixWorldNeedsUpdate = source.matrixWorldNeedsUpdate;
    this.visible                = source.visible;
    this.castShadow             = source.castShadow;
    this.receiveShadow          = source.receiveShadow;
    this.frustumCulled          = source.frustumCulled;
    this.renderOrder            = source.renderOrder;
    if (true === recursive) {
      for (let i = 0; i < source.children.length; i++) {
        this.add(source.children[i].clone());
      }
    }
    return this;
  }

  // Renderable subclasses override this with their actual draw call.
  render() {}

  /* Are we (and every ancestor) visible & not hidden? */
  determineVisible() {
    if (!this.visible || this.hidden) return false;
    for (let p = this._parent; p; p = p._parent) {
      if (!p.visible || p.hidden) return false;
    }
    return true;
  }

  /* Is our world matrix stale (us OR any ancestor dirty)? */
  determineDirty() {
    for (let p = this._parent; p; p = p._parent) {
      if (p.matrixDirty) return true;
    }
    return this.matrixDirty;
  }

  /* Optimization for updateMatrixWorld: if EVERY ancestor (and self) is at
   * identity, we can copy `matrix` straight into `matrixWorld` without
   * multiplyMatrices. */
  determineNoTransform() {
    return this._parent
      ? this._parent.determineNoTransform() && this.matrix.isIdentity()
      : this.matrix.isIdentity();
  }

  // Local-axis translation (movement in this object's frame, post-rotation).
  translateX(d) { this.xAxis || (this.xAxis = new Vector3(1, 0, 0)); this.translateOnAxis(this.xAxis, d); }
  translateY(d) { this.yAxis || (this.yAxis = new Vector3(0, 1, 0)); this.translateOnAxis(this.yAxis, d); }
  translateZ(d) { this.zAxis || (this.zAxis = new Vector3(0, 0, 1)); this.translateOnAxis(this.zAxis, d); }

  translateOnAxis(axis, distance) {
    const v = this.V1 || new Vector3();
    this.V1 = v;
    v.copy(axis).applyQuaternion(this.quaternion);   // axis in world space
    this.position.add(v.multiplyScalar(distance));
    return this;
  }

  /*
   * Push GPU resources up. Shader first (so the shader-renderer's program
   * is bound before the geometry-renderer registers the VAO), then its
   * shadow companion if present, then the geometry.
   */
  upload() {
    if (this.shader) {
      this.shader.upload(this, this.geometry);
      if (this.shader.shadow) this.shader.shadow.upload(this, this.geometry);
    }
    if (this.geometry) this.geometry.upload(this, this.shader);
  }

  /*
   * Tear-down: GPU buffers, hit tests, then detach from parent. The
   * Component-layer parent (`this.parent`) gets a separate notification so
   * StateComponent etc. can drop their child registry too.
   */
  destroy() {
    if (this.geometry && this.geometry.destroy) this.geometry.destroy(this);
    if (this.shader   && this.shader.destroy)   this.shader.destroy(this);
    if (this.hitDestroy) this.hitDestroy();
    if (this._gl && this._gl.ubo) this._gl.ubo.destroy();
    if (this._gl && this._gl.vao) this._gl.vao.destroy();
    if (this._gl) this._gl = null;
    if (this._parent) this._parent.remove(this);
    if (this.parent && this.parent.__destroyChild) this.parent.__destroyChild(this.__id);
  }
}

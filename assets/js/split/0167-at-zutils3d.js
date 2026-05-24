/*
 * zUtils3D — late-binding utilities + prototype patches for the 3D core.
 *
 * Runs once at startup (`'static'` flag) and:
 *
 *   1. Patches geometry-aware methods that depend on Matrix4 (and
 *      therefore on MatrixWasm being ready). These can't live on the
 *      class definitions because of import-order constraints:
 *
 *        - `Ray#intersectTriangle(a, b, c, backfaceCulling, target)`
 *          Möller–Trumbore-style ray/triangle test using face normal
 *          and barycentric sign tests. Returns the hit point (via
 *          `Ray#at`) or null.
 *
 *        - `Mesh#raycast(raycaster, intersects)`
 *          Two-stage culling: bounding-sphere check in world space,
 *          then bounding-box check in local space (after transforming
 *          the ray by `matrixWorld⁻¹`). Walks the triangle list (or
 *          fallback to triangle soup when no index buffer is present),
 *          calls `checkBufferGeometryIntersection` per triangle.
 *
 *          Optimisation:
 *            - `staticRaycast` meshes cache the world-space bounding
 *              sphere in `this.raySphere`, refreshed only when
 *              `raycastNeedsUpdate` is set (e.g. after the matrix
 *              changes). For dynamic meshes we compute the world
 *              sphere into a shared scratch each call.
 *            - `raycastLimit` (per-mesh): skips triangles whose A
 *              vertex is further than `radiusSq` from the supplied
 *              `position`. Lets a mesh restrict picking to a local
 *              region without pre-splitting the geometry.
 *            - `shader.side` controls front/back/double-sided
 *              intersection — BACK_SIDE flips vertex order to test the
 *              back face.
 *
 *          When a hit is found, builds the intersection record:
 *            distance, point (world), object, uv (barycentric
 *            interpolation of vertex UVs), face (a `Face3` with the
 *            computed face normal), faceIndex.
 *
 *        - `Triangle#closestPointToPoint(point, target)`
 *          Project onto the plane; if the projection is inside the
 *          triangle, that's the answer. Otherwise pick the closest
 *          point along each of the three clamped edge segments.
 *
 *        - `Points#raycast(raycaster, intersects)`
 *          Per-point picking with a world-space radius
 *          (`raycaster.params.Points.threshold`). Transforms ray to
 *          local space, scales threshold by inverse mean scale, then
 *          tests each point's squared distance to the ray.
 *
 *        - Static `Triangle.getNormal`, `Triangle.getBarycoord`,
 *          `Triangle.getUV`, `Triangle.containsPoint` —
 *          barycentric helpers used by the raycast paths above.
 *
 *   2. Math additions:
 *        - `Math.euclideanModulo(n, m)` — always-positive modulo
 *          (`(-1) mod 5 === 4`), used by ColorHSL hue wrap etc.
 *        - `Math.isPowerOf2(w, h)` / `floorPowerOf2` / `ceilPowerOf2` —
 *          texture-size helpers (WebGL1 NPOT restrictions).
 *
 *   3. Geometry runtime:
 *        - `Geometry.createAttributes(geom)` — Proxy wrapping the
 *          attribute map; every `geom.attributes.foo = X` rebuilds
 *          parallel `_attributeKeys[]` / `_attributeValues[]` arrays so
 *          the renderer can iterate without `Object.keys` allocs (same
 *          pattern as `Shader.createUniforms`).
 *        - `Geometry.TYPED_ARRAYS` — string → TypedArray constructor
 *          lookup (used by deserialisation).
 *        - `Geometry.arrayNeedsUint32` — choose 16- vs 32-bit index
 *          buffers (anything > 65535 forces Uint32).
 *        - `Geometry.TYPES` — string → primitive geometry constructor
 *          (used by scene-graph clone / load).
 *
 *   4. `isMatrix4` / `isMatrix3` / `isVector3` / `isVector2` /
 *      `isCamera` / `isPerspective` prototype tags so duck-typing
 *      checks elsewhere don't need `instanceof`.
 *
 *   5. `Scene.FRONT_TO_BACK*` sort-mode string constants.
 *
 *   6. Worker thread shim: if running on `window.THREAD`, no live
 *      Shader class exists — install a stub holding just the side
 *      constants so geometry parsing on workers (which never actually
 *      raycasts) doesn't NPE.
 *
 *   7. `MatrixWasm.ready().then(createHelpers)` defers the patches
 *      until WASM is live (or runs them immediately if no MatrixWasm).
 */
Class(function zUtils3D() {
  /*
   * Patches that depend on Matrix4 being functional (which in turn
   * means MatrixWasm must have either loaded or fallen back to JS).
   */
  function createHelpers() {
    /*
     * Ray vs triangle intersection — branchless Möller–Trumbore
     * variant using face normal + signed barycentrics.
     */
    Ray.prototype.intersectTriangle = (function () {
      const diff  = new Vector3();
      const edge1 = new Vector3();
      const edge2 = new Vector3();
      const normal = new Vector3();
      return function intersectTriangle(a, b, c, backfaceCulling, target) {
        edge1.subVectors(b, a);
        edge2.subVectors(c, a);
        normal.crossVectors(edge1, edge2);

        // Sign disambiguates front-vs-back hit; abs lets the rest of
        // the test treat both cases uniformly.
        let sign;
        let DdN = this.direction.dot(normal);
        if (DdN > 0) {
          if (backfaceCulling) return null;
          sign = 1;
        } else if (DdN < 0) {
          sign = -1;
          DdN = -DdN;
        } else {
          return null;
        }

        diff.subVectors(this.origin, a);
        const DdQxE2 = sign * this.direction.dot(edge2.crossVectors(diff, edge2));
        if (DdQxE2 < 0) return null;
        const DdE1xQ = sign * this.direction.dot(edge1.cross(diff));
        if (DdE1xQ < 0) return null;
        if (DdQxE2 + DdE1xQ > DdN) return null;

        const QdN = -sign * diff.dot(normal);
        if (QdN < 0) return null;
        return this.at(QdN / DdN, target);
      };
    })();

    /*
     * Mesh raycast: bounding-sphere/box culling then per-triangle test.
     */
    Mesh.prototype.raycast = (function () {
      const inverseMatrix = new Matrix4();
      const ray = new Ray();
      const sphere = new Sphere();
      const vA = new Vector3();
      const vB = new Vector3();
      const vC = new Vector3();
      const uvA = new Vector2();
      const uvB = new Vector2();
      const uvC = new Vector2();
      const barycoord = new Vector3();
      const intersectionPoint = new Vector3();
      const intersectionPointWorld = new Vector3();

      /*
       * Barycentric UV at the hit point.
       */
      function uvIntersection(point, p1, p2, p3, uv1, uv2, uv3) {
        Triangle.getBarycoord(point, p1, p2, p3, barycoord);
        uv1.multiplyScalar(barycoord.x);
        uv2.multiplyScalar(barycoord.y);
        uv3.multiplyScalar(barycoord.z);
        uv1.add(uv2).add(uv3);
        return uv1.clone();
      }

      /*
       * Triangle test honouring shader.side, then world-space distance
       * inside [near, far] window.
       */
      function checkIntersection(object, shader, raycaster, ray, pA, pB, pC, point) {
        let intersect;
        if (shader.side === Shader.BACK_SIDE) {
          intersect = ray.intersectTriangle(pC, pB, pA, true, point);
        } else {
          intersect = ray.intersectTriangle(pA, pB, pC, shader.side !== Shader.DOUBLE_SIDE, point);
        }
        if (intersect === null) return null;
        intersectionPointWorld.copy(point);
        intersectionPointWorld.applyMatrix4(object.matrixWorld);
        const distance = raycaster.ray.origin.distanceTo(intersectionPointWorld);
        if (distance < raycaster.near || distance > raycaster.far) return null;
        return { distance, point: intersectionPointWorld.clone(), object };
      }

      function checkBufferGeometryIntersection(object, raycaster, ray, position, uv, a, b, c) {
        vA.fromBufferAttribute(position, a);
        vB.fromBufferAttribute(position, b);
        vC.fromBufferAttribute(position, c);

        // Restrict picking to a local region around a per-mesh anchor.
        if (object.raycastLimit) {
          const { radiusSq, position: anchor } = object.raycastLimit;
          if (vA.distanceToSquared(anchor) > radiusSq) return;
        }

        const intersection = checkIntersection(
          object, object.shader, raycaster, ray, vA, vB, vC, intersectionPoint,
        );
        if (!intersection) return null;

        if (uv) {
          uvA.fromBufferAttribute(uv, a);
          uvB.fromBufferAttribute(uv, b);
          uvC.fromBufferAttribute(uv, c);
          intersection.uv = uvIntersection(intersectionPoint, vA, vB, vC, uvA, uvB, uvC);
        }

        const face = new Face3(a, b, c);
        Triangle.getNormal(vA, vB, vC, face.normal);
        intersection.face = face;
        return intersection;
      }

      return function raycast(raycaster, intersects) {
        const geometry = this.geometry;
        const shader = this.shader;
        const matrixWorld = this.matrixWorld;
        if (shader === undefined) return;

        if (geometry.boundingSphere === null) geometry.computeBoundingSphere();
        if (this.scale.x === 0) return;

        // Sphere cull — `staticRaycast` caches the world sphere across calls.
        if (this.staticRaycast) {
          if (!this.raySphere) {
            this.raySphere = new Sphere();
            this.raySphere.copy(geometry.boundingSphere);
            this.raySphere.applyMatrix4(matrixWorld);
          }
          if (this.raycastNeedsUpdate) {
            this.raySphere.copy(geometry.boundingSphere);
            this.raySphere.applyMatrix4(matrixWorld);
            this.raycastNeedsUpdate = false;
          }
          if (raycaster.ray.intersectsSphere(this.raySphere) === false) return;
        } else {
          sphere.copy(geometry.boundingSphere);
          sphere.applyMatrix4(matrixWorld);
          if (raycaster.ray.intersectsSphere(sphere) === false) return;
        }

        // Move the ray into local space, then box-cull.
        inverseMatrix.getInverse(matrixWorld);
        ray.copy(raycaster.ray).applyMatrix4(inverseMatrix);
        if (geometry.boundingBox !== null && ray.intersectsBox(geometry.boundingBox) === false) return;

        const index = geometry.index;
        const position = geometry.attributes.position;
        const uv = geometry.attributes.uv;

        if (index !== null) {
          for (let i = 0, l = index.length; i < l; i += 3) {
            const a = index[i], b = index[i + 1], c = index[i + 2];
            const intersection = checkBufferGeometryIntersection(this, raycaster, ray, position, uv, a, b, c);
            if (intersection) {
              intersection.faceIndex = Math.floor(i / 3);
              intersects.push(intersection);
            }
          }
        } else if (position !== undefined) {
          // Triangle soup — implicit indices.
          for (let i = 0, l = position.count; i < l; i += 3) {
            const a = i, b = i + 1, c = i + 2;
            const intersection = checkBufferGeometryIntersection(this, raycaster, ray, position, uv, a, b, c);
            if (intersection) {
              intersection.faceIndex = Math.floor(i / 3);
              intersects.push(intersection);
            }
          }
        }
      };
    })();

    /*
     * Closest point on a triangle to an arbitrary 3D point — plane
     * project, point-in-triangle check, then edge fallback.
     */
    Triangle.prototype.closestPointToPoint = (function () {
      const plane = new Plane();
      const edgeList = [new Line3(), new Line3(), new Line3()];
      const projectedPoint = new Vector3();
      const closestPoint = new Vector3();
      return function closestPointToPoint(point, target = new Vector3()) {
        plane.setFromCoplanarPoints(this.a, this.b, this.c);
        plane.projectPoint(point, projectedPoint);
        if (this.containsPoint(projectedPoint) === true) {
          target.copy(projectedPoint);
          return target;
        }
        // Outside the triangle — closest point sits on an edge.
        edgeList[0].set(this.a, this.b);
        edgeList[1].set(this.b, this.c);
        edgeList[2].set(this.c, this.a);
        let minDistance = Infinity;
        for (let i = 0; i < edgeList.length; i++) {
          edgeList[i].closestPointToPoint(projectedPoint, true, closestPoint);
          const distance = projectedPoint.distanceToSquared(closestPoint);
          if (distance < minDistance) {
            minDistance = distance;
            target.copy(closestPoint);
          }
        }
        return target;
      };
    })();

    /*
     * Points raycast — each vertex is a tiny sphere; world-space
     * threshold rescaled to local before comparison.
     */
    Points.prototype.raycast = (function () {
      const inverseMatrix = new Matrix4();
      const ray = new Ray();
      const sphere = new Sphere();
      return function raycast(raycaster, intersects) {
        const object = this;
        const geometry = this.geometry;
        const matrixWorld = this.matrixWorld;
        const threshold = raycaster.params.Points.threshold;

        if (geometry.boundingSphere === null) geometry.computeBoundingSphere();
        sphere.copy(geometry.boundingSphere);
        sphere.applyMatrix4(matrixWorld);
        sphere.radius += threshold;
        if (raycaster.ray.intersectsSphere(sphere) === false) return;

        inverseMatrix.getInverse(matrixWorld);
        ray.copy(raycaster.ray).applyMatrix4(inverseMatrix);

        const localThreshold = threshold / ((this.scale.x + this.scale.y + this.scale.z) / 3);
        const localThresholdSq = localThreshold * localThreshold;
        const position = new Vector3();
        const intersectPoint = new Vector3();

        function testPoint(point, index) {
          const rayPointDistanceSq = ray.distanceSqToPoint(point);
          if (rayPointDistanceSq >= localThresholdSq) return;
          ray.closestPointToPoint(point, intersectPoint);
          intersectPoint.applyMatrix4(matrixWorld);
          const distance = raycaster.ray.origin.distanceTo(intersectPoint);
          if (distance < raycaster.near || distance > raycaster.far) return;
          intersects.push({
            distance,
            distanceToRay: Math.sqrt(rayPointDistanceSq),
            point: intersectPoint.clone(),
            index,
            face: null,
            object,
          });
        }

        const index = geometry.index;
        const positions = geometry.attributes.position.array;
        if (index !== null) {
          const indices = index.array;
          for (let i = 0, il = indices.length; i < il; i++) {
            const a = indices[i];
            position.fromArray(positions, 3 * a);
            testPoint(position, a);
          }
        } else {
          for (let i = 0, l = positions.length / 3; i < l; i++) {
            position.fromArray(positions, 3 * i);
            testPoint(position, i);
          }
        }
      };
    })();

    /*
     * Static Triangle helpers — used by the raycast paths and by
     * geometry generators (PolyhedronGeometry's UV correction, etc).
     */
    Object.assign(Triangle, {
      // Face normal: (c-b) × (a-b), normalised. Length-0 → (0,0,0).
      getNormal: (function () {
        const v0 = new Vector3();
        return function getNormal(a, b, c, target = new Vector3()) {
          target.subVectors(c, b);
          v0.subVectors(a, b);
          target.cross(v0);
          const targetLengthSq = target.lengthSq();
          if (targetLengthSq > 0) return target.multiplyScalar(1 / Math.sqrt(targetLengthSq));
          return target.set(0, 0, 0);
        };
      })(),

      // Barycentric coordinates via the classic dot-product method.
      // Degenerate triangle (zero-area) returns the sentinel (-2, -1, -1).
      getBarycoord: (function () {
        const v0 = new Vector3();
        const v1 = new Vector3();
        const v2 = new Vector3();
        return function getBarycoord(point, a, b, c, target = new Vector3()) {
          v0.subVectors(c, a);
          v1.subVectors(b, a);
          v2.subVectors(point, a);
          const dot00 = v0.dot(v0);
          const dot01 = v0.dot(v1);
          const dot02 = v0.dot(v2);
          const dot11 = v1.dot(v1);
          const dot12 = v1.dot(v2);
          const denom = dot00 * dot11 - dot01 * dot01;
          if (denom === 0) return target.set(-2, -1, -1);
          const invDenom = 1 / denom;
          const u = (dot11 * dot02 - dot01 * dot12) * invDenom;
          const v = (dot00 * dot12 - dot01 * dot02) * invDenom;
          return target.set(1 - u - v, v, u);
        };
      })(),

      // Barycentric interpolation of any per-vertex attribute (here UV).
      getUV: (function () {
        const _v3 = new Vector3();
        return function getUV(point, p1, p2, p3, uv1, uv2, uv3, target) {
          this.getBarycoord(point, p1, p2, p3, _v3);
          target.set(0, 0);
          target.addScaledVector(uv1, _v3.x);
          target.addScaledVector(uv2, _v3.y);
          target.addScaledVector(uv3, _v3.z);
          return target;
        };
      })(),

      // True iff (x, y) of the barycoords are non-negative and sum ≤ 1.
      containsPoint: (function () {
        const v1 = new Vector3();
        return function containsPoint(point, a, b, c) {
          Triangle.getBarycoord(point, a, b, c, v1);
          return v1.x >= 0 && v1.y >= 0 && v1.x + v1.y <= 1;
        };
      })(),
    });
  }

  // Always-positive modulo, used by hue wraps etc.
  Math.euclideanModulo = function (n, m) {
    return ((n % m) + m) % m;
  };
  // Power-of-two helpers for texture sizing (WebGL1 NPOT rules).
  Math.isPowerOf2 = function (w, h) {
    const test = (value) => (value & (value - 1)) === 0;
    return test(w) && test(h);
  };
  Math.floorPowerOf2 = function (value) {
    return Math.pow(2, Math.floor(Math.log(value) / Math.LN2));
  };
  Math.ceilPowerOf2 = function (value) {
    return Math.pow(2, Math.ceil(Math.log(value) / Math.LN2));
  };

  this.LOCAL = window.Hydra && Hydra.LOCAL;

  /*
   * Mirror of Shader.createUniforms — Proxy-wrapped attribute map that
   * maintains parallel _attributeKeys[]/_attributeValues[] for fast
   * renderer iteration.
   */
  Geometry.createAttributes = function (geom) {
    const attributes = {};
    const handler = {
      set(target, property, value) {
        target[property] = value;
        geom._attributeKeys.length = 0;
        geom._attributeValues.length = 0;
        for (const key in attributes) {
          geom._attributeKeys.push(key);
          geom._attributeValues.push(attributes[key]);
        }
        return true;
      },
    };
    geom._attributeKeys = [];
    geom._attributeValues = [];
    return new Proxy(attributes, handler);
  };

  // String → TypedArray ctor (used by deserialisation paths).
  Geometry.TYPED_ARRAYS = {
    Int8Array,
    Uint8Array,
    Uint8ClampedArray,
    Int16Array,
    Uint16Array,
    Int32Array,
    Uint32Array,
    Float32Array,
    Float64Array,
  };

  // Decide 16- vs 32-bit index buffers — any element > 65535 needs Uint32.
  Geometry.arrayNeedsUint32 = function (array) {
    for (let i = array.length - 1; i >= 0; --i) if (array[i] > 65535) return true;
    return false;
  };

  // String → primitive geometry ctor (scene-graph load / clone).
  Geometry.TYPES = {
    SphereGeometry,
    IcosahedronGeometry,
    BoxGeometry,
    PlaneGeometry,
    CylinderGeometry,
  };

  // Duck-typing tags so call sites don't need `instanceof`.
  Matrix4.prototype.isMatrix4 = true;
  Matrix3.prototype.isMatrix3 = true;
  Vector3.prototype.isVector3 = true;
  Vector3D.prototype.isVector3 = true;
  Vector2.prototype.isVector2 = true;
  CameraBase3D.prototype.isCamera = true;
  PerspectiveCamera.prototype.isPerspective = true;

  Scene.FRONT_TO_BACK = 'sort_front_to_back';
  Scene.FRONT_TO_BACK_BOUNDING = 'sort_front_to_back_bounding';

  // Worker (THREAD) shim — no live Shader class on the worker; install
  // a stub holding just the side constants so geometry parsing won't NPE.
  if (window.THREAD) {
    Shader = {
      FRONT_SIDE: 'shader_front_side',
      BACK_SIDE: 'shader_back_side',
      DOUBLE_SIDE: 'shader_double_side',
    };
  }

  // Defer the helpers until WASM matrix multiply is ready.
  if (window.MatrixWasm) MatrixWasm.ready().then(createHelpers);
  else createHelpers();
}, 'static');

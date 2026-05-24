/*
 * Geometry — a bag of named GeometryAttributes (position, uv, normal, …)
 * plus an optional index buffer. The renderer-agnostic side of a draw call.
 *
 * Construction:
 *   const g = new Geometry();
 *   g.addAttribute('position', new GeometryAttribute(posArr, 3));
 *   g.addAttribute('uv',       new GeometryAttribute(uvArr,  2));
 *   g.setIndex([0, 1, 2, …]);
 *
 * Adding an attribute with `meshPerAttribute >= 1` flags the geometry as
 * instanced and adopts its `count` as `maxInstancedCount` (the renderer
 * uses that to call `drawElementsInstanced`/`drawArraysInstanced`).
 *
 * `Geometry.createAttributes(self)` is installed elsewhere — it pre-creates
 * an attribute bag (with reserved slot names) tied to this geometry.
 *
 * Compute helpers:
 *   - computeFaceNormals / computeVertexNormals — Lambert/flat shading prep.
 *   - computeBoundingBox / computeBoundingSphere — culling and pickling.
 *   - normalizeNormals — final pass after summing into vertex normals.
 *
 * Lifetime:
 *   - `upload(mesh, shader)` lazily allocates GL buffers.
 *   - `draw(mesh, shader, isQuery)` issues the draw (delegated to the
 *     renderer; `isQuery=true` skips e.g. shadow logic for occlusion queries).
 *   - `destroy(mesh)` frees GL resources unless `keepAlive` is set (shared
 *     geometries like `World.BOX` keep the buffers around).
 */
class Geometry {
  constructor() {
    this.attributes        = Geometry.createAttributes(this);
    this.drawRange         = { start: 0, end: 0 };
    this.boundingBox       = null;
    this.boundingSphere    = null;
    this.index             = null;
    this.maxInstancedCount = undefined;
    this.keepAlive         = false;
    this.id                = Utils.timestamp();
  }

  draw(mesh, shader, isQuery = false) {
    Geometry.renderer.draw(this, mesh, shader, isQuery);
  }
  upload(mesh, shader) { Geometry.renderer.upload(this, mesh, shader); }
  destroy(mesh) { if (!this.keepAlive) Geometry.renderer.destroy(this, mesh); }

  addAttribute(name, attribute) {
    if (attribute.meshPerAttribute >= 1) {
      this.isInstanced       = true;
      this.maxInstancedCount = attribute.count;
    }
    this.attributes[name] = attribute;
  }

  /** `attribute` may be a GeometryAttribute or a bare TypedArray. */
  setIndex(attribute) {
    this.index = attribute.array || attribute;
  }

  /**
   * Expand an indexed geometry into a flat, redundant one (no index buffer).
   * For each face, copy the referenced per-vertex data into a fresh array.
   * Used when downstream code can't handle indexed buffers (e.g. wireframe
   * conversions, certain shader fallbacks).
   */
  toNonIndexed() {
    const geometry2  = new Geometry();
    const indices    = this.index;
    const attributes = this.attributes;
    for (const name in attributes) {
      const attribute = attributes[name];
      const array     = attribute.array;
      const itemSize  = attribute.itemSize;
      const array2    = new array.constructor(indices.length * itemSize);
      let index = 0, index2 = 0;
      for (let i = 0, l = indices.length; i < l; i++) {
        index = indices[i] * itemSize;
        for (let j = 0; j < itemSize; j++) array2[index2++] = array[index++];
      }
      geometry2.addAttribute(name, new GeometryAttribute(array2, itemSize));
    }
    return geometry2;
  }

  /** In-place: normalize every vec3 in the `normal` attribute. */
  normalizeNormals() {
    const vector = this._V1 || new Vector3();
    this._V1 = vector;
    const normals = this.attributes.normal;
    for (let i = 0, il = normals.count; i < il; i++) {
      const x = 3 * i + 0, y = 3 * i + 1, z = 3 * i + 2;
      vector.x = normals.array[x];
      vector.y = normals.array[y];
      vector.z = normals.array[z];
      vector.normalize();
      normals.array[x] = vector.x;
      normals.array[y] = vector.y;
      normals.array[z] = vector.z;
    }
  }

  /**
   * For the legacy `this.faces`/`this.vertices` Three.js Geometry shape —
   * derive a flat normal per face: normalize((C - B) × (A - B)).
   */
  computeFaceNormals() {
    const cb = new Vector3();
    const ab = new Vector3();
    for (let f = 0, fl = this.faces.length; f < fl; f++) {
      const face = this.faces[f];
      const vA = this.vertices[face.a];
      const vB = this.vertices[face.b];
      const vC = this.vertices[face.c];
      cb.subVectors(vC, vB);
      ab.subVectors(vA, vB);
      cb.cross(ab);
      cb.normalize();
      face.normal.copy(cb);
    }
  }

  /**
   * Build smooth vertex normals from `attributes.position`. For each
   * triangle, compute its (un-normalized) face normal, then *accumulate*
   * it into each of the triangle's vertices. After all triangles are
   * walked, `normalizeNormals()` averages them.
   *
   * Two code paths: indexed (default; respects `groups` ranges) and
   * non-indexed (consecutive groups of 9 floats = one triangle).
   */
  computeVertexNormals() {
    const index      = this.index;
    const attributes = this.attributes;
    const groups     = this.groups || [];

    if (attributes.position) {
      const positions = attributes.position.array;
      if (undefined === attributes.normal) {
        this.addAttribute('normal', new GeometryAttribute(new Float32Array(positions.length), 3));
      } else {
        // Zero the normal accumulator before re-summing.
        const array = attributes.normal.array;
        for (let i = 0, il = array.length; i < il; i++) array[i] = 0;
      }

      const normals = attributes.normal.array;
      const pA = new Vector3(), pB = new Vector3(), pC = new Vector3();
      const cb = new Vector3(), ab = new Vector3();
      let vA, vB, vC;

      if (index) {
        const indices = index.array;
        if (groups.length === 0) this.addGroup(0, indices.length);
        for (let j = 0, jl = groups.length; j < jl; ++j) {
          const group = groups[j];
          const start = group.start;
          for (let i = start, il = start + group.count; i < il; i += 3) {
            vA = 3 * indices[i + 0];
            vB = 3 * indices[i + 1];
            vC = 3 * indices[i + 2];
            pA.fromArray(positions, vA);
            pB.fromArray(positions, vB);
            pC.fromArray(positions, vC);
            cb.subVectors(pC, pB);
            ab.subVectors(pA, pB);
            cb.cross(ab);
            normals[vA]     += cb.x;
            normals[vA + 1] += cb.y;
            normals[vA + 2] += cb.z;
            normals[vB]     += cb.x;
            normals[vB + 1] += cb.y;
            normals[vB + 2] += cb.z;
            normals[vC]     += cb.x;
            normals[vC + 1] += cb.y;
            normals[vC + 2] += cb.z;
          }
        }
      } else {
        for (let i = 0, il = positions.length; i < il; i += 9) {
          pA.fromArray(positions, i);
          pB.fromArray(positions, i + 3);
          pC.fromArray(positions, i + 6);
          cb.subVectors(pC, pB);
          ab.subVectors(pA, pB);
          cb.cross(ab);
          // Non-indexed: all 3 vertices of the triangle get the same flat normal.
          normals[i]     = cb.x; normals[i + 1] = cb.y; normals[i + 2] = cb.z;
          normals[i + 3] = cb.x; normals[i + 4] = cb.y; normals[i + 5] = cb.z;
          normals[i + 6] = cb.x; normals[i + 7] = cb.y; normals[i + 8] = cb.z;
        }
      }
      this.normalizeNormals();
      attributes.normal.needsUpdate = true;
    }
  }

  computeBoundingBox() {
    if (!this.boundingBox) this.boundingBox = new Box3();
    const position = this.attributes.position;
    if (position) this.boundingBox.setFromBufferAttribute(position);
    else          this.boundingBox.makeEmpty();
  }

  /**
   * Bounding sphere via centroid-of-AABB + max distance. Not the tightest
   * sphere but fast and frame-stable; good enough for culling.
   */
  computeBoundingSphere() {
    const box    = new Box3();
    const vector = new Vector3();
    if (!this.boundingSphere) this.boundingSphere = new Sphere();
    const position = this.attributes.position;
    if (!position) return;

    const center = this.boundingSphere.center;
    box.setFromBufferAttribute(position);
    box.getCenter(center);
    let maxRadiusSq = 0;
    for (let i = 0, il = position.count; i < il; i++) {
      vector.x = position.array[3 * i + 0];
      vector.y = position.array[3 * i + 1];
      vector.z = position.array[3 * i + 2];
      maxRadiusSq = Math.max(maxRadiusSq, center.distanceToSquared(vector));
    }
    this.boundingSphere.radius = Math.sqrt(maxRadiusSq);
    if (isNaN(this.boundingSphere.radius)) {
      console.error('Bounding Sphere came up NaN, broken position buffer.', this);
    }
  }

  /**
   * Append `geometry`'s buffers onto this one. Indexed geometries get their
   * incoming indices offset by the current vertex count, and the resulting
   * index buffer is auto-promoted to Uint32 if the new size needs it.
   *
   * NOTE: only attribute keys present on BOTH geometries survive — keys
   * unique to the second are dropped.
   */
  merge(geometry) {
    const Float32ArrayConcat = (first, second) => {
      const firstLength = first.length;
      const result = new Float32Array(firstLength + second.length);
      result.set(first);
      result.set(second, firstLength);
      return result;
    };

    const attributes = this.attributes;
    if (this.index) {
      const indices = geometry.index;
      const offset  = attributes.position.count;
      for (let i = 0, il = indices.length; i < il; i++) indices[i] = offset + indices[i];

      this.index = ((first, second) => {
        const firstLength = first.length;
        const Ctor = Geometry.arrayNeedsUint32(second) ? Uint32Array : Uint16Array;
        const result = new Ctor(firstLength + second.length);
        result.set(first);
        result.set(second, firstLength);
        return result;
      })(this.index, indices);
    }
    for (const key in attributes) {
      if (geometry.attributes[key] !== undefined) {
        attributes[key].array = Float32ArrayConcat(attributes[key].array, geometry.attributes[key].array);
        attributes[key].count = attributes[key].array.length / attributes[key].itemSize;
      }
    }
    return this;
  }

  /** Deep clone — pass `noCopy=true` to alias the TypedArrays instead of copying. */
  clone(noCopy) { return new Geometry().copy(this, noCopy); }

  copy(source, noCopy) {
    this.index          = null;
    this.boundingBox    = null;
    this.boundingSphere = null;
    this.index = source.index;
    const attributes = source.attributes;
    for (const name in attributes) this.addAttribute(name, attributes[name].clone(noCopy));
    if (source.boundingBox && source.boundingBox.clone) {
      this.boundingBox = source.boundingBox.clone();
    }
    if (source.boundingSphere && source.boundingSphere.clone) {
      this.boundingSphere = source.boundingSphere.clone();
    }
    return this;
  }

  /** Translate so the bounding-box center sits at the origin. */
  center() {
    const offset = new Vector3();
    this.computeBoundingBox();
    this.boundingBox.getCenter(offset).negate();
    this.applyMatrix(new Matrix4().makeTranslation(offset.x, offset.y, offset.z));
    return this;
  }

  /**
   * Bake `matrix` into positions (and normals via inverse-transpose).
   * Invalidates any existing bounds so they get recomputed on next use.
   */
  applyMatrix(matrix) {
    const position = this.attributes.position;
    if (position) {
      matrix.applyToBufferAttribute(position);
      position.needsUpdate = true;
    }
    const normal = this.attributes.normal;
    if (normal) {
      new Matrix3().getNormalMatrix(matrix).applyToBufferAttribute(normal);
      normal.needsUpdate = true;
    }
    if (this.boundingBox)    this.computeBoundingBox();
    if (this.boundingSphere) this.computeBoundingSphere();
    return this;
  }

  scale(x, y, z) { this.applyMatrix(new Matrix4().makeScale(x, y, z)); }

  /** Convenience: take an array of Vector2/3 points and stuff them into `position`. */
  setFromPoints(points) {
    const position = [];
    for (let i = 0, l = points.length; i < l; i++) {
      const point = points[i];
      position.push(point.x, point.y, point.z || 0);
    }
    this.addAttribute('position', new GeometryAttribute(new Float32Array(position), 3));
    return this;
  }

  /** Default instance source: a fresh clone of this geometry. Subclasses override. */
  instanceFrom(geom) { return geom.clone(); }

  /** Async (off-main-thread) upload, returns a promise. Renderer-defined. */
  uploadBuffersAsync() { return Geometry.renderer.uploadBuffersAsync(this); }

  /** JSON snapshot — index + per-attribute arrays as plain numbers. */
  toJSON() {
    const props = {};
    if (this.index) props.index = Array.from(this.index);
    for (const key in this.attributes) props[key] = Array.from(this.attributes[key].array);
    return JSON.stringify(props);
  }
}

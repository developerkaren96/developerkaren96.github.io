/*
 * BaseLight — common base for all light types (point/directional/area/spot).
 *
 * A light is a `Base3D` (so it inherits position/quaternion/matrix), plus six
 * floats packed across `color` + four `Vector4` slots. The packing is shared
 * with the `lights` UBO that the Shader header emits (see Shader.process):
 *   - color       → `lightColor[i]`
 *   - data        → `lightData[i]`     (light-type-specific payload)
 *   - data2       → `lightData2[i]`    (extra payload, e.g. area-light geom)
 *   - data3       → `lightData3[i]`    (extra payload)
 *   - properties  → `lightProperties[i]`  → x=intensity, y=distance, z=bounce
 *
 * Shadow casting is opt-in via the `castShadow` setter — it lazily allocates
 * a `Shadow` (depth render-target + camera) and registers/unregisters the
 * light with `Lighting`'s per-scene shadow group. The `silentShadow` flag
 * lets callers manage the shadow group themselves (e.g. an off-screen
 * preview light that should not affect the active scene's shadow count).
 *
 * `prepareRender` is called by the renderer just before the shadow pass:
 * snap the shadow camera to the light's position and aim it at `target`.
 */
class BaseLight extends Base3D {
  constructor(color = 0xffffff, intensity = 1, distance = 9999) {
    super();
    this.color      = new Color(color);
    this.data       = new Vector4();
    this.data2      = new Vector4();
    this.data3      = new Vector4();
    this.properties = new Vector4(intensity, distance, 0, 0);
  }

  destroy() {
    if (this.shadow) {
      Lighting.removeFromShadowGroup(this);
      this.shadow.destroy();
    }
  }

  prepareRender() {
    this.shadow.camera.position.copy(this.position);
    this.shadow.camera.lookAt(this.shadow.target);
  }

  // Setter triggers shadow allocation + scene-group registration. We guard
  // with `(this.shadow || bool)` so setting `castShadow = false` on a light
  // that never had a shadow is a no-op.
  set castShadow(bool) {
    if (!this.shadow && !bool) return;
    if (!this.shadow) this.shadow = new Shadow(this);
    this.shadow.enabled = bool;
    if (this.silentShadow) return;
    if (bool) Lighting.addToShadowGroup(this);
    else      Lighting.removeFromShadowGroup(this);
  }

  // ── packed properties (mirrors `lightProperties` in the shader) ──────────
  set intensity(v) { this.properties.x = v; }
  get intensity()  { return this.properties.x; }
  set distance(v)  { this.properties.y = v; }
  get distance()   { return this.properties.y; }
  set bounce(v)    { this.properties.z = v; }
  get bounce()     { return this.properties.z; }
}

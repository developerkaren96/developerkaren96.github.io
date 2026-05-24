/*
 * Spherical — (radius, phi, theta) coordinate triplet for the
 * spherical-coordinate form of a Vector3.
 *
 *   radius   distance from the origin.
 *   phi      polar angle from the +Y axis (0..π).
 *   theta    azimuthal angle in the XZ plane (atan2(x, z)).
 *
 * Used by OrbitControls-style cameras and anywhere a more natural
 * angular parameterisation is wanted (e.g. random-on-sphere sampling).
 *
 * `makeSafe()` clamps phi a tiny epsilon away from the poles to avoid
 * the gimbal-lock degeneracy where a small change in theta produces
 * no Cartesian change.
 */
class Spherical {
  constructor(radius = 1, phi = 0, theta = 0) {
    this.radius = radius;
    this.phi    = phi;
    this.theta  = theta;
  }

  set(radius, phi, theta) { this.radius = radius; this.phi = phi; this.theta = theta; return this; }
  clone()      { return new Spherical().copy(this); }
  copy(other)  { this.radius = other.radius; this.phi = other.phi; this.theta = other.theta; return this; }

  // Pull phi away from the poles to avoid gimbal-lock degeneracy.
  makeSafe()   { this.phi = Math.max(1e-6, Math.min(Math.PI - 1e-6, this.phi)); return this; }

  /*
   * Cartesian → spherical. `theta` uses atan2(x, z) to match the Y-up
   * Z-forward convention; `phi` is the angle from +Y so phi=0 is
   * "looking up" and phi=π is "looking down".
   */
  setFromVector3(vec3) {
    this.radius = vec3.length();
    if (0 === this.radius) {
      this.theta = 0;
      this.phi   = 0;
    } else {
      this.theta = Math.atan2(vec3.x, vec3.z);
      this.phi   = Math.acos(Math.clamp(vec3.y / this.radius, -1, 1));
    }
    return this;
  }
}

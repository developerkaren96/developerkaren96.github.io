/*
 * Cylindrical — (radius, theta, y) coordinate triplet for the
 * cylindrical-coordinate form of a Vector3.
 *
 *   radius   distance from the Y axis (sqrt(x² + z²)).
 *   theta    azimuthal angle in the XZ plane (atan2(x, z)).
 *   y        height along the Y axis.
 *
 * Convert from a Vector3 with `setFromVector3`. The inverse (back to
 * Vector3) lives on Vector3 itself if needed (or just rebuild
 * x = r sin θ, z = r cos θ).
 */
class Cylindrical {
  constructor(radius = 1, theta = 0, y = 0) {
    this.radius = radius;
    this.theta  = theta;
    this.y      = y;
  }

  set(radius, theta, y) { this.radius = radius; this.theta = theta; this.y = y; return this; }
  clone()               { return new this.constructor().copy(this); }
  copy(other)           { this.radius = other.radius; this.theta = other.theta; this.y = other.y; return this; }

  /*
   * Project a Cartesian Vector3 into cylindrical coordinates. atan2's
   * (x, z) argument order matches the Y-up / Z-forward convention used
   * throughout the engine.
   */
  setFromVector3(vec3) {
    this.radius = Math.sqrt(vec3.x * vec3.x + vec3.z * vec3.z);
    this.theta  = Math.atan2(vec3.x, vec3.z);
    this.y      = vec3.y;
    return this;
  }
}

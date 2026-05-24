/*
 * RNG — seedable linear-congruential generator.
 *
 * Used by Math.randomSeed (set up in 0002-misc-0001.js) so that visual
 * effects can be reproduced deterministically from a given seed.
 *
 * The function-as-constructor shape is preserved because 0002 attaches
 * `RNG.prototype.nextFloat` later in the bootstrap. Order matters: this
 * file installs the global, 0002 fills in the prototype.
 */
function RNG(seed) {
  // Glibc LCG constants (modulus, multiplier, increment).
  this.m = 2147483648;
  this.a = 1103515245;
  this.c = 12345;
  this.state = seed || Math.floor(Math.random() * (this.m - 1));
}

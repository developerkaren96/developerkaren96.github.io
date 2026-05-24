/*
 * Namespace declaration — opens the `FX` namespace for everything
 * that follows in this load slot. Subsequent `Class(function …)`
 * registrations under this scope are scoped beneath `FX` so e.g.
 * particle systems, lens dirt, motion blur etc. don't pollute the
 * top-level global. Pair with the matching `Namespace()` reset at
 * the next namespace boundary in the bundle.
 */
Namespace('FX');

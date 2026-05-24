/*
 * InputUIL — static facade for `InputUILConfig` (0322). Mirrors
 * the `CameraUIL` / `MeshUIL` / `ShaderUIL` pattern: a single
 * `create(name, group, decoupled)` call constructs the per-key
 * config panel and attaches it to either the caller-provided
 * group, `UIL.global` by default, or detaches when `group === null`.
 *
 * `decoupled` (passed through to InputUILConfig) flips a mode
 * where the config stores values in its own namespace instead of
 * mutating the caller — used when a node needs to read UIL state
 * but shouldn't write to shared storage.
 *
 * `UPDATE` event constant: channel for cross-instance value
 * propagation through `Events.emitter`.
 */
Class(function InputUIL() {
  this.UPDATE = 'inputUil_Update';
  this.create = function (name, group, decoupled) {
    return new InputUILConfig(name, null === group ? null : group || UIL.global, decoupled);
  };
}, 'static');

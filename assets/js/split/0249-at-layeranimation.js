/*
 * LayerAnimation — per-mesh animation library + driver. Combines an
 * InputUIL config block (so the animation set is editable from the
 * UI) with a `HierarchyAnimation` instance (0247) that swaps its
 * data payload on the fly.
 *
 * Config (InputUIL):
 *   - `path`        — folder under `assets/geometry/` containing the
 *     animation JSONs.
 *   - `jsonFiles`   — newline-separated list of file basenames
 *     (e.g. "idle\nrun\njump"). Each is fetched as
 *     `assets/geometry/${path}/${name}.json` and stored in `_map`
 *     keyed by basename.
 *
 * Hierarchy bootstrap:
 *   - The first listed file becomes `_active` and seeds the inner
 *     `HierarchyAnimation`. The `createObjects` callback maps each
 *     hierarchy node to either the original `_mesh` (if its name
 *     matches `_input.get('name')` — i.e. the bone the caller cares
 *     about) or a plain `Group()` placeholder for every other slot.
 *     This is how a skeletal animation can drive a specific mesh
 *     while leaving the rest of the rig as cheap empty nodes.
 *
 * Playback:
 *   - `play(name, time, ease='linear', delay)` swaps `_hierarchy`'s
 *     data payload to `_map[name]`, starts the render loop, then
 *     tweens `elapsed: 0 → 1` over `time` ms (defaulting to
 *     `frames.length / fps * 1000` — the natural clip length).
 *     Awaits the tween, stops the loop. Returns a Promise that
 *     resolves on completion.
 *   - `await self.wait('initialized')` gates `play()` until the
 *     async bootstrap (config + JSON loads + hierarchy build) is
 *     finished.
 *
 * `_mesh.animation = self` exposes the driver on the mesh so other
 * systems can do `mesh.animation.play('run')` without holding a
 * separate reference.
 */
Class(function LayerAnimation(_mesh, _shader, _group, _input) {
  Inherit(this, Component);
  const self = this;
  var _config,
    _active,
    _hierarchy,
    _map = {};
  !(async function () {
    _mesh.animation = self;
    (function initConfig() {
      (_config = InputUIL.create(_input.prefix + 'anim', _group)).setLabel('Animation Files');
      _config.add('path');
      _config.addTextarea('jsonFiles');
    })();
    await (async function initFiles() {
      let path = `assets/geometry/${_config.get('path')}/`,
        files = _config.get('jsonFiles').split('\n'),
        load = files.map((f) => path + f + '.json').map((path) => get(path)),
        data = await Promise.all(load);
      for (let i = 0; i < files.length; i++) _map[files[i]] = data[i];
      _active = files[0];
    })();
    (async function initHierarchy() {
      _hierarchy = self.initClass(HierarchyAnimation, _map[_active], (data) => {
        let array = [];
        for (let i = 0; i < data.length; i++) {
          data[i].name == _input.get('name') ? array.push(_mesh) : array.push(new Group());
        }
        return array;
      });
      await _hierarchy.ready();
      _hierarchy.update();
      self.flag('initialized', true);
    })();
  })();
  this.play = async function (name, time, ease, delay) {
    if ((await self.wait('initialized'), !_map[name])) throw 'No animation file found for ' + name;
    ease || (ease = 'linear');
    time || (time = (_map[name].frames.length / _map[name].fps) * 1e3);
    _hierarchy.data = _map[name];
    _active = name;
    _hierarchy.start();
    await tween(
      _hierarchy,
      {
        elapsed: 1,
      },
      time,
      ease,
      delay,
    ).promise();
    _hierarchy.stop();
  };
});

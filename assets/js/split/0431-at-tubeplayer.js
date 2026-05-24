/*
 * TubePlayer — multiplayer player fragment for the tubes
 * interaction (PlayerView2 variant — sends `move` Vector3
 * over the wire via bindLink).
 *
 * Local player path (self.params.local truthy):
 *   - Generates a colour from a random hue (HSL 0.5 sat,
 *     0.6 lum) and broadcasts via setPlayerData('color', …).
 *   - Each render frame: pos = ScreenProjection.find(camera)
 *     .unproject(Mouse, Stage, 40) — projects cursor onto a
 *     plane 40 units in front of the camera; a
 *     VelocityTracker on `pos` provides velocity.
 *   - On a 60-tick: if visibleV<0.99 AND mouse hasn't moved,
 *     skip; otherwise require travel >= 0.5 units before
 *     releasing a tube (tubes.release(pos, life=1, width
 *     0.3, velVec=normalize·0.4, color)).
 *
 * Remote players: state.color bound to local Color; bindLink
 * pulls their `move` group to drive identical tube emissions
 * for everyone in the room.
 *
 * Standard Fragment plumbing.
 */
Class(function TubePlayer(_params, ...restArgs) {
  const self = this;
  Inherit(self, PlayerView2);
  Inherit(self, XComponent);
  self.fragName = 'TubePlayer';
  self.contexts = 'PlayerView2';
  self.params = _params;
  self.args = arguments;
  this.isFragment = true;
  var _promises = [];
  !(async function () {
    self.element && (self.element.onMountedHook = (_) => self.onMounted?.());
    self.params = _params;
    self.args = arguments;
    self.parent?.layers && (self.layers = self.parent.layers);
    self.layout?.getAllLayers && (self.layers = await self.layout.getAllLayers());
    const move = new Group(),
      pos = move.position,
      camera = self.params.camera,
      tubes = self.params.proton.tubes,
      velocity = self.createFragment(VelocityTracker, pos),
      velVec = new Vector3();
    self.params.local &&
      self.setPlayerData(
        'color',
        (function getColor() {
          let hue = Math.random(0, 1, 4),
            color = new Color(),
            hsl = new ColorHSL(hue, 0.5, 0.6);
          return (color.setHSL(hsl), color.getHexString());
        })(),
      );
    let color = new Color();
    self.bind(self.state, 'color', (value) => {
      color.set(value);
    });
    self.bindLink && self.bindLink(move, 'move');
    let pos2 = new Vector3(),
      dist = new Vector3();
    self.startRender((_) => {
      if (self.params.local) {
        let z = 40;
        pos.copy(ScreenProjection.find(camera).unproject(Mouse, Stage, z));
      }
      velocity.update();
    });
    self.startRender((_) => {
      (self.get('ViewController/visibleV') < 0.99 && 0 == Mouse.delta.length()) ||
        (dist.subVectors(pos, pos2),
        dist.length() < 0.5 ||
          (velVec.copy(velocity.value).normalize().multiplyScalar(0.4),
          tubes.release(pos, 1, 0.3, velVec, color),
          pos2.copy(pos)));
    }, 60);
    for (let key in self)
      if (self[key]?.then) {
        let store = self[key];
        store.then((val) => (self[key] = val));
        _promises.push(store);
      }
    _promises.length && (await Promise.all(_promises));
    _promises = null;
    self.flag?.('__ready', true);
    self.onInit?.();
  })();
});

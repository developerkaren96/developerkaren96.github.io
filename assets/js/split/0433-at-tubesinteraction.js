/*
 * TubesInteraction — Frag3D + MultiplayerEnvironment2
 * fragment that hosts the shared "tube drawing" experience
 * for the Home/Footer scenes. Connects to
 * `wss://s.dreamwave.network/ws` room key 'atv6' (the global
 * site-wide room, separate from MobileSync's per-user
 * pairing room).
 *
 * Setup:
 *   - Waits for the particle layer + tubes renderer to ready,
 *     binds tRefraction from self.params.refraction onto the
 *     tubes shader, parents self.group into self.params.scene
 *     and unhides the tubes mesh.
 *   - Instantiates a local TubePlayer (local: 1) AND a
 *     MultiplayerConfig2 (server, roomKey 'atv6',
 *     playerClass 'TubePlayer', maxInRoom 3) — so up to 3
 *     visitors can co-draw at once.
 *
 * data plumbed to the room: camera, proton (particle layer),
 * alwaysOn: false (only on when the scene is visible).
 *
 * Standard Fragment plumbing.
 */
Class(function TubesInteraction(_params, ...restArgs) {
  const self = this;
  Inherit(self, Frag3D, 'TubesInteraction');
  Inherit(self, MultiplayerEnvironment2);
  Inherit(self, XComponent);
  self.fragName = 'TubesInteraction';
  self.contexts = 'Frag3D, "TubesInteraction",MultiplayerEnvironment2';
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
    await self.layers.particles.ready();
    await self.layers.particles.tubes.ready();
    self.layers.particles.tubes.shader.set('tRefraction', self.params.refraction);
    self.params.scene.add(self.group);
    self.layers.particles.tubes.mesh.visible = true;
    for (let key in self)
      if (self[key]?.then) {
        let store = self[key];
        store.then((val) => (self[key] = val));
        _promises.push(store);
      }
    _promises.length && (await Promise.all(_promises));
    self.ref_MultiplayerConfig2765 = self.initClass(
      MultiplayerConfig2,
      AppState.createLocal(
        {
          server: 'wss://s.dreamwave.network/ws',
          roomKey: 'atv6',
          playerClass: 'TubePlayer',
          maxInRoom: 3,
          data: {
            camera: self.params.camera,
            proton: self.layers.particles,
            alwaysOn: false,
          },
        },
        true,
      ),
    );
    self.ref_MultiplayerConfig2765.isFragment &&
      _promises.push(self.wait(self.ref_MultiplayerConfig2765, '__ready'));
    self.ref_TubePlayer134 = self.initClass(
      TubePlayer,
      AppState.createLocal(
        {
          local: 1,
          camera: self.params.camera,
          proton: self.layers.particles,
        },
        true,
      ),
    );
    self.ref_TubePlayer134.isFragment &&
      _promises.push(self.wait(self.ref_TubePlayer134, '__ready'));
    _promises = null;
    self.flag?.('__ready', true);
    self.onInit?.();
  })();
});

/*
 * FragFXScene — FXScene flavour of Frag3D (0296). Mounts a named
 * SceneLayout into an FXScene (its own Scene + RT) so the result
 * can be composited into the parent like any other FX pass.
 *
 * `_initFXScene(nuke, rtPool, options)`:
 *   - Strips falsy values from `options` so downstream code that
 *     checks `'key' in options` doesn't trip on `false`/`null`.
 *   - WebVR fallback: if running under WebVR and `vrMode` wasn't
 *     explicitly opted into, the FX-RT path is skipped entirely
 *     (postfx round-trips through an RT confuse stereo rendering on
 *     some headsets). Instead, an `onFXSceneVisibility(bool)` hook
 *     forces the layout's layers to re-toggle visibility (a
 *     visible:true→false→true cycle re-applies layer states that
 *     might otherwise be stale post-resume), then `vrWorldMode()` is
 *     called to render directly into the world.
 *   - `options.screenQuad`: defers one tick, then adds a
 *     `ScreenQuad` shader mesh sampling `self.rt` so the FX scene
 *     paints onto a fullscreen quad in front of everything else
 *     (`renderOrder = -1`, `frustumCulled = false`). The shader's
 *     `customCompile: Utils.uuid()` forces a unique compile so other
 *     FragFXScenes can't share its program (each has its own RT).
 *   - Finally calls `self.create(nuke, [rtPool()|options], options)`
 *     to set up the FXScene RT chain; the rtPool branch is for
 *     shared-RT pooling when many FX scenes are active.
 *
 * `uploadSync()` forwards to `Initializer3D.uploadAll(layout)` so
 * the host preloader can await this scene's assets just like any
 * other.
 */
Class(function FragFXScene(_name) {
  Inherit(this, FXScene);
  const self = this;
  this.layout = this.initClass(SceneLayout, _name);
  this.scene.add(this.layout.group);
  this.group = new Group();
  this._initFXScene = function (nuke, rtPool, options) {
    for (let key in options) options[key] || delete options[key];
    if (RenderManager.type == RenderManager.WEBVR && !options.vrMode)
      return (
        (self.onFXSceneVisibility = (bool) => {
          if (bool) {
            self.group.visible = true;
            let recurse = (obj) => {
              if (obj.classRef?.layers)
                for (let key in obj.classRef.layers) {
                  let layer = obj.classRef.layers[key];
                  true === layer.visible && ((layer.visible = false), (layer.visible = true));
                }
              obj.children.forEach(recurse);
            };
            self.group.children.forEach(recurse);
          }
        }),
        void self.vrWorldMode()
      );
    options.screenQuad &&
      defer((_) => {
        let shader = self.initClass(Shader, 'ScreenQuad', {
            customCompile: Utils.uuid(),
            depthWrite: false,
            tMap: {
              value: self.rt,
            },
          }),
          mesh = new Mesh(World.QUAD, shader);
        mesh.frustumCulled = false;
        mesh.renderOrder = -1;
        self.group.add(mesh);
      });
    rtPool ? self.create(nuke, rtPool(), options) : self.create(nuke, options);
  };
  this.uploadSync = function () {
    return Initializer3D.uploadAll(self.layout);
  };
});

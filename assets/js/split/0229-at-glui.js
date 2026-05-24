/*
 * GLUI — top-level singleton that hosts the WebGL UI subsystem.
 *
 * Owns up to two stages:
 *   - `Stage` (2D, GLUIStage)   — screen-space HUD / overlays.
 *   - `Scene` (3D, GLUIStage3D) — UI laid out in world space.
 *
 * Lifecycle: `init(is2D, is3D)` waits for the `zUtils3D` lib to
 * load, then instantiates the requested stages and hooks the UI
 * render into the world's Nuke postprocessing pass — the per-frame
 * `loop()` is installed as `World.NUKE.postRender`, so UI draws
 * on top of the postprocessed scene. The 3D stage's interaction
 * picker is bound to the global `Mouse`.
 *
 * Aura/AR override: when `window.AURA_AR` is active, the UI render
 * is rerouted to `AURA_AR.postRender` instead of `World.NUKE`, so
 * AR overlays draw the UI in the AR composite stage rather than
 * the standard nuke pipeline.
 *
 * Metal builds short-circuit the loop entirely — the Metal backend
 * supplies its own UI compositing path.
 *
 * Convenience globals:
 *   - `$gl(w, h, map, customCompile)` / `glObject(...)` — new
 *     `GLUIObject`.
 *   - `$glText(text, font, size, opts, customCompile)` / `glText(...)`
 *     — new `GLUIText`.
 *
 * API:
 *   - `init(is2D, is3D)`  — boot the subsystem (idempotent).
 *   - `ready()`           — promise that resolves once init is done.
 *   - `clear()`           — drop both stages' contents.
 *   - `renderDirect(render)` — bypass the Nuke hook and render
 *     immediately; used by special-case scenes.
 */
Class(function GLUI() {
  Inherit(this, Component);
  const self = this,
    hasMetal = !!window.Metal,
    hasAuraAR = !!window.AURA_AR;
  function loop() {
    hasMetal ||
      (hasAuraAR && AURA_AR.active && ((World.NUKE.postRender = null), (AURA_AR.postRender = loop)),
      self.Scene && self.Scene.render(),
      self.Stage && self.Stage.render());
  }
  window.$gl = window.glObject = function (width, height, map, customCompile) {
    return new GLUIObject(width, height, map, customCompile);
  };
  window.$glText = window.glText = function (text, fontName, fontSize, options, customCompile) {
    return new GLUIText(text, fontName, fontSize, options, customCompile);
  };
  this.init = async function (is2D, is3D) {
    self.initialized ||
      (undefined === is2D && ((is2D = true), (is3D = true)),
      await AssetLoader.waitForLib('zUtils3D'),
      is2D && (self.Stage = new GLUIStage()),
      is3D && ((self.Scene = new GLUIStage3D()), (self.Scene.interaction.input = Mouse)),
      self.wait(World, 'NUKE', (_) => {
        self.initialized = true;
        self.Scene && (World.NUKE.onBeforeRender = self.Scene.mark);
        World.NUKE.postRender = loop;
      }));
  };
  this.clear = function () {
    self.Stage.clear();
    self.Scene.clear();
  };
  this.ready = function () {
    return self.wait(self, 'initialized');
  };
  this.renderDirect = function (render) {
    self.Scene && self.Scene.renderDirect(render);
    self.Stage && self.Stage.renderDirect(render);
  };
}, 'static');

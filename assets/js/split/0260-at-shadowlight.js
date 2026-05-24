/*
 * ShadowLight — Object3D wrapper around a `BaseLight` configured
 * specifically as a shadow caster, with extra plumbing for the
 * "lock or refresh-on-change" shadow rendering modes.
 *
 * Setup (async IIFE):
 *   1. Create the underlying BaseLight, copy `_input.prefix` onto
 *      it so the UIL controls bind correctly, and add it as a child
 *      of this wrapper.
 *   2. Mark `silentShadow = ShadowLight.LOCKED` — when LOCKED is
 *      true at the static level, shadow map renders are gated (the
 *      shadow map is rendered once and frozen).
 *   3. Walk up the parent chain looking for a Scene with
 *      `_lightingData`; if found, copy it onto the light so the
 *      shadow shader inherits the scene's light data table.
 *   4. Enable `castShadow` and add the ShadowUIL panel labelled
 *      "Shadows".
 *
 * Dynamic-shadow path (when not LOCKED):
 *   - `startRender` an empty tick (keeps the component alive).
 *   - `self.wait` until a parent Scene exists, with a 2-second
 *     warning if still missing. Once available, marks
 *     `scene.hasShadowLight = true` and binds `bindSceneChange`:
 *     any scene mutation thaws a static light's shadow
 *     (`shadow.frozen = false`), then refreezes 250ms later via a
 *     debounced timer. This is the "refresh on activity, freeze on
 *     quiescence" optimisation that avoids re-rendering static
 *     shadow maps every frame while still picking up genuine
 *     changes.
 *
 * `onVisible()` repeats the thaw/refreeze cycle when the light
 * becomes visible again (e.g. after a section transition) so
 * shadows update at least once after re-show. `defer()` waits one
 * tick so the visibility change has propagated before refreshing.
 *
 * `onDestroy()` tears down the underlying BaseLight.
 */
Class(function ShadowLight(_input, _group) {
  Inherit(this, Object3D);
  const self = this;
  var _light, _timer;
  !(async function () {
    (_light = new BaseLight()).prefix = _input.prefix;
    self.add(_light);
    _light.silentShadow = ShadowLight.LOCKED;
    self.light = _light;
    let scene,
      p = self.parent.group._parent;
    for (; p; ) {
      p instanceof Scene && p._lightingData && (_light._lightingData = p._lightingData);
      p = p._parent;
    }
    _light.castShadow = true;
    ShadowUIL.add(_light, _group).setLabel('Shadows');
    ShadowLight.LOCKED ||
      (self.startRender((_) => {}),
      self.flag('waitStarted', Render.TIME),
      await self.wait(
        () => (
          (scene = (function findScene() {
            let p = self.group._parent;
            for (; p; ) {
              if (p instanceof Scene) return p;
              p = p._parent;
            }
          })()),
          !scene &&
            !self.flag('warned') &&
            Render.TIME - self.flag('waitStarted') > 2e3 &&
            (console.warn('ShadowLight has no parent scene after 2000ms'),
            self.flag('warned', true)),
          scene &&
            self.flag('warned') &&
            console.log(
              `False alarm, ShadowLight got parent scene after ${Render.TIME - self.flag('waitStarted')}ms`,
            ),
          scene
        ),
      ),
      (scene.hasShadowLight = true),
      scene.bindSceneChange((_) => {
        _light.static &&
          ((_light.shadow.frozen = false),
          clearTimeout(_timer),
          (_timer = self.delayedCall((_) => (_light.shadow.frozen = true), 250)));
      }));
  })();
  this.onVisible = async function () {
    await defer();
    _light.static &&
      ((_light.shadow.frozen = false),
      clearTimeout(_timer),
      (_timer = self.delayedCall((_) => (_light.shadow.frozen = true), 250)));
  };
  this.onDestroy = function () {
    _light.destroy();
  };
});

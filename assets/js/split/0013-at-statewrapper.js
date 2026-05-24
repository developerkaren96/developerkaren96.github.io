/*
 * StateWrapper — bind the same AppState key on a *collection* of components.
 *
 *   new StateWrapper([compA, compB]).bind('selected', ({ target, data }) => {
 *     // fires for each component whose .state.selected changes,
 *     // with `target` set to the component that changed.
 *   });
 *
 * Each component is expected to expose a `.state` (AppState) and a
 * `__ready` flag that flips true once that state is hydrated. This
 * wrapper waits for `__ready` before subscribing — so binding to a
 * fresh component graph "just works" even if some children aren't loaded.
 *
 * `bind` and `listen` are aliases.
 */
Class(function StateWrapper(targets) {
  const self = this;
  Inherit(this, Component);

  this.bind = this.listen = function (key, callback) {
    targets.forEach(async (target) => {
      await target.wait('__ready');
      self.bindState(target.state, key, (data) => {
        callback({ target, data });
      });
    });
  };
});

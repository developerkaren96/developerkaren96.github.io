/*
 * WorkLabelPlayground — standalone harness Component that
 * mounts a single WorkPaneUI with mock data ("Museum of
 * Weed" title + boilerplate copy). Used in the Hydra
 * editor's playground (?p=WorkLabelPlayground) to iterate
 * on the per-item pane label without booting the full
 * /work scene.
 *
 * Standard Fragment plumbing.
 */
Class(function WorkLabelPlayground(_params, ...restArgs) {
  const self = this;
  Inherit(self, Component);
  Inherit(self, XComponent);
  self.fragName = 'WorkLabelPlayground';
  self.contexts = 'Component';
  self.params = _params;
  self.args = arguments;
  this.isFragment = true;
  var _promises = [];
  !(async function () {
    self.element && (self.element.onMountedHook = (_) => self.onMounted?.());
    self.ref_WorkPaneUI479 = self.initClass(
      WorkPaneUI,
      AppState.createLocal(
        {
          title: 'Museum of Weed',
          copy: 'A small write-up of the project to give context to what it was, and the techniques used to create it.',
        },
        true,
      ),
    );
    self.ref_WorkPaneUI479.isFragment &&
      _promises.push(self.wait(self.ref_WorkPaneUI479, '__ready'));
    self.params = _params;
    self.args = arguments;
    self.parent?.layers && (self.layers = self.parent.layers);
    self.layout?.getAllLayers && (self.layers = await self.layout.getAllLayers());
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

/*
 * UILGraphNode — empty Class used only as a namespace for
 * the four event-name constants
 * (FOCUSED/BLURRED/RENAMED/TOGGLE_VISIBILITY) emitted by
 * UILGraphLayer / UILGraphGroup / UILGraphNodeMenu. The
 * Fragment body itself does nothing.
 *
 * Standard Fragment plumbing.
 */
Class(
  function UILGraphNode(_params, ...restArgs) {
    const self = this;
    Inherit(self, Element);
    Inherit(self, XComponent);
    self.fragName = 'UILGraphNode';
    self.contexts = 'Element';
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
  },
  '',
  () => {
    UILGraphNode.FOCUSED = 'uilgraphnode_focused';
    UILGraphNode.BLURRED = 'uilgraphnode_blurred';
    UILGraphNode.RENAMED = 'uilgraphnode_renamed';
    UILGraphNode.TOGGLE_VISIBILITY = 'uilgraphnode_toggle_visibility';
  },
);

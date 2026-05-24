/*
 * UILGraphGroupChildren — body of a UILGraphGroup. Hosts a
 * ViewState bound to params.data.children that auto-spawns
 * a UILGraphLayer (or nested UILGraphGroup via the parent
 * layout's determineView) per child. Below the items list
 * sits a dropTarget div that, when dropped onto, fires
 * 'UILGraph/MoveNode' with type 'end-of-list' so a layer
 * dragged here is appended to this group.
 *
 * Standard Fragment plumbing.
 */
Class(function UILGraphGroupChildren(_params, ...restArgs) {
  const self = this;
  Inherit(self, Element);
  Inherit(self, DragAndDrop);
  Inherit(self, XComponent);
  self.fragName = 'UILGraphGroupChildren';
  self.contexts = 'Element,DragAndDrop';
  self.params = _params;
  self.args = arguments;
  this.isFragment = true;
  var _promises = [];
  !(async function () {
    self.element && (self.element.onMountedHook = (_) => self.onMounted?.());
    self.initClass(FragUIHelper, {
      _type: 'UI',
      refName: 'unnamed',
      children: [
        {
          _type: 'div',
          refName: 'wrapper',
          children: [
            {
              _type: 'div',
              refName: 'items',
              children: [
                {
                  view: 'UILGraphLayer',
                  data: '$params.data.children',
                  layoutId: '$params.layoutId',
                  _type: 'ViewState',
                  refName: 'unnamed',
                  children: [],
                },
              ],
            },
            {
              _type: 'div',
              refName: 'dropTarget',
              children: [
                {
                  _type: 'div',
                  refName: 'highlight',
                  children: [],
                },
              ],
            },
          ],
        },
      ],
    });
    self.params = _params;
    self.args = arguments;
    self.parent?.layers && (self.layers = self.parent.layers);
    self.layout?.getAllLayers && (self.layers = await self.layout.getAllLayers());
    self.setDragEnabled(false);
    self.items.classList()[self.params.data.open ? 'remove' : 'add']('hidden');
    self.bind(self.params.data, 'open', (val) =>
      self.items?.classList?.()[val ? 'remove' : 'add']('hidden'),
    );
    self.onDrop = function (dropId) {
      self.fire('UILGraph/MoveNode', {
        moveId: dropId,
        targetId: self.params.data.id,
        type: 'end-of-list',
      });
    };
    self.element.goob(
      `\n    & > .wrapper > .items.hidden {\n        display: none;\n    }\n\n    & > .wrapper > .dropTarget {\n        margin-bottom: 0;\n        margin-left: ${32 * self.params.data.depth}px;\n        height: 6px;\n    }\n`,
    );
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

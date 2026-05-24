/*
 * UILGraphContextMenuButton — single row in the context
 * menu. Bound to 'UILGraphContextMenu/open' so each button
 * shows/hides itself based on whether the open context's
 * type is in its data.uilContexts whitelist. Click fires
 * 'GraphContextMenu/action' with data.action — the menu
 * does not act, the action is picked up by Layout/Group
 * handlers.
 *
 * Standard Fragment plumbing.
 */
Class(function UILGraphContextMenuButton(_data, _index, _params) {
  const self = this;
  Inherit(self, ViewStateElement);
  Inherit(self, Element);
  Inherit(self, XComponent);
  self.fragName = 'UILGraphContextMenuButton';
  self.contexts = 'ViewStateElement,Element';
  self.data = _data;
  self.index = _index;
  self.params = _params;
  this.isFragment = true;
  var _promises = [];
  !(async function () {
    self.element && (self.element.onMountedHook = (_) => self.onMounted?.());
    self.initClass(FragUIHelper, {
      click: '$onClick',
      _type: 'UI',
      refName: 'unnamed',
      children: [
        {
          _type: 'div',
          _innerText: '$data.label',
          refName: 'button',
          children: [],
        },
      ],
    });
    self.data = _data;
    self.index = _index;
    self.params = _params;
    self.createState();
    self.parent?.layers && (self.layers = self.parent.layers);
    self.layout?.getAllLayers && (self.layers = await self.layout.getAllLayers());
    self.bind('UILGraphContextMenu/open', (openContext) => {
      if (
        (openContext || self.element.hide(), self.data.targetNodeCases.reduce((a, b) => a() || b()))
      )
        return self.element.show();
      const action = self.data.uilContexts.includes(openContext.type) ? 'show' : 'hide';
      self.element[action]();
    });
    self.onClick = function () {
      self.fire('GraphContextMenu/action', self.data.action);
    };
    self.element.goob(
      '\n    position: relative;\n    width: 100%;\n    height: 27px;\n    display: flex;\n    flex-direction: row;\n    align-items: center;\n    cursor: default;\n    box-sizing: border-box;\n    padding: 0 18px;\n    user-select: none;\n    transition: background-color 300ms ease-in-out, color 300ms ease-in-out;\n    background-color: transparent;\n    color: white;\n    font-family: sans-serif;\n    font-size: 11px;\n\n    &:hover {\n        color: #fff;\n        background-color: #525252;\n    }\n\n',
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

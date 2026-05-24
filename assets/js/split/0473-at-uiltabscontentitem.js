/*
 * UILTabsContentItem — body for one tab in UILTabs. By
 * default contains its own UILPanelToolbar + UILFolder
 * (mirror of UILPanel's structure). When data.content is
 * later assigned, the binding branches:
 *   function  → treat as a Hydra Class and initClass into
 *               contentContainer (destroying toolbar +
 *               folder first).
 *   UILFolder → just folder.add(value).
 *   object    → assume markup, contentContainer.add(value)
 *               (again destroys toolbar + folder).
 *
 * Standard Fragment plumbing.
 */
Class(function UILTabsContentItem(_data, _index, _params) {
  const self = this;
  Inherit(self, Element);
  Inherit(self, ViewStateElement);
  Inherit(self, XComponent);
  self.fragName = 'UILTabsContentItem';
  self.contexts = 'Element,ViewStateElement';
  self.data = _data;
  self.index = _index;
  self.params = _params;
  this.isFragment = true;
  var _promises = [];
  !(async function () {
    function destroyToolbar() {
      self.toolbar.destroy();
    }
    function destroyFolder() {
      self.folder.destroy();
    }
    self.element && (self.element.onMountedHook = (_) => self.onMounted?.());
    self.initClass(FragUIHelper, {
      _type: 'UI',
      refName: 'unnamed',
      children: [
        {
          _type: 'article',
          refName: 'contentContainer',
          children: [
            {
              _type: 'UILPanelToolbar',
              refName: 'toolbar',
              children: [],
            },
            {
              id: '$data.label',
              options: '$folderOptions',
              _type: 'UILFolder',
              refName: 'folder',
              children: [],
            },
          ],
        },
      ],
    });
    self.data = _data;
    self.index = _index;
    self.params = _params;
    self.createState();
    self.parent?.layers && (self.layers = self.parent.layers);
    self.layout?.getAllLayers && (self.layers = await self.layout.getAllLayers());
    self.ready = false;
    self.folderOptions = {
      hideTitle: true,
      drag: false,
    };
    self.onMounted = () => {
      self.ready = true;
      self.set('container', self.contentContainer);
    };
    self.data.bind('content', async (value) => {
      value &&
        (await self.wait(() => self.ready),
        await defer(),
        'function' == typeof value
          ? (destroyToolbar(),
            destroyFolder(),
            (function addHydraObject(hydraObject) {
              self.initClass(hydraObject, self.data, [self.contentContainer]);
            })(value))
          : value instanceof UILFolder
            ? (function addFolder(folder) {
                self.folder.add(folder);
              })(value)
            : 'object' == typeof value &&
              (destroyToolbar(),
              destroyFolder(),
              (function addHTML(markup) {
                self.contentContainer.add(markup);
              })(value)));
    });
    self.element.goob(
      '\n    & {\n        height: 100%;\n        max-height: 100vh;\n        overflow-y: auto;\n        \n        .UILPanel.global & {\n            max-height: calc(100vh - 40px);\n            padding-bottom: 40px;\n        }\n    }\n\n    .UILPanel.history & {\n        .contentContainer {\n            height: 100%;\n        }\n    }\n    \n',
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

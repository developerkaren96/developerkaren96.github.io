/*
 * UILPerformanceItem — single key/value row used by both
 * UILPerformance and UILMemory. Renders data.key on the
 * left, data.value on the right (space-between flex), no
 * own logic — the parent's startRender tick updates
 * data.value in place.
 *
 * Standard Fragment plumbing.
 */
Class(function UILPerformanceItem(_data, _index, _params) {
  const self = this;
  Inherit(self, ViewStateElement);
  Inherit(self, Element);
  Inherit(self, XComponent);
  self.fragName = 'UILPerformanceItem';
  self.contexts = 'ViewStateElement,Element';
  self.data = _data;
  self.index = _index;
  self.params = _params;
  this.isFragment = true;
  var _promises = [];
  !(async function () {
    self.element && (self.element.onMountedHook = (_) => self.onMounted?.());
    self.initClass(FragUIHelper, {
      _type: 'UI',
      refName: 'unnamed',
      children: [
        {
          _type: 'span',
          _innerText: '$data.key',
          refName: 'unnamed',
          children: [],
        },
        {
          _type: 'span',
          _innerText: '$data.value',
          refName: 'unnamed',
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
    self.element.goob(
      '\n    & {\n        display: flex;\n        font: var(--label3);\n        justify-content: space-between;\n        align-items: center;\n        margin-bottom: calc(var(--spacing-small) / 2);\n    }\n',
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

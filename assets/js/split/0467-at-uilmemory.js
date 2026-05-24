/*
 * UILMemory — debug panel that tallies RenderCount.map
 * (allocation counters keyed by class/type) at 10ms
 * intervals. New keys are appended to statsData
 * automatically, existing rows update value in place. Sets
 * RenderCount.active=true so the runtime starts emitting
 * counters. Rendered via UILPerformanceItem view rows.
 *
 * Standard Fragment plumbing.
 */
Class(function UILMemory(_params, ...restArgs) {
  const self = this;
  Inherit(self, Element);
  Inherit(self, XComponent);
  self.fragName = 'UILMemory';
  self.contexts = 'Element';
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
          data: '$statsData',
          view: 'UILPerformanceItem',
          _type: 'ViewState',
          refName: 'unnamed',
          children: [],
        },
      ],
    });
    self.params = _params;
    self.args = arguments;
    self.parent?.layers && (self.layers = self.parent.layers);
    self.layout?.getAllLayers && (self.layers = await self.layout.getAllLayers());
    self.statsData = new StateArray(
      Object.entries(RenderCount.map).map(([key, value]) => ({
        key: key,
        value: value,
      })),
    );
    self.startRender(function updateStats() {
      if (!self.params.active) return;
      Object.entries(RenderCount.map).forEach(([key, value]) => {
        let isKeyMapped = false;
        self.statsData.forEach((d) => d.get('key') === key && (isKeyMapped = true));
        isKeyMapped ||
          self.statsData.push({
            key: key,
            value: value,
          });
      });
      self.statsData.forEach((d) => d.set('value', RenderCount.map[d.get('key')]));
    }, 10);
    RenderCount.active = true;
    self.element.goob(
      '\n    & {\n        width: 100%;\n        padding: var(--spacing-small);\n    }\n',
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

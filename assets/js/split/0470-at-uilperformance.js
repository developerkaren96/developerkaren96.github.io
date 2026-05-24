/*
 * UILPerformance — debug panel tied to RenderStats. Sets
 * RenderStats.active = params.active each tick so the
 * runtime only collects when this panel is visible. New
 * stat keys are appended to statsData StateArray;
 * existing rows update in place at 10ms. Rendered via
 * UILPerformanceItem view rows (sibling of UILMemory).
 *
 * Standard Fragment plumbing.
 */
Class(function UILPerformance(_params, ...restArgs) {
  const self = this;
  Inherit(self, Element);
  Inherit(self, XComponent);
  self.fragName = 'UILPerformance';
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
      Object.entries(RenderStats.stats).map(([key, value]) => ({
        key: key,
        value: value,
      })),
    );
    self.startRender(function updateStats() {
      if (((RenderStats.active = self.params.active), !self.params.active)) return;
      Object.entries(RenderStats.stats).forEach(([key, value]) => {
        let isKeyMapped = false;
        self.statsData.forEach((d) => d.get('key') === key && (isKeyMapped = true));
        isKeyMapped ||
          self.statsData.push({
            key: key,
            value: value,
          });
      });
      self.statsData.forEach((d) => d.set('value', RenderStats.stats[d.get('key')]));
    }, 10);
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

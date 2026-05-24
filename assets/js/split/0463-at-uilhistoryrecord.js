/*
 * UILHistoryRecord — single change-log row. Top span is
 * "<actorName> - <timeFormatted>" metadata, bottom span is
 * data.message. Used by UILHistoryTab to render the active
 * page's records list.
 *
 * Standard Fragment plumbing.
 */
Class(function UILHistoryRecord(_data, _index, _params) {
  const self = this;
  Inherit(self, Element);
  Inherit(self, ViewStateElement);
  Inherit(self, XComponent);
  self.fragName = 'UILHistoryRecord';
  self.contexts = 'Element,ViewStateElement';
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
          refName: 'metadata',
          children: [],
        },
        {
          _type: 'span',
          _innerText: '$data.message',
          refName: 'message',
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
    self.onInit = function () {
      !(function initHTML() {
        self.metadata.text(`${self.data.actorName} - ${self.data.timeFormatted}`);
      })();
    };
    self.element.goob(
      '\n    & {\n        border-bottom: 1px solid var(--color-neutral-40);\n        padding: 0.75rem 1rem;\n        word-wrap: break-word;\n        overflow-wrap: break-word;\n        word-break: break-all;\n        hyphens: auto;\n    }\n\n    .metadata,\n    .message {\n        display: flex;\n        justify-content: flex-start;\n        align-items: flex-start;\n        line-height: 14.3px;\n    }\n    \n    .metadata {\n        margin-bottom: 0.24rem;     \n        font-weight: 600;\n    }\n',
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

/*
 * UILHistoryDay — single row in the UILHistory panel
 * showing a date label + change count + arrow-right icon.
 * Click bubbles to parent.parent.onSelectDay(data.date)
 * so the history view loads that day's snapshots. Static
 * section seeds UILHistoryDay.arrowRightIcon SVG.
 *
 * Standard Fragment plumbing.
 */
Class(
  function UILHistoryDay(_data, _index, _params) {
    const self = this;
    Inherit(self, Element);
    Inherit(self, ViewStateElement);
    Inherit(self, XComponent);
    self.fragName = 'UILHistoryDay';
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
            click: '$onClick',
            _type: 'div',
            refName: 'day',
            children: [
              {
                className: 'day__info',
                _type: 'div',
                refName: 'unnamed',
                children: [
                  {
                    _type: 'span',
                    _innerText: '$data.date',
                    refName: 'unnamed',
                    children: [],
                  },
                  {
                    _type: 'span',
                    _innerText: '$data.amount',
                    refName: 'unnamed',
                    children: [],
                  },
                ],
              },
              {
                className: 'day__icon',
                _type: 'div',
                refName: 'icon',
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
      self.onInit = function () {
        !(function initHTML() {
          self.icon.html(UILHistoryDay.arrowRightIcon);
        })();
      };
      self.onClick = function () {
        self.parent.parent.onSelectDay(self.data.date);
      };
      self.element.goob(
        '\n    .day {\n        display: flex;\n        font: var(--label4-medium);\n        font-size: 12px;\n        justify-content: center;\n        align-items: center;\n        width: 100%;\n        padding: 1rem;\n\n        border: 1px solid transparent;\n        border-bottom-color: var(--color-neutral-40);\n\n        &:hover {\n            border-color: var(--color-accent-50);\n\n            .day__icon > svg {\n                stroke: var(--font-color-base);\n            }\n        }\n\n        &__info {\n            flex-grow: 1;\n\n            > span {\n                display: inline-block;\n\n                &:last-child {\n                    margin-left: 0.2rem;\n                }\n            }\n        }\n\n        &__icon {\n            > svg {\n                display: block;\n\n                stroke: var(--color-neutral-70);\n\n                transition: stroke 0.17s ease-in-out;\n            }\n        }\n    }\n',
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
  },
  (_) => {
    UILHistoryDay.arrowRightIcon =
      '\n        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">\n            <path d="M6 4L10 8L6 12" stroke-linecap="round" stroke-linejoin="round"/>\n        </svg>\n    ';
  },
);

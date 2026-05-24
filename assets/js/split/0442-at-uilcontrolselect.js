Class(function UILControlSelect(_params, ...restArgs) {
  const self = this;
  Inherit(self, UILControl);
  Inherit(self, XComponent);
  self.fragName = 'UILControlSelect';
  self.contexts = 'UILControl';
  self.params = _params;
  self.args = arguments;
  this.isFragment = true;
  var _promises = [];
  !(async function () {
    if (
      (self.element && (self.element.onMountedHook = (_) => self.onMounted?.()),
      self.initClass(FragUIHelper, {
        _type: 'UI',
        refName: 'unnamed',
        children: [
          {
            className: 'form-group',
            _type: 'div',
            refName: 'unnamed',
            children: [
              {
                htmlFor: '$state.id',
                _type: 'label',
                _innerText: '$state.label',
                refName: 'selectLabel',
                children: [],
              },
              {
                className: 'select-wrapper',
                _type: 'div',
                refName: 'unnamed',
                children: [
                  {
                    id: '$state.id',
                    _type: 'select',
                    refName: 'select',
                    children: [],
                  },
                  {
                    className: 'arrow',
                    _type: 'div',
                    _innerText: ' ▼ ',
                    refName: 'unnamed',
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      }),
      (self.params = _params),
      (self.args = arguments),
      self.parent?.layers && (self.layers = self.parent.layers),
      self.layout?.getAllLayers && (self.layers = await self.layout.getAllLayers()),
      (self.params = Object.assign(
        {},
        {
          id: self.params,
        },
        {
          options: restArgs[0],
        },
      )),
      self.state.set('id', self.params.id),
      !self.params.options.options)
    )
      throw 'UILControlSelect is missing select options';
    function change() {
      self.finish();
    }
    function input() {
      let i = self.select.div.selectedIndex;
      self.value = self.selectOptions[i].value;
    }
    self.params.options.value = self.params.options.value || self.params.options.options[0].value;
    (function initOptions() {
      self.selectOptions = self.params.options.options.map(({ value: value, label: label }) => {
        const el = document.createElement('option');
        return (
          el.setAttribute('value', value),
          self.value === value && el.setAttribute('selected', true),
          (el.text = label || value),
          (el.value = value),
          self.select.add(el),
          el
        );
      });
    })();
    (function initListeners() {
      self.select.div.addEventListener('change', change, false);
      self.select.div.addEventListener('input', input, false);
    })();
    self.init(self.params.id, self.params.options);
    self.select.div.value = self.params.options.value;
    self.force = function (value) {
      self.select.div.value = value;
      self.value = value;
    };
    self.onDestroy = function () {
      self.select.div.removeEventListener('change', change, false);
      self.select.div.removeEventListener('input', input, false);
    };
    self.element.goob(
      '\n    .select-wrapper {\n        position: relative;\n    }\n\n    .arrow {\n        color: var(--color-neutral-70);\n        font-size: 7px;\n        position: absolute;\n        right: var(--spacing-small);\n        top: 15px;\n        pointer-events: none;\n    }\n',
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

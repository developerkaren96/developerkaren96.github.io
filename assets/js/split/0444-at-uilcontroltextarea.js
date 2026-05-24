Class(function UILControlTextarea(_params, ...restArgs) {
  const self = this;
  Inherit(self, UILControl);
  Inherit(self, XComponent);
  self.fragName = 'UILControlTextarea';
  self.contexts = 'UILControl';
  self.params = _params;
  self.args = arguments;
  this.isFragment = true;
  var _promises = [];
  !(async function () {
    let _timeout;
    function onChange() {
      clearTimeout(_timeout);
      _timeout = setTimeout(onFinishChange, 400);
      self.value = self.textareaInput.div.value;
    }
    function onFinishChange() {
      null !== _timeout && (clearTimeout(_timeout), (_timeout = null), self.finish());
    }
    self.element && (self.element.onMountedHook = (_) => self.onMounted?.());
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
              title: '$state.label',
              _type: 'label',
              _innerText: '$state.label',
              refName: 'unnamed',
              children: [],
            },
            {
              type: 'text',
              id: '$state.id',
              maxLength: '$props.max',
              minLength: '$props.min',
              rows: '$props.rows',
              readOnly: '$props.readonly',
              _type: 'textarea',
              refName: 'textareaInput',
              children: [],
            },
          ],
        },
      ],
    });
    self.params = _params;
    self.args = arguments;
    self.parent?.layers && (self.layers = self.parent.layers);
    self.layout?.getAllLayers && (self.layers = await self.layout.getAllLayers());
    self.props = {
      max: 1 / 0,
      min: -1 / 0,
      rows: 2,
      readonly: false,
    };
    self.params = Object.assign(
      {},
      {
        id: self.params,
      },
      {
        options: restArgs[0],
      },
    );
    self.state.set('id', self.params.id);
    Object.assign(self.props, self.params.options);
    self.init(self.params.id, self.params.options);
    self.textareaInput.div.value = self.params.options.value || '';
    (function initListeners() {
      self.textareaInput.div.addEventListener('input', onChange, false);
      self.textareaInput.div.addEventListener('change', onFinishChange, false);
    })();
    self.update = function () {
      self.textareaInput.div.value = self.value || '';
    };
    self.onDestroy = function () {
      self.textareaInput.div.removeEventListener('input', onChange, false);
      self.textareaInput.div.removeEventListener('change', onFinishChange, false);
    };
    self.element.goob(
      '\n    .textareaInput {\n        font-family: Consolas, monaco, monospace;\n    }\n',
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

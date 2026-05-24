Class(function UILControlText(_params, ...restArgs) {
  const self = this;
  Inherit(self, UILControl);
  Inherit(self, XComponent);
  self.fragName = 'UILControlText';
  self.contexts = 'UILControl';
  self.params = _params;
  self.args = arguments;
  this.isFragment = true;
  var _promises = [];
  !(async function () {
    function onChange() {
      clearTimeout(self.timeout);
      self.timeout = setTimeout(onFinishChange, 400);
      self.value = self.textInput.div.value;
    }
    function onFinishChange() {
      null !== self.timeout && (clearTimeout(self.timeout), (self.timeout = null), self.finish());
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
              _type: 'label',
              _innerText: '$state.label',
              refName: 'textInputLabel',
              children: [],
            },
            {
              type: 'text',
              id: '$state.id',
              _type: 'input',
              refName: 'textInput',
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
    (function initListeners() {
      self.textInput.div.addEventListener('input', onChange, false);
      self.textInput.div.addEventListener('change', onFinishChange, false);
    })();
    self.init(self.params.id, self.params.options);
    self.textInput.div.value = self.params.options.value || '';
    self.update = function () {
      self.textInput.div.value = self.value || '';
    };
    self.onDestroy = function () {
      self.textInput.div.removeEventListener('input', onChange, false);
      self.textInput.div.removeEventListener('change', onBlur, false);
    };
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

Class(function UILControlRange(_params, ...restArgs) {
  const self = this;
  Inherit(self, UILControl);
  Inherit(self, XComponent);
  self.fragName = 'UILControlRange';
  self.contexts = 'UILControl';
  self.params = _params;
  self.args = arguments;
  this.isFragment = true;
  var _promises = [];
  !(async function () {
    function change() {
      self.finish();
    }
    function input() {
      self.value = Number(self.slider.div.value);
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
              refName: 'unnamed',
              children: [],
            },
            {
              type: 'range',
              id: '$state.id',
              min: '$props.min',
              max: '$props.max',
              step: '$props.step',
              _type: 'input',
              refName: 'slider',
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
      min: 0,
      max: 100,
      step: 1,
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
    self.slider.div.value = self.params.options.value || '';
    (function initListeners() {
      self.slider.div.addEventListener('change', change, false);
      self.slider.div.addEventListener('input', input, false);
    })();
    self.force = function (value) {
      self.value = value;
      self.slider.div.value = value;
      self.finish(false);
    };
    self.onDestroy = function () {
      self.slider.div.removeEventListener('change', change, false);
      self.slider.div.removeEventListener('input', input, false);
    };
    self.element.goob('\n    & {}\n');
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

Class(function UILControlVector(_params, ...restArgs) {
  const self = this;
  Inherit(self, UILControl);
  Inherit(self, XComponent);
  self.fragName = 'UILControlVector';
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
                id: '$state.labelId',
                _type: 'label',
                _innerText: '$state.label',
                refName: 'unnamed',
                children: [],
              },
              {
                className: 'number-inputs',
                _type: 'div',
                refName: 'unnamed',
                children: [
                  {
                    view: 'UILInputNumber',
                    data: '$inputData',
                    _type: 'ViewState',
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
      self.state.set('labelId', `${self.params.id}-label`),
      (self.inputData = await Data.request(`vectorInputData-${self.params.id}`, () =>
        self.params.options.value.map((value, index) => ({
          value: value || 0,
          labelledBy: self.state.labelId,
          min: self.params.options.min || -1 / 0,
          max: self.params.options.max || 1 / 0,
          step: self.params.options.step || 1,
          precision: self.params.options.precision || 3,
          onInputCB: (v, m) =>
            (function onInput(value, index, master) {
              master ? (self.vector = self.vector.map((v) => value)) : (self.vector[index] = value);
              self.setValue([...self.vector]);
              self.inputData.forEach((input, idx) => {
                input.value = self.vector[idx];
              });
            })(v, index, m),
          onFinishCB: () =>
            (function onFinish() {
              self.finish();
            })(),
          index: index,
        })),
      )),
      (self.vector = []),
      self.params.options.value)
    )
      self.length = self.vector.length;
    else {
      if (!self.params.options.components)
        throw 'UILControlVector: Cannot detect vector type. Define "options.components" count or init with a initial value';
      self.params.options.value = new Array(self.params.options.components).fill(0);
    }
    self.length = self.params.options.value.length;
    self.init(self.params.id, self.params.options);
    self.vector = [...self.value];
    self.update = function () {
      self.inputData.forEach((input, index) => {
        input.value = self.value[index];
      });
    };
    self.element.goob(
      '\n    .number-inputs {\n        display: flex;\n        gap: calc(var(--spacing-small) / 2);\n    }\n',
    );
    self.force = function (value, history = false) {
      self.vector = [...value];
      self.setValue([...self.vector]);
      self.inputData.forEach((input, index) => (input.value = self.value[index]));
      self.finish(history);
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

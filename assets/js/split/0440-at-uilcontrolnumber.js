/*
 * UILControlNumber — scalar number UILControl. Delegates the
 * drag-to-scrub / type-to-edit UI to the `UILInputNumber`
 * view via ViewState; this fragment just owns the option
 * defaults and data-binding.
 *
 * Data row (Data.request keyed by `vectorInputData-<id>` so
 * the inputs can be reused across re-mounts):
 *   { id, value, min=-∞, max=+∞, step=1, precision=3,
 *     onInputCB (per-keystroke), onFinishCB (commit) }
 *
 * Standard Fragment plumbing.
 */
Class(function UILControlNumber(_params, ...restArgs) {
  const self = this;
  Inherit(self, UILControl);
  Inherit(self, XComponent);
  self.fragName = 'UILControlNumber';
  self.contexts = 'UILControl';
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
              view: 'UILInputNumber',
              data: '$data',
              _type: 'ViewState',
              refName: 'unnamed',
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
    self.state.set('labelId', `${self.params.id}-label`);
    self.data = Data.request(`vectorInputData-${self.params.id}`, () => [
      {
        id: self.params.id,
        value: self.params.options.value || 0,
        labelledBy: self.state.labelId,
        min: self.params.options.min || -1 / 0,
        max: self.params.options.max || 1 / 0,
        step: self.params.options.step || 1,
        precision: self.params.options.precision || 3,
        onInputCB: (value) =>
          (function onInput(value) {
            self.setValue(Number(value));
            self.data[value] = value;
          })(value),
        onFinishCB: () =>
          (function onFinish() {
            self.finish();
          })(),
      },
    ]);
    self.init(self.params.id, self.params.options);
    self.update = function () {
      self.data.forEach((input) => {
        input.value = self.value;
      });
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

/*
 * UILControlColor — color picker UILControl. Three coordinated
 * inputs:
 *   - hidden native <input type="color">      → fires
 *     onColorInput (debounced finish 200ms).
 *   - visible <input type="text"> hex string   → fires
 *     onTextInput; click selects all so paste replaces.
 *   - colorChip div  → background-color reflects state.value.
 *
 * value flows: state.value (single source of truth) — both
 * inputs write back into it; updateUI() rewrites the chip's
 * backgroundColor and the native color input's value when
 * state.value changes.
 *
 * Standard Fragment plumbing.
 */
Class(function UILControlColor(_params, ...restArgs) {
  const self = this;
  Inherit(self, UILControl);
  Inherit(self, XComponent);
  self.fragName = 'UILControlColor';
  self.contexts = 'UILControl';
  self.params = _params;
  self.args = arguments;
  this.isFragment = true;
  var _promises = [];
  !(async function () {
    function onColorInput() {
      self.state.set('value', self.colorInput.div.value);
      Utils.debounce(self.finish, 200);
    }
    function onTextInput() {
      self.state.set('value', self.textInput.div.value);
      Utils.debounce(self.finish, 200);
    }
    function onTextClick() {
      self.textInput.div.focus();
      self.textInput.div.select();
    }
    function finishChange() {
      self.finish();
    }
    self.element && (self.element.onMountedHook = (_) => self.onMounted?.());
    self.initClass(FragUIHelper, {
      _type: 'UI',
      refName: 'unnamed',
      children: [
        {
          className: 'form-group UIL',
          _type: 'div',
          refName: 'unnamed',
          children: [
            {
              _type: 'label',
              _innerText: '$state.label',
              refName: 'unnamed',
              children: [],
            },
            {
              className: 'color-input',
              _type: 'div',
              refName: 'unnamed',
              children: [
                {
                  className: 'color-selector',
                  _type: 'div',
                  refName: 'unnamed',
                  children: [
                    {
                      _type: 'label',
                      refName: 'unnamed',
                      children: [
                        {
                          className: 'color-chip',
                          _type: 'div',
                          refName: 'colorChip',
                          children: [],
                        },
                      ],
                    },
                    {
                      className: 'color-text no-style',
                      type: 'text',
                      _type: 'input',
                      refName: 'textInput',
                      children: [],
                    },
                    {
                      id: 'color',
                      name: 'color',
                      type: 'color',
                      className: 'color-box hidden',
                      _type: 'input',
                      refName: 'colorInput',
                      children: [],
                    },
                  ],
                },
              ],
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
    self.state.set('value', self.params.options.value);
    self.state.bind('value', self.textInput);
    self.bindState(self.state, 'value', function handleColorState(color) {
      self.setValue(self.state.value);
      (function updateUI() {
        self.colorChip.div.style.backgroundColor = self.state.get('value');
        self.colorInput.div.value = self.state.get('value');
      })();
    });
    self.colorInput.div.value = self.params.options.value;
    self.init(self.params.id, self.params.options);
    (function initListeners() {
      self.colorInput.div.addEventListener('input', onColorInput, false);
      self.colorInput.div.addEventListener('blur', finishChange, false);
      self.textInput.div.addEventListener('input', onTextInput, false);
      self.textInput.div.addEventListener('click', onTextClick, false);
      self.textInput.div.addEventListener('blur', finishChange, false);
    })();
    self.update = function () {
      self.state.set('value', self.value);
    };
    self.onDestroy = function () {
      self.colorInput.div.removeEventListener('input', onInput, false);
      self.colorInput.div.removeEventListener('blur', finishChange, false);
    };
    self.element.goob(
      '\n    & {}\n\n    #color {\n        cursor: pointer;\n    }\n\n    .color-box {\n        max-width: 35px;\n    }\n\n    .color-text {\n        -webkit-appearance: none;\n                appearance: none;\n        margin: 0;\n        border: 0;\n        outline: 0;\n        font: var(--label2);\n        color: var(--font-color-highlight);\n        background: transparent;\n        position: absolute;\n        width: 100%;\n        height: 100%;\n        top: 0;\n        left: 0;\n        padding: 0 0 0 37px;\n    }\n',
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

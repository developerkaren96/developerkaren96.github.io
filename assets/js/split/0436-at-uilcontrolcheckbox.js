/*
 * UILControlCheckbox — boolean toggle UILControl. Standard
 * form-group layout, paired with a sibling label whose
 * htmlFor matches the checkbox id. Click flips self.value
 * and calls finish(); state.isChecked binding mirrors the
 * value back into the DOM checked attribute.
 *
 * CSS: 50% width so two checkboxes can pair side-by-side in
 * the inspector — :nth-of-type(odd|even) adds 4px padding
 * between them.
 *
 * Standard Fragment plumbing.
 */
Class(function UILControlCheckbox(_params, ...restArgs) {
  const self = this;
  Inherit(self, UILControl);
  Inherit(self, XComponent);
  self.fragName = 'UILControlCheckbox';
  self.contexts = 'UILControl';
  self.params = _params;
  self.args = arguments;
  this.isFragment = true;
  var _promises = [];
  !(async function () {
    function handleChecked(isChecked) {
      self.checkboxInput.div.checked = isChecked;
      isChecked
        ? self.checkboxInput.div.setAttribute('checked', self.value)
        : self.checkboxInput.div.removeAttribute('checked');
    }
    function handleClick() {
      self.value = !self.value;
      self.state.set('isChecked', self.value);
      self.finish();
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
              id: '$state.labelId',
              className: 'label',
              _type: 'div',
              _innerText: '$state.label',
              refName: 'unnamed',
              children: [],
            },
            {
              className: 'checkbox',
              _type: 'div',
              refName: 'unnamed',
              children: [
                {
                  type: 'checkbox',
                  id: '$state.id',
                  ariaLabelledBy: '$state.labelId',
                  checked: '$state.isChecked',
                  _type: 'input',
                  refName: 'checkboxInput',
                  children: [],
                },
                {
                  htmlFor: '$state.id',
                  _type: 'label',
                  _innerText: '$state.label',
                  refName: 'checkboxLabel',
                  children: [],
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
    self.init(self.params.id, self.params.options);
    (function initListeners() {
      self.checkboxInput.click(handleClick);
    })();
    self.onInit = () => {
      self.state.set('labelId', `${self.id}-label`);
      self.state.set('isChecked', self.params.options?.value);
      self.state.bind('isChecked', handleChecked);
    };
    self.element.goob(
      '\n    & {\n        width: 50%;\n        \n        > .label, .content {\n            display: none;\n        }\n    }\n\n    .form-group > *:last-child {\n        width: auto;\n    }\n\n    .UILControlCheckbox:nth-of-type(even) {\n        padding-left: calc(var(--spacing-small) / 2);\n    }\n\n    .UILControlCheckbox:nth-of-type(odd) {\n        padding-right: calc(var(--spacing-small) / 2);\n    }\n\n\n',
    );
    self.update = () => {
      self.state.set('isChecked', self.value);
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

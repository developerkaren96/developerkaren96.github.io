/*
 * UILControlButton — UILControl subclass for the editor's
 * "action button" widget. Renders a label and one or more
 * UILInputButton views via a StateArray bound to opts.actions
 * (each item is `{ title, callback }`).
 *
 * Special features:
 *   - opts.hideLabel adds `hide-label` class so the form-group
 *     stretches the button to 100% width.
 *   - setTitle(title) bulk-rewrites the title of every button
 *     in self.data.
 *
 * Standard Fragment plumbing.
 */
Class(function UILControlButton(_params, ...restArgs) {
  const self = this;
  Inherit(self, UILControl);
  Inherit(self, XComponent);
  self.fragName = 'UILControlButton';
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
              htmlFor: '$state.groupId',
              _type: 'label',
              _innerText: '$state.label',
              refName: 'componentLabel',
              children: [],
            },
            {
              id: '$state.groupId',
              className: 'content',
              _type: 'div',
              refName: 'unnamed',
              children: [
                {
                  view: 'UILInputButton',
                  data: '$data',
                  _type: 'ViewState',
                  refName: 'unnamed',
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
    self.state.set('groupId', `${self.params.id}-group`);
    self.data = new StateArray(self.params.options.actions);
    self.init(self.params.id, self.params.options);
    self.params.options.hideLabel &&
      (self.element.classList().add('hide-label'),
      self.componentLabel.classList().add('visibility-hidden'));
    self.setTitle = (title) => {
      self.data.forEach((button) => {
        button.title = title;
      });
    };
    self.element.goob(
      '\n    .button {\n        width: 100%;\n    }\n\n    &.hide-label {\n        .form-group,\n        .content {\n            width: 100%;\n            max-width: 100% !important;\n        }\n\n    }\n    \n    .UILInputButton + .UILInputButton {\n        margin-top: 2px;\n    }\n',
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

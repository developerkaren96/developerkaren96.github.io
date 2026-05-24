/*
 * UILTabsNavItem — single tab in the UILTabs header. Sets
 * href to #<id> for accessibility/middle-click bookmark
 * support; click fires 'click' { id } upward — UILTabs
 * listens for 'UILTabsNavItem/click' and switches
 * activeIndex. Active state mirrors data.active onto the
 * .active CSS class (which colours the label and hides
 * the divider).
 *
 * Standard Fragment plumbing.
 */
Class(function UILTabsNavItem(_data, _index, _params) {
  const self = this;
  Inherit(self, Element);
  Inherit(self, ViewStateElement);
  Inherit(self, XComponent);
  self.fragName = 'UILTabsNavItem';
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
          href: '$state.anchor',
          _type: 'a',
          _innerText: '$data.label',
          refName: 'tab',
          children: [],
        },
      ],
    });
    self.data = _data;
    self.index = _index;
    self.params = _params;
    self.createState();
    self.parent?.layers && (self.layers = self.parent.layers);
    self.layout?.getAllLayers && (self.layers = await self.layout.getAllLayers());
    self.createState();
    self.state.set('anchor', `#${self.data.id}`);
    self.onClick = (event) => {
      event.preventDefault();
      self.fire('click', {
        id: self.data.id,
      });
    };
    self.data.bind('active', (value) => {
      const action = value ? 'add' : 'remove';
      self.tab.classList()[action]('active');
    });
    self.element.goob(
      "\n    & {\n        &:last-of-type {\n            .tab:after {\n                display: none;\n            }\n        }\n    }\n\n    .tab {\n        color: var(--color-action--disabled);\n        display: block;\n        font: var(--label3-semi);\n        padding: var(--spacing-small);\n        text-decoration: none;\n        position: relative;\n\n        &:after {\n            content: '';\n            display: block;\n            width: 1px;\n            height: 66%;\n            background-color: var(--color-neutral-40);\n            position: absolute;\n            right: 0;\n            top: 16.666%;\n        }\n        \n        &.active {\n            color: var(--font-color-base);\n        }\n    }\n",
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

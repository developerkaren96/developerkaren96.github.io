/*
 * UILGate — full-screen black auth gate shown over the
 * inspector when UILRemote requires sign-in. Hosts two
 * sub-views (UILGateLogin and UILGateError) and routes
 * between them via state.updateView; only one view is
 * animated in at a time (current view animates out, next
 * animates in).
 *
 * Standard Fragment plumbing.
 */
Class(function UILGate(_params, ...restArgs) {
  const self = this;
  Inherit(self, Element);
  Inherit(self, XComponent);
  self.fragName = 'UILGate';
  self.contexts = 'Element';
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
          _type: 'UILGateLogin',
          refName: 'login',
          children: [],
        },
        {
          _type: 'UILGateError',
          refName: 'error',
          children: [],
        },
      ],
    });
    self.params = _params;
    self.args = arguments;
    self.parent?.layers && (self.layers = self.parent.layers);
    self.layout?.getAllLayers && (self.layers = await self.layout.getAllLayers());
    self.views = {
      login: self.login,
      error: self.error,
    };
    self.createState();
    self.bindState(self.state, 'updateView', async function updateView(newView) {
      self.state.currentView && (await self.views[self.state.currentView].animateOut());
      self.views[newView].animateIn();
      self.state.set('currentView', newView);
    });
    self.state.set('updateView', 'login');
    self.animateIn = function () {
      self.element.tween(
        {
          opacity: 1,
        },
        500,
        'easeOutCubic',
      );
    };
    self.animateOut = function () {
      self.element
        .tween(
          {
            opacity: 0,
          },
          500,
          'easeOutCubic',
        )
        .onComplete(() => self.destroy());
    };
    self.element.goob(
      '\n    & {\n        background-color: var(--color-black);\n        position: absolute;\n        inset: 0;\n        display: flex;\n        justify-content: center;\n        align-items: center;\n        pointer-events: all;\n        opacity: 0;\n        z-index: 100001;\n    }\n\n',
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

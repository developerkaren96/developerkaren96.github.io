/*
 * UILGateError — "You do not have access to this page"
 * screen shown after a failed login attempt. Inherits
 * UILGateView for animateIn/animateOut. The Go Back button
 * pushes 'login' back onto parent.state.updateView so the
 * user can retry.
 *
 * Standard Fragment plumbing.
 */
Class(function UILGateError(_params, ...restArgs) {
  const self = this;
  Inherit(self, UILGateView);
  Inherit(self, XComponent);
  self.fragName = 'UILGateError';
  self.contexts = 'UILGateView';
  self.params = _params;
  self.args = arguments;
  this.isFragment = true;
  var _promises = [];
  !(async function () {
    function goBack() {
      self.parent.state.set('updateView', 'login');
    }
    self.element && (self.element.onMountedHook = (_) => self.onMounted?.());
    self.initClass(FragUIHelper, {
      _type: 'UI',
      refName: 'unnamed',
      children: [
        {
          className: 'gate',
          _type: 'article',
          refName: 'unnamed',
          children: [
            {
              className: 'gate-header',
              _type: 'header',
              refName: 'unnamed',
              children: [
                {
                  _type: 'div',
                  refName: 'logo',
                  children: [],
                },
                {
                  className: 'version',
                  _type: 'h1',
                  _innerText: 'UIL v2.3',
                  refName: 'unnamed',
                  children: [],
                },
              ],
            },
            {
              className: 'gate-main',
              _type: 'div',
              refName: 'unnamed',
              children: [
                {
                  className: 'error',
                  _type: 'h2',
                  _innerText: 'Error',
                  refName: 'unnamed',
                  children: [],
                },
                {
                  _type: 'p',
                  _innerText: 'You do not have access to this page',
                  refName: 'unnamed',
                  children: [],
                },
              ],
            },
            {
              className: 'gate-footer',
              _type: 'footer',
              refName: 'unnamed',
              children: [
                {
                  _type: 'button',
                  _innerText: 'Go Back',
                  refName: 'backButton',
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
    (function initListeners() {
      self.backButton.click(goBack);
    })();
    self.logo.html(UILGate.logo);
    self.element.goob(
      '\n    & {\n        --logo-size: 25px;\n\n        opacity: 0;\n    }\n\n    .gate-header {\n        gap: var(--spacing);\n        justify-self: start;\n    }\n\n    .logo {\n        width: var(--logo-size);\n        height: var(--logo-size);\n    }\n\n    .error {\n        font-size: 64px;\n        font-weight: 300;\n        line-height: 1;\n        letter-spacing: 0.2rem;\n        margin: calc(var(--spacing) * 3) 0;\n    }\n\n    .gate-main {\n        font-size: 14px;\n        margin-bottom: calc(var(--spacing) * 3);\n    }\n\n    .gate-footer {\n        justify-self: start;\n    }\n',
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

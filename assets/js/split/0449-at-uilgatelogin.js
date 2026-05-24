/*
 * UILGateLogin — "Log in with Google" entry screen.
 * Disables the button while UILRemote.auth.login() is
 * pending; on success animates the whole gate out and
 * reloads the page so the inspector re-bootstraps with
 * auth'd state. On failure flips parent.updateView to
 * 'error'.
 *
 * Standard Fragment plumbing.
 */
Class(function UILGateLogin(_params, ...restArgs) {
  const self = this;
  Inherit(self, UILGateView);
  Inherit(self, XComponent);
  self.fragName = 'UILGateLogin';
  self.contexts = 'UILGateView';
  self.params = _params;
  self.args = arguments;
  this.isFragment = true;
  var _promises = [];
  !(async function () {
    async function openLoginModal() {
      self.loginButton.div.disabled = true;
      self.user = await UILRemote.auth.login();
      self.user.success
        ? (async function handleLogin() {
            await self.animateOut();
            self.parent.animateOut();
            window.location.reload();
          })()
        : (async function handleError() {
            self.parent.state.set('updateView', 'error');
            await self.wait(500);
            self.loginButton.div.disabled = false;
          })();
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
              refName: 'logoContainer',
              children: [],
            },
            {
              className: 'gate-footer',
              _type: 'footer',
              refName: 'unnamed',
              children: [
                {
                  _type: 'button',
                  _innerText: 'Log in with Google',
                  refName: 'loginButton',
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
      self.loginButton.click(openLoginModal);
    })();
    self.logoContainer.html(UILGate.logo);
    self.element.goob(
      "\n    & {\n        --max-spacing: 240px;\n        --logo-size: 145px;\n        --dot-size: 4px;\n    }\n\n    .gate-header {\n        justify-content: space-between;\n        width: 100%;\n    }\n    \n    .version {\n        margin-bottom: 0;\n        position: relative;\n        width: 100%;\n\n        &:after {\n            background-color: var(--color-white);\n            content: '';\n            display: block;\n            width: var(--dot-size);\n            height: var(--dot-size);\n            border-radius: 50%;\n            position: absolute;\n            right: 0;\n            top: 3px;\n        }\n    }\n\n    .gate-main {\n        display: flex;\n        justify-content: center;\n        align-items: center;\n        width: var(--logo-size);\n    }\n\n    .loginButton:disabled {\n        cursor: not-allowed !important;\n    }\n",
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

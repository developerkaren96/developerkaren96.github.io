/*
 * UILGateView — abstract base for UILGateLogin /
 * UILGateError. Provides animateIn()/animateOut() (500ms
 * opacity tweens) and the shared grid layout for the gate
 * card. The static initializer (second arg to Class) seeds
 * UILGate.logo with the inline AT-style SVG used in both
 * child views' headers.
 *
 * Standard Fragment plumbing.
 */
Class(
  function UILGateView(_params, ...restArgs) {
    const self = this;
    Inherit(self, Element);
    Inherit(self, XComponent);
    self.fragName = 'UILGateView';
    self.contexts = 'Element';
    self.params = _params;
    self.args = arguments;
    this.isFragment = true;
    var _promises = [];
    !(async function () {
      self.element && (self.element.onMountedHook = (_) => self.onMounted?.());
      self.params = _params;
      self.args = arguments;
      self.parent?.layers && (self.layers = self.parent.layers);
      self.layout?.getAllLayers && (self.layers = await self.layout.getAllLayers());
      self.element.hide();
      self.animateIn = function () {
        self.element
          .css({
            opacity: 0,
          })
          .show()
          .tween(
            {
              opacity: 1,
            },
            500,
            'easeOutCubic',
          );
      };
      self.animateOut = function () {
        return self.element
          .tween(
            {
              opacity: 0,
            },
            500,
            'easeOutCubic',
          )
          .onComplete(() => {
            self.element.hide();
          })
          .promise();
      };
      self.element.goob(
        '\n    & {\n        opacity: 0;\n    }\n\n    .gate {\n        display: grid;\n        justify-items: center;\n        grid-template-rows: 1fr minmax(calc(var(--logo-size) + var(--spacing) * 2), calc(var(--logo-size) + var(--max-spacing))) 1fr;\n        max-height: 100%;\n    }\n\n    .gate-header {\n        display: flex;\n        align-items: center;\n    }\n\n    .version {\n        font: var(--label3);\n    }\n',
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
  },
  (_) => {
    UILGate.logo =
      '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 145 146">\n        <g fill="#F7F7F7" clip-path="url(#a)">\n            <path\n                d="M72.5.703C32.46.703 0 33.162 0 73.203c0 40.04 32.46 72.5 72.5 72.5 40.041 0 72.5-32.46 72.5-72.5 0-40.041-32.459-72.5-72.5-72.5Zm0 135.146c-34.6 0-62.646-28.047-62.646-62.646 0-34.6 28.047-62.647 62.646-62.647 34.6 0 62.646 28.047 62.646 62.647 0 34.599-28.046 62.646-62.646 62.646Z" />\n            <path\n                d="m89.002 42.766-26.976-.006-13.573 12.644s-4.06 4.033-7.464 7.523c-3.403 3.49-5.636 8.807-5.636 14.158 0 5.683 2.428 10.62 6.237 14.83a781.937 781.937 0 0 0 10.757 10.713c5.172 5.039 9.355 6.219 15.242 6.199 7.424-.025 11.03-3.311 13.602-5.638.911-.824 8.037-8.033 8.037-8.033l.01 13.651 12.903-12.551V55.903c0-8.16-5.208-13.333-13.14-13.141l.001.004Zm-.006 35.544S75.63 91.828 74.014 93.405c-2.029 1.979-3.812 2.507-6.22 2.507-2.406 0-3.64-.076-6.218-2.507-2.264-2.135-10.09-10.078-10.557-10.616-1.404-1.604-2.107-3.444-2.107-5.516 0-2.472.904-4.581 2.708-6.319l15.034-15.04L89 55.91l-.005 22.403.001-.002Z" />\n        </g>\n        <defs>\n            <clipPath id="a">\n                <path fill="#fff" d="M0 .703h145v145H0z" />\n            </clipPath>\n        </defs>\n    </svg>';
  },
);

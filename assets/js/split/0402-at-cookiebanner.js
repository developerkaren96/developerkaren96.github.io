/*
 * CookieBanner — DOM (not GLUI) fragment that renders the
 * GDPR-style cookie consent notice in a fixed-position div.
 *
 * Built by FragUIHelper: wrapper > [text, buttons[accept,
 * reject]]. Text is composed at runtime by initText() so the
 * "Privacy Notice." anchor is a real `<a>` with target=_blank
 * pointing at the Notion privacy page.
 *
 * Behaviour:
 *   - Waits for Global/loadFinished, then queries CookieNotice
 *     to decide whether to show. Bound to AppState
 *     `showCookies`; setting true fades the wrapper in (800ms
 *     opacity 0→1, easeOutSine), false fades out (400ms) then
 *     element.hide().
 *   - Accept → CookieNotice.accept(); showCookies=false.
 *   - Reject → CookieNotice.decline(); showCookies=false.
 *   - Dev.expose('resetCookies', …) provides a console hook
 *     for re-triggering the banner during dev.
 *
 * Styling injected via goob() (scoped CSS) — frosted-glass
 * card pinned bottom-right (370×180) on desktop, full-width
 * bottom sheet under 768px breakpoint.
 *
 * Standard Fragment plumbing.
 */
Class(function CookieBanner(_params, ...restArgs) {
  const self = this;
  Inherit(self, Element);
  Inherit(self, XComponent);
  self.fragName = 'CookieBanner';
  self.contexts = 'Element';
  self.params = _params;
  self.args = arguments;
  this.isFragment = true;
  var _promises = [];
  !(async function () {
    self.element && (self.element.onMountedHook = (_) => self.onMounted?.());
    self.initClass(FragUIHelper, {
      addTo: 'Stage',
      _type: 'UI',
      refName: 'unnamed',
      children: [
        {
          _type: 'div',
          refName: 'wrapper',
          children: [
            {
              _type: 'p',
              refName: 'text',
              children: [],
            },
            {
              _type: 'div',
              refName: 'buttons',
              children: [
                {
                  'aria-label': 'Accept Cookies',
                  click: '$cookiesAccept',
                  _type: 'button',
                  refName: 'accept',
                  children: [
                    {
                      _type: 'p',
                      _innerText: 'Accept Cookies',
                      refName: 'textAccept',
                      children: [],
                    },
                  ],
                },
                {
                  'aria-label': 'Reject Cookies',
                  click: '$cookiesReject',
                  _type: 'button',
                  refName: 'reject',
                  children: [
                    {
                      _type: 'p',
                      _innerText: 'Reject Cookies',
                      refName: 'textReject',
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
    (function initText() {
      let title = 'Privacy Notice.',
        text = document.createTextNode(
          'Our site uses essential cookies and, with your consent, analytics cookies. Details in ',
        ),
        link = document.createElement('a');
      link.text = title;
      link.setAttribute('title', title);
      link.setAttribute('ariaLabel', title);
      link.setAttribute(
        'href',
        'https://github.com/developerkaren96',
      );
      link.setAttribute('target', '_blank');
      self.text.div.appendChild(text);
      self.text.div.appendChild(link);
    })();
    self.cookiesAccept = (_) => {
      CookieNotice.accept();
      self.set('showCookies', false);
    };
    self.cookiesReject = (_) => {
      CookieNotice.decline();
      self.set('showCookies', false);
    };
    self.listen('Global/loadFinished', async (_) => {
      self.bind('showCookies', (show) => {
        show
          ? (self.element.show(),
            self.wrapper
              .css({
                opacity: 0,
              })
              .tween(
                {
                  opacity: 1,
                },
                800,
                'easeOutSine',
                200,
              ))
          : self.wrapper
              .css({
                opacity: 1,
              })
              .tween(
                {
                  opacity: 0,
                },
                400,
                'easeOutSine',
              )
              .onComplete((_) => {
                self.element.hide();
              });
      });
      await CookieNotice.ready();
      self.set('showCookies', CookieNotice.displayNotice());
    });
    Dev.expose('resetCookies', (_) => CookieNotice.clear());
    self.element.hide();
    self.element.goob(
      '\n    width: 100%;\n    height: 100%;\n\n    .wrapper {\n        position: fixed;\n        bottom: 40px;\n        right: 32px;\n        z-index: 999999;\n        cursor: default;\n\n        width: 370px;\n        height: 180px;\n        padding: 16px 28px 32px;\n\n        background-color: rgba(0,0,0,0.5);\n        -webkit-backdrop-filter: blur(4px);\n        backdrop-filter: blur(4px);\n        border: 2px solid rgba(255,255,255,0.3);\n        border-radius: 12px;\n\n        @media (max-width: 768px) {\n            bottom: 0;\n            left: 0;\n            right: 0;\n            width: 100%;\n            border-radius: 12px 12px 0 0;\n        }\n\n        display: flex;\n        flex-direction: column;\n        justify-content: center;\n        align-items: center;\n        gap: 16px;\n    }\n\n    .buttons {\n        width: 100%;\n        display: flex;\n        flex-direction: row;\n        justify-content: center;\n        align-items: center;\n        gap: 12px;\n    }\n\n    p, a {\n        font-family: "nbarchitekt", monospace;\n        font-size: 14px;\n        font-weight: 400;\n        line-height: 1.5;\n        margin: 6px 0;\n        white-space: pre-wrap;\n\n        @media (max-width: 768px) {\n            font-size: 14px;\n        }\n    }\n\n    p {\n        color: white;\n    }\n\n    a {\n        color: #c6c6c6;\n        pointer-events: auto;\n        cursor: pointer;\n        font-weight: 700;\n    }\n\n    button {\n        p {\n            font-size: 12px;\n            color: white;\n        }\n        cursor: pointer;\n        padding: 4px 18px;\n        border-radius: 500px;\n        border: 2px solid rgba(255,255,255,0.5);\n        transition: all 0.2s ease-out;\n\n        &:first-of-type {\n            background: #9ca5ff55;\n        }\n\n        &:last-of-type {\n            background: #00000055;\n        }\n\n        @media (hover: hover) {\n            &:hover {\n                box-shadow: 0 1px 6px #ffffff55;\n                p {\n                    font-weight: 700;\n                    text-shadow: #ffffff99 0px 0px 5px;\n                }\n\n                &:first-of-type { background: #9ca5ff22; }\n                &:last-of-type { background: #00000011; }\n            }\n        }\n    }\n    \n',
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

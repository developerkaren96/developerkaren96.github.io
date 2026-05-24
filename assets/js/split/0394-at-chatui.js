/*
 * ChatUI — GLUI (WebGL-rendered DOM-like UI) variant of the
 * chat overlay. Hosts two child fragments:
 *   - ChatUIInput   (0395) — input field.
 *   - ChatUIResponse (0396) — reply display.
 *
 * Layout (per resize): input pinned to bottom-left (y = height-
 * 300), response 80px right and 140px above input. Both react
 * to viewport size via `onResize`.
 *
 * Contact visibility: binds AppState 'ViewController/contact'.
 * When the contact view becomes active, fades the chat UI
 * (`ui.alpha`) to 0 over 500ms (easeOutSine); on close, back
 * to 1. Keeps the chat from overlapping the contact form.
 *
 * Standard XComponent Fragment plumbing (params/args, layers
 * inheritance, promise unwrap, `__ready` flag).
 */
Class(function ChatUI(_params, ...restArgs) {
  const self = this;
  Inherit(self, GLUIElement);
  Inherit(self, XComponent);
  self.fragName = 'ChatUI';
  self.contexts = 'GLUIElement';
  self.params = _params;
  self.args = arguments;
  this.isFragment = true;
  var _promises = [];
  !(async function () {
    self.element && (self.element.onMountedHook = (_) => self.onMounted?.());
    self.initClass(FragUIHelper, {
      _type: 'UI',
      refName: 'ui',
      children: [
        {
          _type: 'ChatUIInput',
          refName: 'input',
          children: [],
        },
        {
          _type: 'ChatUIResponse',
          refName: 'response',
          children: [],
        },
      ],
    });
    self.params = _params;
    self.args = arguments;
    self.parent?.layers && (self.layers = self.parent.layers);
    self.layout?.getAllLayers && (self.layers = await self.layout.getAllLayers());
    self.bind('ViewController/contact', (active) => {
      active
        ? self.ui.tween(
            {
              alpha: 0,
            },
            500,
            'easeOutSine',
          )
        : self.ui.tween(
            {
              alpha: 1,
            },
            500,
            'easeOutSine',
          );
    });
    self.onResize(function updateLayout() {
      let y = Stage.height - 300;
      self.input.element.x = 0;
      self.input.element.y = y;
      self.response.element.x = 80;
      self.response.element.y = y + 140;
    });
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

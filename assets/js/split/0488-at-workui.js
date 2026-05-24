/*
 * WorkUI — GLUIElement + FXScrollUI overlay for /work. Hosts
 * a single ChatUI child via FragUIHelper (sticky-top scroll
 * widget; stickyY=0, releaseY=11.6).
 *
 * Visibility: per-frame reads Work/scrollProgress; if
 * 0.05 < progress < 0.92 → tween ui.alpha 0→1 / 1→0 (500ms
 * easeOutSine) gated by self.ui.showing latch. Outside that
 * range the chat overlay is hidden so it doesn't intrude on
 * the top/bottom edge transitions.
 *
 * Standard Fragment plumbing.
 */
Class(function WorkUI(_params, ...restArgs) {
  const self = this;
  Inherit(self, GLUIElement);
  Inherit(self, FXScrollUI);
  Inherit(self, XComponent);
  self.fragName = 'WorkUI';
  self.contexts = 'GLUIElement,FXScrollUI';
  self.params = _params;
  self.args = arguments;
  this.isFragment = true;
  var _promises = [];
  !(async function () {
    self.element && (self.element.onMountedHook = (_) => self.onMounted?.());
    self.initClass(FragUIHelper, {
      addTo: 'GLUI.Stage',
      stickyY: 0,
      releaseY: 11.6,
      _type: 'UI',
      refName: 'ui',
      children: [
        {
          _type: 'ChatUI',
          refName: 'unnamed',
          children: [],
        },
      ],
    });
    self.params = _params;
    self.args = arguments;
    self.parent?.layers && (self.layers = self.parent.layers);
    self.layout?.getAllLayers && (self.layers = await self.layout.getAllLayers());
    self.ui.alpha = 0;
    Scroll.createUnlimited();
    self.startRender((_) => {
      let scrollProgress = self.get('Work/scrollProgress');
      0 == (scrollProgress > 0.05 && scrollProgress < 0.92 ? 1 : 0)
        ? self.ui.showing &&
          ((self.ui.showing = false),
          self.ui.tween(
            {
              alpha: 0,
            },
            500,
            'easeOutSine',
          ))
        : self.ui.showing ||
          ((self.ui.showing = true),
          self.ui.tween(
            {
              alpha: 1,
            },
            500,
            'easeOutSine',
          ));
    });
    self.onHover = (e) => console.log(e.action);
    self.onClick = (_) => console.log('click');
    self.onResize(function updateLayout() {});
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

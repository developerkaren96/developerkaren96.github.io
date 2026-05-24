/*
 * UILGraphNodeMenu — right-side icon strip on every graph
 * node row. Three small icon buttons:
 *   sceneButton  — only on stage-layout nodes; navigates
 *                  to `?p=<scenelayout>&uil`.
 *   lockButton   — toggles data.locked + fires
 *                  'UILGraph/LockNode' so the layout can
 *                  blur focus; icon swaps locked/unlocked.
 *   visibilityButton — toggles data.visible + fires
 *                  UILGraphNode.TOGGLE_VISIBILITY (hidden
 *                  for special nodes).
 *
 * Standard Fragment plumbing.
 */
Class(function UILGraphNodeMenu(_params, ...restArgs) {
  const self = this;
  Inherit(self, Element);
  Inherit(self, XComponent);
  self.fragName = 'UILGraphNodeMenu';
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
          _type: 'div',
          refName: 'wrapper',
          children: [
            {
              className: 'iconButton',
              click: '$onSceneClick',
              _type: 'div',
              refName: 'sceneButton',
              children: [],
            },
            {
              className: 'iconButton',
              click: '$onLockClick',
              _type: 'div',
              refName: 'lockButton',
              children: [],
            },
            {
              className: 'iconButton',
              click: '$onVisibilityClick',
              _type: 'div',
              refName: 'visibilityButton',
              children: [],
            },
          ],
        },
      ],
    });
    self.params = _params;
    self.args = arguments;
    self.parent?.layers && (self.layers = self.parent.layers);
    self.layout?.getAllLayers && (self.layers = await self.layout.getAllLayers());
    self.sceneButton.html(UILGraphLayout.SCENE_ICON);
    self.sceneButton.classList()[self.params.data.scenelayout ? 'remove' : 'add']('hidden');
    self.lockButton.html(
      self.params.data.locked ? UILGraphLayout.LOCKED_ICON : UILGraphLayout.UNLOCKED_ICON,
    );
    self.visibilityButton.html(
      self.params.data.visible ? UILGraphLayout.VISIBILE_ICON : UILGraphLayout.INVISIBLE_ICON,
    );
    self.params.data.special && self.visibilityButton.classList().add('hidden');
    self.onLockClick = (_) => self.params.data.set('locked', !self.params.data.locked);
    self.onVisibilityClick = (_) => self.params.data.set('visible', !self.params.data.visible);
    self.onSceneClick = (_) => (window.location.search = `?p=${self.params.data.scenelayout}&uil`);
    self.onInit = function () {
      self.lockButton.css({
        pointerEvents: 'all',
      });
      self.bind(self.params.data, 'locked', (value) => {
        self.lockButton.html(value ? UILGraphLayout.LOCKED_ICON : UILGraphLayout.UNLOCKED_ICON);
        self.fire('UILGraph/LockNode', {
          id: self.params.data.id,
          layoutId: self.params.layoutId,
          value: value,
        });
        value && self.set(`UIL/${self.params.layoutId}/UILGraph/node/focused`, null);
      });
      self.bind(self.params.data, 'visible', (val) => {
        self.visibilityButton?.html(
          val ? UILGraphLayout.VISIBILE_ICON : UILGraphLayout.INVISIBLE_ICON,
        );
        self.events.fire(UILGraphNode.TOGGLE_VISIBILITY, {
          ...self.params.data.toJSON(),
          visible: val,
        });
      });
    };
    self.element.goob(
      '\n    .wrapper {\n        display: flex;\n        margin-right: 5px;\n        color: var(--color-icon-default);\n        align-items: right;\n    }\n\n    .iconButton.hidden {\n        display: none;\n    }\n\n',
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

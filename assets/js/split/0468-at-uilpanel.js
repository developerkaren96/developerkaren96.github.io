/*
 * UILPanel — top-level dockable inspector panel (right/
 * left/offscreen via options.side). Hosts a sticky
 * UILPanelToolbar with the filter input and a root
 * UILFolder that owns all controls (hideTitle so the
 * folder header is invisible). 'history' panel id slides
 * in/out from the right via 'UILTabs/toggle-history-panel'.
 *
 * Keyboard shortcuts (Ctrl/Cmd + ...):
 *   Shift+H — toggle panel visibility (unless an
 *             input/textarea is focused).
 *   Shift+← — dock to left.
 *   Shift+→ — dock to right.
 *   Shift+C — close all folders.
 *   Shift+O — open all folders.
 *
 * add() special-cases:
 *   UILTabs → prepended directly on the panel.
 *   Global panel + UILFolder → routed to globalTabs.
 *   anything else → folder.add.
 *
 * Standard Fragment plumbing.
 */
Class(function UILPanel(_params, ...restArgs) {
  const self = this;
  Inherit(self, Element);
  Inherit(self, XComponent);
  self.fragName = 'UILPanel';
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
          _type: 'UILPanelToolbar',
          refName: 'toolbar',
          children: [],
        },
        {
          id: '$params.title',
          options: '$folderOptions',
          _type: 'UILFolder',
          refName: 'folder',
          children: [],
        },
      ],
    });
    self.params = _params;
    self.args = arguments;
    self.parent?.layers && (self.layers = self.parent.layers);
    self.layout?.getAllLayers && (self.layers = await self.layout.getAllLayers());
    self.createState();
    self.state.set('historyIsOpen', false);
    self.ready = false;
    self.id = self.params.title;
    self.folderOptions = {
      hideTitle: true,
      drag: false,
    };
    let _hidden = false;
    function toggleHistory() {
      self.state.set('historyIsOpen', !self.state.historyIsOpen);
      self.state.historyIsOpen
        ? self.element.classList().add('open')
        : self.element.classList().remove('open');
      self.fire('historyPanelToggle', self.state.historyIsOpen);
    }
    function onKeydown(e) {
      if (e.ctrlKey || e.metaKey) {
        if (72 == e.keyCode && e.shiftKey) {
          if (`${document.activeElement.type}`.includes(['textarea', 'input', 'number'])) return;
          e.preventDefault();
          _hidden
            ? (function show() {
                self.element.visible();
                _hidden = false;
              })()
            : (function hide() {
                self.element.invisible();
                _hidden = true;
              })();
        }
        37 == e.keyCode &&
          e.shiftKey &&
          (e.preventDefault(),
          self.element.css({
            left: 0,
            right: 'auto',
          }));
        39 == e.keyCode &&
          e.shiftKey &&
          (e.preventDefault(),
          self.element.css({
            left: 'auto',
            right: 0,
          }));
        67 == e.which &&
          e.shiftKey &&
          (e.preventDefault(), self.folder.forEachFolder((f) => f.close()));
        79 == e.which &&
          e.shiftKey &&
          (e.preventDefault(), self.folder.forEachFolder((f) => f.open()));
      }
    }
    self.onMounted = () => {
      self.element.mouseEnabled(true);
      self.ready = true;
      self.params?.options?.hideToolbar &&
        self.wait('toolbar').then(() => {
          self.toolbar.element.hide();
        });
      (function initListeners() {
        document.addEventListener('keydown', onKeydown, false);
        'history' === self.id &&
          (self.element.show(), self.bind('UILTabs/toggle-history-panel', toggleHistory));
      })();
    };
    self.element.classList().add('prevent_interaction3d');
    self.element.classList().add(self.params.title);
    'offscreen' === self.params?.options?.side && self.element.classList().add('offscreen');
    self.add = async function (child) {
      return (
        await self.wait(() => self.ready),
        await defer(),
        self.element.show(),
        child instanceof UILTabs
          ? (self.element.div.prepend(child.element.div), self)
          : 'global' === self.id && child instanceof UILFolder
            ? (UIL.globalTabs.addGlobalFolder(child), self)
            : (self.folder.add(child), self)
      );
    };
    self.remove = function (x) {
      return (self.folder.remove(x.id), self);
    };
    self.get = function (id) {
      return self.folder.getChildById(id);
    };
    self.find = function (id) {
      return self.folder.find(id);
    };
    self.filter = function (str) {
      return self.folder.filter(str);
    };
    self.enableSorting = function (key) {
      return (self.folder.enableSorting && self.folder.enableSorting(key), self);
    };
    self.eliminate = function () {
      self.toolbar.eliminate();
      document.removeEventListener('keydown', onKeydown, false);
    };
    self.element.div.style.cssText = `\n    --panel-width: ${self.params?.options?.width || '300px'};\n    --panel-height: ${self.params?.options?.height || '100vh'};\n    --panel-max-height: ${self.params?.options?.maxHeight || '100vh'};\n    --timing: ${TweenManager._getEase('easeOutCubic')};\n`;
    self.element.goob(
      `\n    & {\n        background-color: var(--panel-background-color);\n        width: var(--panel-width);\n        height: var(--panel-height);\n        max-height: var(--panel-max-height);\n        overflow-y: auto;\n        user-select: none;\n        position: absolute;\n        top: 0;\n        left: ${'left' === self.params?.options?.side ? '0' : 'auto'};\n        right: ${'left' !== self.params?.options?.side ? '0' : 'auto'};\n        opacity: 0.6;\n        transition: opacity 0.2s var(--timing);\n        pointer-events: all;\n        border-radius: 20px;\n        margin-left: 10px;\n        margin-right: 10px;\n\n        &:hover {\n            opacity: 1;\n        }\n    }\n\n    &.history {\n        opacity: 1;\n        right: calc(var(--panel-width) * -1);\n        transition: right 0.5s ease-out;\n\n        &.open {\n            right: 0;\n        }\n    }\n`,
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

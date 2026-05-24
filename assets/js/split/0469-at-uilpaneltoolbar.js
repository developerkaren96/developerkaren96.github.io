/*
 * UILPanelToolbar — sticky filter bar above the root
 * folder. Typing into filterInput calls
 * parent.folder.filter(value) — empty value restores the
 * tree (each folder reverts to its saved open/closed
 * state captured on focus). Escape clears + restores.
 * filterSingle(text) is the public API used by graph
 * focus events to highlight a single matching node.
 * hideAll() (one-shot via 'init' flag) collapses the
 * entire panel by filtering for a guaranteed-no-match
 * string.
 *
 * Standard Fragment plumbing.
 */
Class(function UILPanelToolbar(_params, ...restArgs) {
  const self = this;
  Inherit(self, Element);
  Inherit(self, XComponent);
  self.fragName = 'UILPanelToolbar';
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
          _type: 'input',
          refName: 'filterInput',
          children: [],
        },
      ],
    });
    self.params = _params;
    self.args = arguments;
    self.parent?.layers && (self.layers = self.parent.layers);
    self.layout?.getAllLayers && (self.layers = await self.layout.getAllLayers());
    let _state = new Map();
    function restoreFolderState() {
      self.parent.folder.forEachFolder((folder) => {
        _state.get(folder) ? folder.open() : folder.close();
      });
      _state.clear();
    }
    function onInput(e) {
      if (!self.filterInput.div.value.length)
        return (restoreFolderState(), self.parent.folder.showChildren());
      self.parent.folder.filter(self.filterInput.div.value);
    }
    function onFocus() {
      !(function saveFolderState() {
        self.parent.folder.forEachFolder((folder) => {
          _state.set(folder, folder.isOpen());
        });
      })();
      self.filterInput.css({
        border: '1px solid #37a1ef',
      });
    }
    function onBlur() {
      self.filterInput.css({
        border: '1px solid #2e2e2e',
      });
    }
    function onKeyPressed(e) {
      if (27 === e.keyCode)
        return (
          (self.filterInput.div.value = ''),
          restoreFolderState(),
          self.parent.folder.showChildren()
        );
    }
    self.ready = false;
    (function initListeners() {
      self.filterInput.div.addEventListener('input', onInput, false);
      self.filterInput.div.addEventListener('keydown', onKeyPressed, false);
      self.filterInput.div.addEventListener('focus', onFocus, false);
      self.filterInput.div.addEventListener('blur', onBlur, false);
    })();
    self.onMounted = () => {
      self.ready = true;
    };
    self.eliminate = function () {
      self.filterInput.div.removeEventListener('input', onInput, false);
      self.filterInput.div.removeEventListener('keydown', onKeyPressed, false);
      self.filterInput.div.removeEventListener('focus', onFocus, false);
      self.filterInput.div.removeEventListener('blur', onBlur, false);
    };
    self.filter = function (text) {
      self.filterInput.div.value = text;
      onInput();
    };
    self.filterSingle = async function (text) {
      self.filterInput.div.value = text;
      self?.parent?.folder?.filterSingle(self.filterInput.div.value);
    };
    self.hideAll = function () {
      self.flag('init') || (self.flag('init', true), this.filterSingle('xxxxxx'));
    };
    self.element.goob(
      '\n    & {\n        background-color: var(--panel-background-color);\n        padding: calc(var(--spacing-small) / 2);\n        padding-bottom: 0;\n    }\n',
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

/*
 * UILFolder — collapsible group / container in the UIL
 * inspector. Each folder owns a header (chevron + label +
 * drag handle ☰) and a child container that hosts other
 * UILFolders or leaf UILControls.
 *
 * Features:
 *   - open/close with sessionStorage persistence keyed by
 *     `${Global.PLAYGROUND||'Global'}_folder_<id>` so the
 *     tree's expanded state survives reloads.
 *   - filter(str) and filterSingle(str) recursively show/
 *     hide children using UILFuzzySearch; matched folders
 *     are auto-opened so the user sees their hits.
 *   - HTML5 drag-and-drop reorder when enableSorting(key)
 *     is called: the parent saves the new order to
 *     UILStorage as `UIL_<sortKey>_<parentId>_order`.
 *   - Copy/paste of the whole subtree via UILClipboard
 *     (Cmd-C / Cmd-V while the folder header has focus).
 *
 * Standard Fragment plumbing.
 */
Class(function UILFolder(_params, ...restArgs) {
  const self = this;
  Inherit(self, Element);
  Inherit(self, XComponent);
  self.fragName = 'UILFolder';
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
          _type: 'a',
          refName: 'header',
          children: [
            {
              htmlFor: '$state.label',
              _type: 'label',
              _innerText: '$state.label',
              refName: 'unnamed',
              children: [],
            },
            {
              _type: 'div',
              _innerText: '☰',
              refName: 'drag',
              children: [],
            },
          ],
        },
        {
          _type: 'div',
          refName: 'container',
          children: [],
        },
      ],
    });
    self.params = _params;
    self.args = arguments;
    self.parent?.layers && (self.layers = self.parent.layers);
    self.layout?.getAllLayers && (self.layers = await self.layout.getAllLayers());
    self.params.options ||
      (self.params = Object.assign(
        {},
        {
          id: self.params,
        },
        {
          options: restArgs[0],
        },
      ));
    let _children = {},
      _open = !self.params.options.closed,
      _visible = true,
      _order = [],
      _draggable = false,
      _sortableChildren = false,
      _headerDrag = false,
      _hasClipboard = false;
    self.params.id;
    function removeDragHandlers() {
      self.element.div.removeEventListener('dragstart', dragStart, false);
      self.element.div.removeEventListener('dragover', dragOver, false);
      self.element.div.removeEventListener('drop', drop, false);
    }
    function onToggle(event) {
      self.state.open ? self.close() : self.open();
      self.state.open ? self.header.div.focus() : self.header.div.blur();
    }
    function onMouseDown(event) {
      _headerDrag = true;
      self.header.div.addEventListener('mouseup', onMouseUp);
    }
    function onMouseUp(event) {
      _headerDrag = false;
      self.header.div.removeEventListener('mouseup', onMouseUp);
    }
    function onKeydown(event) {
      event.preventDefault();
      13 === event.which && (_open ? close() : open());
    }
    function onKeyup(event) {
      event.preventDefault();
      _hasClipboard &&
        ('c' == event.key && event.metaKey
          ? (function onCopy() {
              UILClipboard.copy(_children);
            })()
          : 'v' == event.key &&
            event.metaKey &&
            (function onPaste() {
              UILClipboard.paste(_children);
            })());
    }
    function onFocus() {
      self.element.div.classList.add('active');
      _hasClipboard = true;
    }
    function onBlur() {
      self.element.div.classList.remove('active');
      _hasClipboard = false;
    }
    function matchItem(str, item) {
      return (
        UILFuzzySearch.search(str, item.id.toLowerCase()) ||
        UILFuzzySearch.search(str, item.label.toLowerCase())
      );
    }
    function dragStart(e) {
      if (!UILFolder.DragLock) {
        if (!_headerDrag) return (e.preventDefault(), void e.stopPropagation());
        UILFolder.DragLock = self.state.id;
        e.dataTransfer.setData('text/plain', self.state.id);
        e.dataTransfer.effectAllowed = 'move';
        self.element.css({
          opacity: 0.5,
        });
      }
    }
    function dragOver(e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    }
    function drop(e) {
      if (!UILFolder.DragLock) return;
      if (e.dataTransfer.items)
        for (var i = 0; i < e.dataTransfer.items.length; i++)
          if ('file' === e.dataTransfer.items[i].kind) return;
      e.preventDefault();
      _headerDrag = false;
      let target = e.currentTarget._this,
        dragging = self.parent.getChildById(UILFolder.DragLock);
      UILFolder.DragLock = null;
      target &&
        target.parent &&
        dragging &&
        (dragging.element.css({
          opacity: 1,
        }),
        dragging.parent.getChildById(target.id) &&
          (e.stopPropagation(),
          target.parent.container.div.insertBefore(dragging.element.div, target.element.div),
          (_order = [...target.parent.container.div.childNodes].map((el) => el._this.id)),
          self.events.fire(UIL.REORDER, {
            order: [..._order],
          }),
          (function saveSort() {
            UILStorage.set(`UIL_${UIL.sortKey}_${self.parent.id}_order`, JSON.stringify(_order));
          })()));
    }
    function getUrlID() {
      return `${Global.PLAYGROUND || 'Global'}_folder_${self.state.id}`;
    }
    function saveFolderState() {
      sessionStorage.setItem(
        getUrlID(),
        JSON.stringify({
          open: self.state.open,
        }),
      );
    }
    self.id = self.params.id;
    self.label = self.params.options.label || self.params.id;
    self.level = -1;
    self.createState();
    self.state.set('id', self.params.id);
    self.state.set('label', self.params.options.label || self.params.id);
    self.state.set('open', !self.params.options.closed);
    self.params.options.hideTitle && self.header.classList().add('hide-title');
    self.element.css({
      maxHeight: self.params.options.maxHeight || 'none',
    });
    self.element.attr('data-id', self.params.id);
    self.element.attr('data-type', 'UILFolder');
    self.element.div._this = self;
    self.onInit = () => {
      !(function restoreFolderState() {
        let json = JSON.parse(sessionStorage.getItem(getUrlID()));
        json ? (json.open ? self.open() : self.close()) : self.open();
      })();
    };
    self.onMounted = () => {
      self.flag('isReady', true);
    };
    self.ready = (_) => self.wait('isReady');
    (function initListeners() {
      self.header.div.addEventListener('keydown', onKeydown, false);
      self.header.div.addEventListener('click', onToggle, false);
      self.header.div.addEventListener('mousedown', onMouseDown);
      self.header.div.addEventListener('focus', onFocus, false);
      self.header.div.addEventListener('blur', onBlur, false);
      self.header.div.addEventListener('keydown', onKeyup, false);
    })();
    self.add = async function (child) {
      return (
        await self.wait(() => self.ready),
        await defer(),
        child.draggable && child.draggable(_sortableChildren),
        (child.parent = self),
        (_children[child.id] = child),
        self.container.add(child),
        self
      );
    };
    self.remove = function (x) {};
    self.getChildById = function (id) {
      return _children[id];
    };
    self.getAll = function () {};
    self.getVisible = function () {
      return Object.values(_children).filter((x) => x.isVisible());
    };
    self.find = function (id) {
      return id === self.id
        ? self
        : Object.values(_children).reduce(
            (acc, item) =>
              item.id === id
                ? acc.concat(item)
                : item instanceof UILFolder
                  ? acc.concat(item.find(id))
                  : acc,
            [],
          );
    };
    self.filter = function filter(str, match = false) {
      str = str.toLowerCase();
      let result = [],
        haystack = Object.values(_children);
      for (let el of haystack)
        if (el instanceof UILFolder) {
          let matches = el.filter(str, true);
          matches.length
            ? (result.concat(matches), el.show(), el.open())
            : matchItem(str, el)
              ? (result.push(el), el.show(), el.showChildren(), el.close())
              : el.getVisible().length
                ? el.show()
                : el.hide();
        } else matchItem(str, el) ? (result.push(el), el.show()) : el.hide();
      return result;
    };
    self.filterSingle = function filterSingle(str) {
      str = str.toLowerCase();
      let haystack = Object.values(_children);
      for (let el of haystack)
        el instanceof UILFolder
          ? (el.filterSingle(str),
            str == el.state.label.toString().toLowerCase() ||
            str == el.state.id.toString().toLowerCase()
              ? (el.show(), el.showChildren(), el.open(true))
              : el.getVisible().length
                ? el.show()
                : el.hide())
          : matchItem(str, el)
            ? (el.show(), el.state.open && el.open(true))
            : el.hide();
      return [];
    };
    self.open = function (keepClosed = false) {
      if (self.element)
        return (
          self.state.set('open', true),
          self.element.classList().add('open'),
          (_open = true),
          1 != keepClosed && self.forEachFolder((f) => f.close()),
          saveFolderState(),
          self.onOpen && self.onOpen(),
          self
        );
    };
    self.close = function () {
      self.state.set('open', false);
      self.element.classList().remove('open');
      _open = false;
      saveFolderState();
    };
    self.setLabel = function (label) {
      self.state.set('label', label);
    };
    self.hide = function () {
      if (self.element)
        return (
          (_visible = false),
          self.element.css({
            display: 'none',
          }),
          self
        );
    };
    self.show = function () {
      if (self.element)
        return (
          (_visible = true),
          self.element.css({
            display: 'block',
          }),
          self
        );
    };
    self.showChildren = function () {
      return (
        Object.values(_children).forEach((el) =>
          el instanceof UILFolder ? el.showChildren() : el.show(),
        ),
        self.show(),
        self
      );
    };
    self.isOpen = function () {
      return _open;
    };
    self.isVisible = function () {
      return _visible;
    };
    self.forEachFolder = function (cb) {
      return (
        Object.values(_children).forEach((el) => {
          el instanceof UILFolder && (cb(el), el.forEachFolder(cb));
        }),
        self
      );
    };
    self.forEachControl = function (cb) {
      return (
        Object.values(_children).forEach((el) => {
          el instanceof UILFolder ? el.forEachControl(cb) : cb(el);
        }),
        self
      );
    };
    self.enableSorting = function (key) {
      _sortableChildren = true;
      UIL.sortKey = key;
      Object.values(_children).forEach((el) => {
        el instanceof UILFolder && el.draggable(true);
      });
      let order = (function getSort() {
        let sort = UILStorage.get(`UIL_${UIL.sortKey}_${self.id}_order`);
        if (sort) return JSON.parse(sort);
      })();
      return (
        order &&
          ((_order = order),
          (function restoreSort() {
            _order.forEach((id) => {
              _children[id] && self.container.add(_children[id]);
            });
          })()),
        self
      );
    };
    self.draggable = function (enable) {
      _draggable = enable;
      self.element.attr('draggable', enable);
      enable
        ? (!(function addDragHandlers() {
            self.element.div.addEventListener('dragstart', dragStart, false);
            self.element.div.addEventListener('dragover', dragOver, false);
            self.element.div.addEventListener('drop', drop, false);
          })(),
          self.drag && self.drag.show())
        : (removeDragHandlers(), self.drag && self.drag.hide());
    };
    self.toClipboard = function () {
      UILClipboard.copy(_children);
    };
    self.fromClipboard = function () {
      UILClipboard.paste(_children);
    };
    self.eliminate = function () {
      self.params.options.hideTitle ||
        (self.header.div.removeEventListener('keydown', onToggle, false),
        self.header.div.removeEventListener('click', onToggle, false),
        self.header.div.removeEventListener('mousedown', onMouseDown),
        self.header.div.removeEventListener('focus', onFocus, false),
        self.header.div.removeEventListener('blur', onBlur, false));
      _draggable && removeDragHandlers();
    };
    self.forceSort = function (index) {
      self.parent.container.div.insertBefore(
        self.element.div,
        self.parent.container.div.children[index],
      );
      _order = [...self.parent.container.div.childNodes].map((el) => el._this.state.id);
      self.events.fire(UIL.REORDER, {
        order: [..._order],
      });
    };
    self.openChildren = function () {
      Object.values(_children).forEach((el) => (el instanceof UILFolder ? el.open() : null));
    };
    self.onToggle = onToggle;
    UIL.addCSS(
      UILFolder,
      '\n    .UILFolder .UILFolder .UILFolder .header { \n        padding-left: calc(var(--left-padding) + var(--spacing-small)); \n    }\n    .UILFolder .UILFolder .UILFolder .header:before {\n        left: calc(var(--spacing-small) * 2);\n    }\n\n    .UILFolder .UILFolder .UILFolder .UILFolder .UILFolder .header {\n        padding-left: calc(var(--left-padding) + var(--spacing-small) * 3); \n    }\n    .UILFolder .UILFolder .UILFolder .UILFolder .UILFolder .header:before {\n        left: calc(var(--spacing-small) * 3);\n    }\n\n    .UILFolder .UILFolder .UILFolder .UILFolder .UILFolder .UILFolder .header {\n        padding-left: calc(var(--left-padding) + var(--spacing-small) * 4); \n    }\n    .UILFolder .UILFolder .UILFolder .UILFolder .UILFolder .UILFolder .header:before {\n        left: calc(var(--spacing-small) * 4);\n    }\n\n    .UILFolder .UILFolder .UILFolder .UILFolder .UILFolder .UILFolder .UILFolder .header {\n        padding-left: calc(var(--left-padding) + var(--spacing-small) * 5); \n    }\n    .UILFolder .UILFolder .UILFolder .UILFolder .UILFolder .UILFolder .UILFolder .header:before {\n        left: calc(var(--spacing-small) * 5);\n    }\n\n    .UILFolder .UILFolder .UILFolder .UILFolder .UILFolder .UILFolder .UILFolder .UILFolder .header {\n        padding-left: calc(var(--left-padding) + var(--spacing-small) * 6); \n    }\n    .UILFolder .UILFolder .UILFolder .UILFolder .UILFolder .UILFolder .UILFolder .UILFolder .header:before {\n        left: calc(var(--spacing-small) * 6);\n    }\n\n',
    );
    self.element.goob(
      "\n    & {\n        --left-padding: calc(var(--spacing) * 1.75);\n\n        background-color: var(--panel-background-color);\n        width: 100%;\n\n        &:has(> .header:focus) {\n            border: 1px solid var(--color-action--alt);\n        }\n        \n        &.open {\n            > .header:before {\n                transform: rotate(90deg);\n            }\n    \n            > .container {\n                display: block;\n            }\n        }\n    }\n\n    .header {\n        border-bottom: 1px solid var(--color-divider-main);\n        color: var(--color-white);\n        display: flex;\n        font: var(--label4);\n        padding: var(--spacing); \n        padding-left: var(--left-padding);\n        position: relative;\n        align-items: center;\n        text-decoration: none;\n        line-height: 1;\n        user-select: none;\n\n        &:hover {\n            outline: 1px solid var(--color-action--alt);\n        }\n\n        &:before {\n            content: '';\n            display: block;\n            width: 0;\n            height: 0;\n            border-color: transparent transparent transparent var(--color-icon-default);\n            border-style: solid;\n            border-width: 3px 0 3px 4px;\n            position: absolute;\n            left: var(--spacing-small);\n            transition: transform .3s ease-out;\n        }\n\n        &.hide-title {\n            display: none;\n        }\n    }\n\n    .container {\n        display: none;\n    }\n\n    .drag {\n        position: absolute;\n        right: 7px;\n        top: 8px;\n        display: inline-block;\n        pointerEvents: none;\n    }\n",
    );
    self.listen('UILGraphLayout/destroy', (label) => {
      let name = label.split('-')[0];
      self.label.includes(name) && self.element.hide();
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

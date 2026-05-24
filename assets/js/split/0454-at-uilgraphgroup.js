/*
 * UILGraphGroup — folder-like node in the graph tree.
 * Renders a header (chevron toggle, group icon, title,
 * node-menu) plus a UILGraphGroupChildren panel below it.
 * Inherits DragAndDrop so the whole group can be
 * reordered; double-click on the header reveals an inline
 * <input> for renaming (Enter commits + fires RENAMED,
 * Escape cancels).
 *
 * handleMoveNode resorts data.children by sortIndex when a
 * drop event lands inside this group; healSort() collapses
 * sortIndex gaps. handleContextMenuAction processes
 * DELETE actions and updates sortIndex / fires bridge
 * deleteNode.
 *
 * Standard Fragment plumbing.
 */
Class(function UILGraphGroup(_data, _index, _params) {
  const self = this;
  Inherit(self, ViewStateElement);
  Inherit(self, Element);
  Inherit(self, DragAndDrop);
  Inherit(self, XComponent);
  self.fragName = 'UILGraphGroup';
  self.contexts = 'ViewStateElement,Element,DragAndDrop';
  self.data = _data;
  self.index = _index;
  self.params = _params;
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
              _type: 'div',
              refName: 'dropTarget',
              children: [
                {
                  _type: 'div',
                  refName: 'highlight',
                  children: [],
                },
              ],
            },
            {
              click: '$onClick',
              _type: 'div',
              refName: 'header',
              children: [
                {
                  click: '$toggleClick',
                  _type: 'div',
                  refName: 'toggleButton',
                  children: [],
                },
                {
                  _type: 'div',
                  refName: 'typeIcon',
                  children: [],
                },
                {
                  tabIndex: 1,
                  _type: 'div',
                  refName: 'title',
                  children: [
                    {
                      _type: 'div',
                      _innerText: '$data.name',
                      refName: 'titleText',
                      children: [],
                    },
                    {
                      value: '$data.name',
                      _type: 'input',
                      refName: 'titleField',
                      children: [],
                    },
                  ],
                },
                {
                  type: 'group',
                  data: '$data',
                  layoutId: '$params.layoutId',
                  _type: 'UILGraphNodeMenu',
                  refName: 'unnamed',
                  children: [],
                },
              ],
            },
            {
              data: '$data',
              layoutId: '$params.layoutId',
              _type: 'UILGraphGroupChildren',
              refName: 'unnamed',
              children: [],
            },
          ],
        },
      ],
    });
    self.data = _data;
    self.index = _index;
    self.params = _params;
    self.createState();
    self.parent?.layers && (self.layers = self.parent.layers);
    self.layout?.getAllLayers && (self.layers = await self.layout.getAllLayers());
    function handleNodeFocused(val) {
      if (!self.data) return;
      let focusedNode;
      self.data.children?.forEach((node) => {
        node.focused = val == node.id;
        node.focused && (focusedNode = node);
      });
      focusedNode &&
        (UIL.sidebar.toolbar.filterSingle(val),
        Storage.set(`UIL:${self.params.layoutId}/Graph/focused`, val),
        self.events.fire(UILGraphNode.FOCUSED, {
          name: focusedNode.name,
          layoutInstance: self.params.layoutInstance,
        }));
    }
    function handleMoveNode(e) {
      if (!self.data || !self.data.children) return;
      const find = (id) => {
        let found;
        return (
          self.data.children.forEach((node) => {
            node.id == id && (found = node);
          }),
          found
        );
      };
      let moveNode = find(e.moveId),
        targetNode = find(e.targetId);
      try {
        if (!moveNode.parent || moveNode.parent != targetNode?.parent) return;
      } catch (e) {
        return;
      }
      if ((1 == self.data.children.length && (moveNode.sortIndex = 0), 'end-of-list' == e.type)) {
        let oldIndex = moveNode.sortIndex;
        self.data.children.forEach((node) => {
          node.parent || (node.sortIndex > oldIndex && (node.sortIndex -= 1));
        });
        moveNode.sortIndex = self.data.children.length - 1;
        self.data.children.sort((a, b) => a.sortIndex - b.sortIndex);
      } else {
        let oldIndex = moveNode.sortIndex;
        if (
          (self.data.children.forEach((node) => {
            node.sortIndex > oldIndex && (node.sortIndex -= 1);
          }),
          'before' == e.type)
        ) {
          let newIndex = targetNode.sortIndex;
          self.data.children.forEach((node) => {
            node.sortIndex >= newIndex && (node.sortIndex += 1);
          });
          moveNode.sortIndex = newIndex;
        }
        self.data.children.sort((a, b) => a.sortIndex - b.sortIndex);
        healSort();
      }
    }
    function healSort() {
      let lastIndex = -1;
      self.data.children.forEach((node) => {
        let delta = node.sortIndex - lastIndex;
        delta > 1 && (node.sortIndex -= delta - 1);
        lastIndex = node.sortIndex;
      });
    }
    async function handleContextMenuAction(event) {
      if (!self.get) return;
      const context = self.get('UIL/ContextMenu');
      if (
        context &&
        context.layoutId == self.params.layoutId &&
        event === UILGraphContextMenu.DELETE
      ) {
        let foundNode;
        if (
          (self.data.children.forEach((node) => {
            node.id == context.targetId && (foundNode = node);
          }),
          foundNode)
        ) {
          self.params.bridge.deleteNode(foundNode) &&
            (self.data.children.forEach((node) => {
              node.sortIndex > foundNode.sortIndex && (node.sortIndex -= 1);
            }),
            self.data.children.remove(foundNode));
        }
        healSort();
      }
    }
    function onKey(event) {
      return 'enter' == event.key.toLowerCase()
        ? (function onTitleValidate(event) {
            (function rename(name) {
              let previousName = self.data.nameLabel;
              self.data.set('nameLabel', name);
              self.title.text(self.data.nameLabel);
              self.titleField.val(self.data.nameLabel);
              self.events.fire(UILGraphNode.RENAMED, {
                layoutId: self.data.layoutId,
                id: self.data.id,
                name: previousName,
                value: self.data.nameLabel,
              });
              self.data.set('name', name);
              self.name = name;
            })(self.titleField.val());
            hideTitleEditor();
          })()
        : 'escape' == event.key.toLowerCase()
          ? hideTitleEditor()
          : undefined;
    }
    function showTitleEditor() {
      self.titleField.show();
      self.titleField.div.focus();
      self.titleField.div.select();
    }
    function hideTitleEditor() {
      self.titleField.hide();
    }
    function openContextMenu(e) {
      e.preventDefault();
      self.set('UIL/ContextMenu', {
        layoutId: self.params.layoutId,
        targetId: self.data.id,
        parentId: self.data.parentId?.split(`${self.data.scene}_`)[1],
        name: self.data.name,
        type: UILGraph.GROUP_TYPE,
        isStageLayout: self.data.isStageLayout,
      });
    }
    self.id = self.data.id;
    self.name = self.data.name;
    self.nameLabel = self.data.name;
    self.isGraphGroup = true;
    self.sortOrder = self.params.order;
    self.typeIcon.html(UILGraphLayout.GROUP_ICON);
    self.toggleButton.html(UILGraphLayout.ARROW_ICON);
    self.toggleButton.classList()[self.data.open ? 'remove' : 'add']('closed');
    self.titleField.hide();
    self.onClick = function (e) {
      e.target.getAttribute('class')?.indexOf('toggleButton') > -1 ||
        e.target.getAttribute('class')?.indexOf('arrow') > -1 ||
        self.fire(`UIL/${self.params.layoutId}/UILGraph/node/focused`, self.data.id);
    };
    self.data.set('open', true);
    self.toggleClick = (_) => {
      self.data.set('open', !self.data.open);
      self.fire('UILGraphGroup/open', {
        open: self.data.open,
        id: self.data.id,
        layoutId: self.data.layoutId,
      });
    };
    self.bind(self.data, 'open', (val) =>
      self.toggleButton?.classList?.()[val ? 'remove' : 'add']('closed'),
    );
    self.bind(self.data, 'locked', (value) => {
      self.wrapper.css({
        pointerEvents: value ? 'none' : 'auto',
      });
      self.setDragEnabled(!value);
    });
    (function addHandlers() {
      self.header.div.addEventListener('contextmenu', openContextMenu);
      self.element.div.addEventListener('mousedown', self.addDragListeners, false);
      window.addEventListener('mouseup', self.removeDragListeners, false);
      self.header.div.addEventListener('dblclick', showTitleEditor, false);
      self.titleField.div.addEventListener('keyup', onKey, false);
      self.titleField.div.addEventListener('blur', hideTitleEditor, false);
      self.bind(`UIL/${self.params.layoutId}/UILGraph/node/focused`, handleNodeFocused);
      self.listen('UILGraph/MoveNode', handleMoveNode);
      self.listen('GraphContextMenu/action', handleContextMenuAction);
    })();
    self.header.classList()[self.data.selected ? 'add' : 'remove']('focused');
    self.bind(self.data, 'focused', (val) => {
      if (!self.header) return;
      const focusedAction = val ? 'add' : 'remove';
      self.header.classList()[focusedAction]('focused');
    });
    self.onMounted = function () {
      self.element.div.classList.add('UILGraphNode');
      self.header.css({
        paddingLeft: 32 * self.data.depth + 'px',
      });
      self.setDragElement(self.header);
      self.data.locked &&
        (self.wrapper.css({
          pointerEvents: 'none',
        }),
        self.data.special || self.setDragEnabled(false));
    };
    self.onDrop = function (dropId) {
      self.fire('UILGraph/MoveNode', {
        moveId: dropId,
        targetId: self.data.id,
        type: 'before',
      });
    };
    self.element.goob(
      `\n    position: relative;\n    width: 300px;\n    height: auto;\n    font-family: sans-serif;\n    font-size: 11px;\n    width: 100%;\n    cursor: grab;\n\n    & > .wrapper > .header {\n        width: 100%;\n        height: auto;\n        outline: none;\n        display: flex;\n        flex-direction: row;\n        align-items: center;\n        padding: 9px;\n        padding-left: 32px;\n        box-sizing: border-box;\n        user-select: none;\n        border: 1px solid rgba(26, 109, 234, 0);\n    }\n\n    & > .wrapper > .header {\n        transition: border-color 200ms, background-color 200ms;\n    }\n\n    & > .wrapper > .header:hover {\n        border: 1px solid rgba(26, 109, 234, 1);\n    }\n\n\n    & > .wrapper > .header.focused {\n        background-color: rgba(26, 109, 234, 1);\n    }\n\n    & > .wrapper > .header.focused:hover {\n        border: 1px solid rgba(26, 109, 234, 0);\n    }\n\n    .toggleButton {\n        position: absolute;\n        width: 32px;\n        height: auto;\n        box-sizing: border-box;\n        text-align: center;\n        padding: 9px;\n        margin-left: -32px;\n        transform: rotate(180deg);\n        opacity: 0.6;\n        transition: opacity 200ms;\n    }\n\n    .toggleButton:hover {\n        opacity: 1;\n    }\n\n    .toggleButton.closed {\n        transform: rotate(0deg);\n    }\n\n    .toggleButton path {\n        fill: var(--color-white);\n    }\n\n    .typeIcon {\n        margin-right: 9px;\n        margin-left: -4px;\n    }\n\n    .typeIcon path {\n        fill: var(--color-white);\n    }\n\n    .typeIcon rect {\n        stroke: var(--color-white);\n    }\n\n    .title {\n        display: block;\n        verticalAlign: middle;\n    }\n\n    .titleField {\n        background-color: #b1b1b1;\n        position: absolute !important;\n        display: inline-block;\n        margin-left: ${30 * (self.data.depth - 1)}px;\n        top: 4px;\n        left: 32px;\n        width: auto !important;\n        padding: 9px !important;\n        verticalAlign: middle;\n        fontWeight: bold;\n        border: 0;\n        outline: none;\n        z-index: 1;\n    }\n\n    .UILGraphNodeMenu {\n        position: absolute;\n        right: 0;\n    }\n\n    .visibilityButton {\n    }\n\n    .UILGraphGroupChildren {\n        overflow: hidden;\n        margin-top: -4px;\n    }\n\n`,
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

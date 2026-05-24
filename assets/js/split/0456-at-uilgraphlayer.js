/*
 * UILGraphLayer — leaf node in the graph tree. Renders a
 * row with line-elbow connector (suppressed at depth 0),
 * drop target, type icon, title, and node-menu. Right-
 * click opens UILGraph.LAYER_TYPE (or SPECIAL_TYPE when
 * data.special) context. data.locked toggles
 * pointerEvents:none + disables dragging. Double-click on
 * the header opens inline rename input (Enter commits +
 * fires UILGraphNode.RENAMED; Escape cancels).
 *
 * Standard Fragment plumbing.
 */
Class(function UILGraphLayer(_data, _index, _params) {
  const self = this;
  Inherit(self, ViewStateElement);
  Inherit(self, Element);
  Inherit(self, DragAndDrop);
  Inherit(self, XComponent);
  self.fragName = 'UILGraphLayer';
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
          click: '$onClick',
          _type: 'div',
          refName: 'wrapper',
          children: [
            {
              _type: 'div',
              refName: 'line',
              children: [],
            },
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
              tabIndex: 1,
              _type: 'a',
              refName: 'header',
              children: [
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
                      _innerText: '$data.titleString',
                      refName: 'titleInner',
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
                  type: 'layer',
                  data: '$data',
                  _type: 'UILGraphNodeMenu',
                  refName: 'nodemenu',
                  children: [],
                },
              ],
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
    function onKey(event) {
      return 'enter' == event.key.toLowerCase()
        ? (function onTitleValidate(event) {
            (function rename(name) {
              let previousName = self.data.name;
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
      self.data.special ||
        (self.titleField.show(), self.titleField.div.focus(), self.titleField.div.select());
    }
    function hideTitleEditor() {
      self.titleField.hide();
    }
    function openContextMenu(e) {
      e.preventDefault();
      self.set('UIL/ContextMenu', {
        layoutId: self.params.layoutId,
        targetId: self.data.id,
        parentId: self.data.parentId?.split(`sl_${self.data.scene}_`)[1],
        name: self.data.name,
        type: self.data.special ? UILGraph.SPECIAL_TYPE : UILGraph.LAYER_TYPE,
        isStageLayout: self.data.isStageLayout,
      });
    }
    self.data.titleString = self.data.label || self.data.name;
    self.titleField.hide();
    self.data.special && (self.typeIcon.hide(), self.dropTarget.hide(), self.setDragEnabled(false));
    self.data.locked &&
      (self.wrapper.css({
        pointerEvents: 'none',
      }),
      self.data.special || self.setDragEnabled(false));
    (function addHandlers() {
      self.header.div.addEventListener('contextmenu', openContextMenu);
      self.header.div.addEventListener('dblclick', showTitleEditor, false);
      self.titleField.div.addEventListener('keyup', onKey, false);
      self.titleField.div.addEventListener('blur', hideTitleEditor, false);
    })();
    self.bind(self.data, 'locked', (value) => {
      self.wrapper.css({
        pointerEvents: value ? 'none' : 'auto',
      });
      self.data.special || self.setDragEnabled(!value);
    });
    self.onDrop = function (dropId) {
      self.fire('UILGraph/MoveNode', {
        moveId: dropId,
        targetId: self.data.id,
        type: 'before',
      });
    };
    self.wrapper.classList()[self.data.focused ? 'add' : 'remove']('focused');
    self.bind(self.data, 'focused', (val) => {
      self.wrapper?.classList()[val ? 'add' : 'remove']('focused');
    });
    'UILGraphLayout' == self.parent.parent.fragName
      ? self.line.hide()
      : self.line.size(25, 25).html(UILGraphLayout.LINE_ELBOW).css({
          left: 12,
          top: 2,
          position: 'absolute',
        });
    self.onMounted = function () {
      self.element.div.classList.add('UILGraphNode');
      self.header.css({
        paddingLeft: 32 * self.data.depth + 'px',
      });
    };
    self.onClick = function () {
      self.fire(`UIL/${self.params.layoutId}/UILGraph/node/focused`, self.data.id);
    };
    self.element.goob(
      `\n    position: relative;\n    height: auto;\n    width: 100%;\n    cursor: grab;\n\n    & > .wrapper {\n        width: 100%;\n        border: 1px solid transparent;\n        transition: border-color 200ms, background-color 200ms;\n\n    }\n\n    & > .wrapper:hover {\n        border: 1px solid #1A6DEA;\n    }\n\n    & > .wrapper:active {\n        cursor: grabbing !important;\n    }\n\n    & > .wrapper.focused {\n        background-color: #1A6DEA;\n    }\n\n    & > .wrapper.focused:hover {\n        border: 1px solid transparent;\n    }\n\n    & > .wrapper.dragging {\n        background-color: transparent;\n    }\n\n    & > .wrapper.dragging:hover {\n        border: 1px solid #1A6DEA;\n    }\n\n\n    & > .wrapper.focused.dragging {\n        background-color: transparent;\n    }\n\n    & > .wrapper.focused.dragging:hover {\n        border: 1px solid #1A6DEA;\n    }\n\n    .header {\n        color: var(--color-white);\n        display: flex;\n        flex-direction: row;\n        align-items: center;\n        width: 100%;\n        height: auto;\n        outline: none;\n        padding: 9px;\n        padding-left: 0;\n        box-sizing: border-box;\n        user-select: none;\n        padding-left: 32px;\n    }\n\n    .typeIcon {\n        height: 8px;\n        width: 8px;\n        border: 1px solid #737373;\n        margin-left: 0 !important;\n        margin-right: 9px;\n    }\n\n    .UILGraphNodeMenu {\n        position: absolute;\n        right: 0;\n    }\n\n    .title {\n        display: block;\n        verticalAlign: middle;\n    }\n\n    .titleField {\n        background-color: #b1b1b1;\n        position: absolute !important;\n        display: inline-block;\n        margin-left: ${28 * (self.data.depth - 1)}px;\n        top: 2px;\n        left: 36px;\n        width: auto !important;\n        padding: 8px !important;\n        verticalAlign: middle;\n        fontWeight: bold;\n        border: 0;\n        outline: none;\n        z-index: 1;\n    }\n\n    & > .wrapper > .dropTarget {\n        margin-left: ${32 * (self.data.depth - 1)}px;\n    }\n\n`,
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

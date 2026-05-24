/*
 * UILGraphContextMenu — single right-click menu rendered
 * once into <body>. State key 'UIL/ContextMenu' carries
 * {layoutId,targetId,type,...}; the bind() handler filters
 * _sourceButtonsData by the clicked node's type, then
 * positions the panel near Mouse with edge-clamping (160w
 * × 75h) and respects the sidebar tab content scrollTop.
 *
 * Special-case predicates allow CINEMA / FIGMA entries to
 * appear conditionally (e.g. CINEMA only when targetId is
 * 'Config').
 *
 * Static section publishes the action-name string
 * constants consumed by UILGraphLayout/Group handlers.
 *
 * Standard Fragment plumbing.
 */
Class(
  function UILGraphContextMenu(_params, ...restArgs) {
    const self = this;
    Inherit(self, Element);
    Inherit(self, XComponent);
    self.fragName = 'UILGraphContextMenu';
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
                _type: 'div',
                refName: 'buttons',
                children: [
                  {
                    view: 'UILGraphContextMenuButton',
                    data: '$buttonsData',
                    _type: 'ViewState',
                    refName: 'unnamed',
                    children: [],
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
      const {
          LAYOUT_TYPE: LAYOUT_TYPE,
          STAGE_LAYOUT_TYPE: STAGE_LAYOUT_TYPE,
          GROUP_TYPE: GROUP_TYPE,
          LAYER_TYPE: LAYER_TYPE,
          SPECIAL_TYPE: SPECIAL_TYPE,
        } = UILGraph,
        {
          ACTION: ACTION,
          DELETE: DELETE,
          COPY_LAYOUT: COPY_LAYOUT,
          PASTE_LAYOUT: PASTE_LAYOUT,
          ADD_LAYER: ADD_LAYER,
          COPY_LAYER: COPY_LAYER,
          PASTE_LAYER: PASTE_LAYER,
          DUPLICATE_LAYER: DUPLICATE_LAYER,
          CINEMA: CINEMA,
          FIGMA: FIGMA,
          ADD_GROUP: ADD_GROUP,
          DUPLICATE_GROUP: DUPLICATE_GROUP,
        } = UILGraphContextMenu,
        _sourceButtonsData = [
          {
            label: 'Add Layer',
            uilContexts: [GROUP_TYPE, STAGE_LAYOUT_TYPE, LAYOUT_TYPE],
            action: ADD_LAYER,
          },
          {
            label: 'Copy Layer',
            uilContexts: [LAYER_TYPE],
            action: COPY_LAYER,
          },
          {
            label: 'Paste Layer',
            uilContexts: [LAYOUT_TYPE, GROUP_TYPE, LAYER_TYPE],
            action: PASTE_LAYER,
          },
          {
            label: 'Duplicate Layer',
            uilContexts: [STAGE_LAYOUT_TYPE, LAYER_TYPE],
            action: DUPLICATE_LAYER,
          },
          {
            label: 'Add Group',
            uilContexts: [LAYOUT_TYPE, GROUP_TYPE],
            action: ADD_GROUP,
          },
          {
            label: 'Duplicate Group',
            uilContexts: [GROUP_TYPE, STAGE_LAYOUT_TYPE],
            action: DUPLICATE_GROUP,
          },
          {
            label: 'Copy Layout',
            uilContexts: [LAYOUT_TYPE],
            action: COPY_LAYOUT,
          },
          {
            label: 'Paste Layout',
            uilContexts: [LAYOUT_TYPE],
            action: PASTE_LAYOUT,
          },
          {
            label: 'Apply Figma Config',
            uilContexts: [],
            action: FIGMA,
          },
          {
            label: 'Delete',
            uilContexts: [GROUP_TYPE, STAGE_LAYOUT_TYPE, LAYER_TYPE],
            action: DELETE,
          },
        ],
        specialCases = {};
      specialCases[CINEMA] = [() => 'Config' == self.get('UIL/ContextMenu').targetId];
      specialCases[FIGMA] = [() => self.get('UIL/ContextMenu').targetId.endsWith('Root')];
      self.buttonsData = new StateArray([]);
      self.offset = {};
      self.element.hide();
      window.addEventListener('click', () => self.set('UIL/ContextMenu', null));
      self.bind('UIL/ContextMenu', (openContext) => {
        if (!openContext)
          return (function hideContextMenu() {
            return (self.element.mouseEnabled(false), self.element.hide());
          })();
        !(function filterButtons(context) {
          if (!context) return;
          self.buttonsData.refresh(
            JSON.parse(JSON.stringify(_sourceButtonsData)).filter(
              (b) =>
                b.uilContexts.includes(context.type) ||
                (specialCases[b.action] &&
                  specialCases[b.action].map((fn) => fn()).reduce((a, b) => a() || b())),
            ),
          );
        })(openContext);
        (function positionAndShowContextMenu() {
          const margin = 7;
          let x = Mouse.x + margin - self.offset.x;
          x > Stage.width - 160 && (x = Mouse.x - 160 - margin - self.offset.x);
          let y = Mouse.y + margin - self.offset.y;
          y > Stage.height - 75 && (y = Mouse.y - 75 - margin - self.offset.y);
          y += UIL.global.element.div.querySelector('.UILTabsContentItem').scrollTop;
          self.element.transform({
            x: x,
            y: y,
          });
          self.element.show();
        })();
        self.element.mouseEnabled(true);
      });
      self.setOffset = ({ x: x, y: y }) =>
        (self.offset = {
          x: x,
          y: y,
        });
      self.element.goob(
        '\n    position: absolute;\n    width: auto;\n    height: auto;\n    padding-top: 10px;\n    padding-bottom: 10px;\n    color: black;\n    background-color: #303030;\n    border-radius: 12px;\n    line-height: 2px;\n    overflow: hidden;\n    user-select: none;\n    z-index: 999999;\n',
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
  '',
  () => {
    UILGraphContextMenu.ACTION = 'uilgraph_action';
    UILGraphContextMenu.DELETE = 'uilgraph_delete';
    UILGraphContextMenu.COPY_LAYOUT = 'uilgraph_copy_layout';
    UILGraphContextMenu.PASTE_LAYOUT = 'uilgraph_paste_layout';
    UILGraphContextMenu.ADD_LAYER = 'uilgraph_add_layer';
    UILGraphContextMenu.COPY_LAYER = 'uilgraph_copy_layer';
    UILGraphContextMenu.PASTE_LAYER = 'uilgraph_paste_layer';
    UILGraphContextMenu.DUPLICATE_LAYER = 'uilgraph_duplicate_layer';
    UILGraphContextMenu.CINEMA = 'uilgraph_cinema';
    UILGraphContextMenu.FIGMA = 'uilgraph_figma';
    UILGraphContextMenu.ADD_GROUP = 'uilgraph_add_group';
    UILGraphContextMenu.DUPLICATE_GROUP = 'uilgraph_duplicate_group';
  },
);

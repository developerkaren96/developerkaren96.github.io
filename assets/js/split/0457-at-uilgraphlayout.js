/*
 * UILGraphLayout — root node for one scene-layout's graph.
 * Owns a UILGroupBridge that mirrors the underlying scene
 * graph; nodes are split into top-level (self.nodes) and
 * nested (inside group.children) by handleParentBinding,
 * which listens to each node's 'parent' state and
 * push/remove between collections automatically.
 *
 * Context-menu actions implemented here:
 *   DELETE / ADD_LAYER / ADD_GROUP / COPY_LAYER /
 *   COPY_LAYOUT (writes JSON {UIL_ID,layout,...} into the
 *   system clipboard for later paste) / CINEMA / FIGMA.
 *   DUPLICATE_*, PASTE_* are stubbed.
 *
 * Editor bridge: subscribes UILSocket.EDITOR_BRIDGE so an
 * external editor can create/delete/eval layers in this
 * layout by name. Eval intentionally `eval`s
 * `layer._sceneLayout.<code>` — privileged editor channel.
 *
 * Focused-node persistence: 'UILGraphLayoutFocused' +
 * 'UIL:<id>/Graph/focused' restored from Storage on 500ms
 * delay so the previously focused node re-highlights.
 *
 * Static section publishes the SVG icons (eye/eye-off,
 * lock/unlock, scene, group, arrow chevron, elbow line)
 * shared with sub-components.
 *
 * Standard Fragment plumbing.
 */
Class(
  function UILGraphLayout(_params, ...restArgs) {
    const self = this;
    Inherit(self, Element);
    Inherit(self, DragAndDrop);
    Inherit(self, XComponent);
    self.fragName = 'UILGraphLayout';
    self.contexts = 'Element,DragAndDrop';
    self.params = _params;
    self.args = arguments;
    this.isFragment = true;
    var _promises = [];
    (async function () {
      function createStateArray(array) {
        return new StateArray(array || []);
      }
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
                tabIndex: 1,
                _type: 'div',
                refName: 'header',
                children: [
                  {
                    _type: 'div',
                    refName: 'toggle',
                    children: [],
                  },
                  {
                    _type: 'div',
                    _innerText: '$params.name',
                    refName: 'title',
                    children: [],
                  },
                ],
              },
              {
                _type: 'div',
                refName: 'children',
                children: [
                  {
                    _type: 'div',
                    refName: 'viewstate',
                    children: [
                      {
                        view: '$determineView',
                        data: '$nodes',
                        layoutId: '$id',
                        bridge: '$groupBridge',
                        layoutInstance: '$layoutInstance',
                        _type: 'ViewState',
                        refName: 'layers',
                        children: [],
                      },
                    ],
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
      var _isOpen = false,
        _isFocused = false,
        _saveEnabled = false,
        _isGL = true === self.params.isGL,
        _layoutInstance = self.params.layoutInstance,
        _isStageLayout = _layoutInstance.isStageLayout;
      function handleParentBinding(node) {
        self.bind(node, 'parent', (val, prevValue) => {
          val
            ? self.groupBridge.groups.forEach((n) => {
                n.id.includes(val) &&
                  !n.children.includes(node) &&
                  (n.children.push(node),
                  self.nodes.remove(node),
                  1 == n.children.length && (node.sortIndex = 0));
              })
            : prevValue &&
              self.groupBridge.groups.forEach((n) => {
                n.id.includes(prevValue) &&
                  (n.children.remove(node),
                  self.nodes.push(node),
                  (node.sortIndex = self.nodes.length));
              });
        });
      }
      function addHandlers() {
        self.header.div.addEventListener('contextmenu', openContextMenu);
        self.bind(`UIL/${self.id}/UILGraph/node/focused`, handleNodeFocused);
        self.listen('GraphContextMenu/action', handleContextMenuAction);
        self.listen('UILGraph/MoveNode', handleMoveNode);
        self.events.sub(UILSocket.EDITOR_BRIDGE, onEditorBridgeMessage);
      }
      function handleMoveNode(e) {
        const find = (id) => {
          let found;
          return (
            self.groupBridge.all.forEach((node) => {
              node.id == id && (found = node);
            }),
            found
          );
        };
        let moveNode = find(e.moveId),
          targetNode = find(e.targetId);
        if (
          moveNode &&
          !(
            (moveNode.parent && moveNode.parent == targetNode?.parent) ||
            moveNode == targetNode ||
            (targetNode?.parent && moveNode.id.includes(targetNode.parent)) ||
            (targetNode?.children && moveNode.children)
          )
        ) {
          if ('end-of-list' == e.type) {
            if (targetNode) moveNode.parent = targetNode.id;
            else {
              let oldIndex = moveNode.sortIndex;
              self.nodes.forEach((node) => {
                node.sortIndex > oldIndex && (node.sortIndex -= 1);
              });
              moveNode.sortIndex = self.nodes.length - 1;
              moveNode.parent = null;
              self.nodes.sort((a, b) => a.sortIndex - b.sortIndex);
            }
          } else {
            if ('group' == moveNode.type && 'group' == targetNode?.type) return;
            if (targetNode?.parent)
              return (
                (moveNode.parent = targetNode.parent),
                self.fire('UILGraph/MoveNode', e),
                void healSort()
              );
            moveNode.parent = null;
            let oldIndex = moveNode.sortIndex;
            if (
              (self.nodes.forEach((node) => {
                node.sortIndex > oldIndex && (node.sortIndex -= 1);
              }),
              'before' == e.type)
            ) {
              let newIndex = targetNode.sortIndex;
              self.nodes.forEach((node) => {
                node.sortIndex >= newIndex && (node.sortIndex += 1);
              });
              moveNode.sortIndex = newIndex;
            }
            self.nodes.sort((a, b) => a.sortIndex - b.sortIndex);
          }
          healSort();
          self.set(`UIL/${self.id}/UILGraph/node/focused`, e.moveId);
        }
      }
      function healSort() {
        let lastIndex = -1;
        self.nodes.forEach((node) => {
          let delta = node.sortIndex - lastIndex;
          delta > 1 && (node.sortIndex -= delta - 1);
          lastIndex = node.sortIndex;
        });
      }
      async function onEditorBridgeMessage(e) {
        if (e.layout && e.layout === self.name) {
          if ('create' == e.action) {
            let layer = await _layoutInstance._createLayer(null);
            await self.wait(100);
            self.events.fire(UILGraphLayout.BRIDGE_CREATE, {
              layoutName: _layoutInstance.name,
              layerName: layer._sceneLayout.name,
              newName: e.layerName,
            });
          }
          if ('delete' == e.action) {
            let node = find(e.layerName);
            _layoutInstance._deleteLayer(node.id, e.layerName, true) && self.remove(node, true);
          }
          if ('eval' == e.action) {
            let layer = await _layoutInstance.getLayer(e.layerName);
            eval('layer._sceneLayout.' + e.code);
          }
        }
      }
      function openContextMenu(e) {
        e.preventDefault();
        self.set('UIL/ContextMenu', {
          layoutId: self.id,
          targetId: self.id,
          type: _isStageLayout ? UILGraph.STAGE_LAYOUT_TYPE : UILGraph.LAYOUT_TYPE,
          isStageLayout: _isStageLayout,
        });
      }
      async function handleContextMenuAction(event) {
        const context = self.get('UIL/ContextMenu');
        if (context && context.layoutId == self.id)
          switch (event) {
            case UILGraphContextMenu.DELETE:
              let foundNode;
              if (
                (self.nodes.forEach((node) => {
                  node.id == context.targetId && (foundNode = node);
                }),
                foundNode && !foundNode.parent)
              ) {
                self.groupBridge.deleteNode(foundNode) &&
                  (self.nodes.remove(foundNode),
                  self.nodes.forEach((node) => {
                    node.sortIndex > foundNode.sortIndex && (node.sortIndex -= 1);
                  }),
                  self.nodes.length &&
                    self.set(`UIL/${self.id}/UILGraph/node/focused`, self.nodes[0].id));
              }
              healSort();
              break;
            case UILGraphContextMenu.ADD_LAYER:
              {
                self.groupBridge.createLayer();
                let newNode = self.groupBridge.layers[self.groupBridge.layers.length - 1];
                handleParentBinding(newNode);
                self.nodes.push(newNode);
                context.targetId &&
                  context.targetId != self.id &&
                  (newNode.parent = 'group' + context.targetId.split('_group')[1]);
                healSort();
              }
              break;
            case UILGraphContextMenu.ADD_GROUP:
              {
                self.groupBridge.createGroup();
                let newNode = self.groupBridge.groups[self.groupBridge.groups.length - 1];
                handleParentBinding(newNode);
                self.nodes.push(newNode);
                healSort();
              }
              break;
            case UILGraphContextMenu.COPY_LAYER:
              var dataToCopy = {
                UIL_ID: window.UIL_ID,
                layout: context.layoutId,
                layer: self.params.id || `${self.params.name}-${self.params.uniq}`,
                location: window.location.pathname.split('/').filter(Boolean)[0],
              };
              if (window.Platform && Router) {
                const world = await Platform.getRoute(Router.getStateString());
                dataToCopy.world = world;
              }
              navigator.clipboard.writeText(JSON.stringify(dataToCopy));
              break;
            case UILGraphContextMenu.COPY_LAYOUT:
              dataToCopy = {
                UIL_ID: window.UIL_ID,
                layout: context.layoutId,
                location: window.location.pathname.split('/').filter(Boolean)[0],
              };
              if (window.Platform && Router) {
                const world = await Platform.getRoute(Router.getStateString());
                dataToCopy.world = world;
              }
              navigator.clipboard.writeText(JSON.stringify(dataToCopy));
              break;
            case UILGraphContextMenu.DUPLICATE_LAYER:
            case UILGraphContextMenu.DUPLICATE_GROUP:
              break;
            case UILGraphContextMenu.CINEMA:
              applyCinemaConfig();
              break;
            case UILGraphContextMenu.FIGMA:
              applyFigmaConfig();
              break;
            case UILGraphContextMenu.PASTE_LAYER:
              return alert('The Paste Layer feature is not yet implemented.');
            case UILGraphContextMenu.PASTE_LAYOUT:
              return alert('The Paste Layout feature is not yet implemented.');
          }
      }
      function handleNodeFocused(val) {
        let focusedNode;
        self.nodes.forEach((node) => {
          node.focused = val == node.id;
          node.focused && (focusedNode = node);
        });
        focusedNode &&
          (UIL.sidebar.toolbar.filterSingle(val),
          Storage.set(`UIL:${self.id}/Graph/focused`, val),
          Storage.set('UILGraphLayoutFocused', self.id),
          self.set('UILGraphLayoutFocused', self.id),
          self.events.fire(UILGraphNode.FOCUSED, {
            name: focusedNode.name,
            layoutInstance: _layoutInstance,
          }));
      }
      self.id = self.params.id || `${self.params.name.toLowerCase()}-${self.params.uniq}`;
      self.layoutInstance = _layoutInstance;
      self.attachmentId = `${self.params.name}-${self.params.uniq}`;
      self.addSpecial =
        self.addLayer =
        self.addGroup =
        self.syncVisibility =
        self.syncGroupNames =
        self.open =
          (_) => {};
      self.groupBridge = await UILGroupBridge.createSceneLayout(_layoutInstance.name);
      self.determineView = (data) => ('group' == data.type ? UILGraphGroup : UILGraphLayer);
      self.setDragEnabled(false);
      self.nodes = createStateArray();
      self.groupBridge.all.forEach((node) => {
        handleParentBinding(node);
        node.parent || self.nodes.push(node);
      });
      addHandlers();
      self.delayedCall((_) => {
        Storage.get('UILGraphLayoutFocused') == self.id &&
          self.set(
            `UIL/${self.id}/UILGraph/node/focused`,
            Storage.get(`UIL:${self.id}/Graph/focused`),
          );
      }, 500);
      self.onDrop = function (dropId) {
        self.fire('UILGraph/MoveNode', {
          moveId: dropId,
          targetId: null,
          type: 'end-of-list',
        });
      };
      self.bind('UILGraphLayoutFocused', (id) => {
        id != self.id &&
          self.groupBridge.all.forEach((node) => {
            node.focused = false;
          });
      });
      self.element.goob(
        '\n    position: relative;\n    width: 100%;\n    height: auto;\n    font-family: sans-serif;\n    font-size: 11px;\n\n    & > .wrapper {\n        background-color: #161616;\n    }\n\n    .header {\n        width: 100%;\n        height: auto;\n        outline: none;\n        display: block;\n        padding: 4px;\n        box-sizing: border-box;\n        user-select: none;\n    }\n\n    .toggle {\n        position: relative;\n        width: 2px;\n        height: 2px;\n        fontSize: 9ps;\n        text-align: center;\n        display: inline-block;\n        vertical-align: middle;\n        border: 1px solid #b1b1b1;\n        border-radius: 50%;\n        margin-left: 2px;\n    }\n\n    .title {\n        display: inline-block;\n        vertical-align: middle;\n        marginLeft: 6px;\n    }\n\n    .children {\n        overflow: hidden;\n        transition: filter 0.1s linear;\n        filter: brightness(0.8);\n    }\n    .children:hover {\n        filter: brightness(1.0);\n    }\n\n    .lastPseudoLayer {\n        height: 8px;\n    }\n\n    .dropTarget {\n        position: relative;\n        height: 15px;\n        width: 100%;\n        margin-bottom: -15px;\n    }\n\n    .dropTarget .highlight {\n        width: 100%;\n        height: 6px;\n        background: #1A6DEA;\n        opacity: 0;\n        transition: opacity 200ms;\n    }\n\n    .dropTarget.hover .highlight{\n        opacity: 1;\n    }\n\n    & > .wrapper > .children > .dropTarget {\n        margin-bottom: 0;\n    }\n\n    .iconButton {\n        width: 16px;\n        height: 16px;\n        cursor: pointer;\n        transition: opacity 200ms;\n        stroke: var(--color-white);\n        fill: var(--color-white);\n        opacity: 0.6;\n        margin: 2px;\n    }\n    \n    .iconButton rect {\n        fill: var(--color-white);\n    }\n    \n    .iconButton:hover {\n        opacity: 1;\n    }\n',
      );
      self.onDestroy = (_) => {
        self.fire('UILGraphLayout/destroy', self.attachmentId);
      };
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
    UILGraphLayout.VISIBILE_ICON =
      '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">\n    <path d="M8 10C9.1046 10 10 9.1046 10 8C10 6.8954 9.1046 6 8 6C6.8954 6 6 6.8954 6 8C6 9.1046 6.8954 10 8 10Z" stroke-width="0.75" stroke-linecap="round" stroke-linejoin="round"/>\n    <path d="M14 8C12.7409 9.4955 10.4789 11 8 11C5.52113 11 3.25904 9.4955 2 8C3.53237 6.57913 5.32775 5 8 5C10.6723 5 12.4677 6.5791 14 8Z" stroke-width="0.75" stroke-linecap="round" stroke-linejoin="round"/>\n    </svg>';
    UILGraphLayout.INVISIBLE_ICON =
      '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">\n    <path d="M3 3L13 13" stroke-width="0.833333" stroke-linecap="round" stroke-linejoin="round"/>\n    <path d="M7.09535 7.32587C7.03396 7.47036 7 7.62933 7 7.79621C7 8.461 7.53893 8.99998 8.20377 8.99998C8.40481 8.99998 8.59434 8.9507 8.76095 8.86354" stroke-width="0.833333" stroke-linecap="round" stroke-linejoin="round"/>\n    <path d="M5.27945 6C4.40054 6.56451 3.66836 7.36877 3 8.12613C3.98694 9.55876 5.76015 11 7.70328 11C8.51324 11 9.29372 10.7496 10 10.3538" stroke-width="0.833333" stroke-linecap="round" stroke-linejoin="round"/>\n    <path d="M8 5C10.2269 5 11.7231 6.68437 13 8.2C12.8231 8.46896 12.6224 8.73824 12.4011 9" stroke-width="0.833333" stroke-linecap="round" stroke-linejoin="round"/>\n    </svg>';
    UILGraphLayout.LOCKED_ICON =
      '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">\n    <path d="M10.6667 8H11.6C11.8209 8 12 8.16788 12 8.375V12.625C12 12.8321 11.8209 13 11.6 13H4.4C4.17909 13 4 12.8321 4 12.625V8.375C4 8.16788 4.17909 8 4.4 8H5.33333M10.6667 8V5.5C10.6667 4.66667 10.1333 3 8 3C5.86667 3 5.33333 4.66667 5.33333 5.5V8M10.6667 8H5.33333" stroke-width="0.937501" stroke-linecap="round" stroke-linejoin="round"/>\n    <rect x="4" y="8" width="8" height="5" />\n    </svg>\n    ';
    UILGraphLayout.UNLOCKED_ICON =
      '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">\n    <path d="M10.6667 8H11.6C11.8209 8 12 8.16787 12 8.375V12.625C12 12.8321 11.8209 13 11.6 13H4.4C4.17909 13 4 12.8321 4 12.625V8.375C4 8.16787 4.17909 8 4.4 8H5.33333H10.6667ZM10.6667 8V5.5C10.6667 4.66667 10.1333 3 8 3C7.04247 3 6.40727 3.33577 5.99796 3.78125" stroke-width="0.750001" stroke-linecap="round" stroke-linejoin="round"/>\n    </svg>\n    \n    ';
    UILGraphLayout.SCENE_ICON =
      '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">\n    <path d="M13.0009 8.00124C13.0009 8.59111 12.8984 9.1589 12.7107 9.6841C12.3622 10.6588 11.7218 11.4931 10.8938 12.0814C10.0768 12.6618 9.07846 13.0025 8.00125 13.0025C6.92403 13.0025 5.92567 12.6618 5.10869 12.0814C4.28067 11.4931 3.63876 10.6588 3.29178 9.6841C3.1041 9.1589 3.00158 8.59111 3.00158 8.00124C3.00158 7.32936 3.13406 6.68745 3.37537 6.10232C3.77598 5.12446 4.47782 4.30275 5.36577 3.75074C6.12913 3.27443 7.03286 3 8.00125 3C8.96964 3 9.87178 3.27443 10.6367 3.75074C11.5247 4.30275 12.2265 5.12446 12.6271 6.10232C12.8684 6.68745 13.0009 7.32936 13.0009 8.00124Z" stroke-width="0.75" stroke-miterlimit="10"/>\n    <path d="M8.00129 3C8.96968 3 9.87183 3.27443 10.6368 3.75074C10.3339 3.82644 10.0217 3.88795 9.69992 3.93685C9.15421 4.02044 8.58485 4.0646 7.99972 4.0646C7.41458 4.0646 6.84522 4.02044 6.29951 3.93685C5.97935 3.88795 5.66706 3.82487 5.36267 3.75074C6.12918 3.27443 7.0329 3 8.00129 3Z" stroke-width="0.75" stroke-miterlimit="10"/>\n    <path d="M12.6271 6.10232C12.0419 6.25373 11.4221 6.37675 10.777 6.46822C9.89537 6.59282 8.96484 6.66064 8.00118 6.66064C7.03752 6.66064 6.10698 6.59282 5.22534 6.46822C4.58027 6.37675 3.96044 6.25373 3.37531 6.10232C3.77591 5.12446 4.47776 4.30275 5.36571 3.75074C6.12906 3.27443 7.03279 3 8.00118 3C8.96957 3 9.87172 3.27443 10.6366 3.75074C11.5246 4.30275 12.2264 5.12446 12.6271 6.10232Z" stroke-width="0.75" stroke-miterlimit="10"/>\n    <path d="M8.00116 13.0009C6.92394 13.0009 5.92559 12.6603 5.10861 12.0799C5.44139 11.9868 5.78522 11.9111 6.14166 11.8512C6.73626 11.7518 7.35925 11.6982 8.00116 11.6982C8.64307 11.6982 9.26764 11.7518 9.86066 11.8512C10.2155 11.9111 10.5609 11.9868 10.8937 12.0799C10.0767 12.6603 9.07837 13.0009 8.00116 13.0009V13.0009Z" stroke-width="0.75" stroke-miterlimit="10"/>\n    <path d="M12.7107 9.6841C12.3621 10.6588 11.7218 11.4931 10.8938 12.0814C10.0768 12.6618 9.07844 13.0025 8.00122 13.0025C6.92401 13.0025 5.92565 12.6618 5.10867 12.0814C4.28065 11.4931 3.63874 10.6588 3.29176 9.6841C3.88951 9.52638 4.52353 9.39863 5.18595 9.30242C6.08021 9.17309 7.02337 9.1037 8.00122 9.1037C8.97907 9.1037 9.92381 9.17309 10.8165 9.30242C11.4789 9.39705 12.1129 9.52638 12.7107 9.6841V9.6841Z" stroke-width="0.75" stroke-miterlimit="10"/>\n    <path d="M7.99971 13.0025C9.61028 13.0025 10.9159 10.7634 10.9159 8.00124C10.9159 5.23913 9.61028 3 7.99971 3C6.38913 3 5.0835 5.23913 5.0835 8.00124C5.0835 10.7634 6.38913 13.0025 7.99971 13.0025Z" stroke-width="0.75" stroke-miterlimit="10"/>\n    <path d="M7.99967 3V13.0009" stroke-width="0.75" stroke-miterlimit="10"/></svg>';
    UILGraphLayout.GROUP_ICON =
      '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">\n    <rect x="2.5" y="2.5" width="7" height="7" />\n    <path d="M14 14V6H11V11H6V14H14Z" />\n    </svg>';
    UILGraphLayout.ARROW_ICON =
      '<svg width="6" class="arrow" height="4" viewBox="0 0 6 4" fill="none" xmlns="http://www.w3.org/2000/svg">\n    <path d="M6 0L3 4L0 -2.62268e-07L6 0Z" />\n    </svg>';
    UILGraphLayout.LINE_ELBOW =
      '<svg fill="#aaaaaa" width="20px" height="22px" viewBox="0 0 256 256" id="Flat" xmlns="http://www.w3.org/2000/svg">\n    <path d="M210.82825,178.82861h-.00013l-48,48a3.99992,3.99992,0,0,1-5.65625-5.65722L198.34277,180H64a4.0002,4.0002,0,0,1-4-4V32a4,4,0,0,1,8,0V172H198.34277l-41.1709-41.17139a3.99992,3.99992,0,0,1,5.65625-5.65722l48,48h.00013a4.02834,4.02834,0,0,1,.49841.61035c.06543.09814.11047.20434.1665.30664a3.97146,3.97146,0,0,1,.20093.38183,3.91958,3.91958,0,0,1,.126.406c.03345.11377.07751.22266.10083.34033a4.01026,4.01026,0,0,1,0,1.5669c-.02332.11767-.06738.22656-.10083.34033a3.90157,3.90157,0,0,1-.126.406,3.94471,3.94471,0,0,1-.20093.38183c-.0559.1023-.10095.2085-.1665.30664A4.02834,4.02834,0,0,1,210.82825,178.82861Z"/>\n    </svg>';
  },
);

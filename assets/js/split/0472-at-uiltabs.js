/*
 * UILTabs — horizontal tabbed container used by the global
 * inspector panel. params is the StateArray of tab specs
 * ({id,label,content}). The header is a row of
 * UILTabsNavItems; the content section is one big strip of
 * UILTabsContentItems horizontally translated by
 * activeIndex × panel width (200ms easeOutCubic tween).
 *
 * historyButton at the bottom toggles the history slide-in
 * panel via 'toggle-history-panel'; its label tracks
 * 'UILPanel/historyPanelToggle' (History ⇄ Hide History).
 *
 * addGraph/addGlobalFolder route their argument into the
 * matching tab's content slot ('playground' / 'global').
 *
 * Standard Fragment plumbing.
 */
Class(function UILTabs(_params, ...restArgs) {
  const self = this;
  Inherit(self, Element);
  Inherit(self, XComponent);
  self.fragName = 'UILTabs';
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
          _type: 'header',
          refName: 'tabsHeader',
          children: [
            {
              _type: 'nav',
              refName: 'nav',
              children: [
                {
                  view: 'UILTabsNavItem',
                  data: '$state.tabsData',
                  _type: 'ViewState',
                  refName: 'unnamed',
                  children: [],
                },
              ],
            },
          ],
        },
        {
          _type: 'section',
          refName: 'tabsContent',
          children: [
            {
              view: 'UILTabsContentItem',
              data: '$state.tabsData',
              _type: 'ViewState',
              refName: 'unnamed',
              children: [],
            },
          ],
        },
        {
          click: '$handleHistoryClick',
          _type: 'button',
          refName: 'historyButton',
          children: [],
        },
      ],
    });
    self.params = _params;
    self.args = arguments;
    self.parent?.layers && (self.layers = self.parent.layers);
    self.layout?.getAllLayers && (self.layers = await self.layout.getAllLayers());
    self.ready = false;
    self.createState();
    self.state.set('tabsData', new StateArray(self.params));
    self.state.set('activeIndex', 0);
    self.state.set('historyLabel', 'History');
    self.state.bind('historyLabel', self.historyButton);
    self.onMounted = async () => {
      self.historyButton.hide();
      (function initListeners() {
        self.bindState(self.state, 'activeIndex', (value) => {
          !(function updateActiveTab() {
            self.state.tabsData.forEach((tab, index) => {
              tab.active = self.state.activeIndex === index;
            });
            self.tabsContent.tween(
              {
                x: -self.element.div.offsetWidth * self.state.activeIndex,
              },
              200,
              'easeOutCubic',
            );
          })();
        });
        self.bind('UILPanel/historyPanelToggle', (value) => {
          value
            ? self.state.set('historyLabel', 'Hide History')
            : self.state.set('historyLabel', 'History');
        });
      })();
      self.element.attr(
        'style',
        `\n        --tab-content-width: 300px;\n        --tab-count: ${self.state.tabsData.length};\n    `,
      );
      self.ready = true;
    };
    self.listen('UILTabsNavItem/click', (event) => {
      self.state.tabsData.forEach((tab, index) => {
        tab.id === event.id && self.state.set('activeIndex', index);
      });
    });
    self.handleHistoryClick = () => {
      self.fire('toggle-history-panel');
    };
    self.setActiveTab = (index) => {
      self.state.set('activeIndex', index);
    };
    self.addTab = (tabData) => {};
    self.removeTab = (tabId) => {};
    self.setDisabledTab = (tabId) => {};
    self.setHiddenTab = (tabId) => {};
    self.addGraph = (graph) => {
      self.state.tabsData.find((tab) => 'playground' === tab.id).content = graph;
    };
    self.addGlobalFolder = (folder) => {
      self.state.tabsData.find((tab) => 'global' === tab.id).content = folder;
    };
    self.showHistoryButton = async () => {
      await self.wait(() => self.ready);
      await defer();
    };
    self.element.goob(
      '\n    & {\n        box-sizing: border-box;\n        color: #fff;\n        width: 100%;\n        height: 100%;\n        overflow: hidden;\n        position: relative;\n    }\n\n    .tabsHeader {\n        background-color: var(--panel-background-color);\n        border-bottom: var(--border);\n        font: var(--label3-semi);\n    }\n    \n    .nav {\n        display: flex;\n        width: 100%;\n    }\n\n    .tabsContent {\n        display: flex;\n        width: calc(var(--tab-content-width) * var(--tab-count));\n        height: 100%;\n\n        .UILPanel.global & {\n            height: calc(100% - 39px);\n        }\n    }\n\n    .UILTabsContentItem {\n        width: var(--tab-content-width);\n    }\n\n    .historyButton {\n        background-color: var(--color-neutral-20);\n        border: none;\n        color: var(--color-neutral-70);\n        border-radius: 0;\n        width: 100%;\n        text-align-last: left;\n        position: absolute;\n        bottom: 0;\n        left: 0;\n        padding: var(--spacing-small);\n\n        &:hover {\n            color: var(--color-white);\n        }\n    }\n',
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

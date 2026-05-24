/*
 * UILHistoryPaginationControls — pagination nav strip:
 * '<' previous arrow, the dynamic list of
 * UILHistoryPaginationButtons (from parent.paginatedData),
 * and '>' next arrow. Previous/next click forward to
 * parent.updatePaginationIndex(currentPageIndex ± 1).
 *
 * Standard Fragment plumbing.
 */
Class(function UILHistoryPaginationControls(_data, _index, _params) {
  const self = this;
  Inherit(self, Element);
  Inherit(self, ViewStateElement);
  Inherit(self, XComponent);
  self.fragName = 'UILHistoryPaginationControls';
  self.contexts = 'Element,ViewStateElement';
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
          className: 'pagination',
          _type: 'nav',
          refName: 'unnamed',
          children: [
            {
              href: '#',
              click: '$handlePreviousClick',
              _type: 'a',
              _innerText: '$state.previousLabel',
              refName: 'btn',
              children: [],
            },
            {
              _type: 'div',
              refName: 'paginationBtnWrapper',
              children: [
                {
                  data: '$parent.paginatedData',
                  view: 'UILHistoryPaginationButton',
                  _type: 'ViewState',
                  refName: 'unnamed',
                  children: [],
                },
              ],
            },
            {
              href: '#',
              click: '$handleNextClick',
              _type: 'a',
              _innerText: '$state.nextLabel',
              refName: 'btn',
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
    self.createState();
    self.state.set('previousLabel', '<');
    self.state.set('nextLabel', '>');
    self.handlePreviousClick = () => {
      self.parent.updatePaginationIndex(self.parent.state.currentPageIndex - 1);
    };
    self.handleNextClick = () => {
      self.parent.updatePaginationIndex(self.parent.state.currentPageIndex + 1);
    };
    self.element.goob(
      '\n    & {\n        display: flex;\n        justify-content: center;\n        align-items: center;\n    }\n\n    .pagination,\n    .paginationBtnWrapper {\n        display: flex;\n        justify-content: center;\n        align-items: center;\n        gap: calc(var(--spacing-small) / 2);\n    }\n\n    .pagination {\n        background-color: var(--color-neutral-20);\n        justify-content: space-between;\n        padding: var(--spacing-small);\n        width: 100%;\n        overflow-x: auto;\n    }\n\n    .btn {\n        background-color: transparent;\n        color: var(--color-white);\n        border-radius: 4px;\n        display: block;\n        font: var(--label3-simi);\n        line-height: 1;\n        text-decoration: none;\n        padding: calc(var(--spacing-small) / 4) calc(var(--spacing-small) / 2);\n\n        &.active {\n            background-color: var(--color-action);\n        }\n    }\n',
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

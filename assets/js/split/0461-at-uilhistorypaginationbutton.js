/*
 * UILHistoryPaginationButton — single page number in the
 * pagination strip. calculateDisplay() decides whether
 * this button should render based on currentPageIndex,
 * pageCount and maxButtonCount (default 7): the first and
 * last pages are always shown, plus a sliding window
 * around the current page; outliers get replaced by '...'
 * ellipsis buttons (rendered with .disabled class so they
 * don't take pointer-events). Listens for
 * 'UILHistoryTab/updatePaginationIndex' to recompute.
 *
 * Standard Fragment plumbing.
 */
Class(function UILHistoryPaginationButton(_data, _index, _params) {
  const self = this;
  Inherit(self, Element);
  Inherit(self, ViewStateElement);
  Inherit(self, XComponent);
  self.fragName = 'UILHistoryPaginationButton';
  self.contexts = 'Element,ViewStateElement';
  self.data = _data;
  self.index = _index;
  self.params = _params;
  this.isFragment = true;
  var _promises = [];
  !(async function () {
    function calculateDisplay() {
      let {
        pageCount: pageCount,
        maxButtonCount: maxButtonCount,
        index: index,
      } = self.data.toJSON();
      if (((pageCount -= 1), !(pageCount <= 0 || pageCount <= maxButtonCount - 1))) {
        if (
          ((self.visibleButtonIndexes = [0, pageCount]),
          (0 === self.currentPageIndex && self.currentPageIndex === pageCount) ||
            self.visibleButtonIndexes.push(self.currentPageIndex),
          pageCount > maxButtonCount &&
            (1 === index && self.currentPageIndex > 1 ? setEllipsis('start') : removeEllipsis(),
            index === pageCount - 1 && self.currentPageIndex <= pageCount - 2
              ? setEllipsis('end')
              : removeEllipsis()),
          (self.visibleButtonIndexes = [...new Set(self.visibleButtonIndexes)]),
          self.visibleButtonIndexes.length < maxButtonCount)
        ) {
          let fillButtonCount = maxButtonCount - self.visibleButtonIndexes.length;
          if (self.currentPageIndex <= Math.ceil(pageCount / 2))
            for (let i = 0; i < fillButtonCount; i++) {
              self.visibleButtonIndexes.push(self.currentPageIndex + (i + 1));
              fillButtonCount--;
            }
          else if (self.currentPageIndex >= Math.floor(pageCount / 2))
            for (let i = 0; i < fillButtonCount; i++) {
              self.visibleButtonIndexes.push(self.currentPageIndex - (i + 1));
              fillButtonCount--;
            }
        }
        self.hidden = !self.visibleButtonIndexes.includes(index);
      }
    }
    function setEllipsis(position) {
      const indexes = {
        start: 1,
        end: self.data.pageCount - 2,
      };
      self.data.label = '...';
      self.btn.classList().add('disabled');
      self.visibleButtonIndexes.push(indexes[position]);
    }
    function removeEllipsis() {
      self.btn.classList().remove('disabled');
    }
    function setActive(value) {
      value ? self.btn.classList().add('active') : self.btn.classList().remove('active');
    }
    function setDisplay() {
      self.hidden
        ? self.element.classList().add('hidden')
        : self.element.classList().remove('hidden');
    }
    self.element && (self.element.onMountedHook = (_) => self.onMounted?.());
    self.initClass(FragUIHelper, {
      _type: 'UI',
      refName: 'unnamed',
      children: [
        {
          href: '#',
          click: '$handleClick',
          _type: 'a',
          _innerText: '$data.label',
          refName: 'btn',
          children: [],
        },
      ],
    });
    self.data = _data;
    self.index = _index;
    self.params = _params;
    self.createState();
    self.parent?.layers && (self.layers = self.parent.layers);
    self.layout?.getAllLayers && (self.layers = await self.layout.getAllLayers());
    self.currentPageIndex = self.data.currentPageIndex;
    self.visibleButtonIndexes = [];
    self.hidden = false;
    calculateDisplay();
    setDisplay();
    setActive(self.data.active);
    self.onInit = () => {
      !(function initListeners() {
        self.listen('UILHistoryTab/updatePaginationIndex', (value) => {
          console.log('value: ', value);
          self.currentPageIndex = value;
          calculateDisplay();
          setDisplay();
        });
      })();
    };
    self.data.bind('active', (value) => {
      setActive(value);
    });
    self.handleClick = () => {
      self.data.callback(self.data.index);
    };
    self.element.goob(
      "\n    & {\n        display: inline-block;\n        \n        &.hidden {\n            display: none;\n        }\n    }\n\n    .btn {\n        display: flex;\n        align-items: center;\n        justify-content: center;\n        min-width: 26px;\n\n        &.disabled {\n            pointer-events: none;\n        }\n    }\n\n    .has-first-ellipsis {\n        &:after {\n            content: '...';\n        }\n    }\n\n    .has-last-ellipsis {\n        &:before {\n            content: '...';\n        }\n    }\n",
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

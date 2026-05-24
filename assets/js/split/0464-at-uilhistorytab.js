/*
 * UILHistoryTab — two-pane history viewer for the
 * inspector. Left pane lists days (UILHistoryDay) grouped
 * by 'Mon DD'; selecting a day slides both panes left
 * 100% to reveal the right pane: a header (back arrow +
 * date), the day's records (UILHistoryRecord, paginated
 * 20/page), and a UILHistoryPaginationControls footer.
 *
 * Data flow:
 *   UILStorage.getHistory(actorId) → groupByDay → self.history
 *   day dropdown clicks → onSelectDay → recordsData.refresh
 *   paginated into self.paginatedData (StateArray of pages)
 *   activePageData = paginatedData[currentPageIndex].items.
 *
 * UILStorage.getUsers() resolves actor names against the
 * actor id stored in each change record.
 *
 * Static section seeds UILHistoryTab.arrowLeftIcon SVG
 * used by the back button.
 *
 * Standard Fragment plumbing.
 */
Class(
  function UILHistoryTab(_params, ...restArgs) {
    const self = this;
    Inherit(self, Element);
    Inherit(self, XComponent);
    self.fragName = 'UILHistoryTab';
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
            className: 'history__panel days__body',
            _type: 'div',
            refName: 'dayPanel',
            children: [
              {
                data: '$dayData',
                view: 'UILHistoryDay',
                _type: 'ViewState',
                refName: 'unnamed',
                children: [],
              },
            ],
          },
          {
            className: 'history__panel records',
            _type: 'div',
            refName: 'recordsPanel',
            children: [
              {
                className: 'records__header',
                _type: 'header',
                refName: 'unnamed',
                children: [
                  {
                    className: 'records__back',
                    _type: 'div',
                    refName: 'recordsBack',
                    children: [],
                  },
                  {
                    className: 'records__date',
                    _type: 'h3',
                    _innerText: 'Date',
                    refName: 'recordsDateLabel',
                    children: [],
                  },
                ],
              },
              {
                className: 'records__body',
                _type: 'div',
                refName: 'unnamed',
                children: [
                  {
                    data: '$activePageData',
                    view: 'UILHistoryRecord',
                    _type: 'ViewState',
                    refName: 'unnamed',
                    children: [],
                  },
                ],
              },
              {
                _type: 'footer',
                refName: 'footer',
                children: [
                  {
                    data: '$paginatedData',
                    _type: 'UILHistoryPaginationControls',
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
      const dayDataId = self.params?.actorId ? `${self.params.actorId}-days` : 'days',
        recordsDataId = self.params?.actorId ? `${self.params.actorId}-records` : 'records';
      function paginateRecords(data, recordsPerPage = 20, maxButtonCount = 7) {
        const result = [],
          pageCount = Math.ceil(data.length / recordsPerPage);
        pageCount <= 1
          ? self.footer.classList().add('hidden')
          : self.footer.classList().remove('hidden');
        for (let i = 0; i < pageCount; i++) {
          const start = i * recordsPerPage,
            end = start + recordsPerPage,
            pageItems = data.slice(start, end);
          result.push({
            currentPageIndex: self.state.currentPageIndex,
            pageCount: pageCount,
            maxButtonCount: maxButtonCount,
            active: i === self.state.currentPageIndex,
            index: i,
            label: `${i + 1}`,
            items: pageItems,
            callback: (activeIndex) => updatePaginationIndex(activeIndex),
          });
        }
        return result;
      }
      function updatePaginationIndex(activeIndex) {
        activeIndex < 0 ||
          activeIndex >= self.paginatedData.length ||
          (self.state.set('currentPageIndex', activeIndex),
          self.paginatedData.forEach((page, index) => {
            page.active = index === activeIndex;
          }),
          updateActivePageData());
      }
      function updateActivePageData() {
        self.paginatedData.refresh(paginateRecords(self.recordsData.toJSON()));
        self.activePageData.refresh(self.paginatedData[self.state.currentPageIndex].items);
      }
      function getTime(unixTimestamp) {
        const date = new Date(1e3 * unixTimestamp),
          hours = date.getHours(),
          minutes = date.getMinutes();
        return `${hours % 12 || 12}:${minutes < 10 ? '0' : ''}${minutes} ${hours >= 12 ? 'PM' : 'AM'}`;
      }
      self.history = (function getData() {
        const cleanHistory = UILStorage.getHistory(self.params?.actorId).map((item) => ({
          actorName: '',
          timeFormatted: getTime(item.change.time),
          ...item.change,
        }));
        return (function groupByDay(list) {
          let result = {};
          return (
            list.forEach((item) => {
              let date = (function formatDate(time) {
                const date = new Date(time),
                  monthNames = [
                    'Jan',
                    'Feb',
                    'Mar',
                    'Apr',
                    'May',
                    'Jun',
                    'Jul',
                    'Aug',
                    'Sep',
                    'Oct',
                    'Nov',
                    'Dec',
                  ],
                  monthIndex = date.getMonth(),
                  day = date.getDate();
                return `${monthNames[monthIndex]} ${day}`;
              })(1e3 * item.time);
              result[date] || (result[date] = []);
              result[date].push(item);
            }),
            result
          );
        })(cleanHistory);
      })();
      self.dayData = Data.request(dayDataId, () =>
        Object.entries(self.history)
          .map(([k, v]) => ({
            date: k,
            amount: `(${v.length})`,
          }))
          .reverse(),
      );
      self.recordsData = await Data.request(
        recordsDataId,
        () => self.history[Object.keys(self.history)[0]],
      );
      self.createState();
      self.state.set('currentPageIndex', 0);
      self.paginatedData = new StateArray(paginateRecords(self.recordsData.toJSON()));
      self.activePageData = new StateArray(self.paginatedData[self.state.currentPageIndex].items);
      self.onMounted = () => {
        !(function initListeners() {
          self.recordsBack.click(self.showDaysPanel);
        })();
      };
      self.onInit = async function () {
        !(async function setActorsName() {
          const actors = await UILStorage.getUsers();
          for (let key in self.history)
            self.history[key] = self.history[key].map((record) => {
              const actor = actors.find((a) => a.actorId === record.actor);
              return ((record.actorName = actor?.name || ''), record);
            });
        })();
        (function initHTML() {
          self.recordsBack.html(UILHistoryTab.arrowLeftIcon);
        })();
      };
      self.onSelectDay = (day) => {
        !(function updateRecordsData(day) {
          self.state.currentPageIndex = 0;
          self.recordsDateLabel.text(day);
          self.recordsData.refresh([...self.history[day]].reverse());
          updateActivePageData();
        })(day);
        (function showRecordsPanel() {
          self.dayPanel.tween(
            {
              x: '-100%',
            },
            500,
            'easeOutCubic',
          );
          self.recordsPanel.tween(
            {
              x: '-100%',
            },
            500,
            'easeOutCubic',
          );
        })();
      };
      self.updatePaginationIndex = updatePaginationIndex;
      self.showDaysPanel = function () {
        self.dayPanel.tween(
          {
            x: 0,
          },
          500,
          'easeOutCubic',
        );
        self.recordsPanel.tween(
          {
            x: 0,
          },
          500,
          'easeOutCubic',
        );
      };
      self.element.goob(
        '\n    & {\n        display: flex;\n        width: 100%;\n        height: 100%;\n        pointer-events: auto;\n        overflow: hidden;\n        padding-bottom: 40px;\n    }\n\n    .history {\n        &__panel {\n            width: 100%;\n            height: 100%;\n            flex-shrink: 0;\n            padding-bottom: 40px;\n        }\n    }\n\n    .days {\n        &__body {\n            height: 100%;\n            overflow: auto;\n        }\n    }\n\n    .records {\n        display: flex;\n        flex-direction: column;\n\n        &__header {\n            display: flex;\n            align-items: center;\n\n            border-bottom: 1px solid var(--color-neutral-40);\n        }\n\n        &__body {\n            flex-grow: 1;\n            overflow: auto;\n        }\n\n        &__back {\n            padding: 0.8125rem 1rem;\n\n            &:hover {\n                > svg { stroke: var(--font-color-base); }\n            }\n\n            > svg {\n                display: block;\n\n                stroke: var(--color-neutral-70);\n\n                transition: stroke 0.17s ease-in-out;\n            }\n        }\n\n        &__date {\n            flex-grow: 1;\n            margin: 0;\n            padding: 0.8125rem 1rem 0.8125rem 0;\n        }\n\n    }\n    \n    .footer {\n        position: absolute;\n        bottom: -1px;\n        width: 100%;\n\n        &.hidden {\n            display: none;\n        }\n    }\n',
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
  (_) => {
    UILHistoryTab.arrowLeftIcon =
      '\n        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">\n            <path d="M10 4L6 8L10 12" stroke-linecap="round" stroke-linejoin="round"/>\n        </svg>\n    ';
  },
);

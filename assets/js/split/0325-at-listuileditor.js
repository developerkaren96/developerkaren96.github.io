/*
 * ListUILEditor — pop-up panel for editing a ListUIL list. Built
 * as a 400px draggable `UILWindow` with two sections:
 *   - A sortable `UILFolder` of `ListUILItem` rows (0326), one
 *     per id in `UILStorage.get('${_id}_list_items')`.
 *   - An "Add Item" button.
 *
 * Item lifecycle:
 *   - `add()` creates a new `${_id}_${timestamp}` id, instantiates
 *     a `ListUILItem` row, pushes to `_items`, persists JSON.
 *   - On each item row, two events bubble up:
 *       - `Events.UPDATE` → `reorder(e)` reads the new sorted
 *         order (folder ids end in `_folder` so strip the suffix),
 *         saves to UILStorage, fires `template.onSort` callback.
 *       - `Events.END`    → `remove(e)` drops the id and rebuilds
 *         the list via `refresh()`.
 *   - `refresh()` rebuilds list + add button from scratch (used
 *     after structural changes so views aren't reused with stale
 *     indices).
 *
 * Lifecycle:
 *   - `gui.onClose = close` fires `Events.COMPLETE`, which
 *     ListUIL listens for to drop its `_panel` reference.
 *   - `onDestroy` tears the window down.
 *
 * Public `add()` exposes the same hook the button uses, so
 * external code can programmatically add an item (e.g. from a
 * drag-drop handler).
 */
Class(function ListUILEditor(_id, _name, _template) {
  Inherit(this, Component);
  const self = this,
    PANEL_CONFIG = {
      label: _name || 'List',
      width: '400px',
      height: 'auto',
      drag: true,
    };
  var _gui,
    _list,
    _add,
    _items,
    _tabs = [],
    _index = 0;
  function initList() {
    !(function read() {
      let data = UILStorage.get(`${_id}_list_items`);
      undefined === data && (data = '[]');
      _items = JSON.parse(data);
    })();
    (_list = new UILFolder(`${_id}_list`, {
      hideTitle: true,
    })).enableSorting(_id);
    _gui.add(_list);
    for (let id of _items) {
      let view = new ListUILItem(id, _list, _template, _index++);
      self.events.sub(view, Events.UPDATE, reorder);
      self.events.sub(view, Events.END, remove);
      _tabs.push(view);
    }
  }
  function initAdd() {
    !(function initButton(title, callback) {
      _add = new UILControlButton('button', {
        actions: [
          {
            title: title,
            callback: callback,
          },
        ],
        hideLabel: true,
      });
      _gui.add(_add);
    })('Add Item', add);
  }
  function add() {
    let id = `${_id}_${Utils.timestamp()}`,
      view = new ListUILItem(id, _list, _template, _index++);
    self.events.sub(view, Events.UPDATE, reorder);
    self.events.sub(view, Events.END, remove);
    _tabs.push(view);
    _items.push(id);
    write();
  }
  function reorder(e) {
    let order = [];
    for (let item of e.order) order.push(item.split('_folder')[0]);
    _items = order;
    _template().onSort(_items);
    write();
    self.events.fire(Events.UPDATE, {
      order: order,
    });
  }
  function close() {
    self.events.fire(Events.COMPLETE);
  }
  function remove(e) {
    _items.remove(e.id);
    write();
    refresh();
  }
  function write() {
    let data = JSON.stringify(_items);
    UILStorage.set(`${_id}_list_items`, data);
  }
  function refresh() {
    _index = 0;
    _list && _list.destroy && (_list = _list.destroy());
    _add && _add.destroy && (_add = _add.destroy());
    initList();
    initAdd();
  }
  !(function initPanel() {
    self.gui = _gui = new UILWindow(_id, PANEL_CONFIG);
    self.gui.onClose = close;
    UIL.add(_gui);
  })();
  refresh();
  this.onDestroy = function () {
    _gui.destroy();
  };
  this.add = function () {
    add();
  };
});

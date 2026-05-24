/*
 * TimelineUILEditor — pop-up panel for editing a TimelineUIL
 * timeline. 800px draggable `UILWindow` (twice the width of
 * ListUILEditor since timeline rows are wider). Each item is a
 * `TimelineUILItem` (0336) with a normalised 0..1 time value.
 *
 * Items list (from `UILStorage.get('${_id}_list_items')`):
 *   - Items are mounted into a `UILFolder` with `hideTitle:true`.
 *
 * Buttons:
 *   - "Add Item" (suppressed when `_config.lock`).
 *   - "Space Evenly" — `setValue(i / (N-1))` across all items.
 *   - Both buttons clamped to `width: 20%` so the surrounding
 *     timeline UI keeps its real estate.
 *
 * Rails mode (`_config.rails`):
 *   - Each item's `onUpdate` enforces monotonic ordering: any
 *     item moving past a neighbour's value drags the neighbour
 *     with it. Items with `j < i` get pinned to `t.value` when
 *     `t.value < that.value`, and symmetrically for `j > i`.
 *     This keeps the keyframe sequence sorted regardless of
 *     where the user grabs.
 *
 * Item lifecycle (mirrors ListUILEditor):
 *   - `Events.UPDATE` → `reorder(e)` strips the `_folder` suffix
 *     from each id, saves new order, fires `template.onSort`.
 *   - `Events.END`    → `remove(e)` drops id, persists, refreshes.
 *
 * `_config` is decoded from `UILStorage.get('${_id}_config')`
 * (JSON). `refresh()` is the full-rebuild path used after
 * structural changes.
 */
Class(function TimelineUILEditor(_id, _name, _template) {
  Inherit(this, Component);
  const self = this,
    PANEL_CONFIG = {
      label: 'Timeline Editor',
      width: '800px',
      height: 'auto',
      drag: true,
    };
  var _gui,
    _list,
    _add,
    _config,
    _items,
    _tabs = [],
    _index = 0;
  function initList() {
    !(function read() {
      let data = UILStorage.get(`${_id}_list_items`);
      undefined === data && (data = '[]');
      _items = JSON.parse(data);
    })();
    _list = new UILFolder(`${_id}_list`, {
      hideTitle: true,
    });
    _gui.add(_list);
    for (let id of _items) {
      let view = self.initClass(TimelineUILItem, id, _list, _template, _index++);
      self.events.sub(view, Events.UPDATE, reorder);
      self.events.sub(view, Events.END, remove);
      _tabs.push(view);
    }
    _config.rails &&
      (function attachRails() {
        _tabs.forEach((t, i) => {
          t.onUpdate = (v) => {
            _tabs.forEach((t2, j) => {
              t2 != t &&
                (j < i && t.getValue() < t2.getValue() && t2.setValue(t.getValue()),
                j > i && t.getValue() > t2.getValue() && t2.setValue(t.getValue()));
            });
          };
        });
      })();
  }
  function initButton(title, callback) {
    let btn = new UILControlButton('button', {
      actions: [
        {
          title: title,
          callback: callback,
        },
      ],
      hideLabel: true,
    });
    return (_gui.add(btn), btn);
  }
  function spaceEvenly() {
    _tabs.forEach((t, i) => {
      let perc = Math.range(i, 0, _tabs.length - 1, 0, 1);
      t.setValue(perc);
    });
  }
  function add() {
    let id = `${_id}_${Utils.timestamp()}`,
      view = new TimelineUILItem(id, _list, _template, _index++);
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
    (function initAdd() {
      _config.lock ||
        (_add = initButton('Add Item', add)).element.css({
          width: '20%',
        });
      initButton('Space Evenly', spaceEvenly).element.css({
        width: '20%',
      });
    })();
  }
  self.config = _config = JSON.parse(UILStorage.get(`${_id}_config`) || '{}');
  (function initPanel() {
    self.gui = _gui = new UILWindow(_id, PANEL_CONFIG);
    UIL.add(_gui);
  })();
  refresh();
  this.onDestroy = function () {
    _gui.destroy();
  };
});

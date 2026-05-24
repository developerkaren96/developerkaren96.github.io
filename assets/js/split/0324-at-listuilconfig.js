/*
 * ListUILConfig — backing config for a single ListUIL list.
 * Stores the list's item-id array in UILStorage and owns the
 * "Edit List" button that opens the pop-up ListUILEditor.
 *
 * Storage layout:
 *   - `LIST_${_id}_config`      — `{ version }` schema header,
 *     bumped via `updateConfig` whenever the caller passes a
 *     newer version.
 *   - `${_id}_list_items`       — JSON array of generated item
 *     IDs `${_id}_${timestamp}` (created by
 *     `internalAddItems(count)` when bulk seeding lists).
 *
 * UIL surface (only when `appendUILGroup(uil)` is called):
 *   - A collapsed `LIST_${_id}` folder containing one button
 *     "Edit List" → `edit()` → `ListUIL.openPanel(...)`.
 *   - Bubbles the editor's `Events.UPDATE` back through this
 *     config so listeners on the config see edits in real time.
 *   - Fires `ListUIL.OPEN` when the panel is opened.
 *
 * Template API:
 *   - `template(fn)`             — set/get the per-item template
 *     function (renders one row in the editor).
 *   - `onAdd(cb)/onRemove(cb)/onSort(cb)` — sugar for setting
 *     the corresponding callbacks on the template descriptor.
 *
 * `add(item)` pushes into the in-memory list when `_store` is
 * truthy (the "owning" caller from `ListUIL.create`); other
 * callers consume from storage instead.
 *
 * Static export (sibling init): `ListUIL.OPEN = 'list_uil_open'`.
 */
Class(
  function ListUILConfig(_id, _version = 1, _store) {
    Inherit(this, Component);
    const self = this;
    var _items,
      _folder,
      _config,
      _template = {
        onSort: (_) => {},
        onAdd: (_) => {},
        onRemove: (_) => {},
      },
      _name = '';
    function updateConfig() {
      _config.version = _version;
    }
    function edit() {
      let panel = ListUIL.openPanel(_id, _name, self.template);
      self.events.bubble(panel, Events.UPDATE);
      self.events.fire(ListUIL.OPEN);
    }
    _store && (_items = []);
    (function initConfig() {
      (_config = UILStorage.get(
        (function name() {
          return `LIST_${_id}_config`;
        })(),
      ))
        ? _config.version != _version && updateConfig()
        : ((_config = {}), updateConfig());
    })();
    this.add = function (item) {
      return (_items && _items.push(item), item);
    };
    this.template = function (config) {
      return ('function' == typeof config && (_template = config), _template);
    };
    this.appendUILGroup = function (uil) {
      let folder = new UILFolder('LIST_' + _id, {
          closed: true,
        }),
        button = new UILControlButton('button', {
          actions: [
            {
              title: 'Edit List',
              callback: edit,
            },
          ],
          hideLabel: true,
        });
      folder.add(button);
      uil.add(folder);
      _folder = folder;
    };
    this.setLabel = function (name) {
      _folder && _folder.setLabel(name);
      _name = name;
    };
    this.onAdd = function (cb) {
      _template.onAdd = cb;
    };
    this.onRemove = function (cb) {
      _template.onRemove = cb;
    };
    this.onSort = function (cb) {
      _template.onSort = cb;
    };
    this.internalAddItems = function (count) {
      if (!count) return;
      let array = [];
      for (let i = 0; i < count; i++) {
        let id = `${_id}_${Utils.timestamp()}`;
        array.push(id);
      }
      UILStorage.set(`${_id}_list_items`, JSON.stringify(array));
    };
  },
  (_) => {
    ListUIL.OPEN = 'list_uil_open';
  },
);

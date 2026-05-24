/*
 * TimelineUILConfig — backing config for one TimelineUIL
 * timeline. Owns:
 *   - `TL_${_id}_config` UILStorage entry with `{ version }`
 *     (auto-bumped when caller's `_version` is newer).
 *   - `TimelineUILModel` (0337) bound to that storage name — the
 *     model holds the keyframe rows that the editor (0335) edits.
 *   - When `appendUILGroup(uil)` is called, mounts a collapsed
 *     `TL_${_id}` folder with one "Edit Timeline" button that
 *     opens the editor via `TimelineUIL.openPanel(...)`.
 *
 * Same template-callback pattern as ListUILConfig: `onAdd`,
 * `onRemove`, `onSort` slot into `_template`; the editor invokes
 * them as users mutate the timeline. `onUpdate` from the editor
 * bubbles back through this config's events.
 *
 * Static sibling init: `TimelineUIL.OPEN = 'list_uil_open'`
 * (event name shared with ListUIL — single channel for "panel
 * opened" notifications).
 */
Class(
  function TimelineUILConfig(_id, _version = 1, _store) {
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
    function name() {
      return `TL_${_id}_config`;
    }
    function updateConfig() {
      _config.version = _version;
    }
    function edit() {
      let panel = TimelineUIL.openPanel(name(), _name, self.template);
      self.events.bubble(panel, Events.UPDATE);
      self.events.fire(TimelineUIL.OPEN);
    }
    this.model = new TimelineUILModel(name());
    _store && (_items = []);
    (function initConfig() {
      (_config = UILStorage.get(name()))
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
      let folder = new UILFolder('TL_' + _id, {
          closed: true,
        }),
        button = new UILControlButton('button', {
          actions: [
            {
              title: 'Edit Timeline',
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
    TimelineUIL.OPEN = 'list_uil_open';
  },
);

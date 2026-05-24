/*
 * TimelineUILModel — read-mostly accessor that exposes a
 * TimelineUIL list as a structured `[{label, value, arbitrary}]`
 * array. Hangs off `TimelineUILConfig.model` so scene code can
 * read the timeline state without going through the editor.
 *
 * Init:
 *   - Reads `${_id}_config` (config JSON) and `${_id}_list_items`
 *     (array of item ids) from UILStorage.
 *   - For each item id, builds an `InputUIL.create(...)`
 *     headless config (last arg `!!UIL.global` runs it in slim
 *     read-only mode in production) and extracts:
 *       - `label`     — display name (default "Item").
 *       - `value`     — `getNumber('percent')` (0..1).
 *       - `arbitrary` — optional arbitrary payload.
 *   - When `UIL.global` is present (editor live), schedules a
 *     `Render.start(..., 10)` polling loop that refreshes
 *     `label` / `value` from storage. Production builds skip the
 *     polling since storage is frozen.
 *   - `_map[label] = data` for cheap key-based lookup.
 *
 * Write API:
 *   - `setState(array)` — replaces the entire timeline with the
 *     incoming `[{label, percent | arbitrary}, ...]`. Lengthens
 *     `_items` with timestamped ids as needed, truncates extras,
 *     then writes each row's `label`/`percent` (or `arbitrary`)
 *     through a fresh `InputUIL.create`. Persists `_items` JSON.
 *   - `lock()`   — sets `_config.lock = true` (forces the editor
 *     into read-only mode).
 *   - `rails()`  — sets `_config.rails = true` (enables
 *     monotonic-order dragging in the editor).
 *
 * Read API:
 *   - `getData()` — full `_data` array reference.
 *   - `get(label)` — single row by label via `_map`.
 */
Class(function TimelineUILModel(_id) {
  var _items,
    _config,
    _data = [],
    _map = {};
  !(function initItems() {
    _config = JSON.parse(UILStorage.get(`${_id}_config`) || '{}');
    _items = JSON.parse(UILStorage.get(`${_id}_list_items`) || '[]');
  })();
  (function initData() {
    _items.forEach((item, i) => {
      let input = InputUIL.create(`${item}_folder`, null, null, !!UIL.global),
        data = {};
      data.label = input.get('label') || 'Item';
      data.value = input.getNumber('percent') || 0;
      data.arbitrary = input.get('arbitrary');
      _data.push(data);
      _map[data.label] = data;
      UIL.global &&
        Render.start((_) => {
          data.label = input.get('label') || 'Item';
          data.value = input.getNumber('percent') || 0;
        }, 10);
    });
  })();
  this.setState = function (array) {
    for (let i = 0; i < array.length; i++) _items[i] || _items.push(`${_id}_${Utils.timestamp()}`);
    _items.length > array.length && (_items = _items.slice(0, array.length));
    _items.forEach((item, i) => {
      let data = array[i],
        input = InputUIL.create(`${item}_folder`, null);
      input.setValue('label', data.label);
      data.percent && input.setValue('percent', data.percent);
      data.arbitrary && input.setValue('percent', data.arbitrary);
    });
    UILStorage.set(`${_id}_list_items`, JSON.stringify(_items));
  };
  this.lock = function () {
    return (
      _config.lock ||
        ((_config.lock = true),
        UIL.global && UILStorage.set(`${_id}_config`, JSON.stringify(_config))),
      this
    );
  };
  this.rails = function () {
    return (
      _config.rails ||
        ((_config.rails = true),
        UIL.global && UILStorage.set(`${_id}_config`, JSON.stringify(_config))),
      this
    );
  };
  this.getData = function () {
    return _data;
  };
  this.get = function (key) {
    return _map[key];
  };
});

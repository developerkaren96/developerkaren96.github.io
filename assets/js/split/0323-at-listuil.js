/*
 * ListUIL — static singleton: registry + factory for editable
 * lists (arrays of named items) in the UIL editor. Each list
 * gets a single `ListUILConfig` (0324) and an optional pop-up
 * `ListUILEditor` (0325) for bulk editing.
 *
 * `create(id, version=1, group)`:
 *   - Returns a `ListUILConfig`. The `UIL.global && !_created[id]`
 *     flag is true only for the first caller of a given id —
 *     that caller "owns" the UI group binding; subsequent callers
 *     get a read/write config without re-mounting the group.
 *   - `version` lets a list bump its schema (each `_created` entry
 *     keys off id only, but the config respects the version for
 *     storage layout).
 *   - `group === null` keeps the config detached (programmatic),
 *     otherwise attaches to caller's group or `UIL.global`.
 *
 * `openPanel(id, name, template)`:
 *   - Destroys any previously-open editor and opens a new
 *     `ListUILEditor`. Auto-cleans up on its `Events.COMPLETE`.
 *
 * `set`/`get` are intentional no-op stubs — kept for API
 * symmetry with the other *UIL singletons (matches the duck
 * type without doing storage work since lists own their own
 * storage scheme inside `ListUILConfig`).
 *
 * `getPanel()` exposes the currently open editor (or undefined).
 */
Class(function ListUIL() {
  Inherit(this, Component);
  const self = this;
  var _panel,
    _created = {};
  function removePanel() {
    _panel &&
      _panel.destroy &&
      (self.events.unsub(_panel, Events.COMPLETE, removePanel), (_panel = _panel.destroy()));
  }
  this.create = function (id, version = 1, group) {
    'number' != typeof version && ((group = version), (version = 1));
    group = null === group ? null : group || UIL.global;
    let config = new ListUILConfig(id, version, UIL.global && !_created[id]);
    return (
      UIL.global &&
        (_created[id] ||
          ((_created[id] = config), null != group && config.appendUILGroup(group || UIL.global))),
      config
    );
  };
  this.openPanel = function (id, name, template) {
    return (
      removePanel(),
      (_panel = new ListUILEditor(id, name, template)),
      self.events.sub(_panel, Events.COMPLETE, removePanel),
      _panel
    );
  };
  this.set = function () {};
  this.get = function () {};
  this.getPanel = function () {
    return _panel;
  };
}, 'static');

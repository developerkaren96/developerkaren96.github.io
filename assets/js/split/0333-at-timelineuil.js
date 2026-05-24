/*
 * TimelineUIL — static singleton: factory + registry for animation
 * timelines in the UIL editor. Same shape as `ListUIL` (0323):
 *
 *   - `create(id, version=1, group)`         — returns/creates the
 *     `TimelineUILConfig` for a given id, mounting an "Edit
 *     Timeline" button under the supplied UIL group. The first
 *     caller for a given id "owns" the group attachment; later
 *     callers receive a sibling config without re-mounting.
 *   - `openPanel(id, name, template)`        — opens the pop-up
 *     `TimelineUILEditor` (0335) and auto-disposes the previous
 *     one. `Events.COMPLETE` from the editor clears `_panel`.
 *   - `set`/`get`                            — no-op stubs to keep
 *     symmetry with other *UIL singletons (timelines own their
 *     storage internally).
 */
Class(function TimelineUIL() {
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
    let config = new TimelineUILConfig(id, version, UIL.global && !_created[id]);
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
      (_panel = new TimelineUILEditor(id, name, template)),
      self.events.sub(_panel, Events.COMPLETE, removePanel),
      _panel
    );
  };
  this.set = function () {};
  this.get = function () {};
}, 'static');

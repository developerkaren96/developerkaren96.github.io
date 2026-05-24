/*
 * TimelineUILItem — single keyframe row inside a
 * TimelineUILEditor. Mirrors ListUILItem (0326) but exposes a
 * normalised time slider instead of a generic delete button.
 *
 * Backing storage is a per-item `InputUILConfig`
 * (`${_id}_folder`) inside the parent timeline folder. Fields:
 *   - `label`    — display name. Hidden when the parent editor
 *     is locked (read-only mode).
 *   - `keyframe` — UILControlRange 0..100 (the editable %).
 *   - `percent`  — hidden 0..1 mirror of `keyframe / 100`. Kept
 *     in sync via `onUpdate`. `percent` is the canonical value
 *     read/written through `getValue` / `setValue`.
 *
 * The folder is opened by default (`open()`) and is draggable
 * unless the editor is locked. Drag events bubble up to the
 * editor as `Events.UPDATE` for reorder handling.
 *
 * Delete button — confirm → `template.onRemove(id)` →
 * `Events.END {id}`. Hidden in lock mode. Constrained to
 * `width: 20%` to share row space with the keyframe slider.
 *
 * `setValue(v)` writes both `percent` (0..1) and `keyframe`
 * (0..100) so the slider stays in lockstep with programmatic
 * updates (e.g. the editor's rails mode dragging neighbours).
 */
Class(function TimelineUILItem(_id, _parent, _template, _index) {
  Inherit(this, Component);
  const self = this;
  var _folder;
  function onDelete() {
    if (!confirm('You sure you want to delete this?')) return;
    let id = _id;
    _template().onRemove(id);
    self.events.fire(Events.END, {
      id: id,
    });
  }
  function onReorder(e) {
    self.events.fire(Events.UPDATE, e);
  }
  !(async function initFolder() {
    (_folder = InputUIL.create(`${_id}_folder`, _parent)).setLabel('Item');
    (self.parent && self.parent.config.lock) || _folder.group.draggable(true);
    self.events.sub(_folder.group, UIL.REORDER, onReorder);
    _folder.group.open();
  })();
  (function initTemplate() {
    let id = _id;
    (0, _template().onAdd)(id, _folder, _index);
  })();
  (function initUI() {
    _folder.add('label', self.parent && self.parent.config.lock ? 'hidden' : undefined);
    _folder.addRange('keyframe');
    _folder.add('percent', 'hidden');
    _folder.getField('keyframe').force(Math.round(100 * _folder.getNumber('percent')) || 0);
    _folder.onUpdate = (key) => {
      if ('keyframe' == key) {
        let val = _folder.getNumber(key) / 100;
        _folder.setValue('percent', val);
        self.onUpdate && self.onUpdate(val);
      }
    };
    let label = _folder.get('label');
    if ((label && _folder.setLabel(label), !self.parent || !self.parent.config.lock)) {
      let actions = [
          {
            title: 'Delete',
            callback: onDelete,
          },
        ],
        hideLabel = true,
        btn =
          (_folder.addButton('delete', {
            actions: actions,
            hideLabel: hideLabel,
          }),
          _folder.getField('delete'));
      btn &&
        btn.$content.css({
          width: '20%',
        });
    }
  })();
  this.setLabel = function (label) {
    _folder.setLabel(label);
  };
  this.getValue = function (value) {
    return _folder.getNumber('percent');
  };
  this.setValue = function (value) {
    _folder.setValue('percent', value);
    _folder.getField('keyframe').force(Math.round(100 * value) || 0);
  };
});

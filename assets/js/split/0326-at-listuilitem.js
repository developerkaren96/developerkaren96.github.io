/*
 * ListUILItem — a single row inside a `ListUILEditor`. Wraps a
 * draggable `InputUILConfig` folder (so item-specific controls
 * persist to UILStorage under `${_id}_folder_…`) and delegates
 * per-item content to the list's user-supplied template.
 *
 * Construction:
 *   - Creates an `InputUIL.create('${id}_folder', parent)` →
 *     `_folder` (label "Item"), marks its `<UILFolder>` element
 *     `draggable(true)` so the editor can sort the list.
 *   - Subscribes to the folder's `UIL.REORDER` event, re-firing
 *     as `Events.UPDATE` for the editor (which then writes the
 *     new order to storage).
 *   - Stashes a back-reference: `_folder.listUILItem = self` so
 *     code with only the folder can hop back here.
 *
 * Template hook:
 *   - `template().onAdd(id, _folder, _index)` is invoked once at
 *     init so the caller can add list-specific controls (text,
 *     toggles, etc.) into the folder.
 *
 * Delete action:
 *   - "Delete" button → `onDelete()` confirms, fires the user's
 *     `template().onRemove(id)`, then bubbles `Events.END` with
 *     the id so the editor can drop and persist.
 *
 * Public surface:
 *   - `setLabel(label)` — rename the folder.
 *   - `forceSort(index)` — programmatic reorder (used during
 *     refresh to restore order).
 *   - `open()` / `close()` — expand/collapse the folder (open
 *     also opens children for full inspection).
 */
Class(function ListUILItem(_id, _parent, _template, _index) {
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
    _folder.group.draggable(true);
    self.events.sub(_folder.group, UIL.REORDER, onReorder);
    _folder.listUILItem = self;
  })();
  (function initTemplate() {
    let id = _id;
    (0, _template().onAdd)(id, _folder, _index);
  })();
  (function initUI() {
    let actions = [
        {
          title: 'Delete',
          callback: onDelete,
        },
      ],
      hideLabel = true;
    _folder.addButton('delete', {
      actions: actions,
      hideLabel: hideLabel,
    });
  })();
  this.setLabel = function (label) {
    _folder.setLabel(label);
  };
  this.forceSort = function (index) {
    _folder.group.forceSort(index);
  };
  this.open = function () {
    _folder.group.open();
    _folder.group.openChildren();
  };
  this.close = function () {
    _folder.group.close();
  };
});

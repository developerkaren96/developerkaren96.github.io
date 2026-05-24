/*
 * DragAndDrop — generic DOM drag-source mixin used by the
 * editor's UILGraph nodes. Wraps the HTML5 drag API so the
 * inheriting class only needs to set `self.data.id` (or
 * `self.id`) and `self.dropTarget` to a sibling Element.
 *
 * Lifecycle:
 *   - onInit() attaches mousedown→setDragging, mouseup→
 *     removeDragListeners and the dragstart/end/enter/leave/
 *     over/drop pair on dragEl and dropTarget. `initialized`
 *     guards against double-wire.
 *   - onRemoveView() / setDragEnabled(false) detach everything.
 *
 * State coordination via AppState `UIL/Graph/dragging` — set
 * to the drag id while a drag is active so other graph
 * widgets can react (highlight valid drop zones etc.).
 *
 * Drag visuals: source element fades to 0.4 opacity during
 * drag; drop target gets a `.hover` class while a drag is
 * over it. UILGraphGroupChildren gets a special green
 * (#1aeade) highlight via an extra goob() rule.
 *
 * Standard Fragment plumbing.
 */
Class(function DragAndDrop(_params, ...restArgs) {
  const self = this;
  Inherit(self, Element);
  Inherit(self, XComponent);
  self.fragName = 'DragAndDrop';
  self.contexts = 'Element';
  self.params = _params;
  self.args = arguments;
  this.isFragment = true;
  var _promises = [];
  !(async function () {
    self.element && (self.element.onMountedHook = (_) => self.onMounted?.());
    self.params = _params;
    self.args = arguments;
    self.parent?.layers && (self.layers = self.parent.layers);
    self.layout?.getAllLayers && (self.layers = await self.layout.getAllLayers());
    self.element.attr('draggable', 'true');
    self.dragEl = self.element;
    let _dragId,
      initialized = false;
    function setDragging() {
      self.set('UIL/Graph/dragging', self.dragId);
    }
    function removeDragListeners() {
      self.set('UIL/Graph/dragging', false);
      self.dragEl.div.removeEventListener('mousedown', setDragging, false);
      window.removeEventListener('mouseup', self.removeDragListeners, false);
      self.dropTarget.classList?.().remove('hover');
      self.dragEl.div.removeEventListener('dragstart', self.dragStart, false);
      self.dragEl.div.removeEventListener('dragend', self.dragEnd, false);
      self.dropTarget.div.removeEventListener('dragenter', self.dragEnter);
      self.dropTarget.div.removeEventListener('dragleave', self.dragLeave);
      self.dropTarget.div.removeEventListener('dragover', self.dragOver);
      self.dropTarget.div.removeEventListener('drop', self.drop);
      self.dragEl?.div?.removeEventListener('mousedown', self.addDragListeners, false);
    }
    self.setDragEnabled = function (val) {
      self.dragEl.attr('draggable', val);
      false === val && removeDragListeners();
    };
    self.setDragElement = function (el) {
      self.element.div.removeEventListener('mousedown', setDragging, false);
      self.element.attr('draggable', false);
      self.dragEl = el;
      self.dragEl.attr('draggable', true);
    };
    self.onInit = function () {
      self.dropTarget &&
        !initialized &&
        (!(function addDragListeners() {
          if (
            (self.dragEl.div.addEventListener('mousedown', setDragging, false),
            window.addEventListener('mouseup', self.removeDragListeners, false),
            !self.element || !self.dropTarget)
          )
            return;
          self.dragEl.div.addEventListener('dragstart', self.dragStart, false);
          self.dragEl.div.addEventListener('dragend', self.dragEnd, false);
          self.dropTarget.div.addEventListener('dragenter', self.dragEnter);
          self.dropTarget.div.addEventListener('dragleave', self.dragLeave);
          self.dropTarget.div.addEventListener('dragover', self.dragOver);
          self.dropTarget.div.addEventListener('drop', self.drop);
        })(),
        (_dragId = self.data ? self.data.id : !!self.id && self.id),
        (initialized = true));
    };
    self.onRemoveView = function () {
      removeDragListeners();
    };
    self.bind('UIL/Graph/dragging', (isDragging) => {});
    self.dragStart = function (event) {
      event.stopPropagation();
      _dragId ||
        console.warn(
          'No Drag Id is set on Drag and Drop. Set either _this.data.id or _this.id on the class inheriting from DragAndDrop',
          self,
        );
      event.dataTransfer.setData('text/plain', _dragId);
      event.dataTransfer.effectAllowed = 'move';
      event.dropEffect = 'move';
      self.element.css({
        opacity: 0.4,
      });
      self.onDragStart?.(event);
    };
    self.dragEnd = function (event) {
      event.stopPropagation();
      self.onDragEnd?.(event);
      self.element?.css({
        opacity: 1,
      });
    };
    self.dragEnter = function (event) {
      self.dropTarget.classList().add('hover');
      self.onDragEnter?.(event);
    };
    self.dragLeave = function (event) {
      self.dropTarget.classList().remove('hover');
      self.onDragLeave?.(event);
    };
    self.dragOver = function (event) {
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = 'move';
      self.onDragOver?.(event);
    };
    self.drop = function (event) {
      return (
        event.stopPropagation(),
        self.dropTarget.classList().remove('hover'),
        self.onDrop?.(event.dataTransfer.getData('text')),
        false
      );
    };
    self.element.goob(
      '\n    cursor: pointer;\n    .highlight {\n        pointer-events: none;\n    }\n',
    );
    'UILGraphGroupChildren' === Utils.getConstructorName(self) &&
      self.element.goob(
        '\n        .highlight {\n            background: #1aeade !important;\n        }\n    ',
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
});

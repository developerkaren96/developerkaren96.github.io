/*
 * UILControl — base class for all editor (UIL) input widgets.
 * Establishes the get/set/equals/clone state machine, change
 * /finish callback pair, persistence to UILStorage +
 * UILLocalStorage, and history (undo/redo) integration via
 * UILHistory. Subclasses (Button/Checkbox/Color/File/Image/
 * Number…) provide their own `update(value)` to project the
 * value into a custom DOM control.
 *
 * Public surface:
 *   - init(id, opts)      — set id, label, opts.value.
 *   - setValue / getValue — controlled-component pattern; only
 *     fires _onChange when isEqual() returns false.
 *   - force(value)        — set + finish without history.
 *   - finish(history=true)— commit; push to UILHistory and
 *     persist to local + remote (UILStorage) if changed.
 *   - onChange / onFinishChange — fluent callback registration
 *     (returns self for chaining).
 *   - debounce(cb, time)  — generic debounce wrapped helper.
 *   - getView / setView   — swap inner DOM view fragments.
 *   - hide / show / isVisible — display-mode toggles.
 *   - setLabel / setDescription — title + tooltip.
 *
 * isEqual handles array/object compare via JSON.stringify;
 * clone() shallow-copies arrays and objects, null → '' so the
 * dirty check survives reset to null.
 *
 * Static UILControl.infoIcon — inline SVG used by subclasses
 * that render a (?) help marker.
 *
 * Standard Fragment plumbing.
 */
Class(
  function UILControl(_params, ...restArgs) {
    const self = this;
    Inherit(self, Element);
    Inherit(self, XComponent);
    self.fragName = 'UILControl';
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
      var _onChange = () => {};
      self.element.attr('data-type', 'UILControl');
      self.element.div._this = self;
      let _onFinishChange = () => {};
      function isEqual(a, b) {
        return Array.isArray(a) || Array.isArray(b)
          ? a + '' == b + ''
          : 'object' == typeof a || 'object' == typeof b
            ? JSON.stringify(a) === JSON.stringify(b)
            : a === b;
      }
      function clone(value) {
        return Array.isArray(value)
          ? [...value]
          : null === value
            ? ''
            : 'object' == typeof value
              ? Object.assign({}, value)
              : value;
      }
      self.element.goob(
        '\n    & {\n        padding: calc(var(--spacing) / 2) var(--spacing);\n        width: 100%;\n    }\n',
      );
      self.init = (id, opts = {}) => {
        self.id = id;
        self.opts = opts;
        self.setValue(clone(opts.value));
        self.previous = clone(self.value);
        self.value && self.set('value', self.value);
        self.setLabel(opts.label || id);
        self.element.attr('data-id', id);
      };
      self.finish = (history = true) => {
        _onFinishChange(self.value);
        isEqual(self.value, self.previous) ||
          (history && UILHistory.set(self, self.previous),
          UILLocalStorage.set(self.id, self.value),
          UILStorage.set(self.id, self.value),
          (self.previous = clone(self.value)));
      };
      self.force = (value) => {
        self.setValue(clone(value));
        self.finish(false);
      };
      self.debounce = (callback, time = 250) => {
        let interval;
        return (...args) => {
          clearTimeout(interval);
          interval = setTimeout(() => {
            interval = null;
            callback(...args);
          }, time);
        };
      };
      self.onChange = (cb) => ((_onChange = cb), self);
      self.onFinishChange = (cb) => ((_onFinishChange = cb), self);
      self.getValue = function () {
        return self.value;
      };
      self.setValue = (value) => {
        isEqual(value, self.value) ||
          ((self.value = clone(value)),
          self.update && self.update(self.value),
          'function' == typeof _onChange && _onChange(self.value));
      };
      self.getView = function () {
        return self.view;
      };
      self.setView = (view) => {
        self.view && self.view.destroy();
        self.view = view;
        self.content.add(self.view);
      };
      self.hide = function () {
        return (
          (self.visible = false),
          self.element.css({
            display: 'none',
          }),
          self
        );
      };
      self.show = function () {
        return (
          (self.visible = true),
          self.element.css({
            display: 'inline-block',
          }),
          self
        );
      };
      self.isVisible = function () {
        return self.visible;
      };
      self.setLabel = (label) => {
        self.label = label;
        self.state.set('label', label);
      };
      self.setDescription = function (desc) {
        console.log('description: ' + desc);
        self.label.attr('title', desc);
      };
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
  },
  (_) => {
    UILControl.infoIcon =
      '<span><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9 9a3 3 0 016 1c0 2-3 3-3 3M12 17h0"/></svg></span>';
  },
);

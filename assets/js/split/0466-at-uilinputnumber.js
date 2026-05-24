/*
 * UILInputNumber — the workhorse drag-to-scrub number
 * input shared by UILControlNumber / UILControlVector.
 *
 * Modes:
 *   Type-to-edit  — keyup commits to setValue with min/max
 *                   clamp + precision toFixed; debounced
 *                   finish at 400ms or on blur.
 *   Middle-/Cmd-/Ctrl-click drag — col-resize cursor;
 *                   (dx − dy) accumulates into _distance,
 *                   shiftKey shrinks /5 (fine), default
 *                   /50 (coarse); altKey sets master flag
 *                   so consumers can broadcast to siblings
 *                   (vector "uniform scale"); 100ms
 *                   coalesced onFinishCB via Timer.create.
 *   Enter alt — master + immediate onInput + onFinishCB
 *                   (apply to all components in a vector).
 *
 * Standard Fragment plumbing.
 */
Class(function UILInputNumber(_data, _index, _params) {
  const self = this;
  Inherit(self, Element);
  Inherit(self, ViewStateElement);
  Inherit(self, XComponent);
  self.fragName = 'UILInputNumber';
  self.contexts = 'Element,ViewStateElement';
  self.data = _data;
  self.index = _index;
  self.params = _params;
  this.isFragment = true;
  var _promises = [];
  !(async function () {
    let _timeout;
    self.element && (self.element.onMountedHook = (_) => self.onMounted?.());
    self.initClass(FragUIHelper, {
      _type: 'UI',
      refName: 'unnamed',
      children: [
        {
          ariaLabelledBy: '$data.labelledBy',
          min: '$data.min',
          max: '$data.max',
          step: '$data.step',
          _type: 'input',
          refName: 'input',
          children: [],
        },
      ],
    });
    self.data = _data;
    self.index = _index;
    self.params = _params;
    self.createState();
    self.parent?.layers && (self.layers = self.parent.layers);
    self.layout?.getAllLayers && (self.layers = await self.layout.getAllLayers());
    let _distance,
      _onMouseDownValue,
      _editing = false,
      _pointer = [0, 0],
      _prevPointer = [0, 0],
      _step = 0.05,
      _onInputCB = () => {},
      _onFinishCB = () => {};
    function setValue(value) {
      if (
        ((value = parseFloat(value).toFixed(self.data.precision) || 0) < self.data.min &&
          (value = self.data.min),
        value > self.data.max && (value = self.data.max),
        isNaN(Number(value)))
      )
        return (self.value = 0);
      self.value = Number(value);
      self.data.onInputCB(self.value, self.master);
    }
    function updateValueAndInput(value, showDecimals = false) {
      setValue(value);
      let displayValue = showDecimals
        ? parseFloat(self.value).toFixed(self.data.precision)
        : self.value;
      _editing || (self.input.div.value = displayValue);
    }
    function onBlur() {
      updateValueAndInput(self.input.div.value, true);
      onFinishChange(true);
    }
    function onKeyUp(e) {
      13 === e.keyCode &&
        (e.altKey
          ? ((self.master = true), onInput(), self.data.onFinishCB(self.value, self.master))
          : (setValue(self.value), self.data.onFinishCB(self.value, self.master)));
    }
    function onInput() {
      _timeout = setTimeout(finishInput, 400);
      _editing = true;
      self.value = self.input.div.value;
    }
    function finishInput() {
      isNaN(self.input.div.value) || (setValue(self.input.div.value), onFinishChange());
    }
    function onFinishChange(force = false) {
      (_editing || force) &&
        ((_editing = false),
        clearTimeout(_timeout),
        self.data.onFinishCB(self.value, self.master),
        (self.master = false));
    }
    function onMouseDown(e) {
      (1 === e.button || (0 === e.button && e.metaKey) || e.ctrlKey) &&
        (e.preventDefault(),
        self.input.css({
          cursor: 'col-resize',
        }),
        (_distance = 0),
        (_onMouseDownValue = self.value),
        (_prevPointer = [e.screenX, e.screenY]),
        document.addEventListener('mousemove', onMouseMove, false),
        document.addEventListener('mouseup', onMouseUp, false));
    }
    function onMouseMove(e) {
      clearTimeout(_timeout);
      _editing = true;
      let currentValue = self.value;
      _pointer = [e.screenX, e.screenY];
      _distance += _pointer[0] - _prevPointer[0] - (_pointer[1] - _prevPointer[1]);
      let value = Number(_onMouseDownValue) + Number(_distance / (e.shiftKey ? 5 : 50)) * _step;
      value = Math.min(self.data.max, Math.max(self.data.min, value));
      self.master = e.altKey;
      currentValue !== value &&
        (function setValueDrag(value) {
          (undefined === value && value === self.input.div.value) ||
            (setValue(value),
            (self.input.div.value = self.value.toFixed(self.data.precision)),
            clearTimeout(self.dragCallback),
            (self.dragCallback = Timer.create(
              (_) => self.data.onFinishCB(self.value, self.master),
              100,
            )));
        })(value);
      _prevPointer = [e.screenX, e.screenY];
    }
    function onMouseUp(e) {
      onFinishChange();
      self.input.css({
        cursor: '',
      });
      document.removeEventListener('mousemove', onMouseMove, false);
      document.removeEventListener('mouseup', onMouseUp, false);
    }
    self.master;
    self.dragCallback;
    self.onMounted = () => {
      updateValueAndInput(self.data.value, true);
    };
    (function initListeners() {
      self.input.div.addEventListener('mousedown', onMouseDown, false);
      self.input.div.addEventListener('keyup', onKeyUp, false);
      self.input.div.addEventListener('change', onFinishChange, false);
      self.input.div.addEventListener('blur', onBlur, false);
      self.input.div.addEventListener('input', onInput, false);
    })();
    self.data.bind('value', (value) => {
      updateValueAndInput(value);
    });
    self.getValue = () => self.value;
    self.publicSetValue = (value) => {
      _editing ? setValue(value) : updateValueAndInput(value);
    };
    self.onInput = (cb) => cb;
    self.onFinish = (cb) => cb;
    self.forceUpdate = function (value) {
      updateValueAndInput(value);
    };
    self.onDestroy = function () {
      self.input.div.removeEventListener('mousedown', onMouseDown, false);
      self.input.div.removeEventListener('change', onFinishChange, false);
      self.input.div.removeEventListener('blur', onBlur, false);
      self.input.div.removeEventListener('input', onInput, false);
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
});

/*
 * InputUILConfig — generic key-value editor backing every per-
 * scene / per-component property panel. Each instance owns a
 * UILFolder (`INPUT_${name}`) and persists field values to
 * `UILStorage` under `${prefix}_${key}`.
 *
 * Modes:
 *   - `_uil` set:        attached to a parent panel (sidebar/global).
 *   - `_decoupled` true: don't add the folder to the parent panel;
 *     storage still flows. Used when a node needs its own state
 *     namespace but lives somewhere bespoke (graph nodes, copies).
 *   - `_slim` true:      only `.get` / `.getNumber` / `.getFilePath`
 *     are exposed (read-only consumer mode). Runtime code can
 *     consume editor data without dragging in the entire control
 *     API surface.
 *   - `_uil` null:       fully headless — `.add*` no-ops, values
 *     still readable from storage. This is how editor-driven
 *     components run in production builds.
 *
 * Read API:
 *   - `get(key)`        — UILStorage lookup with type coercion:
 *     booleans pass through; `'true'/'false'` strings → bool;
 *     `'[...'` → JSON.parse; everything else passes through. A
 *     per-config `_cache` accelerates lookups when there's no
 *     `UIL.global` (production: storage is frozen).
 *   - `getNumber(key)`  — Number() with NaN→0 fallback.
 *   - `getFilePath(key)`— normalises file/image control payloads
 *     `{src, relative}` → prefers `.relative` when it has an
 *     extension, otherwise `.src` (used by asset resolvers).
 *   - `getImage(key)`   — JSON-parsed `.src` accessor.
 *
 * Write API (skipped when `_slim`):
 *   - `add(key, init, ControlClass, options, params)` — core add.
 *     Picks up persisted value, hydrates the control, persists
 *     on `onFinishChange` (and `onChange` for vector/range live
 *     edits). Cross-instance sync via `Events.emitter.fire(
 *     InputUIL.UPDATE, ...)`. UILStorage state-bind reflects
 *     external writes back into `self.state` (an AppState).
 *   - Sugar wrappers: `addToggle`, `addSelect`, `addImage`,
 *     `addFile`, `addRange`, `addNumber`, `addColor`,
 *     `addTextarea`, `addButton`, `addVector`. All check
 *     `UIL.sidebar` before doing UI work; otherwise no-op.
 *   - `setValue(key, value)` — programmatic write + UI refresh.
 *   - `copyFrom(input, fields)` — bulk-copy values between two
 *     InputUILConfigs (e.g. duplicating a particle effect).
 *   - `setLabel(name)` / `setDescription(key, desc)` / `getField(key)`.
 *
 * Bus integration:
 *   - Subscribes to `InputUIL.UPDATE`. On a foreign-instance
 *     payload with matching prefix, writes value to UILStorage
 *     and invokes `onUpdate(key)`.
 *
 * `self.state` (AppState.createLocal) exposes a reactive
 * snapshot per key, mirroring UILStorage. Components that want
 * fine-grained subscribes consume this instead of polling.
 */
Class(function InputUILConfig(_name, _uil, _decoupled, _slim) {
  var _cache,
    self = this;
  const prefix = 'INPUT_' + _name;
  var _group = _uil
      ? (function createFolder() {
          if (!UIL.sidebar) return null;
          let folder = new UILFolder(_name, {
            closed: true,
          });
          _decoupled || (_uil.add(folder), _uil == UIL.sidebar && folder.hide());
          return folder;
        })()
      : null,
    _fields = _uil ? {} : null;
  function externalUpdate(e) {
    e.prefix == prefix &&
      e.group != self &&
      (UILStorage.set(`${prefix}_${e.key}`, e.value), self.onUpdate && self.onUpdate(e.key));
  }
  self.group = _group;
  self.keys = [];
  _uil &&
    (function addListeners() {
      Events.emitter._addEvent(InputUIL.UPDATE, externalUpdate, self);
    })();
  this.state = AppState.createLocal();
  this.get = function (key) {
    if (_cache && undefined !== _cache[key]) return _cache[key];
    let val = UILStorage.get(`${prefix}_${key}`);
    return 'boolean' == typeof val
      ? val
      : val && '' != val
        ? 'true' === val ||
          ('false' !== val &&
            (val.charAt && '[' == val.charAt(0)
              ? JSON.parse(val)
              : (UIL.global || (_cache || (_cache = {}), _cache[key] || (_cache[key] = val)), val)))
        : undefined;
  };
  this.getFilePath = function (key) {
    let data = this.get(key);
    return '{' === data?.charAt?.(0)
      ? ((data = JSON.parse(data)), data.relative.includes('.') ? data.relative : data.src)
      : 'object' == typeof data
        ? data.relative.includes('.')
          ? data.relative
          : data.src
        : data;
  };
  this.getNumber = function (key) {
    let number = Number(this.get(key));
    return (isNaN(number) && (number = 0), number);
  };
  _slim ||
    ((this.add = function (key, initValue, uil = window.UILControlText, options, params = {}) {
      if ((self.keys.push(key), !_group || 'hidden' == initValue || !UIL.sidebar)) return this;
      let fallback;
      'string' == typeof uil && ((fallback = uil), (uil = window.UILControlText));
      let value = UILStorage.get(`${prefix}_${key}`);
      if (
        (undefined === value && fallback && (value = UILStorage.get(`${prefix}_${fallback}`)),
        'true' === value && (value = true),
        'false' === value && (value = false),
        uil == UILControlVector && 'string' == typeof value && (value = JSON.parse(value)),
        undefined === value && (value = initValue),
        'string' == typeof value && (uil == UILControlImage || uil == UILControlFile))
      )
        try {
          value = JSON.parse(value);
        } catch (e) {}
      let change = (val, fromInit) => {
        val = 'string' == typeof val ? val : JSON.stringify(val);
        UILStorage.set(`${prefix}_${key}`, val);
        self.onUpdate && self.onUpdate(key, val);
        fromInit ||
          Events.emitter._fireEvent(InputUIL.UPDATE, {
            prefix: prefix,
            key: key,
            value: val,
            group: self,
          });
      };
      ('string' != typeof initValue && 'number' != typeof initValue && uil != UILControlVector) ||
        UILStorage.get(`${prefix}_${key}`) ||
        change(initValue, true);
      let opts = Utils.mergeObject(params, {
        label: key,
        value: value,
        options: options,
      });
      uil == window.UILControlButton && (opts = options);
      let config = new uil(`${prefix}_${key}`, opts);
      return (
        config.onFinishChange(change),
        UILStorage.state.bind(`${prefix}_${key}`, (val) => self.state.set(key, val)),
        (uil != UILControlVector && uil != UILControlRange) || config.onChange(change),
        _group.add(config),
        (_fields[key] = config),
        this
      );
    }),
    (this.addToggle = function (key, initValue) {
      return UIL.sidebar ? this.add(key, initValue, UILControlCheckbox) : this;
    }),
    (this.addSelect = function (key, options) {
      return UIL.sidebar ? this.add(key, null, UILControlSelect, options) : this;
    }),
    (this.addImage = function (key, options) {
      return UIL.sidebar ? this.add(key, null, UILControlImage, null, options) : this;
    }),
    (this.addFile = function (key, options) {
      if (!UIL.sidebar) return this;
      this.get(key);
      return this.add(key, null, UILControlFile, null, options);
    }),
    (this.addRange = function (key, initValue, options) {
      return UIL.sidebar ? this.add(key, initValue, UILControlRange, null, options) : this;
    }),
    (this.addNumber = function (key, initValue, step) {
      return UIL.sidebar
        ? this.add(key, initValue, UILControlNumber, null, {
            step: step,
          })
        : this;
    }),
    (this.addColor = function (key, initValue = new Color()) {
      return UIL.sidebar ? this.add(key, initValue.getHexString(), UILControlColor) : this;
    }),
    (this.addTextarea = function (key, initValue) {
      return UIL.sidebar
        ? this.add(key, initValue, UILControlTextarea, null, {
            monospace: true,
            rows: 4,
          })
        : this;
    }),
    (this.addButton = function (key, options) {
      if (!UIL.sidebar) return this;
      if ('function' == typeof options) {
        let cb = options;
        options = {
          actions: [
            {
              title: key,
              callback: (_) => cb(key),
            },
          ],
          hideLabel: true,
        };
      }
      return this.add(key, null, UILControlButton, options);
    }),
    (this.addVector = function (key, initValue, options) {
      return UIL.sidebar
        ? (options ||
            (options = {
              step: 0.05,
            }),
          this.add(key, initValue, UILControlVector, null, options))
        : this;
    }),
    (this.getImage = function (key) {
      let data = this.get(key);
      if (data) return JSON.parse(data).src;
    }),
    (this.setValue = function (key, value) {
      if (
        (UILStorage.set(`${prefix}_${key}`, value),
        self.onUpdate && self.onUpdate(key),
        self.state.set(key, value),
        _fields)
      ) {
        let field = _fields[key];
        field && ((field.value = value), field.update && field.update());
      }
      return this;
    }),
    (this.copyFrom = function (input, fields) {
      fields.forEach((key) => {
        let val = input.get(key);
        undefined !== val &&
          ('string' != typeof val && (val = JSON.stringify(val)), self.setValue(key, val));
      });
    }),
    (this.setLabel = function (name) {
      _group && _group.setLabel(name);
    }),
    (this.getField = function (key) {
      if (_fields) return _fields[key];
    }),
    (this.setDescription = function (key, desc) {
      self.getField(key)?.setDescription(desc);
    }));
});

/*
 * ShaderUILConfig — per-shader editor backing `ShaderUIL.add`.
 * Builds a `UILFolder` titled from `shader.UILPrefix` (which is
 * a path like `MaterialA/_/varA` — the label uses the first
 * segment plus the third when 3+ segments exist) and walks the
 * shader's uniforms to lay out the right control for each.
 *
 * Per-uniform control mapping:
 *   - vec2/vec3/vec4 (Vector*) → UILControlVector (3 dp step
 *     0.05), `obj.value.fromArray(...)`. UBOs flip
 *     `_shader.ubo.needsUpdate = true` on change. Exposes
 *     `forceUpdateKEY()` for programmatic re-sync.
 *   - color (`type === 'c'`) → UILControlColor.
 *   - number/range → UILControlNumber / UILControlRange depending
 *     on whether `obj.range` is present.
 *   - texture / cubemap → UILControlImage with the appropriate
 *     loader (`ShaderUIL.getTexture` / `getCubeTexture` /
 *     `Utils3D.*`). Image swaps fire `ShaderUIL.TEXTURE_UPDATE`.
 *   - boolean → UILControlCheckbox.
 *   - enum (`obj.options`) → UILControlSelect.
 *   - `obj.description` propagated as the control's tooltip.
 *   - `obj.ignoreUIL` skips the field entirely (so internal
 *     uniforms like `tLifeData`, `uTransition` don't pollute
 *     the editor).
 *
 * Storage:
 *   - Every control's `onFinishChange` persists to
 *     `UILStorage.set(prefix+key, ...)`. Live `UILStorage.state.bind`
 *     subscriptions reflect external writes back into the
 *     controls (used by the graph editor for cross-shader sync
 *     and by the timeline for animated values).
 *
 * Cross-instance + cross-property event channels:
 *   - `ShaderUIL.UPDATE`         — scalar / vector / color edits.
 *   - `ShaderUIL.TEXTURE_UPDATE` — texture uniform swaps.
 *   - `ShaderUIL.SHADER_UPDATE`  — full source / source-key change.
 *
 * Dedup: bails out (no folder created) if
 * `ShaderUIL.exists[prefix]` is already set — multiple meshes
 * sharing the same shader prefix render only one editor.
 *
 * Label cleanup: trailing underscore is stripped from the
 * derived label.
 */
Class(function ShaderUILConfig(_shader, _uil) {
  var _textures,
    self = this;
  const prefix = _shader.UILPrefix;
  var _group =
    _uil && !ShaderUIL.exists[prefix]
      ? (function createFolder() {
          if (!UIL.sidebar) return null;
          let label = (function getName() {
            let split = _shader.UILPrefix.split('/');
            return split.length > 2 ? split[0] + '_' + split[2] : split[0];
          })();
          '_' == label.charAt(label.length - 1) && (label = label.slice(0, -1));
          let folder = new UILFolder(prefix + label, {
            label: label,
            closed: true,
          });
          return (_uil.add(folder), folder);
        })()
      : null;
  function createVector(obj, key) {
    let initValue = UILStorage.get(`${prefix}${key}`) || obj.value.toArray();
    if (_group) {
      let vector = new UILControlVector(`${prefix}${key}`, {
        label: key,
        value: initValue,
        step: 0.05,
        description: obj.description,
      });
      vector.onChange((val) => {
        obj.value.fromArray(val);
        _shader.ubo && (_shader.ubo.needsUpdate = true);
      });
      self['forceUpdate' + key.toUpperCase()] = (_) => {
        let val = _shader.get(key).toArray();
        vector.force(val, true);
      };
      vector.onFinishChange((e) => UILStorage.set(`${prefix}${key}`, e));
      UILStorage.state.bind(`${prefix}${key}`, (val) => vector.setValue(val));
      _group.add(vector);
    }
    obj.value.fromArray(initValue);
  }
  function createTexture(obj, key) {
    let getTexture;
    _group && !_textures && (_textures = {});
    getTexture = obj.cube
      ? obj.getTexture || ShaderUIL.getCubeTexture || Utils3D.getCubeTexture
      : obj.getTexture || ShaderUIL.getTexture || Utils3D.getTexture;
    const set =
      _shader.parent && _shader.parent.setOverride
        ? _shader.parent.setOverride
        : _shader.set || _shader.setUniform;
    _shader.get || _shader.getUniform;
    let prefix = _shader.UILPrefix + '_tx',
      data = UILStorage.get(`${prefix}_${key}`);
    'string' == typeof data && (data = JSON.parse(data));
    let value = data ? data.src : null,
      change = (data) => {
        if (('string' == typeof data && (data = JSON.parse(data)), !data)) return;
        let val = data.src,
          cleanPath = val.includes('?') && !data.hotreload ? val.split('?')[0] : val;
        data.compressed && ((val += '-compressedKtx'), 'ktx2' === data.compressed && (val += '2'));
        _textures && (_textures[cleanPath] = change);
        data.src = cleanPath;
        UILStorage.set(`${prefix}_${key}`, data);
        set(
          key,
          getTexture(val, {
            premultiplyAlpha: obj.premultiplyAlpha,
            scale: obj.scale,
          }),
          _shader,
        );
      };
    if ((value && value.length && change(data), _group)) {
      let compressOptions = {};
      obj.cube && (compressOptions.cube = true);
      let img = new UILControlImage(prefix + key, {
        label: key,
        value: data,
        description: obj.description,
        compressOptions: compressOptions,
      });
      img.onFinishChange(change);
      _group.add(img);
      UILStorage.state.bind(`${prefix}_${key}`, (val) => change(val));
      self['forceUpdate' + key.toUpperCase()] = (_) => {
        img.force(_shader.get(key), true);
      };
    }
  }
  function createNumber(obj, key) {
    let initValue = UILStorage.get(`${prefix}${key}`);
    if ((undefined === initValue && (initValue = obj.value), _group)) {
      let number = new UILControlNumber(`${prefix}${key}`, {
        label: key,
        value: initValue,
        step: 0.05,
        description: obj.description,
      });
      number.onChange((val) => {
        _shader.ubo && (_shader.ubo.needsUpdate = true);
        obj.value = Number(val);
      });
      number.onFinishChange((e) => UILStorage.set(`${prefix}${key}`, e));
      _group.add(number);
      self['forceUpdate' + key.toUpperCase()] = (_) => {
        number.forceUpdate(Number(_shader.get(key)), true);
      };
      UILStorage.state.bind(`${prefix}${key}`, (val) => number.setValue(val));
    }
    obj.value = initValue;
  }
  function createColor(obj, key) {
    let initValue = UILStorage.get(`${prefix}${key}`) || obj.value.getHexString();
    if (_group) {
      let color = new UILControlColor(`${prefix}${key}`, {
        label: key,
        value: initValue,
        description: obj.description,
      });
      UILStorage.state.bind(`${prefix}${key}`, (val) => color.setValue(val));
      color.onChange((val) => {
        obj.value.set(val);
        _shader.ubo && (_shader.ubo.needsUpdate = true);
      });
      color.onFinishChange((e) => UILStorage.set(`${prefix}${key}`, e));
      _group.add(color);
      self['forceUpdate' + key.toUpperCase()] = (_) => {
        color.force(_shader.get(key).getHexString(), true);
      };
    }
    initValue && obj.value.set(initValue);
  }
  function createSelect(obj, key) {
    let initValue = UILStorage.get(`${prefix}${key}`);
    if (_group) {
      UILStorage.state.bind(`${prefix}${key}`, (val) => (obj.val = val));
      let { options: options, description: description } = obj,
        select = new UILControlSelect(`${prefix}${key}`, {
          label: key,
          value: initValue,
          options: options,
          description: description,
        });
      select.onChange((val) => {
        _group &&
          Events.emitter._fireEvent(ShaderUIL.UPDATE, {
            prefix: prefix,
            key: key,
            val: val,
            group: self,
          });
        obj.value = val;
        UILStorage.set(`${prefix}${key}`, val);
      });
      _group.add(select);
    }
    initValue && (obj.value = initValue);
  }
  function textureUpdate(e) {
    if (!_textures) return;
    let cleanPath = e.file.split('?')[0];
    for (let key in _textures) {
      cleanPath == (key.includes('?') ? key.split('?')[0] : key) &&
        _textures[key]({
          src: e.file,
          hotreload: true,
        });
    }
  }
  function update(e) {
    if (e.prefix == _shader.UILPrefix && e.group != self)
      if (e.color) {
        let val = e.val,
          obj = _shader.uniforms[e.key];
        Array.isArray(val) ? obj.value.setRGB(val[0], val[1], val[2]) : obj.value.set(val);
      } else
        e.texture
          ? 'remote' != e.texture && _shader.set(e.key, e.texture)
          : e.vector
            ? _shader.uniforms[e.key].value.fromArray(e.val)
            : (_shader.uniforms[e.key].value = e.val);
  }
  this.group = _group;
  this.shader = _shader;
  _group && (_shader.shaderUIL = self);
  (function initItems() {
    for (var key in _shader.uniforms) {
      let obj = _shader.uniforms[key];
      obj &&
        !obj.ignoreUIL &&
        (obj.options && Array.isArray(obj.options)
          ? createSelect(obj, key)
          : ('number' == typeof obj.value && createNumber(obj, key),
            obj.value instanceof Color && createColor(obj, key),
            (null === obj.value || obj.value instanceof Texture) && createTexture(obj, key),
            obj.value instanceof Vector2 && createVector(obj, key),
            obj.value instanceof Vector3 && createVector(obj, key),
            obj.value instanceof Vector4 && createVector(obj, key)));
    }
  })();
  _group &&
    (function addListeners() {
      Events.emitter._addEvent(ShaderUIL.UPDATE, update, self);
      Events.emitter._addEvent(ShaderUIL.TEXTURE_UPDATE, textureUpdate, self);
    })();
  this.setLabel = function (name) {
    _group && _group.setLabel(name);
  };
  this.forceUpdate = function (e) {
    e.prefix = _shader.UILPrefix;
    update(e);
    self['forceUpdate' + e.key.toUpperCase()]?.();
  };
  this.copyTexture = function (key, shader) {
    let newPrefix = shader.UILPrefix + '_tx',
      prefix = _shader.UILPrefix + '_tx',
      data = UILStorage.get(`${prefix}_${key}`);
    data && UILStorage.set(`${newPrefix}_${key}`, data);
  };
});

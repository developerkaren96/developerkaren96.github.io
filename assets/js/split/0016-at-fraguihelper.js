Class(
  function FragUIHelper(_obj, _root) {
    Inherit(this, Component);
    const self = this,
      invalidDomAttrs = ['refname', 'refname', '_innertext', '_type', '_placeholder'],
      _createdObjs = new Map();
    function isLowerCase(str) {
      return str.charAt(0) == str.charAt(0).toLowerCase();
    }
    function isCustomComponentType(type) {
      return (
        !isLowerCase(type) &&
        'UI' !== type &&
        'GLObject' !== type &&
        'glObject' !== type &&
        'glObj' !== type &&
        'GLText' !== type &&
        'glText' !== type &&
        'HydraObject' !== type
      );
    }
    function findStateObject(text) {
      return text.match(/\$(.*)\./)[1];
    }
    function getPropByString(obj, propString) {
      if (!propString) return obj;
      for (var props = propString.split('.'), i = 0, iLen = props.length - 1; i < iLen; i++) {
        var candidate = obj[props[i]];
        if (undefined === candidate) break;
        obj = candidate;
      }
      return obj[props[i]];
    }
    function parseTextBindings(text) {
      let binds = [];
      for (; text.match(/\$(.*)\./); ) {
        let match = text.match(/\$(.*)\./),
          split = text.split(match[0]);
        split[0] = split[0] + '@[';
        split[1] = split[1].split(' ');
        let name = split[1][0];
        split[1][0] += ']';
        split[1] = split[1].join(' ');
        text = split.join('');
        binds.push(name);
      }
      return [binds, text];
    }
    function parseTextGlobalBindings(text) {
      let binds = [];
      for (; text.match(/\$(\w*)\/(\w*)/); ) {
        let match = text.match(/\$(\w*)\/(\w*)/),
          split = text.split(match[0]);
        split[0] = split[0] + '@[';
        split[1] = split[1].split(' ');
        let name = match[0].slice(1).trim();
        split[1][0] = name;
        split[1][0] += ']';
        split[1] = split[1].join(' ');
        text = split.join('');
        binds.push(name);
      }
      return [binds, text];
    }
    function parseCSSTransformStr(obj) {
      let data = {};
      return (
        obj.split(',').forEach((param) => {
          let [a, b] = param.split(':');
          a = a.trim();
          b = b.trim();
          isNaN(b) || (b = Number(b));
          data[a] = b;
        }),
        data
      );
    }
    function doConstructor(obj) {
      switch (obj._type) {
        case 'UI':
          return self.parent.element || self.parent.getDOMElement?.();
        case 'GLObject':
        case 'glObject':
        case 'glObj':
          return obj.width && obj.height && obj.bg
            ? $gl(Number(obj.width), Number(obj.height), obj.bg)
            : $gl();
        case 'GLText':
        case 'glText':
          if (obj._innerText.match?.(/\$(.*)\./)) {
            let {
                font: font,
                fontSize: fontSize,
                fontColor: fontColor,
                _innerText: _innerText,
                ...options
              } = obj,
              $text = $glText(obj._innerText, obj.font, Number(obj.fontSize), {
                color: fontColor,
                ...options,
              }),
              state = findStateObject(obj._innerText),
              ref = state;
            const stateAsNumber = Number(ref);
            if (!isNaN(stateAsNumber))
              return (
                $obj.html(obj._innerText),
                $glText(obj._innerText, obj.font, Number(obj.fontSize), {
                  color: obj.fontColor,
                  width: obj.width,
                })
              );
            if (ref.includes('.')) {
              let split = state.split('.');
              ref = split[0];
              split.shift();
              state = split.join('.');
            }
            return (
              self.wait(self.parent, ref).then((_) => {
                let [binds, text] = parseTextBindings(obj._innerText);
                $text.setText(text);
                self.parent.bindState(
                  ref == state ? self.parent[ref] : getPropByString(self.parent[ref], state),
                  binds,
                  $text,
                );
              }),
              $text
            );
          }
          if (obj._innerText.match?.(/\$(\w*)\/(\w*)/)) {
            let [binds, text] = parseTextGlobalBindings(obj._innerText),
              {
                font: font,
                fontSize: fontSize,
                fontColor: fontColor,
                _innerText: _innerText,
                ...options
              } = obj,
              $text = $glText(obj._innerText, obj.font, Number(obj.fontSize), {
                color: fontColor,
                ...options,
              });
            return (self.parent.bindState(AppState, binds, $text), $text);
          }
          {
            let {
              font: font,
              fontSize: fontSize,
              fontColor: fontColor,
              _innerText: _innerText,
              ...options
            } = obj;
            return $glText(obj._innerText, obj.font, Number(obj.fontSize), {
              color: fontColor,
              ...options,
            });
          }
        default:
          let $obj = $(
            obj.className || obj.refName || 'h',
            'HydraObject' != obj._type ? obj._type : 'div',
          );
          if (
            (obj.width && obj.height && $obj.size(obj.width, obj.height),
            obj.font && $obj.fontStyle(obj.font, Number(obj.fontSize), obj.fontColor),
            obj._innerText)
          )
            if (obj._innerText.match?.(/\$(.*)\./)) {
              let state = findStateObject(obj._innerText),
                ref = state;
              const stateAsNumber = Number(ref);
              if (!isNaN(stateAsNumber)) return ($obj.html(obj._innerText), $obj);
              if (ref.includes('.')) {
                let split = state.split('.');
                ref = split[0];
                split.shift();
                state = split.join('.');
              }
              self.wait(self.parent, ref).then((_) => {
                let [binds, text] = parseTextBindings(obj._innerText);
                $obj.html?.(text);
                self.parent?.bindState(
                  ref == state ? self.parent[ref] : getPropByString(self.parent[ref], state),
                  binds,
                  $obj,
                );
              });
            } else if (obj._innerText.match?.(/\$(\w*)\/(\w*)/)) {
              let [binds, text] = parseTextGlobalBindings(obj._innerText);
              $obj.html(text);
              self.parent.bindState(AppState, binds, $obj);
            } else $obj.html(obj._innerText);
          return $obj;
      }
    }
    function applyValues(obj, $obj) {
      const callObjKeyVal = (key) =>
        new Promise((resolve) => {
          const applyValue = (val) => {
              if (
                !($obj instanceof GLUIObject || $obj instanceof GLUIText) ||
                ('width' !== key && 'height' !== key)
              )
                if ('function' == typeof $obj[key]) $obj[key](val);
                else {
                  if ($obj instanceof HydraObject && !invalidDomAttrs.includes(key.toLowerCase()))
                    if ('className' === key) {
                      if ('string' != typeof val || 'string' != typeof $obj.div.className) return;
                      $obj.classList().add(...val.split(/\s+/));
                      $obj.div.className.includes('$') &&
                        $obj.div.classList.forEach((className) => {
                          className.startsWith('$') && $obj.div.classList.remove(className);
                        });
                    } else $obj.attr(FragUIHelper.SVG_ALIAS.get(key) || key, val);
                  $obj[key] = val;
                }
            },
            callFn = async () => {
              let val = isNaN(obj[key]) ? obj[key] : Number(obj[key]);
              if ('string' == typeof val) {
                if (val.match(/\$(.*)\./)) {
                  let stateStr = findStateObject(val),
                    state = self.parent[stateStr];
                  state ||
                    (await self.wait(self.parent, stateStr), (state = self.parent[stateStr]));
                  state.then && (state = await state);
                  let [binds] = parseTextBindings(val);
                  return self.parent.bindState(state, binds, (dataVal) => applyValue(dataVal));
                }
                if (val.match(/\$(\w*)\/(\w*)/)) {
                  let [binds] = parseTextGlobalBindings(val);
                  return self.parent.bindState(AppState, binds, (dataVal) => applyValue(dataVal));
                }
                if (val.startsWith('$') && '$element' != val)
                  return applyValue(self.parent[val.slice(1)]);
              }
              applyValue(val);
            };
          if (self.parent.__afterInitClass)
            return self.parent.__afterInitClass.push(() => resolve(callFn()));
          resolve(callFn());
        });
      for (let key in obj)
        if ('_type' !== key && 'refName' !== key && 'children' !== key && 'display' !== key) {
          if ('shader' == key) {
            let shader = self.initClass(Shader, obj[key], {
              tMap: {
                value: null,
              },
            });
            if (window[shader.vsName]) {
              let mesh = $obj.mesh || {};
              mesh.shaderClass = self.parent.initClass(window[shader.vsName], mesh, shader);
            }
            $obj.useShader(shader);
          }
          if (
            (obj.width &&
              obj.height &&
              $obj.size &&
              $obj.size(
                isNaN(obj.width) ? obj.width : Number(obj.width),
                isNaN(obj.height) ? obj.height : Number(obj.height),
              ),
            'css' == key || 'transform' == key)
          )
            $obj[key](parseCSSTransformStr(obj[key]));
          else if ('onClick' == key || 'onHover' == key)
            $obj.useShader
              ? (self
                  .wait((_) => !!self.parent[obj[key].slice(1)])
                  .then((_) => {
                    const interactHandle = self.parent[obj[key].slice(1)];
                    $obj['__interact' + key] = interactHandle;
                  }),
                self
                  .wait((_) => !!$obj.__interactonHover && !!$obj.__interactonClick)
                  .then((_) => {
                    $obj.__interactonHover &&
                      ($obj.interact(
                        $obj.__interactonHover,
                        $obj.__interactonClick,
                        obj.seoLink,
                        obj.seoText,
                      ),
                      delete $obj.__interactonClick,
                      delete $obj.__interactonHover);
                  }))
              : self
                  .wait((_) => !!self.parent[obj[key].slice(1)])
                  .then((_) => {
                    const interactHandle = self.parent[obj[key].slice(1)];
                    let hoverFn = 'onHover' === key ? interactHandle : null,
                      clickFn = 'onClick' === key ? interactHandle : null;
                    $obj.interact(hoverFn, clickFn, obj.seoLink, obj.seoText);
                  });
          else if ('function' == typeof $obj[key]) {
            if ('size' == key) {
              let size = obj.size.split(',');
              size.map((x) => Number(x));
              $obj.size(size[0], size[1]);
              continue;
            }
            1 === obj[key] && (obj[key] = undefined);
            callObjKeyVal(key);
          } else callObjKeyVal(key);
        }
    }
    function convertToUsableRef(str) {
      str.startsWith('$') && (str = str.slice(1));
      let ref = str,
        state = str;
      if (str.includes('.')) {
        let split = str.split('.');
        state = split[0];
        split.shift();
        ref = split.join('.');
      }
      return [state, ref];
    }
    function create(obj, parent, isDeferredPhase = false) {
      if (isCustomComponentType(obj._type)) {
        if (propsRequireDefer(obj)) {
          if (!isDeferredPhase)
            return (
              (obj._placeholder = document.createElement('span')),
              void (parent.element || parent)?.add(obj._placeholder)
            );
        } else if (isDeferredPhase)
          return createChildren(obj, _createdObjs.get(obj), isDeferredPhase);
        let params = {},
          paramsState;
        for (let key in obj)
          if (
            '_type' !== key &&
            'refName' !== key &&
            'children' !== key &&
            'display' !== key &&
            '_placeholder' !== key &&
            'conditional' !== key
          )
            if (((params[key] = obj[key]), params[key].match?.(/\$(.*)\./))) {
              let [state, ref] = convertToUsableRef(params[key]);
              if (state == ref) params[key] = self.parent[state];
              else if (self.parent[state]?.isAppState && ref.indexOf('.') < 0) {
                let [binds, text] = parseTextBindings(params[key]),
                  binding = (newValue) => {
                    paramsState ? (paramsState[key] = newValue) : (params[key] = newValue);
                  };
                binding._string = text;
                self.parent.bindState(self.parent[state], binds, binding);
              } else params[key] = getPropByString(self.parent[state], ref);
            } else if (params[key].match?.(/\$(\w*)\/(\w*)/)) {
              let [binds, text] = parseTextGlobalBindings(params[key]),
                binding = (newValue) => {
                  paramsState ? (paramsState[key] = newValue) : (params[key] = newValue);
                };
              binding._string = text;
              self.parent.bindState(AppState, binds, binding);
            } else if (params[key].startsWith?.('$')) {
              let pk = params[key],
                value = self.parent[pk.slice(1)];
              null == value
                ? ((params['wait_' + key] = self
                    .wait(self.parent, pk.slice(1))
                    .then((_) => self.parent[pk.slice(1)])),
                  (params[key] = undefined))
                : (params[key] = value);
            }
        'ViewState' == obj._type && (params.__parent = parent);
        let $obj = self.parent.initClass(
          window[obj._type],
          (paramsState = AppState.createLocal(params, true)),
          isDeferredPhase ? null : [parent.element || parent],
        );
        if (isDeferredPhase) {
          if ($obj.element) {
            obj._placeholder.replaceWith($obj.element.div);
            const $parent = parent.element || parent;
            $parent && ($parent._children.push($obj.element), ($obj.element._parent = $parent));
            $obj.element.onMountedHook &&
              defer((_) => {
                $obj.element.onMountedHook();
                delete $obj.element.onMountedHook;
              });
          } else obj._placeholder.parentNode.removeChild(obj._placeholder);
          delete obj._placeholder;
        }
        return (
          (self.parent[obj.refName] = $obj),
          _createdObjs.set(obj, $obj),
          createChildren(obj, $obj, isDeferredPhase),
          void (params.css && $obj.element.css(parseCSSTransformStr(params.css)))
        );
      }
      if (isDeferredPhase) return createChildren(obj, _createdObjs.get(obj), isDeferredPhase);
      let $obj = doConstructor(obj);
      if (
        (undefined !== obj.conditional &&
          self.parent.state &&
          (self.parent.state.get(obj.conditional) ? $obj.show?.() : $obj.hide?.(),
          self.bindState(self.parent.state, obj.conditional, (bool) => {
            bool ? $obj.show?.() : $obj.hide?.();
          })),
        obj.addTo)
      ) {
        let addTo =
          obj.addTo.includes('.') || 'Stage' == obj.addTo ? eval(obj.addTo) : self.parent.element;
        addTo.add($obj);
      } else parent && parent.add($obj);
      applyValues(obj, $obj);
      $obj?.transform?.();
      obj.refName && (self.parent[obj.refName] = $obj);
      _createdObjs.set(obj, $obj);
      createChildren(obj, $obj, isDeferredPhase);
    }
    async function createChildren(obj, $obj, isDeferredPhase = false) {
      obj.children.forEach((o) => create(o, $obj, isDeferredPhase));
      !isDeferredPhase &&
        obj === _obj &&
        anyChildrenRequireDefer(obj) &&
        (await defer(), obj.children.forEach((o) => create(o, $obj, true)));
      obj === _obj && _createdObjs.clear();
    }
    function propsRequireDefer(obj) {
      if (isCustomComponentType(obj._type))
        for (let key in obj) {
          if (
            '_type' === key ||
            'refName' === key ||
            'children' === key ||
            'display' === key ||
            '_placeholder' === key
          )
            continue;
          let param = obj[key];
          if (param.startsWith?.('$')) return true;
        }
      return false;
    }
    function anyChildrenRequireDefer(obj) {
      return obj.children.some((o) => !!propsRequireDefer(o) || anyChildrenRequireDefer(o));
    }
    _obj.addTo || 'UI' == _obj._type || (_obj.addTo = '$element');
    _root && applyValues(_root, self.parent.element);
    create(_obj);
  },
  (_) => {
    FragUIHelper.SVG_ALIAS = new Map([
      ['acceptCharset', 'accept-charset'],
      ['htmlFor', 'for'],
      ['httpEquiv', 'http-equiv'],
      ['crossOrigin', 'crossorigin'],
      ['accentHeight', 'accent-height'],
      ['alignmentBaseline', 'alignment-baseline'],
      ['arabicForm', 'arabic-form'],
      ['baselineShift', 'baseline-shift'],
      ['capHeight', 'cap-height'],
      ['clipPath', 'clip-path'],
      ['clipRule', 'clip-rule'],
      ['colorInterpolation', 'color-interpolation'],
      ['colorInterpolationFilters', 'color-interpolation-filters'],
      ['colorProfile', 'color-profile'],
      ['colorRendering', 'color-rendering'],
      ['dominantBaseline', 'dominant-baseline'],
      ['enableBackground', 'enable-background'],
      ['fillOpacity', 'fill-opacity'],
      ['fillRule', 'fill-rule'],
      ['floodColor', 'flood-color'],
      ['floodOpacity', 'flood-opacity'],
      ['fontFamily', 'font-family'],
      ['fontSize', 'font-size'],
      ['fontSizeAdjust', 'font-size-adjust'],
      ['fontStretch', 'font-stretch'],
      ['fontStyle', 'font-style'],
      ['fontVariant', 'font-variant'],
      ['fontWeight', 'font-weight'],
      ['glyphName', 'glyph-name'],
      ['glyphOrientationHorizontal', 'glyph-orientation-horizontal'],
      ['glyphOrientationVertical', 'glyph-orientation-vertical'],
      ['horizAdvX', 'horiz-adv-x'],
      ['horizOriginX', 'horiz-origin-x'],
      ['imageRendering', 'image-rendering'],
      ['letterSpacing', 'letter-spacing'],
      ['lightingColor', 'lighting-color'],
      ['markerEnd', 'marker-end'],
      ['markerMid', 'marker-mid'],
      ['markerStart', 'marker-start'],
      ['overlinePosition', 'overline-position'],
      ['overlineThickness', 'overline-thickness'],
      ['paintOrder', 'paint-order'],
      ['panose-1', 'panose-1'],
      ['pointerEvents', 'pointer-events'],
      ['renderingIntent', 'rendering-intent'],
      ['shapeRendering', 'shape-rendering'],
      ['stopColor', 'stop-color'],
      ['stopOpacity', 'stop-opacity'],
      ['strikethroughPosition', 'strikethrough-position'],
      ['strikethroughThickness', 'strikethrough-thickness'],
      ['strokeDasharray', 'stroke-dasharray'],
      ['strokeDashoffset', 'stroke-dashoffset'],
      ['strokeLinecap', 'stroke-linecap'],
      ['strokeLinejoin', 'stroke-linejoin'],
      ['strokeMiterlimit', 'stroke-miterlimit'],
      ['strokeOpacity', 'stroke-opacity'],
      ['strokeWidth', 'stroke-width'],
      ['textAnchor', 'text-anchor'],
      ['textDecoration', 'text-decoration'],
      ['textRendering', 'text-rendering'],
      ['transformOrigin', 'transform-origin'],
      ['underlinePosition', 'underline-position'],
      ['underlineThickness', 'underline-thickness'],
      ['unicodeBidi', 'unicode-bidi'],
      ['unicodeRange', 'unicode-range'],
      ['unitsPerEm', 'units-per-em'],
      ['vAlphabetic', 'v-alphabetic'],
      ['vHanging', 'v-hanging'],
      ['vIdeographic', 'v-ideographic'],
      ['vMathematical', 'v-mathematical'],
      ['vectorEffect', 'vector-effect'],
      ['vertAdvY', 'vert-adv-y'],
      ['vertOriginX', 'vert-origin-x'],
      ['vertOriginY', 'vert-origin-y'],
      ['wordSpacing', 'word-spacing'],
      ['writingMode', 'writing-mode'],
      ['xmlnsXlink', 'xmlns:xlink'],
      ['xHeight', 'x-height'],
    ]);
  },
);

/*
 * Text3D — Object3D-flavoured wrapper around a $glText (the GLUI
 * MSDF text renderer) for use inside Scene3D layouts. Integrates
 * with the SceneLayout editor (InputUIL config + UIL fontStyle
 * editor) and exposes a rich animation/property surface to scene
 * code.
 *
 * UIL config (under `${prefix}_text3d`):
 *   - text         (textarea)   — the literal string. Supports
 *     `$DATA.foo.bar` placeholders which are eval'd against
 *     `self.parent.data` at create time.
 *   - fontStyle    (textarea)   — `key: value` per line; parsed
 *     into `_fontObject`. Numbers, `true`/`false` are coerced.
 *   - anchor2D     (toggle)     — 2D anchored text vs full 3D.
 *   - renderRetina (toggle)     — GLUIUtils retina-mode pass.
 *   - data         (hidden)     — JSON snapshot of `_fontObject`,
 *     refreshed when the sidebar updates any field.
 *
 * Text creation pipeline:
 *   - `createText(text, fontObject)` builds a `$glText`, then on
 *     shader-create time it patches in an optional custom shader
 *     (split `void main` from `Shaders.getShader(name+'.fs')`),
 *     instantiates `window[shaderName]` as a sibling class if it
 *     exists, and exposes the shader under UIL.
 *   - Default shader uniforms wired up on load: `uTransition`,
 *     `uOpacity`, `uTranslate/uRotate` (live vectors), word/letter/
 *     line counts, `uByWord/uByLine`, `uMouse` (Mouse.normal,
 *     smoothed 0.2 per frame), `uPadding`, `uScrollDelta` (Scroll
 *     unlimited, smoothed), bounding box min/max.
 *   - `MouseFluid.instance().applyTo(shader)` injects the
 *     mouse-fluid texture so shaders can sample it.
 *
 * Localized fallback (`Text3D.FallbackText` + `createFallbackTexture`):
 *   - If `fontObject.localize` (or `_input.forceLocalize`) is set
 *     and the configured font is missing glyphs for the text,
 *     swap to a rasterized texture-quad fallback. The fallback
 *     keeps the colour and alpha-tween API surface compatible
 *     with `$glText` so `setText` / `tween` etc. still work.
 *
 * Public API mirrors typical text components:
 *   - `setText` / `setColor` / `setProperties(obj)` /
 *     `setPropertiesCheck(obj, force)`.
 *   - `tween(val, time, ease, delay)` animates `uTransition` (or
 *     fallback alpha).
 *   - `set('animateByWord' | 'animateByLine' | 'animationPadding'
 *     | 'transition' | 'renderOrder', ...)`.
 *   - `getDimensions()` resolves the AABB once glyphs are laid out.
 *   - `ready()` resolves when shader is attached.
 *
 * Static helpers:
 *   - `Text3D.missingChars` — default `false`; can be overridden
 *     by app to opt into the localized fallback path.
 *   - `Text3D.measureScreen($text, camera, z)` — projects the
 *     text's world AABB into screen space (lazy ScreenProjection).
 */
Class(
  function Text3D(_input, _group) {
    Inherit(this, Object3D);
    const self = this;
    var _config, _fontObject, $text;
    this.translate = new Vector3();
    this.rotate = new Vector3();
    var _mouse = new Vector2();
    function initUIL() {
      (_config = InputUIL.create(_input.prefix + '_text3d', _group)).setLabel('Text3D');
      _config.addTextarea('text').addTextarea('fontStyle');
      _config.addToggle('anchor2D', false);
      _config.addToggle('renderRetina', false);
      _config.add('data', 'hidden');
      UIL.sidebar &&
        (_config.onUpdate = (key) => {
          if ('data' != key) {
            let text = parseData(_config.get('text')),
              obj = getFontObject();
            _config.setValue('data', JSON.stringify(obj));
            $text && ($text.setText(text, obj), obj.color && $text.setColor(obj.color));
            self.onUpdate && self.onUpdate();
          }
        });
    }
    function parseData(text) {
      if (!text || !text.includes('$DATA')) return text;
      for (; text.includes('$DATA'); ) {
        let code = text.split('$DATA')[1].split(' ')[0].split('\n')[0],
          line = '$DATA' + code;
        text = text.replace(line, eval(line.replace('$DATA', '_this.parent.data')));
      }
      return text;
    }
    function getFontObject() {
      let font = _config.get('fontStyle') || '',
        obj = {};
      return (
        (font = font.split('\n')),
        font.forEach((line) => {
          let key = (line = line.split(':'))[0],
            val = line[1];
          val && (val = val.replace(/ /g, ''));
          key.length &&
            ((obj[key] = isNaN(Number(val)) ? val : Number(val)),
            'false' === val && (obj[key] = false),
            'true' === val && (obj[key] = true));
        }),
        obj
      );
    }
    function initText() {
      if (!(_fontObject = JSON.parse(_config.get('data') || '{}')).size) return;
      Text3D.FONT_CONFIG && (_fontObject.config = Text3D.FONT_CONFIG);
      Text3D.LANG_BREAK && (_fontObject.langBreak = Text3D.LANG_BREAK);
      _fontObject.shader || (_fontObject.shader = 'Text3D');
      let text = parseData(_config.get('text'));
      text && createText(text, _fontObject);
    }
    async function overrideLocalize(text, fontObject, cb) {
      if (!text) return;
      self.localized = true;
      fontObject.text = text;
      self.text && self.text.destroy && self.text.destroy();
      self.text = new Text3D.FallbackText();
      self.text.setColor(_fontObject.color);
      self.text.onSetText = (text) => self.setText(text);
      Text3D.createFallbackTexture(text, fontObject).then((texture) => {
        self.text.setColor(fontObject.color);
        let geom = new PlaneGeometry(texture.width, texture.height);
        for (
          geom.computeBoundingBox(),
            'center' != fontObject.align &&
              geom.applyMatrix(new Matrix4().makeTranslation(texture.width / 2, 0, 0));
          self.group.children.length;
        )
          self.group.remove(self.group.children[0]);
        return (self.text.createMesh(geom, texture), self.add(self.text.group), self.text);
      });
    }
    function createText(text, fontObject) {
      if ((fontObject.localize || _input.forceLocalize) && Text3D.missingChars(text, fontObject))
        return overrideLocalize(text, fontObject);
      ($text = $glText(text, null, null, fontObject)).enable3D(_config.get('anchor2D'));
      GLUIUtils.setRetinaMode($text, _config.get('renderRetina'), self);
      $text.text.onCreateShader = (shader) => {
        let shaderName = _input.get('shader');
        shaderName &&
          (shader.fragmentShader?.length &&
            (shader.fragmentShader =
              shader.fragmentShader.split('void main')[0] +
              '\n' +
              Shaders.getShader(shaderName + '.fs')),
          (shader.customCompile = shaderName));
        $text.text3d = self;
        window[shaderName] &&
          ((self.shaderClass = self.parent.initClass(
            window[shaderName],
            $text,
            shader,
            _group,
            _input,
          )),
          ShaderUIL.add(shader, _group).setLabel('Shader'));
      };
      self.text = $text;
      let setText = $text.setText.bind($text);
      $text.setText = function (text, obj) {
        if (obj) for (let key in obj) _fontObject[key] = obj[key];
        _fontObject.text = text;
        setText(text, _fontObject);
        self.events.fire(Events.UPDATE);
        defer(setUniforms);
      };
      $text.loaded().then((_) => {
        if (!$text) return;
        self.shader = $text.mesh.shader;
        self.shader.addUniforms({
          uTransition: {
            value: 1,
            ignoreUIL: true,
          },
          uOpacity: {
            value: 1,
            ignoreUIL: true,
          },
          uTranslate: {
            value: self.translate,
          },
          uRotate: {
            value: self.rotate,
          },
          uWordCount: {
            value: 0,
            ignoreUIL: true,
          },
          uLetterCount: {
            value: 0,
            ignoreUIL: true,
          },
          uLineCount: {
            value: 0,
            ignoreUIL: true,
          },
          uByWord: {
            value: 0,
            ignoreUIL: true,
          },
          uByLine: {
            value: 0,
            ignoreUIL: true,
          },
          uMouse: {
            value: _mouse,
            ignoreUIL: true,
          },
          uPadding: {
            value: 0.3,
            ignoreUIL: true,
          },
          uScrollDelta: {
            value: 0,
            ignoreUIL: true,
          },
          uBoundingMin: {
            value: new Vector3().copy($text.dimensions.min),
            ignoreUIL: true,
          },
          uBoundingMax: {
            value: new Vector3().copy($text.dimensions.max),
            ignoreUIL: true,
          },
        });
        MouseFluid.instance().applyTo(self.shader);
        let scroll = Scroll.createUnlimited();
        self.startRender((_) => {
          self.shader.uniforms.uScrollDelta.value = Math.lerp(
            0.1 * scroll.delta.y,
            self.shader.uniforms.uScrollDelta.value,
            0.05,
          );
        });
        Text3D.onCreateShader && Text3D.onCreateShader(self.shader);
      });
      setUniforms();
    }
    async function setUniforms() {
      if ((await self.wait(self, 'shader'), await $text.loaded(), _input && _input.get)) {
        let depthWrite = _input.get('depthWrite'),
          depthTest = _input.get('depthTest');
        'boolean' == typeof depthWrite && ($text.mesh.shader.depthWrite = depthWrite);
        'boolean' == typeof depthTest && ($text.mesh.shader.depthTest = depthTest);
        let blending = _input.get('blending');
        blending && ($text.mesh.shader.blending = blending);
      }
      self.shader.set('uWordCount', $text.mesh.geometry.wordCount);
      self.shader.set('uLetterCount', $text.mesh.geometry.letterCount);
      self.shader.set('uLineCount', $text.mesh.geometry.lineCount);
      self.shader.set('uBoundingMin', new Vector3().copy($text.dimensions.min));
      self.shader.set('uBoundingMax', new Vector3().copy($text.dimensions.max));
    }
    self.wildcard = _input.get('wildcard');
    (async function () {
      self.group.text = self;
      initUIL();
      initText();
      Text3D.onCreate && Text3D.onCreate(self);
      self.startRender((_) => {
        _mouse.lerp(Mouse.normal, 0.2);
      });
    })();
    this.get('fontObject', (_) => _fontObject);
    this.setProperties = function (obj) {
      return (
        (obj = {
          ..._fontObject,
          ...obj,
        }),
        $text ? ($text.setText(obj.text, obj), setUniforms()) : createText(obj.text, obj),
        self.text.loaded()
      );
    };
    this.setPropertiesCheck = function (obj, force) {
      let applyProperties = false;
      for (const key in obj)
        _fontObject[key] !== obj[key] && ((applyProperties = true), (_fontObject[key] = obj[key]));
      return applyProperties || force ? self.setProperties() : Promise.resolve();
    };
    this.setText = function (text) {
      if (((_fontObject.text = text), $text)) {
        if (_fontObject.localize && Text3D.missingChars(text, _fontObject))
          return (
            self.group.remove($text.group),
            (self.shader = undefined),
            ($text = null),
            void createText(text, _fontObject)
          );
        $text.setText(text);
        setUniforms();
        $text.mesh && ($text.mesh.onBeforeRender(), $text.mesh.updateMatrixWorld(true));
      } else createText(text, _fontObject);
    };
    this.setColor = function (color) {
      _fontObject.color = color;
      self.text && self.text.setColor(color);
    };
    this.set('animateByWord', async (bool) => {
      self.localized || (await self.wait(self, 'shader'), self.shader.set('uByWord', bool ? 1 : 0));
    });
    this.set('animateByLine', async (bool) => {
      self.localized || (await self.wait(self, 'shader'), self.shader.set('uByLine', bool ? 1 : 0));
    });
    this.set('animationPadding', async (p) => {
      self.localized || (await self.wait(self, 'shader'), self.shader.set('uPadding', p));
    });
    this.set('transition', async (v) => {
      if (self.localized) return (self.text.alpha = v);
      await self.wait(self, 'shader');
      self.shader.set('uTransition', v);
    });
    this.tween = async function (val, time, ease, delay) {
      return self.localized
        ? self.text.tween(val, time, ease, delay)
        : (await self.wait(self, 'shader'),
          self.shader.tween('uTransition', val, time, ease, delay));
    };
    this.upload = function () {
      $text && $text.upload();
    };
    this.ready = function () {
      return self.wait(self, 'shader');
    };
    this.set('renderOrder', (v) => {
      $text && ($text.setZ(v), ($text.seoSortOrder = v));
    });
    this.getDimensions = async (_) => (
      await $text.loaded(),
      await $text.text.ready(),
      $text.dimensions
    );
  },
  (_) => {
    var _projection;
    Text3D.missingChars = function () {
      return false;
    };
    Text3D.measureScreen = async function ($text, camera = World.CAMERA, z = 0) {
      _projection || (_projection = new ScreenProjection(World.CAMERA));
      $text instanceof Text3D && ($text = $text.text);
      await $text.loaded();
      $text.mesh.onBeforeRender();
      $text.mesh.updateMatrixWorld(true);
      await defer();
      _projection.camera = camera;
      let bb = new Box3();
      bb.setFromObject($text.mesh);
      bb.min.z = bb.max.z = z;
      let min = _projection.project(bb.min).clone(),
        max = _projection.project(bb.max).clone();
      return {
        width: Math.abs(min.x - max.x),
        height: Math.abs(min.y - max.y),
      };
    };
  },
);

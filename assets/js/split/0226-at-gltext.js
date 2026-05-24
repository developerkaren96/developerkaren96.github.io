/*
 * GLText — high-level WebGL text mesh. Loads an MSDF/SDF bitmap
 * font (with optional bold and italic faces), generates a packed
 * glyph quad mesh via `GLTextGeometry`, and assembles a `Shader` +
 * `Mesh` ready to drop into a scene.
 *
 * Constructor takes a single options object:
 *   - `font`            — base font name (key into FONT_CONFIG /
 *                          GLTextGeometry.fontMapping).
 *   - `italic` / `bold` — names of the italic/bold faces, or false.
 *   - `text`            — string to render.
 *   - `width`           — line wrap width (Infinity for no wrap).
 *   - `align`           — left | center | right | justify.
 *   - `size`            — font scale.
 *   - `direction`       — 'ltr' | 'rtl'.
 *   - `letterSpacing`, `lineHeight`, `wordSpacing`, `paragraphSpacing`,
 *     `indent`          — typographic knobs.
 *   - `wordBreak`       — allow mid-word break on overflow.
 *   - `langBreak`       — regex of characters that act as soft
 *                          break opportunities (e.g. CJK).
 *   - `color`, `alpha`  — uniform inputs.
 *   - `shader`          — Shader template name (default 'DefaultText').
 *   - `customCompile`   — bypass shader-instance caching.
 *
 * Optional `GLText.overrideParams(opts)` hook lets the host app
 * tweak letterSpacing/size/wordSpacing/lineHeight globally (e.g.
 * for accessibility scaling); the original values are restored on
 * `resetOverride()` so getData() reflects the *requested* values.
 *
 * Output (after `loaded`):
 *   - `self.texture`        — base font atlas.
 *   - `self.textureBold` / `self.textureItalic` (if requested).
 *   - `self.shader`         — Shader instance with tMap/tMapBold/
 *                              tMapItalic/uColor/uAlpha uniforms,
 *                              transparent: true.
 *   - `self.geometry`       — Geometry with attributes:
 *                              position(3), uv(2), local(2),
 *                              animation(3), weight(1), index(1).
 *                              Plus letterCount / wordCount /
 *                              lineCount / boundingBox / boundingSphere.
 *   - `self.mesh`           — Mesh wrapping geometry + shader.
 *   - `self.height`         — overall pixel height.
 *
 * API:
 *   - `ready()` / `loaded()` — returns the load promise.
 *   - `centerY()` / `bottomY()` — vertical anchor helpers (re-applied
 *     on setText if `needsCenterY` / `needsBottomY` was set).
 *   - `setText(txt, options?)` — re-layout. Reuses the same geometry
 *     buffers (setArray) when possible. Returns a new load promise.
 *   - `resize(options)` — shorthand for setText(text, options).
 *   - `setColor(c)` / `tweenColor(c, ms, ease)`.
 *   - `getData()` — snapshot of all layout params (for cloning).
 *   - `destroy()` — releases the Mesh.
 *
 * Static:
 *   - `GLText.FONT_CONFIG` — registry of per-font fudge offsets
 *     (boldBaseOffset / italicBaseOffset / baseOffset).
 */
Class(
  function GLText({
    font: font,
    italic = false,
    bold = false,
    text: text,
    width = 1 / 0,
    align = 'left',
    size = 1,
    direction = 'ltr',
    letterSpacing = 0,
    lineHeight = 1,
    wordSpacing = 0,
    wordBreak = false,
    langBreak = false,
    paragraphSpacing = 1,
    indent = 0,
    color = new Color('#000000'),
    alpha = 1,
    shader = 'DefaultText',
    customCompile = false,
  }) {
    const self = this;
    var _override,
      _promise = Promise.create();
    const config = GLText.FONT_CONFIG[font];
    function overrideParams() {
      if (GLText.overrideParams) {
        _override = {
          letterSpacing: letterSpacing,
          size: size,
          wordSpacing: wordSpacing,
          lineHeight: lineHeight,
        };
        let obj = GLText.overrideParams({
          letterSpacing: letterSpacing,
          size: size,
          wordSpacing: wordSpacing,
          lineHeight: lineHeight,
        });
        letterSpacing = obj.letterSpacing;
        size = obj.size;
        wordSpacing = obj.wordSpacing;
        lineHeight = obj.lineHeight;
      }
    }
    function resetOverride() {
      _override &&
        ((letterSpacing = _override.letterSpacing),
        (size = _override.size),
        (wordSpacing = _override.wordSpacing),
        (lineHeight = _override.lineHeight));
    }
    !(function init() {
      overrideParams();
      self.charLength = text.length;
      self.text = new GLTextGeometry({
        font: font,
        italic: italic,
        bold: bold,
        text: text,
        width: width,
        align: align,
        direction: direction,
        wordSpacing: wordSpacing,
        letterSpacing: letterSpacing,
        paragraphSpacing: paragraphSpacing,
        size: size,
        lineHeight: lineHeight,
        wordBreak: wordBreak,
        langBreak: langBreak,
        config: config,
        indent: indent,
      });
      self.string = text;
      resetOverride();
      self.text.loaded.then(
        ({
          buffers: buffers,
          texture: texture,
          textureBold: textureBold,
          textureItalic: textureItalic,
          height: height,
          numLines: numLines,
        }) => {
          self.texture = texture;
          bold && (self.textureBold = textureBold);
          italic && (self.textureItalic = textureItalic);
          self.shader = new Shader(shader, {
            tMap: {
              value: self.texture,
              ignoreUIL: true,
            },
            tMapBold: {
              value: self.textureBold || Utils3D.getEmptyTexture(),
              ignoreUIL: true,
            },
            tMapItalic: {
              value: self.textureItalic || Utils3D.getEmptyTexture(),
              ignoreUIL: true,
            },
            uColor: {
              value: color,
              ignoreUIL: true,
            },
            uAlpha: {
              value: alpha,
              ignoreUIL: true,
            },
            transparent: true,
            customCompile: Utils.uuid(),
          });
          self.onCreateShader && self.onCreateShader(self.shader);
          (function createGeometry(buffers) {
            self.geometry = new Geometry();
            self.geometry.addAttribute('position', new GeometryAttribute(buffers.position, 3));
            self.geometry.addAttribute('uv', new GeometryAttribute(buffers.uv, 2));
            self.geometry.addAttribute('local', new GeometryAttribute(buffers.local, 2));
            self.geometry.addAttribute('animation', new GeometryAttribute(buffers.animation, 3));
            self.geometry.addAttribute('weight', new GeometryAttribute(buffers.weight, 1));
            self.geometry.setIndex(new GeometryAttribute(buffers.index, 1));
            self.geometry.boundingBox = buffers.boundingBox;
            self.geometry.boundingSphere = buffers.boundingSphere;
            self.geometry.letterCount = buffers.letterCount + 1;
            self.geometry.wordCount = buffers.wordCount + 1;
            self.geometry.lineCount = buffers.lineCount + 1;
          })(buffers);
          self.mesh = new Mesh(self.geometry, self.shader);
          self.height = height;
          _promise.resolve();
        },
      );
    })();
    undefined === font && console.log(font, text);
    this.destroy = function () {
      self.mesh && self.mesh.destroy && self.mesh.destroy();
    };
    this.ready = this.loaded = function () {
      return _promise;
    };
    this.centerY = function () {
      self.mesh.position.y = 0.5 * self.height;
      self.needsCenterY = true;
    };
    this.bottomY = function () {
      self.mesh.position.y = self.height;
      self.needsBottomY = true;
    };
    this.resize = function (options) {
      return this.setText(text, options);
    };
    this.tweenColor = function (c, time = 300, ease = 'easeOutCubic') {
      c && color.tween(c, time, ease);
    };
    this.setColor = function (c) {
      c && color.set(c);
    };
    this.setText = function (txt, options) {
      if (
        (text != txt ||
          !(function match(options) {
            return (
              !options ||
              (options.font == font &&
                options.italic == italic &&
                options.bold == bold &&
                options.width == width &&
                options.align == align &&
                options.direction == direction &&
                !(options.wordSpacing > 0 && options.wordSpacing != wordSpacing) &&
                options.letterSpacing == letterSpacing &&
                options.paragraphSpacing == paragraphSpacing &&
                options.size == size &&
                options.indent == indent &&
                options.lineHeight == lineHeight &&
                !(
                  (true === options.wordBreak && !options.wordBreak) ||
                  (0 == options.wordBreak && options.wordBreak)
                ))
            );
          })(options)) &&
        (text = txt)
      )
        return (
          (function setVars(options) {
            font = options.font || font;
            bold = options.bold || bold;
            italic = options.italic || italic;
            width = options.width || width;
            align = options.align || align;
            wordSpacing = options.wordSpacing || wordSpacing;
            letterSpacing = options.letterSpacing || letterSpacing;
            paragraphSpacing = options.paragraphSpacing || paragraphSpacing;
            size = options.size || size;
            lineHeight = options.lineHeight || lineHeight;
            wordBreak = options.wordBreak || wordBreak;
            langBreak = options.langBreak || langBreak;
            direction = options.direction || direction;
            indent = options.indent || indent;
          })(options || {}),
          overrideParams(),
          (self.string = text),
          (self.charLength = text.length),
          (self.text = new GLTextGeometry({
            font: font,
            italic: italic,
            bold: bold,
            text: text,
            width: width,
            align: align,
            direction: direction,
            wordSpacing: wordSpacing,
            letterSpacing: letterSpacing,
            paragraphSpacing: paragraphSpacing,
            size: size,
            lineHeight: lineHeight,
            wordBreak: wordBreak,
            langBreak: langBreak,
            config: config,
            indent: indent,
          })),
          resetOverride(),
          (_promise = Promise.create()),
          self.text.loaded.then(({ buffers: buffers, height: height }) => {
            !(function updateGeometry(buffers) {
              self.geometry.attributes.position.setArray(buffers.position);
              self.geometry.attributes.uv.setArray(buffers.uv);
              self.geometry.attributes.animation.setArray(buffers.animation);
              self.geometry.attributes.weight.setArray(buffers.weight);
              self.geometry.index = buffers.index;
              self.geometry.indexNeedsUpdate = true;
              self.geometry.boundingBox = buffers.boundingBox;
              self.geometry.boundingSphere = buffers.boundingSphere;
              self.geometry.letterCount = buffers.letterCount + 1;
              self.geometry.wordCount = buffers.wordCount + 1;
              self.geometry.lineCount = buffers.lineCount + 1;
            })(buffers);
            self.height = height;
            self.needsCenterY && self.centerY();
            self.needsBottomY && self.bottomY();
            _promise.resolve();
          }),
          _promise
        );
    };
    this.getData = function () {
      return {
        font: font,
        italic: italic,
        bold: bold,
        text: text,
        width: width,
        align: align,
        direction: direction,
        wordSpacing: wordSpacing,
        letterSpacing: letterSpacing,
        paragraphSpacing: paragraphSpacing,
        size: size,
        lineHeight: lineHeight,
        wordBreak: wordBreak,
        langBreak: langBreak,
        color: color,
        indent: indent,
      };
    };
  },
  (_) => {
    GLText.FONT_CONFIG = {};
  },
);

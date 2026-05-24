/*
 * GLTextGeometry — middle layer between GLText and the worker-side
 * layout engine. Loads the font JSON + atlas texture (regular and
 * optional bold/italic) and dispatches the actual glyph layout to
 * `GLTextThread` (0228) so the main thread doesn't stall on long
 * paragraphs.
 *
 * Constructor: same per-instance typography options as GLText (see
 * 0226). Returns immediately; consumers `await` the two promises:
 *   - `fontLoaded` — fonts (JSON + textures) have arrived.
 *   - `loaded`     — worker has finished layout; resolves with
 *                    `{ buffers, texture, textureBold, textureItalic,
 *                       height, numLines }`.
 *
 * `onLayout(buffers, texture, height, numLines)` — optional hook
 * called synchronously after layout, before `loaded` resolves.
 *
 * Static helpers attached to the constructor:
 *   - `GLTextGeometry.loadFont(font)` — returns a cached promise
 *     for `[json, texture, glyphs]`. The glyph map is built by
 *     indexing `json.chars` by `.char`.
 *   - `loadJSON` / `loadTexture` — internal asset lookup:
 *       * JSON: `<fontPath><fontMapping[font] || font>.json`.
 *       * Texture: prefers `.ktx2`, falls back to `.webp` (when
 *         supported and present in the SW asset manifest), else
 *         `.png`. Mipmaps disabled, LINEAR minFilter.
 *   - `GLTextGeometry.fontMapping` — alias table (e.g. logical name
 *     -> on-disk filename); also gates the use of `fontPath` (a
 *     custom font folder) vs the default `assets/fonts/`.
 *   - `GLTextGeometry.chars` — per-font character roster, populated
 *     after first load.
 */
Class(
  function GLTextGeometry({
    font: font,
    italic: italic,
    bold: bold,
    text: text,
    width = 1 / 0,
    align = 'left',
    size = 1,
    direction = 'ltr',
    letterSpacing = 0,
    paragraphSpacing = 1,
    indent = 0,
    lineHeight = 1.4,
    wordSpacing = 0,
    wordBreak = false,
    langBreak = false,
    config = {},
  }) {
    let json,
      texture,
      glyphs,
      bJson,
      bTexture,
      bGlyphs,
      iJson,
      iTexture,
      iGlyphs,
      self = this;
    self.loaded = Promise.create();
    self.fontLoaded = Promise.create();
    (async function init() {
      await (async function loadFont() {
        [json, texture, glyphs] = await GLTextGeometry.loadFont(font);
        bold && ([bJson, bTexture, bGlyphs] = await GLTextGeometry.loadFont(bold));
        italic && ([iJson, iTexture, iGlyphs] = await GLTextGeometry.loadFont(italic));
        self.fontLoaded.resolve();
      })();
      (async function createGeometry() {
        let buffers = await GLTextThread.generate({
          font: font,
          bold: bold,
          italic: italic,
          text: text,
          width: width,
          align: align,
          size: size,
          direction: direction,
          letterSpacing: letterSpacing,
          paragraphSpacing: paragraphSpacing,
          indent: indent,
          lineHeight: lineHeight,
          wordSpacing: wordSpacing,
          wordBreak: wordBreak,
          langBreak: langBreak,
          json: json,
          glyphs: glyphs,
          bJson: bJson,
          bGlyphs: bGlyphs,
          iJson: iJson,
          iGlyphs: iGlyphs,
          config: config,
        });
        self.buffers = buffers;
        self.texture = texture;
        self.textureBold = bTexture;
        self.textureItalic = iTexture;
        self.numLines = buffers.lineLength;
        self.height = self.numLines * size * lineHeight;
        self.onLayout && self.onLayout(buffers, texture, self.height, self.numLines);
        self.loaded.resolve({
          buffers: buffers,
          texture: texture,
          textureBold: bTexture,
          textureItalic: iTexture,
          height: self.height,
          numLines: self.numLines,
        });
      })();
    })();
  },
  (_) => {
    async function loadJSON(font) {
      return await get(
        (function getPathTo(font, ext) {
          let fontName = GLTextGeometry.fontMapping[font] || font,
            suffix = ext ? `.${ext}` : '';
          return Assets.getPath(`${getFontPath(font)}${fontName}${suffix}`);
        })(font, 'json'),
      );
    }
    async function loadTexture(font) {
      let base = `${getFontPath(font)}${font}`,
        path =
          [`${base}.ktx2`, Assets.supportsWebP() && `${base}.webp`]
            .filter(Boolean)
            .find((candidate) => (window.ASSETS?.SW || []).includes(candidate)) || `${base}.png`,
        texture = await Utils3D.getTexture(path);
      return ((texture.generateMipmaps = false), (texture.minFilter = Texture.LINEAR), texture);
    }
    function getFontPath(font) {
      return GLTextGeometry.fontMapping[font] && GLTextGeometry.fontPath
        ? GLTextGeometry.fontPath
        : 'assets/fonts/';
    }
    let _promises = {};
    GLTextGeometry.fontMapping = {};
    GLTextGeometry.chars = {};
    GLTextGeometry.loadFont = function (font) {
      if (!_promises[font]) {
        let promise = Promise.create();
        _promises[font] = promise;
        (async function () {
          let [json, texture] = await Promise.all([loadJSON(font), loadTexture(font)]),
            glyphs = {};
          json.chars.forEach((d) => (glyphs[d.char] = d));
          promise.resolve([json, texture, glyphs]);
          GLTextGeometry.chars[font] = json.chars;
        })();
      }
      return _promises[font];
    };
  },
);

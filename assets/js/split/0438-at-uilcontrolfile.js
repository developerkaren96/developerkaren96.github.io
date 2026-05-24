/*
 * UILControlFile — generic file-input UILControl (used by
 * Geometry / model paths; the image-specific variant is
 * 0439). Stores a structured value:
 *   { src, relative, prefix, filename }
 *
 * The visible <input type=text> shows the relative path. A
 * hidden <input type=file> + "Select File" button trigger
 * the OS file picker; on change, the chosen file's name is
 * appended to prefix+relative to build the final src and
 * the change is committed via self.finish().
 *
 * inputTextChange: typing 'World' or 'SceneLayout' is
 * detected (the includes-array idiom returns truthy if any
 * substring matches) so the path can be a class-name pointer
 * rather than an asset filename.
 *
 * previewImage div toggles visibility based on state.hasFile
 * and updates a --preview-background CSS var with the file's
 * URL.
 *
 * Standard Fragment plumbing.
 */
Class(function UILControlFile(_params, ...restArgs) {
  const self = this;
  Inherit(self, UILControl);
  Inherit(self, XComponent);
  self.fragName = 'UILControlFile';
  self.contexts = 'UILControl';
  self.params = _params;
  self.args = arguments;
  this.isFragment = true;
  var _promises = [];
  !(async function () {
    self.element && (self.element.onMountedHook = (_) => self.onMounted?.());
    self.initClass(FragUIHelper, {
      _type: 'UI',
      refName: 'unnamed',
      children: [
        {
          className: 'form-group',
          _type: 'div',
          refName: 'unnamed',
          children: [
            {
              id: '$state.id',
              _type: 'label',
              _innerText: '$state.label',
              refName: 'unnamed',
              children: [],
            },
            {
              className: 'content',
              _type: 'div',
              refName: 'unnamed',
              children: [
                {
                  title: '$state.fileUrl',
                  _type: 'div',
                  refName: 'previewImage',
                  children: [],
                },
                {
                  type: 'text',
                  id: 'geometry-text-input',
                  ariaLabelledBy: '$state.id',
                  placeholder: '$state.placeholder',
                  _type: 'input',
                  refName: 'inputText',
                  children: [],
                },
                {
                  type: 'file',
                  id: '$state.inputFileId',
                  ariaLabelledBy: '$state.id',
                  _type: 'input',
                  refName: 'inputFile',
                  children: [],
                },
                {
                  _type: 'button',
                  _innerText: 'Select File',
                  refName: 'inputButton',
                  children: [],
                },
              ],
            },
          ],
        },
      ],
    });
    self.params = _params;
    self.args = arguments;
    self.parent?.layers && (self.layers = self.parent.layers);
    self.layout?.getAllLayers && (self.layers = await self.layout.getAllLayers());
    self.params = Object.assign(
      {},
      {
        id: self.params,
      },
      {
        options: restArgs[0],
      },
    );
    self.state.set('id', self.params.id);
    self.state.set('inputFileId', self.params.id + '-inputFile');
    self.state.set('inputTextId', self.params.id + '-inputText');
    self.state.set('placeholder', self.params.options.relative);
    const ogValues = {
      src: self.params.options.src || '',
      relative: self.params.options.relative || '',
      prefix: self.params.options.prefix || '',
      filename: self.params.options.filename || '',
    };
    function togglePreviewImage() {
      self.state.hasFile ? self.previewImage.show() : self.previewImage.hide();
    }
    function setPreviewImage() {
      self.element.div.style.setProperty(
        '--preview-background',
        `url(${self.state.get('fileUrl')})`,
      );
    }
    async function inputFileChange(event) {
      let file = event.target.files[0];
      self.state.set('hasFile', true);
      self.value.filename = file.name;
      self.value.relative = (function getRelative() {
        return self.inputText.div.value.includes(self.value.prefix)
          ? self.inputText.div.value.replace(self.value.prefix, '')
          : self.inputText.div.value;
      })();
      self.value.src = (function getSrc() {
        return self.value.filename && self.value.filename.includes('http')
          ? self.value.filename
          : `${self.value.prefix ? self.value.prefix + '/' : ''}${self.value.relative ? self.value.relative + '/' : ''}${self.value.filename}`;
      })();
      self.finish();
    }
    async function inputTextChange(event) {
      event.target.value &&
        (self.inputText.val().includes(['World', 'SceneLayout']),
        (self.value = {
          src: '',
          relative: self.inputText.val(),
          prefix: '',
          filename: '',
        }),
        self.finish());
    }
    self.value = Object.assign({}, ogValues);
    self.inputFile.classList().add('sr-only');
    self.inputButton.classList().add('small');
    self.init(self.params.id, self.params.options);
    togglePreviewImage();
    (function toggleTextInput() {
      self.inputText.show();
    })();
    (function initListeners() {
      self.inputButton.click(() => self.inputFile.div.click());
      self.inputFile.bind('change', inputFileChange);
      self.inputText.bind('change', inputTextChange);
      self.bindState(self.state, 'fileUrl', setPreviewImage);
      self.bindState(self.state, 'hasFile', togglePreviewImage);
    })();
    self.onInit = () => {
      self.value &&
        self.value.src &&
        (self.state.set('hasFile', true),
        self.state.set('fileUrl', self.value.src),
        (self.inputText.div.value = self.value.filename));
    };
    self.force = function (value, isClipboard) {};
    self.onDestroy = function () {};
    self.element.goob(
      '\n    & {}\n\n    .path {\n        margin-bottom: var(--spacing-small);\n    }\n\n    .content {\n        display: flex;\n        flex-direction: column;\n        gap: var(--spacing-small);\n    }\n\n    .previewImage {\n        background-image: var(--preview-background);\n        background-size: cover;\n        background-position: center;\n        background-repeat: no-repeat;\n        width: 100%;\n        aspect-ratio: 16 / 9;\n        display: none;\n    }\n',
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

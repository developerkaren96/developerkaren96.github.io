/*
 * UILControlImage — image-asset UILControl (textures, atlas
 * sources etc.). Strong superset of UILControlFile (0438):
 * adds a 160×128 preview thumbnail, "Browse Assets" (opens
 * UILExternalFilePicker for the 'textures' bucket),
 * "Compress" button (KTX2 / KTX), "Use Compressed" checkbox,
 * delete (✕) button, drag-and-drop + remote upload support.
 *
 * Value shape:
 *   { src, relative, prefix='assets/images', filename,
 *     compressed: false|true|'ktx2', useCompressed: bool }
 *
 * Compression pipeline:
 *   - supportsKtx2() probes whether the project has the
 *     `compressktx2` UIL script available; caches the result
 *     on Dev.supportsKtx2 to avoid re-probing.
 *   - compressKtx2() shells out to that script with
 *     `--genmipmap --encode etc1s` (plus `--cubemap` when the
 *     source is a cubemap face set). For cubemaps it derives
 *     the 6 face paths via Utils3D.splitCubemapPath +
 *     getCubemapFacePaths and outputs a single .ktx2.
 *   - compressClick() flips the button bg through yellow
 *     (pending) → green/red (result) and re-finish()es.
 *
 * Upload path: when window.UIL_REMOTE is set the chosen file
 * is uploaded via UILStorage.uploadFileToRemoteBucket
 * (progress div tracks bytes) and the returned customMetadata
 * .path becomes the filename.
 *
 * Validation: change() fetches the resolved src; if it 404s
 * an alert pops and the value is rejected. force() (called
 * from file picker / clipboard) reapplies a value plus the
 * KTX2 mode-switch.
 *
 * Standard Fragment plumbing.
 */
Class(function UILControlImage(_params, ...restArgs) {
  const self = this;
  Inherit(self, UILControl);
  Inherit(self, XComponent);
  self.fragName = 'UILControlImage';
  self.contexts = 'UILControl';
  self.params = _params;
  self.args = arguments;
  this.isFragment = true;
  var _promises = [];
  !(async function () {
    function openFilePicker() {
      new UILExternalFilePicker(filePickerSelected, 'textures');
    }
    function filePickerSelected(value) {
      console.log('file selected: ' + value);
      window.UIL_REMOTE && console.warn('UIL_REMOTE is not supported when using file picker!');
      const v = {
        compressed: false,
        filename: value.split('/').last(),
        prefix: 'assets/images',
        relative: 'assets/images',
        src: `assets/images/${value}`,
      };
      self.force(v, true);
      self.finish();
    }
    async function supportsKtx2() {
      if (undefined === Dev.supportsKtx2)
        try {
          await Dev.execUILScript('compressktx2', {
            options: ['--help'],
            output: '',
            src: [],
          });
          Dev.supportsKtx2 = true;
        } catch (e) {
          console.log(
            '%cKTX2 support not found in this project%c. 💁‍️ See https://www.notion.so/a91bbc09b19d4475bfc5bcb8d6048d70 for upgrade instructions',
            'background-color: #ffde7b',
            'background-color: unset',
          );
          Dev.supportsKtx2 = false;
        }
      return Dev.supportsKtx2;
    }
    async function compressKtx2() {
      let result,
        path = self.value.src.split('?')[0];
      if (self.params.options.compressOptions?.cube) {
        self.compress.bg('#fdb460').html('Cubemap');
        let [output, src] = (function parseCubePaths(path) {
          let info = Utils3D.splitCubemapPath(path),
            src = Utils3D.getCubemapFacePaths(info);
          return [`${info.prefix}.ktx2`, src];
        })(path);
        result = await Dev.execUILScript('compressktx2', {
          options: ['--genmipmap', '--encode', 'etc1s', '--cubemap'],
          output: output,
          src: src,
        });
      } else {
        let noext = (function removeImageExtension(filename) {
            const lastDotIndex = filename.lastIndexOf('.');
            return -1 !== lastDotIndex ? filename.substring(0, lastDotIndex) : filename;
          })(path.split('/').last()),
          folder = (function getFolderPath(url) {
            return ((url = url.split('/')).last().includes('.') && url.pop(), url.join('/'));
          })(path);
        result = await Dev.execUILScript('compressktx2', {
          options: ['--genmipmap', '--encode', 'etc1s'],
          output: `${folder}/${noext}.ktx2`,
          src: [path],
        });
      }
      return 'Error' !== result;
    }
    async function compressClick() {
      if (!self.value.src || self.flag('compressPending')) return;
      self.flag('compressPending', true);
      self.compress.bg('#f4ee42').text('---');
      let success = false;
      try {
        if (await supportsKtx2()) success = await compressKtx2();
        else {
          'Error' !==
            (await Dev.execUILScript('compressktx', {
              src: self.value.src.split('?')[0],
            })) && (success = true);
        }
      } catch (e) {
        console.error(e);
      }
      success
        ? self.compress.bg('#46f441').html('Success')
        : self.compress.bg('#f44141').html('Failed');
      self.flag('compressPending', false);
      self.finish();
    }
    async function checkChange() {
      let compressed = !!self.check.div.checked;
      compressed && (await supportsKtx2()) && (compressed = 'ktx2');
      self.value.compressed = compressed;
      self.value.useCompressed = !!compressed;
      self.finish();
    }
    async function change() {
      let file = self.picker.div.files[0];
      if (!file) return;
      let name = file.name;
      if (window.UIL_REMOTE) {
        const { customMetadata: customMetadata } = await UILStorage.uploadFileToRemoteBucket({
          file: file,
          progress: self.progress,
        });
        name = customMetadata.path;
      }
      self.value.filename = name;
      self.value.relative = (function getRelative() {
        return self.value.filename.includes('http')
          ? ''
          : self.value.relative.includes(self.value.prefix)
            ? self.value.relative.replace(`${self.value.prefix}`, '')
            : self.value.relative;
      })();
      self.value.src = (function getSrc() {
        return self.value.filename.includes('http')
          ? self.value.filename
          : `${self.value.prefix ? self.value.prefix + '/' : ''}${self.value.relative ? self.value.relative + '/' : ''}${self.value.filename}`;
      })();
      self.value.compressed = !!self.check.div.checked;
      self.value.useCompressed = self.value.compressed;
      let compressed = !!self.check.div.checked;
      compressed && (await supportsKtx2()) && (compressed = 'ktx2');
      self.value.compressed = compressed;
      self.value.useCompressed = !!compressed;
      (await (function imageExists(url) {
        return (
          !!url.includes('http') ||
          ((url = Assets.getPath(url)),
          fetch(url)
            .then((e) => 404 != e.status)
            .catch((e) => console.warn('UILControlImage image url validation failed', e)))
        );
      })(self.value.src))
        ? ((self.value = Object.assign({}, self.value)),
          (self.picker.div.value = ''),
          self.picker.attr('title', self.value.src),
          self.img.css({
            backgroundImage: `url(${Assets.getPath(self.value.src)})`,
          }),
          self.delete.show(),
          self.finish())
        : ((self.picker.div.value = ''),
          console.warn('UIL: Could not find image', self.value),
          alert(`"${self.value.src}" not found!\nMake sure "relative path" is correct.`));
    }
    function deleteImage() {
      self.value = {
        src: '',
        relative: '',
        prefix: 'assets/images',
        filename: '',
        useCompressed: false,
      };
      self.input.div.value = '';
      self.picker.div.value = '';
      self.picker.attr('title', null);
      self.img.css({
        backgroundImage: '',
      });
      self.delete.hide();
      self.value = Object.assign({}, self.value);
      self.finish();
    }
    function inputChange() {
      self.value.relative = self.input.div.value;
    }
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
              htmlFor: 'image',
              _type: 'label',
              _innerText: '$state.label',
              refName: 'unnamed',
              children: [],
            },
            {
              type: 'text',
              className: 'path',
              _type: 'input',
              refName: 'input',
              children: [],
            },
          ],
        },
        {
          className: 'wrapper',
          _type: 'div',
          refName: 'unnamed',
          children: [
            {
              className: 'preview',
              _type: 'div',
              refName: 'unnamed',
              children: [
                {
                  _type: 'div',
                  refName: 'img',
                  children: [],
                },
                {
                  className: 'picker',
                  type: 'file',
                  id: 'imageFile',
                  accept: 'image/*',
                  _type: 'input',
                  refName: 'picker',
                  children: [],
                },
                {
                  className: 'progress',
                  _type: 'div',
                  refName: 'unnamed',
                  children: [],
                },
                {
                  _type: 'button',
                  refName: 'delete',
                  children: [
                    {
                      width: 10,
                      height: 10,
                      viewBox: '0 0 10 10',
                      fill: 'none',
                      stroke: 'currentColor',
                      xmlns: 'http://www.w3.org/2000/svg',
                      _type: 'svg',
                      refName: 'unnamed',
                      children: [
                        {
                          strokeWidth: 2,
                          strokeLinecap: 'round',
                          d: 'M2 2l6 6M2 8l6-6',
                          _type: 'path',
                          refName: 'unnamed',
                          children: [],
                        },
                      ],
                    },
                  ],
                },
                {
                  className: 'copy',
                  _type: 'div',
                  _innerText: 'Drag and drop your file here',
                  refName: 'unnamed',
                  children: [],
                },
              ],
            },
            {
              className: 'preview-controls',
              _type: 'div',
              refName: 'unnamed',
              children: [
                {
                  className: 'control-button small',
                  _type: 'button',
                  _innerText: 'Browse Assets',
                  refName: 'browseButton',
                  children: [],
                },
                {
                  className: 'control-button small',
                  _type: 'button',
                  _innerText: 'Compress',
                  refName: 'compress',
                  children: [],
                },
                {
                  className: 'checkbox-control',
                  htmlFor: '$state.compressedInput',
                  _type: 'label',
                  refName: 'unnamed',
                  children: [
                    {
                      className: 'regular-checkbox',
                      type: 'checkbox',
                      name: '$state.compressedInput',
                      id: '$state.compressedInput',
                      _type: 'input',
                      refName: 'check',
                      children: [],
                    },
                    {
                      _type: 'span',
                      _innerText: 'Use Compressed',
                      refName: 'unnamed',
                      children: [],
                    },
                  ],
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
    self.state.set('compressedInput', `${self.params.id}-compressed`);
    self.params.options.value = Object.assign(
      {
        src: '',
        relative: self.params.options.relative || '',
        prefix: self.params.options.prefix,
        filename: '',
        useCompressed: false,
      },
      self.params.options.value,
    );
    self.value = Object.assign({}, self.params.options.value);
    self.init(self.params.id, self.params.options);
    self.check.div.checked = self.params.options.value.useCompressed;
    self.value.relative
      ? (self.input.div.value = self.value.relative)
      : self.input.attr('placeholder', 'Relative Path');
    self.delete.hide();
    self.value.src &&
      self.img.css({
        backgroundImage: `url('${Assets.getPath(self.value.src)}')`,
      });
    (function initListeners() {
      self.picker.div.addEventListener('change', change, false);
      self.input.div.addEventListener('change', inputChange, false);
      self.browseButton.click(openFilePicker);
      self.delete.div.onclick = deleteImage;
      self.compress.div.onclick = compressClick;
      self.check.div.onchange = checkChange;
    })();
    self.force = async function (value, isClipboard) {
      self.value = Object.assign({}, value);
      self.input.div.value = self.value.relative;
      self.picker.div.value = '';
      self.picker.attr('title', self.value.src);
      console.log(value);
      self.img.css({
        backgroundImage: `url('${Assets.getPath(self.value.src)}')`,
      });
      self.check.div.checked = self.value.compressed;
      let compressed = !!self.check.div.checked;
      compressed && (await supportsKtx2()) && (compressed = 'ktx2');
      self.value.compressed = compressed;
      self.value.useCompressed = !!compressed;
    };
    self.onDestroy = function () {
      self.picker.div.removeEventListener('change', change, false);
      self.input.div.removeEventListener('change', inputChange, false);
    };
    self.element.goob(
      '\n    & {}\n\n    .form-group {\n        margin-bottom: var(--spacing-small);\n    }\n\n    .picker {\n        &:focus {\n            .img {\n                border-color: var(--color-accent-80);\n            }\n        }\n    }\n\n    .wrapper {\n        display: flex;\n        gap: var(--spacing-small);\n    }\n\n    .preview {\n        width: 160px;\n        height: 128px;\n        box-sizing: border-box;\n        position: relative;\n        display: flex;\n        align-items: center;\n        justify-content: center;\n        overflow: hidden;\n        flex-shrink: 0;\n    }\n\n    .img {\n        width: 100%;\n        height: 100%;\n        position: absolute;\n        inset: 0px;\n        background-size: cover;\n        background-repeat: no-repeat;\n        background-position: center center;\n        border: 1px dotted var(--color-neutral-40);\n        text-align: center;\n    }\n\n    .picker {\n        position: absolute;\n        opacity: 0;\n        inset: 0px;\n    }\n\n    .progress {\n        position: absolute;\n        bottom: 0px;\n        height: 10px;\n        left: 0px;\n        background: rgb(155, 156, 155);\n    }\n\n    .copy {\n        color: var(--color-neutral-80);\n        font: var(--label2);\n        padding: var(--spacing-small);\n        text-align: center;\n    }\n\n    .control-button {\n        margin-bottom: calc(var(--spacing-small) / 2);\n        width: 100%;\n    }\n',
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

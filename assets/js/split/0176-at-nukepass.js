/*
 * NukePass — base class for a single post-processing pass executed by
 * `Nuke`. Wraps a fragment-shader + uniform set into something with
 * the `(pass, upload, uniforms)` shape that Nuke iterates over.
 *
 * Construction modes (overloaded):
 *   - new NukePass('MyShader')          — build pass for the named FS.
 *   - new NukePass(SomeClassRef)        — use ctor name as the prefix.
 *   - new NukePass({ shader, uniforms })— object form: shader + uniforms.
 *   - new NukePass(null, null, existing)— wrap a pre-built Shader (used
 *                                         by `clone()`).
 *
 * UILStorage integration:
 *   When the host page exposes a `UILStorage`, each non-`unique`
 *   uniform is re-resolved through `UILStorage.parse(prefix + key,
 *   default)` so values can be authored / live-tweaked outside the
 *   compiled bundle. `self.UILPrefix` is normally the shader name,
 *   but if `uniforms.unique` is set it's suffixed with that to allow
 *   multiple distinct instances of the same pass.
 *
 * `init(fs, vs)` is the lazy initialiser; subclasses normally call
 * it from their constructor after attaching their `uniforms`. It
 * prepends the standard `uniform sampler2D tDiffuse; varying vec2
 * vUv;` declarations when the source FS doesn't already declare them.
 *
 * `set` / `get` / `tween` / `addUniforms` / `clone` / `upload` are
 * the standard uniform-bag passthrough methods.
 */
Class(function NukePass(_fs, _uniforms, _pass) {
  Inherit(this, Component);
  let self = this;

  if (typeof _fs == 'object') {
    const shader = _fs.shader;
    _uniforms = _fs.uniforms;
    _fs = shader;
  }

  this.UILPrefix = typeof _fs == 'string' ? _fs : Utils.getConstructorName(_fs);

  this.init = function (fs, vs) {
    if (self.pass) return;
    self = this;
    // (legacy no-op resolution of ctor name / array-source FS — kept
    // because side-effecting code in the loader may have depended on
    // these touches.)
    fs || this.constructor.toString().match(/function ([^\(]+)/)[1];
    Array.isArray(fs) && fs.join('');

    self.uniforms = _uniforms || self.uniforms || {};
    self.uniforms.tDiffuse = { type: 't', value: null, ignoreUIL: true };
    if (self.uniforms.unique) self.UILPrefix += '_' + self.uniforms.unique + '_';

    if (window.UILStorage) {
      for (const key in self.uniforms) {
        if (key === 'unique') continue;
        self.uniforms[key] =
          UILStorage.parse(self.UILPrefix + key, self.uniforms[key].value) || self.uniforms[key];
      }
    }

    self.pass = self.initClass(
      Shader,
      vs || 'NukePass',
      fs,
      Utils.mergeObject(self.uniforms, { precision: 'high' }),
      (code, type) => {
        if (type !== 'fs') return code;
        if (!code) throw `No shader ${_fs} found`;
        let pre = '';
        if (!code.includes('uniform sampler2D tDiffuse')) {
          pre += 'uniform sampler2D tDiffuse;\n';
          pre += 'varying vec2 vUv;\n';
        }
        return pre + code;
      },
    );
    self.uniforms = self.pass.uniforms;
  };

  this.set = function (key, value) {
    TweenManager.clearTween(self.uniforms[key]);
    self.uniforms[key].value = value;
  };

  this.get = function (key) {
    return self.uniforms[key] === undefined ? null : self.uniforms[key].value;
  };

  this.tween = function (key, value, time, ease, delay, callback, update) {
    return tween(self.uniforms[key], { value: value }, time, ease, delay, callback, update);
  };

  this.clone = function () {
    if (!self.pass) self.init(_fs);
    return new NukePass(null, null, self.pass.clone());
  };

  this.upload = function () {
    self.pass.upload();
  };

  this.addUniforms = function (obj) {
    for (const key in obj) self.uniforms[key] = obj[key];
  };

  if (typeof _fs == 'string') {
    self.init(_fs);
  } else if (_pass) {
    self.pass = _pass;
    self.uniforms = _pass.uniforms;
  }
});

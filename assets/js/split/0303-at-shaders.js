/*
 * Shaders — registry / loader for all GLSL source in the bundle.
 * Source is shipped as a single concatenated blob with `{@}name`
 * delimiters; this class parses it into a flat lookup table where
 * `self[name].vs` / `self[name].fs` hold the resolved vertex /
 * fragment source ready for `Shader` to compile.
 *
 * Source format:
 *   - `{@}name` separator between named shaders.
 *   - Each named entry may contain `#!UNIFORMS …`, `#!VARYINGS …`,
 *     `#!ATTRIBUTES …` blocks (shared declarations) plus one or
 *     more `#!SHADER: Vertex …` / `#!SHADER: Fragment …` sections.
 *   - `parseSingleShader` extracts the three shared blocks, then
 *     walks each `#!SHADER` block. Vertex shaders get
 *     `attributes + uniforms + varyings + glsl` prepended;
 *     fragments get `uniforms + varyings + glsl`.
 *   - The output is stored under `${baseName}.vs` / `${baseName}.fs`.
 *
 * `parseCompiled(shaders)` is the outer entry — splits the bundle
 * on `{@}`, and for each `(name, text)` pair either runs
 * `parseSingleShader` (if it has the `#!UNIFORMS` marker, i.e. a
 * named shader file) or stores the text verbatim (used for shared
 * include snippets).
 *
 * `parseRequirements()` walks the assembled table and resolves
 * `require(...)` directives via the local `require(shader, key)`
 * helper — supports cross-shader includes so a fragment can pull
 * shared utility functions out of another entry.
 *
 * `_dependencies` accumulates the resolution graph so circular
 * requires can be detected.
 */
Class(function Shaders() {
  Inherit(this, Component);
  var self = this,
    _dependencies;
  function parseSingleShader(code, fileName) {
    let uniforms = code.split('#!UNIFORMS')[1].split('#!')[0],
      varyings = code.split('#!VARYINGS')[1].split('#!')[0],
      attributes = code.split('#!ATTRIBUTES')[1].split('#!')[0];
    for (; code.includes('#!SHADER'); ) {
      let split = (code = code.slice(code.indexOf('#!SHADER'))).split('#!SHADER')[1],
        br = split.indexOf('\n'),
        name = split.slice(0, br).split(': ')[1];
      name.slice(0, 6).includes('Vertex') && (name = fileName.split('.')[0] + '.vs');
      name.slice(0, 8).includes('Fragment') && (name = fileName.split('.')[0] + '.fs');
      let glsl = split.slice(br);
      glsl = name.includes('.vs')
        ? attributes + uniforms + varyings + glsl
        : uniforms + varyings + glsl;
      let splitName = name.split('.');
      self[splitName[0] + (splitName[1].includes('vs') ? '.vs' : '.fs')] = glsl;
      code = code.replace('#!SHADER', '$');
    }
  }
  function parseCompiled(shaders) {
    var split = shaders.split('{@}');
    split.shift();
    for (var i = 0; i < split.length; i += 2) {
      var name = split[i],
        text = split[i + 1];
      text.includes('#!UNIFORMS') ? parseSingleShader(text, name) : (self[name] = text);
    }
  }
  function parseRequirements() {
    for (var key in self) {
      var obj = self[key];
      'string' == typeof obj && (self[key] = require(obj, key));
    }
  }
  function require(shader, key) {
    if (!shader.includes('require')) return shader;
    for (shader = shader.replace(/# require/g, '#require'); shader.includes('#require'); ) {
      var name = shader.split('#require(')[1].split(')')[0];
      if (((name = name.replace(/ /g, '')), !self[name]))
        throw 'Shader required ' + name + ', but not found in compiled shaders.\n' + shader;
      _dependencies &&
        (_dependencies[name] || (_dependencies[name] = []),
        _dependencies[name].includes(key) || _dependencies[name].push(key));
      shader = shader.replace('#require(' + name + ')', self[name]);
    }
    return shader;
  }
  Hydra.LOCAL && (_dependencies = {});
  this.get('dependencies', (_) => _dependencies);
  this.parse = function (code, file) {
    code.includes('{@}')
      ? (parseCompiled(code), parseRequirements())
      : ((file = (file = file.split('/'))[file.length - 1]), (self[file] = code));
    self.shadersParsed = true;
  };
  this.parseSingle = parseSingleShader;
  this.onReady = this.ready = function (callback) {
    let promise = Promise.create();
    return (
      callback && promise.then(callback),
      self.wait(() => promise.resolve(), self, 'shadersParsed'),
      promise
    );
  };
  this.getShader = function (string) {
    self.FALLBACKS && self.FALLBACKS[string] && (string = self.FALLBACKS[string]);
    var code = self[string];
    if (!code) throw `No shader ${string} found`;
    for (; code.includes('#test '); )
      try {
        var test = code.split('#test ')[1],
          name = test.split('\n')[0],
          glsl = code.split('#test ' + name + '\n')[1].split('#endtest')[0];
        eval(name) || (code = code.replace(glsl, ''));
        code = code.replace('#test ' + name + '\n', '');
        code = code.replace('#endtest', '');
      } catch (e) {
        throw 'Error parsing test :: ' + string;
      }
    return code;
  };
}, 'static');

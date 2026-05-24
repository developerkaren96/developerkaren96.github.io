/*
 * Modules — tiny CommonJS-style module registry.
 *
 * Pretends `window.Module(fn)` is the "define" call and `window.require(path)`
 * is the resolver. Used by Active Theory's build pipeline (AURA) so that
 * many small modules can be bundled into one script without esbuild/webpack
 * but still expose a require-like surface.
 *
 * Storage layout:
 *   _modules[rootName] = {
 *     index:  { exports, exec },           // the "root" module of this group
 *     'sub/path': { exports, exec },       // nested members
 *   }
 *
 * Two shapes for `Module()`:
 *   - Module(NamedClass)  → `NamedClass` is the root constructor. Its name
 *                            becomes the namespace; the instance lands at
 *                            `_modules[name].index`.
 *   - Module(unnamed)     → instance must self-identify with `m.module`
 *                            (namespace) and `m.path` (sub-key).
 *
 * Lazy execution: every module has an `exec()` that's called the first time
 * it's `require()`d (or once on the next frame via the initial `defer(exec)`).
 *
 * On load, `window.require` is patched to point here — Node's native
 * `require` is preserved at `window.requireNative` (SSR fallback).
 */
Class(function Modules() {
  const modules = {};       // namespace → { path → module }
  const constructors = {};  // name → original constructor function

  /** Eagerly exec every registered module exactly once (deferred to next frame). */
  function execAll() {
    for (const namespace in modules) {
      for (const path in modules[namespace]) {
        const module = modules[namespace][path];
        if (!module._ready) {
          module._ready = true;
          if (module.exec) module.exec();
        }
      }
    }
  }
  defer(execAll);

  /**
   * Register a module. Two forms — see file header.
   *
   *   Module(class FooNs { ... })   → named root.
   *   Module(unnamed)               → instance with `.module` / `.path`.
   */
  this.Module = function (ModuleClass) {
    const instance = new ModuleClass();
    const nameMatch = ModuleClass.toString().slice(0, 100).match(/function ([^\(]+)/);

    if (nameMatch) {
      const name = nameMatch[1];
      instance._ready = true;
      modules[name] = { index: instance };
      constructors[name] = ModuleClass;
    } else {
      if (!modules[instance.module]) modules[instance.module] = {};
      modules[instance.module][instance.path] = instance;
    }
  };

  /**
   * Resolve a require path. Lazy-execs the target module on first call.
   *
   *   require('foo')          → modules.foo.index.exports
   *   require('foo/bar')      → modules.foo.bar.exports
   */
  this.require = function (path) {
    let root;
    if (path.includes('/')) {
      root = path.split('/')[0];
      path = path.replace(root + '/', '');
    } else {
      root = path;
      path = 'index';
    }

    function resolve(rootName, subPath) {
      const namespace = modules[rootName];
      if (!namespace) throw `Module ${rootName} not found`;
      const module = namespace[subPath];
      if (!module._ready) {
        module._ready = true;
        if (module.exec) module.exec();
      }
      return module;
    }

    return resolve(root, path).exports;
  };

  /** Get the original constructor function by registered name. */
  this.getConstructor = function (name) { return constructors[name]; };

  /** Wait until every named module has been registered. */
  this.modulesReady = async function () {
    const names = [...arguments].flat();
    await Promise.all(names.map((name) => Modules.moduleReady(name)));
  };

  /** Promise that resolves once `name` appears in the registry. */
  this.moduleReady = function (name) {
    const promise = Promise.create();
    // Poll once per frame — cheap, and we only do this until the module shows up.
    const check = function () {
      if (modules[name]) { Render.stop(check); promise.resolve(); }
    };
    Render.start(check);
    return promise;
  };

  // Patch globals — `window.Module(...)` and `window.require(...)` are the
  // public API. Preserve Node's native `require` for SSR contexts.
  window.Module = this.Module;
  if (!window._NODE_) {
    window.requireNative = window.require;
    window.require = this.require;
  }
}, 'Static');

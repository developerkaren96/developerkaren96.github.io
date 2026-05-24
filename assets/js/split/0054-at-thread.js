/*
 * Thread — abstraction over a Web Worker that lets you author worker code
 * inline (as regular `Class(…)` or function definitions in the main bundle)
 * and have it auto-uploaded to the worker side. Provides a typed
 * request/response surface plus a few escape hatches for raw script
 * injection.
 *
 * Construction:
 *   new Thread(WorkerImplClass)
 *     The provided constructor is stringified and shipped to the worker
 *     as the worker's "main" class. Every `this.X = …` assignment in the
 *     class body becomes a callable method on the host-side Thread
 *     instance (see `importClass(_, true)` / `createMethod`). The method
 *     returns a Promise that resolves with whatever the worker posts back
 *     on the message channel keyed by the call id.
 *
 * Class-import pipeline (`importClass`):
 *   • scoped=true (the user's main class)
 *       - Strip the outer `function() { … }` shell, leaving the body.
 *       - Extract `/*!hydra-thread-ignore* /` … `/*!end-hydra-thread-ignore* /`
 *         blocks so they survive intact (their `this.foo` usage isn't a
 *         host-side proxy point — it's already worker-local code that
 *         doesn't need a wrapper).
 *       - Walk every remaining `this.` and (a) rewrite it to `self.` for
 *         the worker context, (b) `createMethod(name)` so the host side
 *         can call `thread.name(msg, cb)`.
 *       - Splice the ignored blocks back in at their original positions.
 *   • scoped=false (helper classes like Utils/Component/Events)
 *       - Wrap in `Namespace.Class(…, "static")` or plain `Class(…)`
 *         depending on whether the constructor is static. `[native code]`
 *         constructors are skipped.
 *   • Hydra.LOCAL builds append `//# sourceURL=hydra-thread/Name.js` so
 *     DevTools can attribute stack frames inside the worker correctly.
 *
 * ES5 mode (`importES5`):
 *   When the build was transpiled (`window._ES5_`), the worker is missing
 *   `_createSuper` / `_isNativeReflectConstruct` / `_getPrototypeOf`
 *   helpers Babel injects on the host. Ship them as raw code first so
 *   classes that extend others actually work.
 *
 * IPC:
 *   `send(name, message, callback)`
 *     Assigns a fresh integer id from `Thread.UNIQUE_ID` (wraps at
 *     1,000,000), stashes `callback` under that id, posts. Worker replies
 *     with `{ id, message }` (or `{ evt, msg }` for emit-style).
 *   `transferable mode`:
 *     If the caller passes a buffer array as the 3rd arg, posts with
 *     transfer list so ArrayBuffers move zero-copy.
 *   `workerMessage` dispatch:
 *     • `data.console` → console.log
 *     • `data.id`      → resolve callback for that id
 *     • `data.emit`    → fire event-style listener registered via on()
 *     • else           → routed to the special 'transfer' callback
 *
 * Function/module helpers:
 *   `loadFunction(fn1, fn2, …)` — ship one-off `function name(…) {}`
 *                                  decls as `self.name = function(…)`,
 *                                  then create a host proxy.
 *   `importScript(path)`        — worker-side `importScripts(absolute)`.
 *   `importCode(code)`          — raw text post (no scoping).
 *   `importModules(...)`        — pull a Module by name, wrap with
 *                                 `Module(…)` and ship.
 *   `importES6Class(name)`      — for ES5 builds, decompose the class
 *                                 into base/proto/sup parts the worker
 *                                 can reassemble (es5 path). Otherwise
 *                                 just ship the source via es6 path.
 *
 * Cleanup:
 *   `onDestroy` terminates the worker.
 *
 * Statics:
 *   `Thread.PATH`     defaults to 'assets/js/hydra'; overridable via
 *                     `window._THREAD_PATH_`.
 *   `Thread.cluster()` round-robin pool wrapper with .push/.get/array.
 *   `Thread.shared()`  lazily builds a process-wide pool sized to
 *                     `clamp(hardwareConcurrency, 4, 8)`. Returns the
 *                     full cluster when called with truthy arg, else the
 *                     next thread in the rotation.
 *   `Thread.upload`/`uploadClass`
 *     Broadcast a function/class to every thread in the shared pool.
 */
Class(function Thread(_class) {
  Inherit(this, Component);
  const self = this;
  let _worker, _callbacks, _path, _mvc;
  const _msg = {};

  const IGNORE_START = '/*!hydra-thread-ignore*/';
  const IGNORE_END   = '/*!end-hydra-thread-ignore*/';

  function init() {
    const file = window._ES5_ ? '/hydra-thread-es5.js' : '/hydra-thread.js';
    _callbacks = {};
    _worker = new Worker(Thread.PATH + file);
  }

  function importClasses() {
    importClass(Utils);
    importClass(Component);
    importClass(Events);
    importClass(_class, true);
    importES5();
  }

  /*
   * Marshal a class definition across the worker boundary. `scoped` is
   * set for the user's primary worker class — see header for the
   * `this.X` → method-proxy rewrite logic.
   */
  function importClass(_class, scoped) {
    if (!_class) return;
    let code, namespace;

    if (scoped) {
      // Strip outer function wrapper, keep the body.
      code = _class.toString().replace('{', '!!!').split('!!!')[1];

      // Preserve `/*!hydra-thread-ignore*/ … /*!end-hydra-thread-ignore*/`
      // blocks verbatim — their `this.X` is intentional and shouldn't be
      // promoted to a host proxy.
      const ignores = [];
      while (true) {
        const startIndex = code.indexOf(IGNORE_START);
        if (startIndex < 0) break;
        let endIndex = code.indexOf(IGNORE_END);
        if (endIndex < 0) endIndex = code.length;
        ignores.push(code.substring(startIndex, endIndex));
        code = code.substring(0, startIndex) + code.substring(endIndex);
      }

      // For each remaining `this.name = …`, rewrite to `self.` and
      // register a host-side proxy method.
      while (code.includes('this.')) {
        const name = code.slice(code.indexOf('this.')).split('this.')[1].split(/\s*=/)[0];
        code = code.replace('this', 'self');
        createMethod(name);
      }
      // Trim trailing `}` left after stripping the wrapper, undo any
      // `_this` → `_self` collateral damage.
      code = code.slice(0, -1).replace(/_self/g, '_this');

      // Splice the preserved ignore blocks back into place.
      let index = 0;
      ignores.forEach((ignored) => {
        const endIndex = code.indexOf(IGNORE_END, index);
        code = code.substring(0, endIndex) + ignored + code.substring(endIndex);
        index = endIndex + ignored.length + IGNORE_END.length;
      });
    } else if ('function' != typeof _class) {
      // Static instance: skip native constructors, otherwise wrap as
      // `Namespace.Class(<ctor>, "static")` so worker reconstructs.
      code = _class.constructor.toString();
      if (code.includes('[native')) return;
      namespace = _class._namespace ? _class._namespace + '.' : '';
      code = namespace + 'Class(' + code + ', "static");';
    } else {
      // Plain class function.
      namespace = _class._namespace ? _class._namespace + '.' : '';
      code = namespace + 'Class(' + _class.toString() + ');';
    }

    if (Hydra.LOCAL) {
      code += `\n//# sourceURL=hydra-thread/${Utils.getConstructorName(_class)}.js`;
    }
    _worker.postMessage({ code });
  }

  /*
   * Build a host-side stub that posts a message to the worker. Optional
   * Promise mode (no callback supplied) and transferable mode (3rd arg
   * is a buffer list) are detected here.
   */
  function createMethod(name) {
    self[name] = function (message = {}, callback, buffer) {
      let promise;
      if (Array.isArray(callback)) {
        buffer = callback;
        callback = undefined;
      }
      if (Array.isArray(buffer)) {
        message = { msg: message, transfer: true };
        message.buffer = buffer;
      }
      if (undefined === callback) {
        promise = Promise.create();
        callback = promise.resolve;
      }
      self.send(name, message, callback);
      return promise;
    };
  }

  // Babel ES5 helpers the worker can't synthesize on its own.
  function importES5() {
    if (!window._ES5_) return;
    ['_createSuper', '_isNativeReflectConstruct'].forEach((name) => {
      const code = window[name].toString();
      if (!code.includes('[native')) _worker.postMessage({ code });
    });
    _worker.postMessage({
      code:
        'function _getPrototypeOf(o){_getPrototypeOf=Object.setPrototypeOf?Object.getPrototypeOf:function _getPrototypeOf(o){return o.__proto__||Object.getPrototypeOf(o);};return _getPrototypeOf(o);}',
    });
  }

  function addListeners() {
    _worker.addEventListener('message', workerMessage);
  }

  /*
   * Dispatch worker → host messages. The shape determines the route:
   *   { console, message }    → console.log
   *   { id, message }         → resolve the call with that id
   *   { emit, evt, msg }      → fire the on()-registered listener
   *   anything else           → 'transfer' catch-all callback
   */
  function workerMessage(e) {
    let callback;
    if (e.data.console) {
      console.log(e.data.message);
    } else if (e.data.id) {
      callback = _callbacks[e.data.id];
      if (callback) callback(e.data.message);
      delete _callbacks[e.data.id];
    } else if (e.data.emit) {
      callback = _callbacks[e.data.evt];
      if (callback) callback(e.data.msg);
    } else {
      callback = _callbacks.transfer;
      if (callback) callback(e.data);
    }
  }

  init();
  importClasses();
  addListeners();

  this.on  = function (evt, callback) { _callbacks[evt] = callback; };
  this.off = function (evt)           { delete _callbacks[evt]; };

  /*
   * Upload one or more `function name(args) {…}` declarations. Returns
   * the list of names so the caller can keep track. Method proxies are
   * installed locally so `thread.name(msg, cb)` works after this.
   */
  this.loadFunction = function () {
    const names = [];
    let code, split, name;
    for (let i = 0; i < arguments.length; i++) {
      split = undefined;
      name = undefined;
      code = arguments[i].toString().replace('(', '!!!');
      split = code.split('!!!');
      name = split[0].split(' ')[1];
      code = 'self.' + name + ' = function(' + split[1];
      if (Hydra.LOCAL) code += `\n//# sourceURL=hydra-thread/function/${name}.js`;
      _worker.postMessage({ code });
      createMethod(name);
      names.push(name);
    }
    return names;
  };

  this.importScript = function (path) {
    _worker.postMessage({ path: Thread.absolutePath(path), importScript: true });
  };

  this.importCode = function (code) {
    _worker.postMessage({ code });
  };

  this.importClass = function () {
    for (let i = 0; i < arguments.length; i++) importClass(arguments[i]);
  };

  this.importModules = this.importModule = function () {
    for (let i = 0; i < arguments.length; i++) {
      const code = Modules.getConstructor(arguments[i]).toString();
      _worker.postMessage({ code: `Module(${code})` });
    }
  };

  /*
   * Ship an ES6 class definition. In ES5 builds we hand the worker the
   * pieces it needs to rebuild the inheritance chain (base body + proto
   * methods + _createSuper wiring). In modern builds we just eval the
   * name back to source and post it directly.
   */
  this.importES6Class = function (name) {
    if (window._ES5_) {
      const Class = window[name];
      const base  = Class.toString();
      const proto = [];
      let sup;
      const matches = /(_this\w+)\s*=\s*(_super\w+)\.call/g.exec(base);
      if (matches) {
        const superVar = matches[2];
        const superConstructor = Object.getPrototypeOf(Class);
        if (!superConstructor.toString().includes('[native')) {
          const superName = Utils.getConstructorName(superConstructor);
          sup = `_inherits(${name}, ${superName}); var ${superVar} = _createSuper(${name});`;
        }
      }
      Object.getOwnPropertyNames(Class.prototype).forEach((fn) => {
        if ('constructor' != fn && Class.prototype[fn]) {
          proto.push({ key: fn, string: Class.prototype[fn].toString() });
        }
      });
      _worker.postMessage({ es5: base, name, proto, sup });
    } else {
      let es6 = `(${eval(name)})`;
      if (Hydra.LOCAL) es6 += `\n//# sourceURL=hydra-thread/${name}.js`;
      _worker.postMessage({ es6, name });
    }
  };

  /*
   * Core IPC: build an envelope with a unique id, register the callback,
   * post. `transfer` mode flattens the envelope into the message body
   * itself so the worker can pluck the buffers off the same object.
   */
  this.send = function (name, message, callback) {
    if ('string' == typeof name) {
      message = message || {};
      message.fn = name;
    } else {
      callback = message;
      message = name;
    }
    if (Thread.UNIQUE_ID > 999999) Thread.UNIQUE_ID = 1;
    const id = Thread.UNIQUE_ID++;
    if (callback) _callbacks[id] = callback;

    if (message.transfer) {
      message.msg.id = id;
      message.msg.fn = message.fn;
      message.msg.transfer = true;
      _worker.postMessage(message.msg, message.buffer);
    } else {
      _msg.message = message;
      _msg.id = id;
      _worker.postMessage(_msg);
    }
  };

  this.onDestroy = function () {
    if (_worker.terminate) _worker.terminate();
  };
}, () => {
  /*
   * Statics block. `cluster()` builds a thin round-robin holder so calling
   * `pool.get()` rotates through `array`. `shared()` lazily spins up a
   * process-wide pool sized to a sensible default (4–8 threads depending
   * on `navigator.hardwareConcurrency`).
   */
  let _shared;

  Thread.PATH         = window._THREAD_PATH_ || 'assets/js/hydra';
  Thread.UNIQUE_ID    = 1;
  Thread.absolutePath = Hydra.absolutePath;

  Thread.cluster = function () {
    return new (function () {
      let index = 0;
      const array = [];
      this.push = function (thread) { array.push(thread); };
      this.get  = function () {
        const thread = array[index];
        index++;
        if (index >= array.length) index = 0;
        return thread;
      };
      this.array = array;
    })();
  };

  // Broadcast a function definition to every thread in the shared pool.
  Thread.upload = function (...args) {
    let name;
    Thread.shared();
    for (let i = 0; i < _shared.array.length; i++) name = _shared.array[i].loadFunction(...args);
    return name;
  };

  // Same, for class definitions.
  Thread.uploadClass = function (...args) {
    let name;
    Thread.shared();
    for (let i = 0; i < _shared.array.length; i++) name = _shared.array[i].importClass(...args);
    return name;
  };

  // Build (or fetch) the shared pool. Sizes to clamp(hwConcurrency, 4, 8).
  Thread.shared = function (list) {
    if (!_shared) {
      _shared = Thread.cluster();
      const hardware = navigator.hardwareConcurrency || 4;
      const count    = Math.max(Math.min(hardware, 8), 4);
      for (let i = 0; i < count; i++) _shared.push(new Thread());
    }
    return list ? _shared : _shared.get();
  };
});

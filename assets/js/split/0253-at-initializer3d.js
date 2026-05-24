/*
 * Initializer3D — async asset/work coordinator for 3D scenes.
 * A single Component that:
 *
 *   - Collects in-flight Promises in `_promises`. `resolve()` waits
 *     for them all, then fires the `READY` event after a 100ms
 *     debounce (`self.fire` delayed call). After firing, sets
 *     `self.resolved = true` and disables the `Utils3D.onTextureCreated`
 *     hook so post-init texture creation doesn't get tracked. If a
 *     loader is attached, `trigger(50)` advances its progress bar by
 *     50 units (the "all the heavy work is done" milestone).
 *
 *   - Runs a serialised work queue (`_queue` / `workQueue()`). Items
 *     are promise-shaped — `workQueue` shifts the next item and
 *     calls its `resolve` with the continuation. This forces
 *     sequential execution of expensive build steps (e.g. shader
 *     compilation, texture upload) that would otherwise blow the
 *     frame budget if run in parallel. `Hydra.LOCAL` mode arms a
 *     5-second warning timer to catch hung items during development.
 *
 *   - `incCompleted()` ticks the attached loader by 1 unit per
 *     individual asset; useful for fine-grained progress.
 *
 *   - `bundle()` returns a `PromiseBundler` — a tiny helper that
 *     gathers ad-hoc promises and resolves them as a unit, firing a
 *     shared `ready` promise once the bundle is quiescent for the
 *     debounce window (so a stream of micro-tasks collapses into a
 *     single "ready" event rather than thrashing).
 *
 * Event: `READY` ('initializer_ready') — fired once when the global
 * pool drains. Code that depends on "the 3D world is ready" listens
 * for this rather than guessing.
 */
Class(function Initializer3D() {
  Inherit(this, Component);
  const self = this;
  let _loader,
    _working,
    _promises = [],
    _queue = [];
  async function resolve() {
    await Promise.all(_promises);
    clearTimeout(self.fire);
    self.fire = self.delayedCall((_) => {
      self.events.fire(self.READY);
      self.resolved = true;
      Utils3D.onTextureCreated = null;
      _loader && _loader.trigger(50);
    }, 100);
  }
  async function workQueue() {
    clearTimeout(self.warningTimer);
    _working = true;
    let promise = _queue.shift();
    if (!promise) return (_working = false);
    promise.resolve(workQueue);
    Hydra.LOCAL &&
      (self.warningTimer = self.delayedCall((_) => {
        console.warn('Long running queue has taken more than 5 seconds.');
      }, 5e3));
  }
  function incCompleted() {
    _loader && _loader.trigger(1);
  }
  this.READY = 'initializer_ready';
  this.bundle = function () {
    return new (function PromiseBundler() {
      const promises = [],
        ready = Promise.create();
      let timer;
      function run() {
        clearTimeout(timer);
        timer = self.delayedCall((_) => {
          Promise.all(promises).then((_) => ready.resolve());
        }, 100);
      }
      this.capture = function (promise) {
        promises.push(promise);
        run();
      };
      this.ready = function () {
        return (run(), ready);
      };
    })();
  };
  this.promise = this.capture = function (promise) {
    return (
      _loader && _loader.add(1),
      promise.then(incCompleted),
      _promises.push(promise),
      clearTimeout(self.timer),
      (self.timer = self.delayedCall(resolve, 100)),
      promise
    );
  };
  this.ready = this.loaded = function () {
    return self.wait(self, 'resolved');
  };
  this.createWorld = async function () {
    await Promise.all([
      AssetLoader.waitForLib('zUtils3D'),
      Shaders.ready(),
      GPU.ready(),
      UILStorage.ready(),
    ]);
    await MatrixWasm.ready();
    World.instance();
  };
  this.linkSceneLayout = function (loader) {
    self.captureTextures();
    SceneLayout.initializer = self.capture;
    _loader = loader;
  };
  this.queue = function (immediate) {
    if (immediate) return Promise.resolve((_) => {});
    let promise = Promise.create();
    return (_queue.push(promise), _working || workQueue(), promise);
  };
  this.captureTextures = function () {
    Utils3D.onTextureCreated = (texture) => {
      self.promise(texture.promise);
    };
  };
  this.uploadAll = async function (group) {
    if (!group) throw 'Undefined passed to uploadAll';
    let sceneLayout;
    if (group instanceof SceneLayout || (window.StageLayout && group instanceof StageLayout)) {
      if (((sceneLayout = group), sceneLayout.uploaded)) return;
      sceneLayout.uploaded = true;
      await sceneLayout.loadedAllLayers();
      group = group.group;
    }
    let promises = [],
      layouts = [],
      textures = [];
    if (sceneLayout) {
      sceneLayout.textures = textures;
      for (let key in sceneLayout.layers) {
        let layer = sceneLayout.layers[key];
        layer.uploadSync && layer.uploadSync();
      }
    }
    group?.traverse?.((obj) => {
      if (
        (obj.sceneLayout && obj != group && layouts.push(obj.sceneLayout),
        obj.stageLayout && obj != group && layouts.push(obj.stageLayout),
        !obj.uploadIgnore && 0 != obj.visible)
      ) {
        if (obj.shader)
          for (let key in obj.shader.uniforms) {
            let uniform = obj.shader.uniforms[key];
            uniform &&
              uniform.value &&
              uniform.value.promise &&
              (textures.push(uniform.value),
              promises.push(
                uniform.value.promise
                  .then(uniform.value.upload.bind(uniform.value))
                  .catch((e) => {}),
              ));
          }
        obj?.glui && obj?.glui?.mesh?.upload?.();
        obj.shader && obj.shader.shadow && obj.shader.shadow.upload();
        obj.classRef && obj.classRef.upload && obj.classRef.upload();
        obj.asyncPromise
          ? promises.push(obj.asyncPromise.then(obj.upload.bind(obj)))
          : obj.upload && obj.upload();
      }
    });
    group.children &&
      group.children.forEach((child) => {
        child.upload?.();
      });
    await Promise.catchAll(promises);
    textures.forEach((t) => t.upload());
    for (let i = 0; i < layouts.length; i++) await self.uploadAll(layouts[i]);
    sceneLayout && sceneLayout._completeInitialization && sceneLayout._completeInitialization(true);
    sceneLayout && delete sceneLayout.textures;
  };
  this.uploadAllDistributed = this.uploadAllAsync = async function (group, releaseQueue) {
    if (!group) throw 'Undefined passed to uploadAllDistributed';
    let sceneLayout;
    if (
      (releaseQueue || 'boolean' == typeof releaseQueue || (releaseQueue = await self.queue()),
      group instanceof SceneLayout || (window.StageLayout && group instanceof StageLayout))
    ) {
      if (((sceneLayout = group), sceneLayout.uploaded))
        return 'function' == typeof releaseQueue ? releaseQueue() : undefined;
      sceneLayout.uploaded = true;
      await sceneLayout.loadedAllLayers();
      group = group.group;
    }
    let uploads = [],
      _async = [],
      promises = [],
      layouts = [],
      textures = [];
    if (sceneLayout) {
      sceneLayout.textures = textures;
      for (let key in sceneLayout.layers) {
        let layer = sceneLayout.layers[key];
        layer.upload && !layer.uploadIgnore && layer.upload();
      }
    }
    if (sceneLayout.parent) {
      for (let key in sceneLayout.parent.classes) {
        let clss = sceneLayout.parent.classes[key];
        clss.upload && uploads.push(clss.upload.bind(clss));
      }
      sceneLayout.parent.nuke && self.uploadNukeAsync(sceneLayout.parent.nuke);
    }
    group.traverse((obj) => {
      if (
        (obj.sceneLayout && obj != group && layouts.push(obj.sceneLayout),
        obj.stageLayout && obj != group && layouts.push(obj.stageLayout),
        !obj.uploadIgnore && 0 != obj.visible)
      ) {
        if (obj.shader)
          for (let key in obj.shader.uniforms) {
            let uniform = obj.shader.uniforms[key];
            uniform &&
              uniform.value &&
              uniform.value.promise &&
              (textures.push(uniform.value),
              promises.push(
                uniform.value.promise
                  .then((_) => uploads.push(uniform.value.upload.bind(uniform.value)))
                  .catch((e) => {}),
              ));
          }
        if (obj.asyncPromise)
          promises.push(
            obj.asyncPromise.then((_) => {
              obj.geometry && (obj.geometry.distributeBufferData = true);
              uploads.push(obj.upload.bind(obj));
              obj.geometry && _async.push(obj.geometry.uploadBuffersAsync.bind(obj.geometry));
            }),
          );
        else if (obj.upload) {
          if (obj.geometry) {
            if (obj.geometry.uploaded) return;
            obj.geometry.distributeBufferData = true;
          }
          uploads.push(obj.upload.bind(obj));
          obj.geometry && _async.push(obj.geometry.uploadBuffersAsync.bind(obj.geometry));
        }
        obj.shader &&
          obj.shader.shadow &&
          uploads.push(obj.shader.shadow.upload.bind(obj.shader.shadow));
        obj.classRef && obj.classRef.upload && uploads.push(obj.classRef.upload.bind(obj.classRef));
      }
    });
    let canFinish = false,
      promise = Promise.create(),
      worker = new Render.Worker((_) => {
        let upload = uploads.shift();
        upload
          ? upload()
          : canFinish
            ? ((async (_) => {
                for (let i = 0; i < _async.length; i++) await _async[i]();
                for (let i = 0; i < layouts.length; i++)
                  await self.uploadAllAsync(layouts[i], !!releaseQueue);
                'function' == typeof releaseQueue && releaseQueue();
                promise.resolve();
              })(),
              worker.stop())
            : worker.pause();
      }, 1);
    return (
      Promise.catchAll(promises).then((_) => {
        worker.resume();
        canFinish = true;
      }),
      sceneLayout &&
        sceneLayout._completeInitialization &&
        sceneLayout._completeInitialization(false),
      sceneLayout &&
        promise.then((_) => {
          delete sceneLayout.textures;
        }),
      promise
    );
  };
  this.detectUploadAll = function (group, sync, releaseQueue) {
    return sync ? self.uploadAll(group) : self.uploadAllDistributed(group, releaseQueue);
  };
  this.detectUploadNuke = function (nuke, sync) {
    return sync ? self.uploadNukeAsync(nuke) : self.uploadNuke(nuke);
  };
  this.uploadNuke = async function (nuke) {
    if (nuke && nuke.enabled) {
      for (let i = 0; i < nuke.passes.length; i++) {
        let pass = nuke.passes[i],
          uniforms = pass.uniforms;
        for (let key in uniforms) {
          uniforms[key].value && uniforms[key].value.promise && (await uniforms[key].value.promise);
          uniforms[key].value && uniforms[key].value.upload && uniforms[key].value.upload();
        }
        pass.upload();
      }
      Nuke.defaultPass.uploaded || Nuke.defaultPass.upload();
      nuke.render();
    }
  };
  this.uploadNukeAsync = async function (nuke) {
    let queue = await self.queue(),
      calls = [];
    for (let i = 0; i < nuke.passes.length; i++) {
      let pass = nuke.passes[i],
        uniforms = pass.uniforms;
      for (let key in uniforms) {
        uniforms[key].value && uniforms[key].value.promise && (await uniforms[key].value.promise);
        uniforms[key].value &&
          uniforms[key].value.upload &&
          calls.push(uniforms[key].value.upload.bind(uniforms[key].value));
      }
      calls.push(pass.upload.bind(pass));
    }
    Nuke.defaultPass.uploaded || calls.push(Nuke.defaultPass.upload.bind(Nuke.defaultPass));
    calls.push(nuke.render.bind(nuke));
    let promise = Promise.create(),
      worker = new Render.Worker(function uploadBuffersAsync() {
        let cb = calls.shift();
        cb ? cb() : (promise.resolve(), worker.stop());
      });
    await promise;
    queue();
  };
  this.destroyAll = function (scene) {
    scene.traverse((obj) => {
      if (obj.geometry && obj.shader) {
        for (let key in obj.shader.uniforms) {
          let uniform = obj.shader.uniforms[key];
          uniform && uniform.value instanceof Texture && uniform.value.destroy();
        }
        obj.destroy();
      }
    });
  };
  this.set('loader', (loader) => {
    _loader = loader;
  });
}, 'static');

/*
 * ViewState — drives a 1:1 reactive mapping between a StateArray (data) and
 * a list of View instances. Each `add` data event produces a new instance
 * (constructed via `ref.initClass(ViewClass, data, index, ...)`), `remove`
 * tears it down, `modify` re-renders or re-creates it depending on whether
 * its data still passes `dataFilter`.
 *
 * Two construction shapes:
 *   new ViewState(MyView, ...extraArgs)
 *   new ViewState({
 *     view:         MyView,
 *     data:         myStateArray,
 *     wait_data:    asyncPromise,
 *     onAddView:    (inst, idx) => {},
 *     onRemoveView: (inst, idx) => promiseToAwait,
 *     __parent:     containerObj,
 *   })
 *
 * Object form additionally exposes `listen(key, callback)` — auto-binds an
 * AppState subscription on every instance's `.state[key]` and forwards
 * changes as `{ target: instance, data: value }`.
 *
 * Dynamic view class:
 *   When `parent.contexts` exists and `ViewClass` is a function, it's
 *   treated as a *resolver*: it's called with the data state and must
 *   return the actual class to instantiate. Used when the view type depends
 *   on the data record.
 *
 * Add path (`dataUpdate` → `ViewState.schedule`):
 *   Construction is queued through a shared 2-jobs-per-frame Render.Worker
 *   so large lists don't stall the frame. The worker pops jobs, instantiates
 *   the view, sets `inst.data = data`, and calls `ref.onInitialize(inst)`.
 *
 *   While async `onRemoveView` promises are in flight, `add` waits on
 *   `_removals` so a destroy → create sequence on the same slot doesn't
 *   race.
 *
 * onInitialize: ordered insertion:
 *   The new instance is spliced into `_instances` at the position matching
 *   `_stateArray.indexOf(instance.data)` — preserving source order even
 *   when items arrive out of order (because of Worker batching). If the
 *   parent has a DOM element, the instance's element is also inserted at
 *   the correct DOM position via `parent.element.add(el, before)`.
 *
 * Group / mesh hookup: when the view exposes `group`/`mesh`, it's added to
 * `parent.group` so the 3D scene graph stays in sync with the list.
 *
 * Remove flow:
 *   `onRemoveView` callback (or `inst.onRemoveView(i)`) may return a
 *   promise — the destroy is deferred until that promise resolves (unless
 *   `disableAutoDestroy`). Multiple in-flight removals are gathered in
 *   `_removals` and awaited collectively before clearing `animating`.
 *
 * HMR:
 *   `hmr(viewName)` is the hot-replace entry: remove every existing
 *   instance, rebind to the new class, then re-feed the source array.
 */
Class(
  function ViewState(ViewClass, ...rest) {
    Inherit(this, Component);
    const self = this;
    let _stateArray, _params, _dynamicViewClass;
    const _callbacks = {};
    const _bindings  = [];
    const _removals  = [];

    // Object-form constructor — extract the view + decorate the instance.
    if ('object' == typeof ViewClass && ViewClass.view) {
      _params   = ViewClass;
      ViewClass = _params.view;
      rest      = [_params];
      delete _params.view;
      self.listen = function (key, callback) {
        _bindings.push(key);
        _callbacks[key] = callback;
      };
      self.onAddView    = _params.onAddView;
      self.onRemoveView = _params.onRemoveView;
    }
    if ('function' == typeof ViewClass && self.parent.contexts) _dynamicViewClass = true;
    if ('string'   == typeof ViewClass) ViewClass = window[ViewClass];

    const _instances = (this.views = []);

    function remove(data) {
      self.animating = true;
      for (let i = 0; i < _instances.length; i++) {
        const inst = _instances[i];
        if (data != inst.data) continue;

        // Either callback path can return a Promise. We then defer destroy
        // until it resolves (unless the user opted out).
        const promise = self.onRemoveView?.(inst, i) || inst.onRemoveView?.(i);
        if (promise && promise.then) {
          _removals.push(promise);
          if (!self.disableAutoDestroy) promise.then(() => inst.destroy?.());
        }
        _instances.splice(i, 1);
        if (0 === _instances.length) self.onEmpty?.();
        // Sync destroy when there's no animation promise.
        if (!(promise && promise.then) && !self.disableAutoDestroy && inst.destroy) inst.destroy();
        break;
      }
      ViewState.clearScheduled(data, self);
      if (_removals.length) {
        // Gather all in-flight removals; clear `animating` only when all
        // have settled.
        const removals = _removals.slice();
        Promise.all(removals).then(() => {
          removals.forEach((removal) => { _removals.remove(removal); });
          if (0 === _removals.length) self.animating = false;
        });
      }
    }

    async function dataUpdate(e) {
      switch (e.type) {
        case 'add':
          // Don't race with in-flight teardown of the same slot.
          while (_removals.length) await Promise.all(_removals);
          if (self.dataFilter(e.state)) {
            ViewState.schedule(
              self,
              _dynamicViewClass ? ViewClass(e.state) : ViewClass,
              e.state,
              _stateArray.indexOf(e.state),
              rest,
            );
          }
          break;
        case 'remove':
          remove(e.state);
          break;
        case 'modify':
          if (self.dataFilter(e.state)) {
            // Existing instance for this data → onUpdateView. Otherwise
            // schedule a new one.
            (function update(data) {
              let _exists = false;
              for (let i = 0; i < _instances.length; i++) {
                const inst = _instances[i];
                if (data._uid === inst.data._uid) {
                  self.onUpdateView?.(_instances[i], i);
                  _exists = true;
                  return;
                }
              }
              if (!_exists) {
                ViewState.schedule(
                  self,
                  _dynamicViewClass ? ViewClass(data) : ViewClass,
                  data,
                  _stateArray.indexOf(data),
                );
              }
            })(e.state, e.index);
          } else {
            remove(e.state);
          }
      }
    }

    // Hot-replace the view class — drain instances and re-feed the source.
    this.hmr = function (view) {
      ViewClass = window[view];
      while (_instances.length) remove(_instances[0].data);
      this.setSourceData(_stateArray);
    };

    this.setSourceData = function (array) {
      if (Array.isArray(array) && !(array instanceof StateArray)) array = new StateArray(array);
      if (!(array instanceof StateArray || Array.isArray(array))) {
        throw 'ViewState::setSourceData must be instance of StateArray';
      }
      _stateArray = self.stateArray = array;
      self.events.sub(array, Events.UPDATE, dataUpdate);
      array.forEach((state) => {
        if (self.dataFilter(state)) {
          ViewState.schedule(
            self,
            _dynamicViewClass ? ViewClass(state) : ViewClass,
            state,
            _stateArray.indexOf(state),
            rest,
          );
        }
      });
    };

    // Subclass hook to filter which data items get rendered.
    this.dataFilter = function () { return true; };

    /*
     * Insert at the correct ordered position (by source index). Find the
     * first existing instance whose index is greater than ours; splice in
     * before it. DOM element ordering follows the same scheme.
     */
    this.onInitialize = function (instance) {
      const unfilteredIndex = _stateArray.indexOf(instance.data);
      let filteredIndex = -1;
      for (let i = 0; i < _instances.length; ++i) {
        const data = _instances[i].data;
        if (_stateArray.indexOf(data) > unfilteredIndex) { filteredIndex = i; break; }
      }
      if (filteredIndex < 0) filteredIndex = _instances.length;
      if (instance.element && self.parent.element && self.parent.element.add) {
        let before = null;
        if (filteredIndex < _instances.length && _instances[filteredIndex].element) {
          before = _instances[filteredIndex];
        }
        self.parent.element.add(instance.element, before);
      }
      _instances.splice(filteredIndex, 0, instance);

      // Auto-bind requested state keys on the new instance.
      if (self.listen && instance.state) {
        _bindings.forEach((key) => {
          self.bindState(instance.state, key, (data) => {
            _callbacks[key]?.({ target: instance, data });
          });
        });
      }
      _params?.__parent && _params.__parent.add(instance);
      if (instance.group || instance.mesh) self.parent.group?.add(instance.group || instance.mesh);
      self.onAddView?.(instance, filteredIndex);
    };

    if (_params?.data) this.setSourceData(_params.data);
    if (_params?.wait_data) {
      _params.wait_data.then((data) => {
        _params.data = data;
        self.setSourceData(data);
      });
    }
  },
  (_) => {
    /*
     * Static worker queue. ViewState.schedule pushes; the 2-jobs-per-frame
     * worker pops and instantiates. The worker auto-pauses when the queue
     * empties. `additionalArgs` is an array-of-arrays (one per call site)
     * that gets flattened into the actual constructor args.
     */
    const queue = [];
    const worker = new Render.Worker((_) => {
      const obj = queue.shift();
      if (!obj) return worker.pause();
      const { ref, ViewClass, data, index, additionalArgs } = obj;
      if (!ref.initClass) return;
      const args = [];
      additionalArgs.forEach((arg) => { args.push(...arg); });
      const inst = ref.initClass(ViewClass, data, index, ...args, null);
      inst.data = data;
      ref.onInitialize(inst);
    }, 2);
    worker.pause();

    // Cancel a pending instantiation (e.g. when its data has been removed
    // before construction).
    ViewState.clearScheduled = function (data, ref) {
      for (let i = 0; i < queue.length; i++) {
        const obj = queue[i];
        if (obj.data === data && obj.ref == ref) return queue.splice(i, 1);
      }
    };

    ViewState.schedule = function (ref, ViewClass, data, index, ...rest) {
      if (!ref.initClass) return;
      queue.push({ ref, ViewClass, data, index, additionalArgs: rest });
      worker.resume();
    };
  },
);

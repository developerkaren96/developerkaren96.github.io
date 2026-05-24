/*
 * StateInitializer — lifecycle binding between an AppState key and a
 * child class instance on the parent component.
 *
 *   new StateInitializer(MyClass, 'myRef', { paramA: '#x#42#x#' }, {
 *     init:   'frag/key',     // when true → instantiate, when false → destroy
 *     init3d: 'frag/key3d',   // when true → upload 3D assets eagerly
 *   });
 *
 * On `init` going truthy:
 *   - resolves any `#x#…#x#` literal-as-string params back to expressions
 *     (the AURA editor serializes JS expressions wrapped in those markers).
 *   - resolves `_this.foo` param strings to `self.parent.foo` references.
 *   - instantiates `MyClass` on the parent via `initClass(MyClass, params)`.
 *
 * On `init` going falsy: destroys the existing instance.
 *
 * If `init3d` is configured, `onInit3D` waits a moment for the instance to
 * settle then preloads its 3D bundle through `Initializer3D`.
 *
 * `#x#…#x#` strings: an AURA editor convention. The editor stores JS-expr
 * params as strings so they can round-trip through JSON; the markers
 * indicate "this is code, not a literal." At runtime we strip the markers
 * and either eval (for conditions) or read property references.
 *
 * The `eval` here only executes content from the project's own scene-JSON
 * payload — it's not parsing untrusted input.
 */
Class(function StateInitializer(InstanceClass, refName, params, stateConfig) {
  Inherit(this, Component);
  const self = this;
  let initTimestamp = Render.TIME;

  /** Prefix unqualified state keys with the parent's frag name. */
  function parseState(state) {
    if (!state.includes('/')) state = self.parent.fragName + '/' + state;
    return state;
  }

  /** Toggle the child instance: truthy → create, falsy → destroy. */
  function onInit(isActive) {
    initTimestamp = Render.TIME;
    if (isActive) {
      // Resolve `#x#…#x#` strings and `_this.foo` references in params.
      for (const key in params) {
        if (params[key].includes?.('#x#')) {
          params[key] = params[key].replace(/#x#/g, '');
        }
        if (params[key].includes?.('_this.')) {
          params[key] = self.parent[params[key].split('_this.')[1]];
        }
      }
      self.parent[refName] = self.parent.initClass(InstanceClass, params);
    } else {
      self.parent[refName] = self.parent[refName]?.destroy();
    }
  }

  /**
   * Pre-warm the GPU pipeline for the newly-created child:
   *   - wait up to 1s post-init (give layout time to settle),
   *   - wait until the child reference exists,
   *   - upload its `nuke` shader (if any),
   *   - upload its 3D group via Initializer3D.
   */
  async function onInit3D() {
    await self.wait(Math.max(1000 - (Render.TIME - initTimestamp), 0));
    await self.wait(() => !!self.parent[refName]);
    const ref = self.parent[refName];
    if (ref.nuke) await Initializer3D.uploadNuke(ref.nuke);
    const group = ref.layout || ref.scene || ref.group || ref.element?.group;
    if (group) await Initializer3D.uploadAllAsync(group);
  }

  this.ref = refName;

  // ─── Wire up the state binding(s) ──────────────────────────────────────
  (function () {
    if (!stateConfig.init) throw 'StateInitializer required init parameter';

    if (stateConfig.init.includes?.('#x#')) {
      // Editor-serialized condition: eval the inner expression once at boot.
      // (See file header re: trust model — this is project-author JS.)
      if (eval(stateConfig.init.replace(/#x#/g, ''))) onInit(true);
    } else if (stateConfig.init === 'true' || stateConfig.init === 1) {
      // Constant-true initializer.
      onInit(true);
    } else {
      // Bind to an AppState key.
      self.bindState(AppState, parseState(stateConfig.init), onInit);
    }

    if (stateConfig.init3d) {
      self.bindState(AppState, parseState(stateConfig.init3d), onInit3D);
    }
  })();

  /** Manually flip the init state to true (for forced spawns). */
  this.force = function () {
    AppState.set(parseState(stateConfig.init), true);
  };
});

/*
 * AppStateOperators — small static collection of RxJS-style operators meant
 * to be composed inside an AppState binding chain (the `.map(...)` form on
 * AppState exposes these).
 *
 *   AppStateOperators.map(v => v * 2)
 *   AppStateOperators.tap(console.log)
 *   AppStateOperators.filter(v => v > 0)
 *   AppStateOperators.skip(3)
 *   AppStateOperators.untilDestroyed(ctx)
 *
 * Conventions:
 *   - Each operator is a *factory*: it takes the user predicate / value-fn
 *     and returns the actual stream callback that the AppState binding
 *     plumbing invokes with `(value, emittedCount, binding)`.
 *   - `filter` rejects the chain with a sentinel `Promise.reject()` when the
 *     predicate is false; the binding plumbing treats that as "skip this
 *     emission" without surfacing an error.
 *   - `skip(n)` is `filter` with the always-after-N predicate.
 *   - `untilDestroyed(ctx)` is an auto-cleanup pseudo-operator: the *first*
 *     emission registers an `onDestroy` on `ctx` that tears down the binding.
 *     `checked` ensures registration runs once.
 */
Class(function AppStateOperators(_default) {
  Inherit(this, Component);

  this.map = (fn) => (value) => fn(value);

  // Side-effectful tap — observe without transforming.
  this.tap = (fn) => (value) => (fn(value), value);

  // Sentinel rejection signals "skip" to the binding pipeline; the chain
  // continues on the next emission.
  this.filter = (fn) => (value, emittedCount) =>
    fn(value, emittedCount) ? value : Promise.reject();

  this.skip = (skipCount) => this.filter((_, emittedCount) => skipCount <= emittedCount);

  /*
   * Tie a binding's lifetime to `ctx`'s destroy. `checked` lazily registers
   * the destroy callback on first emission (we don't have a handle to the
   * binding until then because the chain hasn't been wired yet).
   */
  this.untilDestroyed = (ctx) => {
    let checked = false;
    return (value, _, binding) => {
      if (!checked) {
        checked = true;
        ctx._bindOnDestroy(() => {
          if (Hydra.LOCAL) console.log('binding destroyed ');
          binding.destroy?.();
        });
      }
      return value;
    };
  };
}, 'static');

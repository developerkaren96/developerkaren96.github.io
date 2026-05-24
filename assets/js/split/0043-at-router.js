/*
 * Router — declarative URL → view resolver layered on top of PushState.
 *
 *   new Router(_isHash, _rootPath)
 *
 * Route shape:
 *   {
 *     path:      'projects/:id',          // URLPattern syntax (relative)
 *     view:      '$ProjectFragment',      // '$Foo' resolves to this[Foo],
 *                                         // else to a registered class
 *     redirect:  'projects/intro',        // sibling-path redirect
 *     updateURL: true,                    // make redirects bump the URL
 *     children:  [ { path: 'tab', ... } ],
 *     name:      'projects',
 *     meta:      { ... },
 *   }
 *
 * Tree → flat list:
 *   `_routesFlattened` holds `{ path, route, matcher }` records, one per
 *   leaf and intermediate node. `addChildrenRoutes` recursively concatenates
 *   parent and child paths with `/` so `URLPattern.pathname` matches the
 *   full route. The first route whose `URLPattern.exec(...)` returns truthy
 *   wins, and `result.pathname.groups` becomes the route's `params`.
 *
 * Resolution pipeline (handleState):
 *   1. Pull current value from PushState; if absent, treat as init (value
 *      becomes '').
 *   2. If `virtualRoutes` is on, just publish the value to
 *      AppState['Router/state'] — leave the visual transitions to whichever
 *      consumer subscribes there.
 *   3. Lock the router (prevent further nav until the current resolution
 *      finishes), iterate `_callbacks` until one of them matches a route.
 *   4. Handle redirects: a `redirect` route is dereferenced; with
 *      `updateURL`, the URL is rewritten + we return early so the next URL-
 *      change cycle picks it up; otherwise the route swap is silent.
 *   5. No match → fall through to the registered '404' route.
 *   6. Resolve `view`:
 *        - direct ref            → use the field as-is
 *        - `'$ref'`              → `self[ref]` if exists; else iterate
 *                                  `self.classes` to force-instantiate the
 *                                  matching .ref class so `self.ref` exists
 *      and set `visible = true`.
 *   7. Run the registered callback `(prev, next, path, params, route)`,
 *      then call `next.onRouteChange({...})`. Publish `Router/previous`
 *      and `Router/previousRoute` to AppState, unlock, save as
 *      `_prevRoute`.
 *
 * HMR support: when a hot-replaced view instance arrives via
 * `Component.HMR_INSTANCE_RELOADED`, the cached `_prevView` is swapped to
 * the new instance so future transitions know about it.
 *
 * `_initFragRoutes`: convenience for fragment-style declarations where
 * `view` is a `$ref` string; resolves them to actual fields before
 * delegating to `registerRoutes`.
 *
 * registerRoutes throws if no '404' route is defined — the catch-all is
 * required.
 *
 * `_debounce`: registerRoutes is often called multiple times from different
 * sub-trees in the same frame; we delay the first `handleState` by 1 ms so
 * all of them are merged into a single resolution pass.
 *
 * navigate / replace: wrap `setState` / `replaceState` with a 10 ms debounce
 * so rapid programmatic nav events collapse.
 */
Class(function Router(_isHash, _rootPath) {
  Inherit(this, PushState, _isHash);
  const self = this;
  let _debounce;
  let _prevView, _nextView;
  let _404Route, _prevRoute;
  const _callbacks         = [];
  const _routesFlattened   = [];

  // Find the first registered URLPattern that matches `path`. Returns a
  // route object decorated with `.params` from the matched groups.
  function matchRoute(path) {
    let params;
    const matchedRoute = _routesFlattened.find((route) => {
      const result = route.matcher.exec({ pathname: `/${path}` });
      if (!result || !result.pathname) return false;
      params = result.pathname.groups;
      return true;
    });
    return !!matchedRoute && { ...matchedRoute.route, params };
  }

  function handleState(e) {
    let value = e?.value;
    let isInit = false;
    if (!value) { isInit = true; value = self.getState(); }

    // Virtual routing: don't run resolver, just expose the path to AppState.
    if (self.virtualRoutes) {
      return AppState.set('Router/state', String(value), isInit && !value);
    }

    let route = null;
    let cb    = null;
    self.lock();
    _callbacks.forEach((callback) => {
      if (route) return;
      route = matchRoute(value);
      cb    = callback;
    });

    // Resolve redirects.
    if (route && route.redirect) {
      const redirectedRoute = matchRoute(route.redirect);
      if (redirectedRoute) {
        if (route.updateURL) { self.unlock(); return void self.setState(route.redirect); }
        route = redirectedRoute;
      }
    }

    // Unmatched → 404 fallback.
    if (!route) { value = '404'; route = _404Route; }

    AppState.set('Router/state', String(value));
    AppState.set('Router/route', route);

    (async function doRoute(route, path, callback) {
      _nextView = route?.view;
      // '$ref' → look up `this.ref`; else force-instantiate from `classes`.
      if ('$' == _nextView?.charAt?.(0)) {
        const ref = _nextView.slice(1);
        if (self[ref]) {
          _nextView = self[ref];
        } else {
          for (const key in self.classes) {
            const obj = self.classes[key];
            if (obj.ref == ref) obj.force();
            _nextView = self[ref];
          }
        }
        if (_nextView) _nextView.visible = true;
      }
      const params = null;
      await callback?.(_prevView, _nextView, path, route.params, route);
      await _nextView?.onRouteChange?.({
        params,
        path,
        name:     route.name,
        children: route.children,
        meta:     route.meta,
      });
      _prevView = _nextView;
      AppState.set('Router/previous',      _prevRoute?.path);
      AppState.set('Router/previousRoute', _prevRoute);
      self.currentRoute = { ...route, params };
      self.unlock();
      _prevRoute = route;
    })(route, value, cb);
  }

  // HMR: replace cached prev-view reference if the underlying instance got
  // hot-reloaded.
  function handleInstanceReloaded({ oldInstance, newInstance }) {
    if (_prevView === oldInstance) _prevView = newInstance;
  }

  // Recursive flatten — every level of nesting expands into its own
  // `<parent>/<child>` entry with its own URLPattern matcher.
  function addChildrenRoutes(element, parentPath) {
    if (!(element.children && element.children.length)) return;
    element.children.forEach((child) => {
      const path = `${parentPath}/${child.path}`;
      _routesFlattened.push({
        path,
        route:   child,
        matcher: new URLPattern({ pathname: path }),
      });
      addChildrenRoutes(child, path);
    });
  }

  self.currentRoute      = null;
  self.fireChangeWhenSet = true;

  // Root-path: explicit string > '' on LOCAL > '/' on production.
  (function setRootPath() {
    const rootPath = 'string' == typeof _rootPath ? _rootPath : Hydra.LOCAL ? '' : '/';
    self.setRoot(rootPath);
  })();

  (function initEvents() {
    self.events.sub(self, Events.UPDATE, handleState);
    self.events.sub(Component.HMR_INSTANCE_RELOADED, handleInstanceReloaded);
  })();

  /*
   * Convenience for fragment-style route arrays where `view` is a `$ref`
   * string referencing `self[ref]`. Resolves before passing along.
   */
  this._initFragRoutes = function (array) {
    array.forEach((obj) => {
      if (obj.view)     obj.view = self[obj.view.slice(1)];
      if (obj.lazyView) obj.view = obj.lazyView;
    });
    this.registerRoutes(self.onRouteChange, array);
  };

  this.registerRoutes = function (callback, list) {
    list.forEach((element) => {
      if (element.path.startsWith('/')) throw new Error('router paths should not start with /');
      if (element.redirect && element.redirect.startsWith('/')) {
        throw new Error('redirect paths must not start with /');
      }
      const path = `/${element.path}`;
      _routesFlattened.push({
        path,
        route:   element,
        matcher: new URLPattern({ pathname: path }),
      });
      addChildrenRoutes(element, path);
      if ('404' === element.path) _404Route = element;
    });
    if (!_404Route) throw new Error('Error: no 404 route defined.  Please define a route whos path is "404" ');
    _callbacks.push(callback);
    // Coalesce multiple registerRoutes calls in the same frame.
    clearTimeout(_debounce);
    _debounce = self.delayedCall(handleState, 1);
  };

  this.navigate = function (path) {
    if (self.isLocked) return;
    if (path.startsWith('/')) path = path.substring(1);
    Utils.debounce(() => { self.setState(path); }, 10);
  };

  this.replace = function (path) {
    if (path.startsWith('/')) path = path.substring(1);
    Utils.debounce(() => { self.replaceState(path); }, 10);
  };
});

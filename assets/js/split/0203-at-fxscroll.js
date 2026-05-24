/*
 * FXScroll — Hydra's "scrolling-as-WebGL-scene" container.
 *
 * The visible page is split into N stacked "views", each one rendered
 * as a full screen into its own RT. As the user scrolls, the active
 * index pair (current/next) cross-fades via a transition shader
 * (typically a slide or warp effect) under control of
 * ScrollRenderManager.
 *
 * Per-frame `loop`:
 *   - Calls `_renderManager.render()` which advances the cross-fade.
 *   - For each view that has its own camera (`__scrollCamera`),
 *     translates the camera Y by `scrollY * scrollNormal` so meshes
 *     parallax in sync with the DOM scroll position.
 *
 * Behind the scenes:
 *   - A single screen-quad mesh holds the `_transitionShader`.
 *   - A real HTML element ($element) keeps the actual page scroll
 *     bar so accessibility/keyboard scrolling still works; mouse
 *     wheel / touch are routed through ScrollController for the
 *     virtualised scroll.
 *
 * Views can be `manualRender = true` (driven by the manager) or
 * regular Scene-attached objects.
 */
Class(function FXScroll(_params = {}) {
  Inherit(this, Object3D);
  const self = this;
  var $element,
    _transitionShader,
    _renderManager,
    _views = [];
  function loop() {
    _renderManager.render();
    for (let i = _views.length - 1; i > -1; i--) {
      let view = _views[i];
      if (null != view.scrollNormal && view.__scrollCamera) {
        let camera = view.__scrollCamera,
          y = view.__scrollY;
        camera.group.position.y = y * view.scrollNormal;
      }
    }
    let scroll = _renderManager.controller.overallScroll;
    scroll > 0 && (self.progress = scroll);
  }
  function findRouter() {
    let p = self.parent;
    for (; p; ) {
      if (p.getState) return p;
      p = p.parent;
    }
  }
  function navigate(view) {
    let route = view.__scrollRoute;
    if (route) findRouter()?.navigate(route);
    else {
      let privateRoute = view.__privateRoute;
      privateRoute && (findRouter()?.replaceState(''), AppState.set('Router/state', privateRoute));
    }
  }
  async function initRoute() {
    if (self.flag('initializing')) return;
    if (
      (self.flag('initializing', true, 2e3),
      _views.length || (await self.wait((_) => !!_views.length)),
      await defer(),
      self._invisible)
    )
      return;
    let router = findRouter();
    if (((router.virtualRoutes = true), !router)) return;
    let state = router.getState();
    AppState.set('Router/state', state);
    state && state.includes('/') && (state = state.split('/')[0]);
    (async function sortAndInitialize(state) {
      let foundFirst = false,
        sortedViews = [..._views];
      _params.initializeSort &&
        (sortedViews.forEach((view) => {
          view.__scrollRoute == state && ((view.__initIndex = 0), (foundFirst = view));
        }),
        foundFirst || ((sortedViews[0].__initIndex = 0), (foundFirst = sortedViews[0])),
        sortedViews.forEach((view) => {
          if (null == view.__initIndex) {
            let myIndex = _views.indexOf(view),
              firstIndex = sortedViews.indexOf(foundFirst);
            view.__initIndex = Math.abs(myIndex - firstIndex);
          }
        }),
        sortedViews.sort((a, b) => a.__initIndex - b.__initIndex));
      sortedViews.forEach(async (ref, i) => {
        ref.nuke && (await Initializer3D.uploadNuke(ref.nuke));
        const group = ref.layout || ref.scene || ref.group || ref.element?.group;
        group &&
          (await Initializer3D.detectUploadAll(group, 0 == i),
          i == sortedViews.length - 1 && AppState.set('FXScroll/initialized', true),
          0 == i && AppState.set('FXScroll/firstScene'));
      });
    })(state);
    for (let i = 0; i < _views.length; i++) {
      let view = _views[i];
      if (view.__scrollRoute == state)
        return void (_renderManager.controller.scroll = view.start + 20);
    }
    navigate(_views[0]);
  }
  function resizeHandler() {
    _transitionShader.set('uRatio', Stage.width / Stage.height);
  }
  function handleViewChange({ view: view }) {
    self.flag('initializing') || AppState.get('Router/state')?.includes('work/') || navigate(view);
  }
  this.views = _views;
  this.progress = 0;
  (function initHTML() {
    ($element = Stage.create('FXScroll')).css({
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      zIndex: 2,
    });
    $element._scrollParent = true;
    self.element = $element;
  })();
  (function initLogic() {
    _transitionShader = self.initClass(Shader, 'FXScrollTransition', {
      tNormal: {
        value: Utils3D.getRepeatTexture('assets/images/pbr/damaged_road_normal.png'),
      },
      tMap1: {
        value: null,
      },
      tMap2: {
        value: null,
      },
      uRatio: {
        value: Stage.width / Stage.height,
      },
      uTransition: {
        value: 0,
      },
      uVelocity: {
        value: 0,
      },
      uAngle: {
        value: _params.angle || 0,
      },
    });
    _renderManager = self.initClass(ScrollRenderManager, self, _transitionShader, {
      container: $element,
      keyboard:
        undefined === _params.keyboard || 'boolean' != typeof _params.keyboard || _params.keyboard,
      smoothScroll: true,
      pingPong: _params.pingPong || false,
    });
    self.events.sub(_renderManager.controller, ScrollController.VIEW_CHANGE, handleViewChange);
  })();
  self.startRender(loop);
  self.onResize(resizeHandler);
  this.onVisible = function () {
    initRoute();
  };
  this.scrollTo = function (scroll, time) {
    if (time > 0) {
      let v = {
        value: _renderManager.controller.scroll,
      };
      tween(
        v,
        {
          value: scroll?.start ? scroll.start + 20 : scroll,
        },
        time,
        'linear',
      ).onUpdate((_) => {
        _renderManager.controller.scroll = v.value;
      });
    } else _renderManager.controller.scroll = scroll?.start ? scroll.start + 20 : scroll;
  };
  this.get('renderManager', () => _renderManager);
  this.parent.lockScroll = function () {
    _renderManager.controller.lock();
  };
  this.parent.unlockScroll = function () {
    _renderManager.controller.unlock();
  };
  this.parent._initFXScroll = async function (list) {
    for (let i = 0; i < list.length; i++) {
      let obj = list[i];
      for (let key in obj) {
        let value = obj[key];
        '$' == value.charAt?.(0) &&
          (await self.wait(self.parent, value.slice(1)), (obj[key] = self.parent[value.slice(1)]));
      }
      let view = obj.view;
      view.__scrollElement = $('scrollElement');
      let vh = obj.vh;
      _params.pageScalar && (vh *= _params.pageScalar);
      view.__scrollElement.size('100%', 105 * Number(Math.max(1, vh)) + 'vh').css({
        position: 'absolute',
      });
      obj.cameraLayer &&
        view.layout?.getLayer(obj.cameraLayer).then((camera) => {
          view.__scrollCamera = camera;
        });
      obj.route && (view.__scrollRoute = obj.route);
      obj.privateRoute && (view.__privateRoute = obj.privateRoute);
      obj.cameraMove && (view.__scrollY = Number(obj.cameraMove));
      _views.push(view);
      $element.add(view.__scrollElement);
      view.attachElementToScroll = (el) => view.__scrollCamera.add(el);
    }
    _renderManager.show(self);
    initRoute();
  };
});

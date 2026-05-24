/*
 * ScrollRenderManager — pairs a ScrollController (input/state) with a
 * transition Shader and a stack of per-view RTs to produce the actual
 * cross-fade animation between scroll views.
 *
 * Per-frame `render()`:
 *   - Watches `_controller.index1` / `index2` for changes; toggles
 *     visibility of the corresponding view's RT-backed meshes.
 *   - Wires the current pair into the transition shader as `tMap1`
 *     and `tMap2`, with `uTransition = controller.progress`.
 *   - Sets normalised scissor rects on each view so only the part of
 *     the screen revealing for that view is actually drawn. The
 *     factor `1.3 * Math.range(progress, 0, 1, 1, 0)` over-extends
 *     the scissor slightly past the visible edge so transition
 *     shaders that displace pixels at the seam don't show clipping.
 *
 * Ping-pong toggle (`params.pingPong`, default true):
 *   - When on, only one of the two views is drawn per frame
 *     (alternating). Cuts draw cost in half when both views are
 *     expensive 3D scenes and the user is mid-transition.
 *   - When off, both views render every frame — necessary if the
 *     transition shader expects sub-frame-accurate samples.
 *
 * Custom events relayed from the controller:
 *   - `ScrollControllerRenderManager_view_change`
 *   - `ScrollControllerRenderManager_bottom`
 *   - `ScrollControllerRenderManager_top`
 *
 * `show(page)` swaps in `page.views` as the active view stack and
 * hides each view's DOM scroll container.
 */
Class(function ScrollRenderManager(object, transitionShader, params) {
  Inherit(this, Component);
  const self = this;
  var _mesh,
    _controller,
    _views,
    _index1 = 0,
    _index2 = 0,
    _renderCount = 0;
  function onScrollControllerViewChange(e) {
    self.events.fire(self.VIEW_CHANGE, e);
  }
  function onScrollControllerBottom(e) {
    self.events.fire(self.BOTTOM, e);
  }
  function onScrollControllerTop(e) {
    self.events.fire(self.TOP, e);
  }
  this.VIEW_CHANGE = 'ScrollControllerRenderManager_view_change';
  this.BOTTOM = 'ScrollControllerRenderManager_bottom';
  this.TOP = 'ScrollControllerRenderManager_top';
  this.initialize = function (object, transitionShader, params = {}) {
    self.initClass(Shader, 'ScreenQuad', {
      tMap: {
        value: null,
      },
    });
    self.transitionShader = transitionShader;
    (_mesh = new Mesh(World.QUAD, self.transitionShader)).frustumCulled = false;
    object.add(_mesh);
    _controller = self.initClass(ScrollController, params.container, params);
    self.events.sub(_controller, ScrollController.VIEW_CHANGE, onScrollControllerViewChange);
    self.events.sub(_controller, ScrollController.BOTTOM, onScrollControllerBottom);
    self.events.sub(_controller, ScrollController.TOP, onScrollControllerTop);
    self.controller = _controller;
    self.pingPong = false !== params.pingPong;
  };
  this.render = function () {
    _views &&
      (_index1 !== _controller.index1 || _index2 !== _controller.index2
        ? (_views[_index1].rt && (_views[_index1].visible = false),
          _views[_index2].rt && (_views[_index2].visible = false),
          (_index1 = _controller.index1),
          (_index2 = _controller.index2),
          _views[_index1].rt && (_views[_index1].visible = true),
          _views[_index2].rt && _controller.progress > 0 && (_views[_index2].visible = true))
        : (_views[_index1].visible && _views[_index2].visible) ||
          (_views[_index1].rt && (_views[_index1].visible = true),
          _views[_index2].rt && _controller.progress > 0 && (_views[_index2].visible = true)),
      self.transitionShader.set('tMap1', _views[_index1].rt ? _views[_index1] : null),
      self.transitionShader.set('tMap2', _views[_index2].rt ? _views[_index2] : null),
      self.transitionShader.set('uTransition', _controller.progress),
      null != _controller.progress &&
        (_views[_index1].setScissor(0, 0, 1, 1.3 * Math.range(_controller.progress, 0, 1, 1, 0)),
        _views[_index2].setScissor(
          0,
          0,
          1,
          1.3 * Math.range(_controller.progress, 0, 1, 0, 1),
          true,
        )),
      self.pingPong
        ? ((0 === (_renderCount = Math.abs(_renderCount - 1)) || _controller.progress < 0.01) &&
            _views[_index1].rt &&
            _views[_index1].draw(),
          1 === _renderCount &&
            _views[_index2].rt &&
            _controller.progress > 0 &&
            _views[_index2].draw())
        : (_views[_index1].rt && _views[_index1].draw(),
          _index1 !== _index2 &&
            _controller.progress > 0 &&
            _views[_index2].rt &&
            _views[_index2].draw()));
  };
  this.show = function (page) {
    _controller.show(page);
    (_views = page.views).forEach((v) => {
      v.manualRender = true;
      v.scrollContainer && v.scrollContainer.hide();
      v.visible = false;
    });
  };
  this.hide = function (page) {
    _controller.hide(page);
  };
  object && this.initialize(object, transitionShader, params);
});

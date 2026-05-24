/*
 * ScrollController — the virtual-scroll state machine that drives
 * FXScroll / ScrollRenderManager.
 *
 * Listens to a `VirtualScroll` instance for mouse-wheel / touch /
 * keyboard input and accumulates them into a continuous scroll
 * position. Snaps to discrete "views" (one per full screen of
 * content) and exposes:
 *
 *   - `position`       : current scroll offset (px).
 *   - `last` / `delta` : previous position and per-frame delta.
 *   - `direction`      : -1 / 0 / +1 last-known scroll direction.
 *   - `index1`         : index of the *current* view.
 *   - `index2`         : index of the *upcoming* view during a
 *                         transition (= index1 + direction).
 *   - `progress`       : 0–1 fade from index1 → index2.
 *
 * Events fired:
 *   - `VIEW_CHANGE` whenever index1 stabilises onto a new value.
 *   - `BOTTOM`      when the user reaches the end of the stack.
 *   - `TOP`         when they scroll back to the start.
 *
 * `show(page)` / `hide(page)` toggle the controller's attachment to
 * a particular page's views array — supports multi-page apps where
 * each page has its own scroll stack.
 *
 * `_timer` debounces the `VIEW_CHANGE` event so a quick flick that
 * passes through several views doesn't fire one event per view.
 */
Class(
  function ScrollController(_object, _params) {
    Inherit(this, Component);
    const self = this;
    var _virtualScroll, _views;
    this.position = 0;
    this.last = 0;
    this.delta = 0;
    this.direction = 0;
    this.index1 = 0;
    this.index2 = 0;
    this.progress = 0;
    var _index = 0,
      _bottomScrolled = false,
      _timer = null,
      _virtualValue = 0,
      _totalHeight = 0;
    function debounceResize() {
      Utils.debounce(resize, 250);
    }
    function removeHandlers() {
      self.events.unsub(Events.RESIZE, debounceResize);
      self.stopRender(loop);
      self.events.unsub(Keyboard.DOWN, keydown);
    }
    function keydown(e) {
      if (_views)
        switch (e.code) {
          case 'Tab':
            !(function handleTabNav() {
              if (_params.virtualScroll && !self.smoothScroll) return;
              defer(() => {});
            })();
            break;
          case 'ArrowUp':
            moveScroll(-0.25 * Stage.height);
            break;
          case 'ArrowDown':
            moveScroll(0.25 * Stage.height);
        }
    }
    function moveScroll(s) {
      (_params.keyboard || _params.virtualScroll) &&
        (_params.virtualScroll
          ? (_virtualValue += Math._round(s))
          : (self.object.div.scrollTop += Math._round(s)));
    }
    async function resize() {
      if (_views && !self._invisible) {
        if (((_totalHeight = 0), _virtualScroll))
          _views.forEach((view) => {
            view.start = _totalHeight;
            let height = view.height;
            view.end = view.start + view.height;
            _totalHeight += height;
          });
        else {
          await defer();
          _views.forEach(async (view) => {
            let layout = view.__scrollElement;
            layout.ready && (await layout.ready());
            layout.css({
              top: _totalHeight,
            });
            view.start = _totalHeight;
            layout.start = _totalHeight;
            let height = layout.div.getBoundingClientRect().height;
            view.height = height;
            layout.height = height;
            _totalHeight += height;
            view.end = view.start + view.height;
            layout.parallax && layout.willChange('transform');
          });
          __body;
        }
        update();
      }
    }
    function loop() {
      self.flag('active') &&
        (_virtualScroll
          ? ((_virtualValue += 0.7 * _virtualScroll.delta.y),
            _params.infinite || (_virtualValue = Math.clamp(_virtualValue, 0, _totalHeight)),
            (self.position = Math.lerp(_virtualValue, self.position, ScrollController.LERP)))
          : self.smoothScroll
            ? (self.position = Math.floor(
                Math.lerp(self.object.div.scrollTop, self.position, ScrollController.LERP),
              ))
            : (self.position = self.object.div.scrollTop),
        (self.delta = self.position - self.last),
        (self.last = self.position),
        (self.direction = Math.sign(self.delta)),
        (self.overallScroll = Math.range(
          (self.position + Stage.height) / _totalHeight,
          0.03,
          1,
          0,
          1,
          true,
        )),
        update());
    }
    !(function initParams() {
      _params || (_params = {});
      self.object = _object;
      self.object.overflowScroll({
        y: true,
      });
      self.smoothScroll = false !== _params.smoothScroll;
    })();
    (function style() {
      _params.virtualScroll ||
        (self.smoothScroll
          ? self.object.css({
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              overflowY: 'scroll',
            })
          : self.object.css({
              width: '100%',
            }));
    })();
    _params.virtualScroll && (_virtualScroll = Scroll.createUnlimited());
    let _sec = new Array(3);
    function update() {
      if (!_views) return;
      if (_params.infinite)
        return (function updateInfinite() {
          let offset = _views[1].start;
          if (!offset) return;
          let height = _totalHeight,
            prevActiveView = _views[self.index1];
          prevActiveView && (prevActiveView.active = false);
          _sec[0] = Math.floor(Math.mod(self.position, height) / offset);
          _sec[2] = Math.floor(Math.mod(self.position + Stage.height, height) / offset);
          self.index1 = _sec[0];
          self.index2 = _sec[2];
          let extraPadding = Stage.height / offset;
          if (
            (1 === extraPadding && (extraPadding = 0),
            (self.progress = Math.range(
              Math.fract(self.position / offset),
              extraPadding,
              1,
              0,
              1,
              true,
            )),
            (_views[self.index1].active = true),
            parallax(_views[self.index1]),
            parallax(_views[self.index2]),
            _index !== self.index1)
          ) {
            _index = self.index1;
            let event = {};
            event.index = _index;
            event.direction = self.direction;
            event.view = _views[_index];
            self.events.fire(ScrollController.VIEW_CHANGE, event);
          }
        })();
      self.smoothScroll;
      let prevActiveView = _views[self.index1];
      prevActiveView && (prevActiveView.active = false);
      let height = 0;
      for (let i = 0, l = _views.length; i < l; i++) {
        let view = _views[i];
        if (
          ((height += view.height),
          (view.scrollNormal = -1),
          (view.scrollProgress = 0),
          view.scrollContainer && (view.scrollContainer.visible = false),
          self.position < height)
        ) {
          self.index1 = i;
          self.index2 = i + 1;
          self.index2 > l - 1 && (self.index2 = l - 1);
          break;
        }
      }
      let current = Math.max(self.position + Stage.height - _views[self.index2].start, 0);
      if (
        ((self.progress = current / Stage.height),
        (_views[self.index1].active = true),
        parallax(_views[self.index1]),
        parallax(_views[self.index2]),
        _index !== self.index1)
      ) {
        _index = self.index1;
        let event = {};
        event.index = _index;
        event.direction = self.direction;
        event.view = _views[_index];
        self.events.fire(ScrollController.VIEW_CHANGE, event);
      }
      Math.abs(_totalHeight - Stage.height - self.position) < 0.2 * Stage.height
        ? _bottomScrolled ||
          ((_bottomScrolled = true),
          (_timer = self.delayedCall(() => {
            let event = {};
            event.index = self.index2;
            event.direction = 1;
            event.view = _views[self.index2];
            self.events.fire(ScrollController.BOTTOM, event);
          }, 850)))
        : (_timer && (clearTimeout(_timer), (_timer = null)),
          _bottomScrolled && (_bottomScrolled = false));
    }
    function parallax(view) {
      let current = 0,
        progress = 0;
      if (_params.infinite) {
        let pos = self.position + Stage.height - view.start;
        current = Math.fract(pos / _totalHeight) * _totalHeight;
        progress = Math.clamp(current / (view.height + Stage.height), 0, 1);
      } else {
        current = self.position + Stage.height - view.start;
        progress = Math.clamp(current / (view.height + Stage.height), 0, 1);
      }
      isNaN(progress) && (progress = 0);
      view.scrollProgress = progress;
      view.scrollNormal = Math.range(progress, 0, 1, 1, -1);
      view.scrollDirection = self.direction;
      view.scrollTransition = self.progress;
      let layout = view.ui || view,
        currentScroll = self.scroll;
      if (layout.scrollContainer && progress > 0) {
        let target = view.start - currentScroll;
        if (null != layout.scrollContainer.stickyY)
          if (null != layout.scrollContainer.releaseY) {
            let percent = (layout.scrollContainer.releaseY * Stage.height) / view.height;
            if (view.scrollProgress > percent) {
              let pixels = (view.scrollProgress - percent) * view.height;
              target = layout.scrollContainer.stickyY * Stage.height - pixels;
            } else target = Math.max(layout.scrollContainer.stickyY * Stage.height, target);
          } else target = Math.max(layout.scrollContainer.stickyY * Stage.height, target);
        layout.scrollContainer.y = Math.lerp(
          target,
          layout.scrollContainer.y,
          ScrollController.LERP,
        );
        layout.scrollContainer.fxScrollSetup
          ? layout.scrollContainer.show()
          : ((layout.scrollContainer.fxScrollSetup = true), (layout.scrollContainer.y = target));
        layout.scrollContainer.transform && layout.scrollContainer.transform();
      }
    }
    this.get('totalHeight', () => _totalHeight);
    this.get('scroll', (_) => (_params.virtualScroll ? _virtualValue : self.object.div.scrollTop));
    this.set('scroll', (s) => {
      _params.virtualScroll
        ? (_virtualValue = Math._round(s))
        : (self.object.div.scrollTop = Math._round(s));
    });
    this.show = function (page) {
      self.smoothScroll && _params.virtualScroll;
      page;
      _views = page.views;
      self.scroll = 0;
      self.position = 0;
      _virtualValue = 0;
      resize();
      (function addHandlers() {
        self.events.sub(Events.RESIZE, debounceResize);
        self.startRender(loop);
        self.events.sub(Keyboard.DOWN, keydown);
      })();
      self.flag('active', true);
    };
    this.hide = function (page) {
      removeHandlers();
      self.flag('active', false);
    };
    this.lock = function () {
      _params.virtualScroll ||
        self.object.css({
          overflow: 'hidden',
        });
    };
    this.unlock = function () {
      _params.virtualScroll ||
        self.object.css({
          overflowY: 'scroll',
        });
    };
    this.onDestroy = function () {
      removeHandlers();
    };
  },
  (_) => {
    ScrollController.VIEW_CHANGE = 'smooth_view_change';
    ScrollController.BOTTOM = 'smooth_bottom';
    ScrollController.TOP = 'smooth_top';
    ScrollController.LERP = Device.mobile && !Utils.query('roomqr') ? 0.5 : 0.1;
  },
);

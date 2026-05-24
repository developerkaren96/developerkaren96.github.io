/*
 * WorkItems — Object3D + internal ViewState of WorkItem
 * children, one per project. Data fetched via
 * self.requestData('workItems'); placeholder fallback in
 * dev returns 15 mocked items (Museum of Weed / Paper
 * Planes flavour).
 *
 * positionViews:
 *   arranges views on a horizontal arc around origin
 *   (radius 3.8). Angle step is 50° landscape / 35°
 *   portrait, vertical step 0.12*total (0.16 on portrait
 *   mobile, with base y=4). lookAt(2× position) so each
 *   pane faces tangentially. Adds scale-in tween
 *   (0→1, 1200ms easeOutQuint, staggered 200ms).
 *
 * _cameraTargets[]: pre-computed Group per view (position +
 *   quaternion); portrait-mobile drops y by 0.7.
 *
 * handleCameraScroll (per-frame, gated by 'locked'):
 *   smoothStep scrollProgress over edge dead-zone
 *   (0.06 desktop / 0.1 mobile), lerps camera through
 *   _cameraTargets segment, slerping orientation. First
 *   frame is a hard copy; subsequent frames lerp 0.2.
 *   y bumped down at start (smoothStep 0→0.15) and up at
 *   end (smoothStep 1→0.85) for fly-in/out.
 *
 *   Sorts _views by distanceToSquared to camera and assigns
 *   setRenderOrder(i) so nearest renders on top. When route
 *   equals 'work', publishes WorkItems/videoURL = last
 *   (=closest) view's data.videoURL, prompting Work to
 *   restart the video texture.
 *
 * Work/project bind: when project set, finds the matching
 *   view by perma and tweens camera straight to its
 *   position (700ms easeOutCubic), then locks scroll
 *   handler. Clear unlocks.
 *
 * onAddView: starts view at scale=0 then debounces
 *   positionViews 500ms (collapses bulk adds into one
 *   re-layout). onRemoveView: tweens view scale to 0
 *   400ms easeInQuart and fires ViewController/resetWork
 *   (single-shot via 'removing' flag, 200ms cooldown).
 *
 * Standard Fragment plumbing.
 */
Class(function WorkItems(_input, _group) {
  const self = this;
  Inherit(self, Object3D);
  Inherit(self, XComponent);
  self.fragName = 'WorkItems';
  self.contexts = 'Object3D';
  self.uilInput = _input;
  self.uilFolder = _group;
  this.isFragment = true;
  var _promises = [];
  !(async function () {
    self.element && (self.element.onMountedHook = (_) => self.onMounted?.());
    self.uilInput = _input;
    self.uilFolder = _group;
    self.parent?.layers && (self.layers = self.parent.layers);
    self.layout?.getAllLayers && (self.layers = await self.layout.getAllLayers());
    self.data = await self.requestData('workItems', {}, (_) => {
      let data = [];
      for (let i = 0; i < 15; i++)
        data.push({
          seo: 'Test SEO text for item ' + i,
          title: i % 2 ? 'Museum of Weed' : 'Paper Planes',
          subhead:
            i % 2
              ? 'A small write-up of the project to give context to what it was, and the techniques used to create it.'
              : 'At Google I/O 2016, users in 15 countries used a mobile device to fold, stamp and throw planes into the 50-ft screen on stage. So far, 4.5 million planes have been created.',
          date: '2017\nVICE\nINSTALLATION',
          body: 'We worked with VICE  to build Exhibit 7 in the Museum of Weed, a temporary exhibition in Hollywood, California showcasing the social and legal evolution of cannabis.\n\nExhibit 7, Legalization, consisted of a 30 foot interactive timeline, powered by a Kinect, and a map visualization - both of which combine to tell the story of cannabis over time.',
          perma: 'test' + i,
          index: i,
        });
      return data;
    });
    self.set('items', self.data);
    var _views = [],
      _cameraTargets = [];
    function positionViews() {
      let mobile = Device.mobile && Stage.height > Stage.width;
      _cameraTargets.length = 0;
      _views = [...self.viewState.views];
      let views = self.viewState.views,
        angle = 0,
        total = Math.min(7, views.length),
        step = mobile ? Math.radians(35) : Math.radians(50),
        y = mobile ? 4 : 0,
        yStep = mobile ? 0.16 * total : 0.12 * total;
      views.forEach((view, i) => {
        view.group.position.x = 3.8 * Math.cos(angle);
        view.group.position.z = 3.8 * Math.sin(angle);
        view.group.position.y = 0;
        let pos = view.group.position.clone();
        pos.multiplyScalar(2);
        view.group.lookAt(pos);
        angle -= step;
        view.group.position.y = y - yStep * i;
        pos.y = y - yStep * i;
        let target = new Group();
        target.position.copy(pos);
        Device.mobile && Stage.width < Stage.height && (target.position.y -= 0.7);
        target.quaternion.copy(view.group.quaternion);
        _cameraTargets.push(target);
        tween(
          view.group.scale,
          {
            x: 1,
            y: 1,
            z: 1,
          },
          1200,
          'easeOutQuint',
          200 * i + 200,
        );
      });
    }
    self.onAddView = (view) => {
      view.group.scale.setScalar(0);
      Utils.debounce(positionViews, 500);
    };
    self.onRemoveView = (inst, index) => (
      self.flag('removing') ||
        (self.flag('removing', true, 200), self.fire('ViewController/resetWork')),
      tween(
        inst.group.scale,
        {
          x: 0,
          y: 0,
          z: 0,
        },
        400,
        'easeInQuart',
      ).promise()
    );
    self.set('videoURL', '');
    let target = new Group(),
      scrollValue = (new Group(), 0),
      camera = (Scroll.getUnlimited(), await self.get('Work/camera')),
      root = self.findParent('Work');
    self.handleCameraScroll = (_) => {
      if (self.flag('locked')) return;
      if (!_cameraTargets[0] || null == root.scrollProgress) return;
      let offset = Device.mobile ? 0.1 : 0.06;
      scrollValue = Math.smoothStep(offset, 1 - offset, root.scrollProgress);
      let numPlanes = _cameraTargets.length,
        segmentPosition = scrollValue * (numPlanes - 1),
        planeIndex1 = Math.floor(segmentPosition),
        planeIndex2 = Math.min(planeIndex1 + 1, numPlanes - 1),
        segmentFraction = segmentPosition - planeIndex1,
        t0 = _cameraTargets[planeIndex1],
        t1 = _cameraTargets[planeIndex2];
      target.position.copy(t0.position).lerp(t1.position, segmentFraction, false);
      target.quaternion.copy(t0.quaternion).slerp(t1.quaternion, segmentFraction, false);
      target.position.y += -1 * Math.smoothStep(0, 0.15, root.scrollProgress);
      target.position.y += 1 * Math.smoothStep(1, 0.85, root.scrollProgress);
      self.flag('firstframe')
        ? (camera.group.position.lerp(target.position, 0.2),
          camera.group.quaternion.slerp(target.quaternion, 0.2))
        : (self.flag('firstframe', true),
          camera.group.position.copy(target.position),
          camera.group.quaternion.copy(target.quaternion));
      self.viewState.views.length &&
        _views[0].group &&
        (_views.sort((a, b) =>
          a.group && b.group
            ? ((a.__distToCamera = a.group.position.distanceToSquared(camera.group.position)),
              (b.__distToCamera = b.group.position.distanceToSquared(camera.group.position)),
              b.__distToCamera - a.__distToCamera)
            : 0,
        ),
        _views.forEach((view, i) => view.setRenderOrder?.(i)),
        'work' === self.get('Router/state') &&
          _views[_views.length - 1].data &&
          self.set('videoURL', _views[_views.length - 1].data.videoURL));
    };
    self.startRender(self.handleCameraScroll);
    self.bind('Work/project', (data) => {
      if (data) {
        let view = (function findView(perma) {
          for (let i = 0; i < _views.length; i++) {
            if (!_views[i].data) return;
            if (_views[i].data.perma == perma) return _views[i];
          }
        })(data.perma);
        view &&
          (self.flag('locked', true),
          tween(camera.group.position, view.group.position, 700, 'easeOutCubic'));
      } else self.flag('locked', false);
    });
    for (let key in self)
      if (self[key]?.then) {
        let store = self[key];
        store.then((val) => (self[key] = val));
        _promises.push(store);
      }
    _promises.length && (await Promise.all(_promises));
    self.viewState = self.initClass(
      ViewState,
      AppState.createLocal(
        {
          view: 'WorkItem',
          data: self.data,
          onAddView: self.onAddView,
          onRemoveView: self.onRemoveView,
        },
        true,
      ),
    );
    self.viewState.isFragment && _promises.push(self.wait(self.viewState, '__ready'));
    _promises = null;
    self.flag?.('__ready', true);
    self.onInit?.();
  })();
});

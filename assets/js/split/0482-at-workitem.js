/*
 * WorkItem — ViewStateElement instance (one per project card
 * in /work). Clones 'Work/pane' (3D plane mesh) and
 * 'Work/pane_ui' (the WorkPaneUI text overlay) and reparents
 * them under this Object3D.
 *
 * Mesh shader: tMap = still thumbnail (Utils3D.getTexture of
 * data.thumbnailURL), tVideo + uVideoBlend wired from
 * 'WorkItems/videoURL' tween (Work/video → uVideoBlend 0→1
 * over 500ms when the currently broadcast videoURL matches
 * this item). uColor = project hex; uHover lerped from
 * self.hovered, uMouse lerped from Mouse.normal, uPhone
 * portrait flag.
 *
 * UI shader: tMap = self.paneRT.bitmap.capture (the
 * WorkPaneUI 1024² RT), uCamDistance = paneRT.camdistance,
 * frustumCulled=false, depthWrite=false.
 *
 * Layout: portrait-mobile bumps mesh.scale to 2.9×2.7 and
 * uScale uniform to (1.6, 0.9) for the squashed aspect;
 * landscape restores oScale.
 *
 * Interaction3D wires hover (sets self.hovered + SEO scroll
 * snap on focus) and click (navigate `work/{perma}` unless
 * ChatDOM is focused, click within 50ms, scrollProgress
 * >0.96, contact view active, or distance to camera >30).
 *
 * Router/state bind: when state equals `work/{perma}`,
 * publishes Work/project=data + WorkItems/videoURL.
 *
 * setRenderOrder(i): mesh.renderOrder=i, ui.renderOrder=i+1
 * (called by WorkItems' camera-sort).
 *
 * Standard Fragment plumbing.
 */
Class(function WorkItem(_data, _index, _params) {
  const self = this;
  Inherit(self, Object3D);
  Inherit(self, ViewStateElement);
  Inherit(self, XComponent);
  self.fragName = 'WorkItem';
  self.contexts = 'Object3D,ViewStateElement';
  self.data = _data;
  self.index = _index;
  self.params = _params;
  this.isFragment = true;
  var _promises = [];
  !(async function () {
    self.element && (self.element.onMountedHook = (_) => self.onMounted?.());
    self.data = _data;
    self.index = _index;
    self.params = _params;
    self.createState();
    self.parent?.layers && (self.layers = self.parent.layers);
    self.layout?.getAllLayers && (self.layers = await self.layout.getAllLayers());
    let stillTexture = Utils3D.getTexture(self.data.thumbnailURL),
      mesh = (await self.get('Work/pane')).clone(),
      mesh_shader = mesh.shader.clone();
    self.add(mesh);
    mesh.shader = mesh_shader;
    mesh.visible = true;
    mesh.shader.upload();
    let ui = (await self.get('Work/pane_ui')).clone(),
      ui_shader = ui.shader.clone();
    async function updateLayout() {
      Device.mobile && Stage.height > Stage.width
        ? ((mesh.scale.x = 2.9),
          (mesh.scale.y = 2.7),
          (mesh.shader.uniforms.uScale.value.x = 1.6),
          (mesh.shader.uniforms.uScale.value.y = 0.9))
        : ((mesh.shader.uniforms.uScale.value.x = 1),
          (mesh.shader.uniforms.uScale.value.y = 1),
          mesh.scale.copy(mesh.oScale));
    }
    self.add(ui);
    ui.shader = ui_shader;
    ui.shader.depthWrite = false;
    ui.visible = true;
    ui.frustumCulled = false;
    ui.position.z = 0;
    ui.shader.upload();
    mesh.oScale = new Vector3().copy(mesh.scale);
    updateLayout();
    self.onResize(updateLayout);
    self.onInit = async (_) => {
      let video = await self.get('Work/video');
      video && (mesh.shader.uniforms.tVideo.value = video);
      ui.shader.set('tMap', self.paneRT.bitmap.capture);
      ui.shader.set('uColor', new Color('#' + self.data.color));
      mesh.shader.uniforms.uColor.value = new Color('#' + self.data.color);
      mesh.shader.set('tMap', stillTexture);
      self.bind('Work/updatedVideo', (src) => {
        src === self.data.videoURL
          ? ((mesh.shader.uniforms.tVideo.value = video),
            mesh.shader.tween('uVideoBlend', 1, 500, 'easeOutSine', 300))
          : mesh.shader.set('uVideoBlend', 0);
      });
    };
    self.setRenderOrder = (i) => {
      mesh.renderOrder = i;
      ui.renderOrder = i + 1;
    };
    let mouse = new Vector2();
    self.startRender((_) => {
      mouse.lerp(Mouse.normal, 0.08);
      mesh.shader.uniforms.uMouse.value = mouse;
      mesh.shader.uniforms.uHover.value = Math.lerp(
        self.hovered ? 1 : 0,
        mesh.shader.uniforms.uHover.value,
        0.08,
      );
      ui.shader.uniforms.uHover.value = mesh.shader.uniforms.uHover.value;
      ui.shader.uniforms.uCamDistance.value = self.paneRT.camdistance;
    });
    let camera = await self.get('Work/camera');
    Interaction3D.find(camera).add(
      mesh,
      function onHover(e) {
        if (contact && 'over' === e.action) return;
        if (e.seo && 'over' === e.action) {
          if (!self.parent || !self.parent.views) return;
          let t = invSmooth(self.data.index / self.parent.views.length),
            scroll = Math.range(t, 0, 1, root.start, root.start + root.height, true);
          self.get('ViewController/scroll').scrollTo(scroll);
        }
        self.hovered = 'over' == e.action;
      },
      function onClick(e) {
        if (contact) return;
        if (self.__distToCamera > 30) return;
        defer((_) => {
          !self.get('ChatDOM/isFocused', true) &&
            Date.now() - self.get('ChatDOM/lastClick') > 50 &&
            self.findParent('Work').scrollProgress < 0.96 &&
            !self.get('ViewController/contact', true) &&
            self.navigate(`work/${self.data.perma}`);
        });
      },
      {
        url: `work/${self.data.perma}`,
        label: self.data.seo,
      },
    );
    let contact = false;
    self.bind('ViewController/contact', (active) => {
      contact = active;
    });
    let root = self.findParent('Work');
    const invSmooth = (x) => x + (x - x * x * (3 - 2 * x));
    self.bind('Router/state', (val) => {
      val == `work/${self.data.perma}` &&
        (self.set('Work/project', self.data), self.set('WorkItems/videoURL', self.data.videoURL));
      val.includes('/');
    });
    for (let key in self)
      if (self[key]?.then) {
        let store = self[key];
        store.then((val) => (self[key] = val));
        _promises.push(store);
      }
    _promises.length && (await Promise.all(_promises));
    self.paneRT = self.initClass(
      WorkPaneUI,
      AppState.createLocal(
        {
          title: self.data.title,
          copy: self.data.subhead,
          projectLogo: self.data.projectLogo,
          clientName: self.data.clientName,
          mesh: mesh,
        },
        true,
      ),
    );
    self.paneRT.isFragment && _promises.push(self.wait(self.paneRT, '__ready'));
    _promises = null;
    self.flag?.('__ready', true);
    self.onInit?.();
  })();
});

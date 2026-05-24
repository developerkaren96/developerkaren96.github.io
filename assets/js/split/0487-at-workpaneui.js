/*
 * WorkPaneUI — GLUIElement + Initialization that renders the
 * per-project pane label as a 1024×1024 UI3D bitmap RT
 * captured to a texture and consumed by WorkItemUIShader
 * as tMap.
 *
 * FragUIHelper layout (glText/glObject children, all
 * NBArchitektStd-Regular):
 *   client     fontSize 18 (replaced by clientName.replace
 *              ',' → ' /', center, lineHeight 1.8)
 *   title      fontSize ~ Math.range(title.length,5,20,130,
 *              100)*0.9, center, width 700
 *   copy       fontSize 18 lineHeight 1.6 (alpha 0 at init)
 *   logo       glObject 400×200 black.jpg slot (overridden
 *              by params.projectLogo.url; client hidden when
 *              a logo is present)
 *   block      924×224 dark backdrop behind title
 *   underline  924×2 white rule
 *
 * Logo uses dedicated LogoShader (tMap, uAlpha).
 *
 * bitmap.linkMesh(self.params.mesh, predicate): updates the
 *   needsRender/camdistance only when mesh→camera distance
 *   < 6 (proxy for visible-on-screen — avoids re-rendering
 *   the RT for off-screen items).
 *
 * resize() vertically centers the client+title+copy stack
 * around y=470, places logo above client, and stretches
 * 'block' to 1000 × 0.7*title.height behind title.
 * Re-resized once after 500ms wait so font metrics
 * (text.ready) settle before final layout. needsRender=100
 * forces a multi-frame re-render burst into the RT.
 *
 * Standard Fragment plumbing.
 */
Class(function WorkPaneUI(_params, ...restArgs) {
  const self = this;
  Inherit(self, GLUIElement);
  Inherit(self, Initialization);
  Inherit(self, XComponent);
  self.fragName = 'WorkPaneUI';
  self.contexts = 'GLUIElement,Initialization';
  self.params = _params;
  self.args = arguments;
  this.isFragment = true;
  var _promises = [];
  !(async function () {
    self.element && (self.element.onMountedHook = (_) => self.onMounted?.());
    self.bitmap = self.initClass(
      UI3D,
      AppState.createLocal(
        {
          width: 1024,
          height: 1024,
        },
        true,
      ),
    );
    self.bitmap.isFragment && _promises.push(self.wait(self.bitmap, '__ready'));
    self.initClass(FragUIHelper, {
      _type: 'UI',
      refName: 'unnamed',
      children: [
        {
          font: 'NBArchitektStd-Regular',
          fontSize: 18,
          fontColor: '#ffffff',
          x: 512,
          y: 600,
          z: 0,
          _type: 'glText',
          _innerText: 'client',
          refName: 'client',
          children: [],
        },
        {
          font: 'NBArchitektStd-Regular',
          fontSize: 100,
          align: 'center',
          fontColor: '#ffffff',
          x: 512,
          y: 280,
          z: 0,
          _type: 'glText',
          _innerText: 'Museum of Weed',
          refName: 'title',
          children: [],
        },
        {
          font: 'NBArchitektStd-Regular',
          fontSize: 18,
          lineHeight: 1.6,
          fontColor: '#ffffff',
          x: 512,
          y: 600,
          z: 0,
          _type: 'glText',
          _innerText: 'X',
          refName: 'copy',
          children: [],
        },
        {
          width: 400,
          height: 200,
          bg: 'assets/images/_scenelayout/black.jpg',
          _type: 'glObject',
          refName: 'logo',
          children: [],
        },
        {
          width: 924,
          height: 224,
          bg: '#060606',
          _type: 'glObject',
          refName: 'block',
          children: [],
        },
        {
          width: 924,
          height: 2,
          bg: '#ffffff',
          _type: 'glObject',
          refName: 'underline',
          children: [],
        },
      ],
    });
    self.params = _params;
    self.args = arguments;
    self.parent?.layers && (self.layers = self.parent.layers);
    self.layout?.getAllLayers && (self.layers = await self.layout.getAllLayers());
    const logoShader = self.createFragment(Shader, 'LogoShader', {
      tMap: {
        value: null,
      },
      uAlpha: {
        value: 1,
      },
    });
    self.logo.useShader(logoShader);
    self.onInit = async function () {
      self.bitmap.capture.rt.upload();
      await self.initSync(self.element.group);
      await self.initSync(self.element);
      self.set('ready', true);
    };
    self.copy.alpha = 0;
    self.camera = await self.get('Work/camera');
    self.camdistance = 0;
    self.bitmap.linkMesh(
      self.params.mesh,
      (_) => (
        (self.camdistance = self.params.mesh
          .getWorldPosition()
          .distanceTo(self.camera.group.position)),
        self.camdistance < 6
      ),
    );
    self.bitmap.root.add(self.element);
    self.gl(1024, 1024, self.bitmap.capture);
    if (self.params.title && self.params.copy && self.params.clientName) {
      self.client.setText(self.params.clientName.replace(/,/g, ' /'), {
        size: 24,
        align: 'center',
        letterSpacing: 0.1,
        lineHeight: 1.8,
      });
      let size = 0.9 * Math.range(self.params.title.length, 5, 20, 130, 100, true);
      self.title.setText(self.params.title, {
        size: size,
        align: 'center',
        letterSpacing: 0.01,
        lineHeight: 1.1,
        width: 700,
      });
      self.params.projectLogo &&
        (self.logo.bg(self.params.projectLogo.url), (self.client.alpha = 0));
      await self.client.text.ready();
      await self.title.text.ready();
      self.copy && (await self.copy.text.ready());
      resize();
      await self.wait(500);
      resize();
      self.bitmap.capture.needsRender = 100;
    }
    function resize() {
      self.title.height = self.title.dimensions.height;
      self.copy && (self.copy.height = self.copy.dimensions.height);
      self.client.height = self.client.dimensions.height;
      self.client.width = self.client.dimensions.width;
      let y = 470 - 0.5 * self.title.height - 0.5 * self.copy.height - 0.5 * self.client.height;
      isNaN(y) ||
        ((self.client.y = y),
        (y += self.client.height + 20),
        (self.title.y = y + 20),
        (y += self.title.height + 80),
        self.copy && (self.copy.y = y),
        (self.logo.y = self.client.y - 105),
        (self.logo.scale = 0.65),
        (self.logo.x = 512 - self.logo.width / 2),
        (self.block.width = 1e3),
        (self.block.height = 0.7 * self.title.height),
        (self.block.x = 512 - 0.5 * self.block.width),
        (self.block.y = self.title.y + 0.8 * (self.title.height - self.block.height)));
    }
    self.onResize((_) => {
      resize();
      self.bitmap.capture.needsRender = 100;
    });
    for (let key in self)
      if (self[key]?.then) {
        let store = self[key];
        store.then((val) => (self[key] = val));
        _promises.push(store);
      }
    _promises.length && (await Promise.all(_promises));
    _promises = null;
    self.flag?.('__ready', true);
    self.onInit?.();
  })();
});

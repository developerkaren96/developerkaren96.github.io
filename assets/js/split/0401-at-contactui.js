/*
 * ContactUI — GLUI fragment for the contact overlay (separate
 * from the 3D Contact FragFXScene 0400; this is the 2D text/
 * icons/QR layer that animates over the top).
 *
 * Layout: ~20 GLUI children built declaratively via
 * FragUIHelper — globe.png backdrop, two arrows, two stars,
 * three city labels (LAX / SYD / AMS — note "YEREVAN" used in code
 * but rendered as "SYD"), CONTACT US heading, email,
 * Privacy/Newsletter links, IG/IN/TW icons, three underline
 * bars and a [ MOBILE SYNC ] indicator.
 *
 * Two layout modes via updateLayout():
 *   - portrait mobile: 400×800 tall layout, globe centred,
 *     scale 0.85, mobile sync hidden.
 *   - default: 1300×500 landscape, globe full-width, QR code
 *     pinned next to AMS (positioned via self.qrcode.glui).
 *
 * MobileSync child fragment provides the QR pairing flow;
 * its glui rect is re-parented under self.ui with ADDITIVE
 * blending so it composites onto the same surface.
 *
 * Hover handler (hover()): tweens object alpha 1↔0.6 and
 * underline bar scaleX 1↔0 with `easeOutQuart`.
 *
 * Interactions wire `window.open` to:
 *   mailto:developerkarensimonyan@gmail.com
 *   https://mailchi.mp/activetheory/newsletter
 *   notion privacy notice
 *   instagram / linkedin / twitter
 *
 * GLA11y nodes registered for screen-reader text on every
 * label and clickable icon.
 *
 * `ViewController/contact` AppState toggles show/hide with
 * additive-blend fade (2s in / 1s out).
 *
 * `startRender` glitch effect: replaceRandomLetters() swaps
 * random ASCII positions with digits 0-9, intensity driven
 * by 1 − alpha so the text "decodes" as the panel fades in.
 *
 * Standard Fragment plumbing.
 */
Class(function ContactUI(_params, ...restArgs) {
  const self = this;
  Inherit(self, GLUIElement);
  Inherit(self, Initialization);
  Inherit(self, XComponent);
  self.fragName = 'ContactUI';
  self.contexts = 'GLUIElement,Initialization';
  self.params = _params;
  self.args = arguments;
  this.isFragment = true;
  var _promises = [];
  !(async function () {
    function hover(e) {
      switch (e.action) {
        case 'over':
          e.object.tween(
            {
              alpha: 0.6,
            },
            300,
            'easeOutQuart',
          );
          e.object.line &&
            e.object.line.tween(
              {
                scaleX: 0,
                alpha: 0.6,
              },
              300,
              'easeOutQuart',
            );
          break;
        case 'out':
          e.object.tween(
            {
              alpha: 1,
            },
            500,
            'easeOutQuart',
          );
          e.object.line &&
            e.object.line.tween(
              {
                scaleX: 1,
                alpha: 1,
              },
              500,
              'easeOutQuart',
            );
      }
    }
    async function updateLayout() {
      if (Device.mobile && Stage.height > Stage.width) {
        let width = 400,
          height = 800,
          scaleX = Math.range(Stage.width, 0, width, 0, 1),
          scaleY = Math.range(Stage.height, 0, height, 0, 1);
        self.ui.scale = Math.min(scaleX, scaleY);
        self.ui.x = Stage.width / 2 - self.ui.scale * width * 0.5;
        self.ui.y = Stage.height / 2 - self.ui.scale * height * 0.5 + 40;
        self.globe.x = 0.5 * width - self.globe.width / 2;
        self.globe.y = 0.39 * height - self.globe.height / 2;
        self.globe.scale = 0.5;
        self.globe.alpha = 1;
        self.arrow1.x = 0.5 * width;
        self.arrow1.y = 0.25 * height;
        self.arrow1.rotation = -90;
        self.arrow1.scale = 0.5;
        self.arrow2.x = self.arrow1.x;
        self.arrow2.y = 0.45 * height;
        self.arrow2.rotation = self.arrow1.rotation;
        self.arrow2.scale = self.arrow1.scale;
        self.star1.x = 0.5 * width - Math.max(0.1 * width, 85) - self.star1.width / 2 - 10;
        self.star1.y = 0.45 * height - self.star1.height / 2 - 238;
        self.star2.x = 0.5 * width + Math.max(0.1 * width, 85) - self.star2.width / 2 + 10;
        self.star2.y = 0.45 * height - self.star2.height / 2 - 238;
        self.contact.x = 0.5 * width;
        self.contact.y = 0.45 * height - 245;
        self.nyc.x = 0.5 * width + 5;
        self.nyc.y = 0.4 * height - 58;
        self.nyc.scale = 0.85;
        self.nyc.alpha = 0.9;
        self.lax.x = 0.5 * width + 5;
        self.lax.y = 0.27 * height - 58;
        self.lax.scale = 0.85;
        self.lax.alpha = 0.9;
        self.ams.x = 0.5 * width + 5;
        self.ams.y = 0.53 * height - 58;
        self.ams.scale = 0.85;
        self.ams.alpha = 0.9;
        await self.wait((_) => self.email.dimensions.width);
        await self.wait((_) => self.subscribe.dimensions.width);
        await self.wait((_) => self.privacy.dimensions.width);
        self.email.x = 0.5 * width + 2;
        self.email.y = 0.5 * height + 100;
        self.subscribe.x = 0.5 * width - 0.5 * self.subscribe.dimensions.width + 2;
        self.subscribe.y = self.email.y + 60;
        self.privacy.x = 0.5 * width - 0.5 * self.privacy.dimensions.width + 2;
        self.privacy.y = self.subscribe.y + 25;
        self.line1.width = self.email.dimensions.width;
        self.line2.width = 0;
        self.line3.width = 0;
        self.line1.x = 0.5 * width - 0.5 * self.line1.width;
        self.line1.y = self.email.y + 20;
        self.line2.x = 0.5 * width - 0.5 * self.line2.width;
        self.line2.y = self.subscribe.y + 17;
        self.line3.x = 0.5 * width - 0.5 * self.line3.width;
        self.line3.y = self.privacy.y + 17;
        self.in.x = 0.5 * width - 0.5 * self.in.width;
        self.in.y = self.line3.y + 35;
        self.tw.x = 0.5 * width - 0.5 * self.tw.width + 50;
        self.tw.y = self.line3.y + 35;
        self.ig.x = 0.5 * width - 0.5 * self.ig.width - 50;
        self.ig.y = self.line3.y + 35;
        self.sync.alpha = 0;
      } else {
        let width = 1300,
          height = 500,
          scaleX = Math.range(Stage.width, 0, width, 0, 1),
          scaleY = Math.range(Stage.height, 0, height, 0, 1);
        self.ui.scale = Math.min(scaleX, scaleY);
        self.ui.scale = Math.min(1.15, self.ui.scale);
        self.ui.x = Stage.width / 2 - 0.5 * self.ui.scale * width;
        self.ui.y = Stage.height / 2 - 0.5 * self.ui.scale * height;
        self.globe.x = 0.5 * width - self.globe.width / 2;
        self.globe.y = 0.5 * height - self.globe.height / 2;
        self.globe.scale = 0.91;
        self.globe.alpha = 0.5;
        self.arrow1.x = 0.325 * width - self.arrow1.width / 2;
        self.arrow1.y = 0.5 * height - self.arrow1.height / 2;
        self.arrow2.x = 0.675 * width - self.arrow2.width / 2;
        self.arrow2.y = 0.5 * height - self.arrow2.height / 2;
        self.star1.x = 0.44 * width - self.star1.width / 2;
        self.star1.y = 0.5 * height - self.star1.height / 2 - 203;
        self.star2.x = 0.56 * width - self.star2.width / 2;
        self.star2.y = 0.5 * height - self.star2.height / 2 - 203;
        self.contact.x = 0.5 * width;
        self.contact.y = height / 2 - 210;
        self.lax.x = 0.15 * width + 5;
        self.lax.y = height / 2 - 58;
        self.nyc.x = 0.5 * width + 5;
        self.nyc.y = height / 2 - 58;
        self.ams.x = 0.85 * width + 5;
        self.ams.y = height / 2 - 58;
        await self.wait((_) => self.ams.dimensions.width);
        await self.wait((_) => self.lax.dimensions.width);
        await self.wait((_) => self.email.dimensions.width);
        await self.wait((_) => self.subscribe.dimensions.width);
        await self.wait((_) => self.privacy.dimensions.width);
        self.email.x = width / 2;
        self.email.y = height / 2 + 200;
        self.ig.x = self.lax.x - 125;
        self.ig.y = self.email.y - 40;
        self.in.x = self.ig.x + 50;
        self.in.y = self.ig.y + 1;
        self.tw.x = self.in.x + 50;
        self.tw.y = self.ig.y + 1;
        self.privacy.x = self.lax.x - 0.5 * self.lax.dimensions.width;
        self.privacy.y = self.ig.y + 65;
        self.subscribe.x = self.privacy.x;
        self.subscribe.y = self.privacy.y + 30;
        self.line1.width = self.email.dimensions.width + 2;
        self.line1.x = self.email.x - 0.5 * self.line1.width - 1;
        self.line1.y = self.email.y + 20;
        self.line2.width = self.privacy.dimensions.width;
        self.line2.x = self.privacy.x;
        self.line2.y = self.privacy.y + 15;
        self.line3.width = self.subscribe.dimensions.width;
        self.line3.x = self.subscribe.x;
        self.line3.y = self.subscribe.y + 15;
        // Mobile sync QR + label removed — keep alpha 0 across layouts.
        if (self.qrcode && self.qrcode.glui) {
          self.qrcode.glui.alpha = 0;
          self.qrcode.glui.visible = false;
        }
        self.sync.alpha = 0;
        self.sync.visible = false;
      }
    }
    function replaceRandomLetters(str, numReplacements) {
      let result = str.split('');
      for (let i = 0; i < numReplacements; i++) {
        const randomPos = Math.floor(Math.random() * str.length),
          randomChar = '01234567890'.charAt(Math.floor(11 * Math.random()));
        result[randomPos].includes([' ', '/', '?', ',', '.']) || (result[randomPos] = randomChar);
      }
      return result.join('');
    }
    self.element && (self.element.onMountedHook = (_) => self.onMounted?.());
    self.initClass(FragUIHelper, {
      addTo: 'GLUI.Stage',
      _type: 'UI',
      refName: 'ui',
      children: [
        {
          width: 1e3,
          height: 700,
          bg: 'assets/images/ui/globe.png',
          _type: 'glObject',
          refName: 'globe',
          children: [],
        },
        {
          width: 80,
          height: 80,
          bg: 'assets/images/ui/arrow.png',
          _type: 'glObject',
          refName: 'arrow1',
          children: [],
        },
        {
          width: 80,
          height: 80,
          bg: 'assets/images/ui/arrow.png',
          _type: 'glObject',
          refName: 'arrow2',
          children: [],
        },
        {
          width: 16,
          height: 16,
          bg: 'assets/images/ui/star.png',
          _type: 'glObject',
          refName: 'star1',
          children: [],
        },
        {
          width: 16,
          height: 16,
          bg: 'assets/images/ui/star.png',
          _type: 'glObject',
          refName: 'star2',
          children: [],
        },
        {
          font: 'NBArchitektStd-Light',
          fontSize: 14,
          align: 'center',
          letterSpacing: 0.1,
          fontColor: '#ffffff',
          _type: 'glText',
          _innerText: 'CONTACT US',
          refName: 'contact',
          children: [],
        },
        {
          font: 'NBArchitektStd-Light',
          fontSize: 110,
          align: 'center',
          letterSpacing: 0.1,
          fontColor: '#ffffff',
          _type: 'glText',
          _innerText: 'LAX',
          refName: 'lax',
          children: [],
        },
        {
          font: 'NBArchitektStd-Light',
          fontSize: 110,
          align: 'center',
          letterSpacing: 0.1,
          fontColor: '#ffffff',
          _type: 'glText',
          _innerText: 'SYD',
          refName: 'nyc',
          children: [],
        },
        {
          font: 'NBArchitektStd-Light',
          fontSize: 110,
          align: 'center',
          letterSpacing: 0.1,
          fontColor: '#ffffff',
          _type: 'glText',
          _innerText: 'AMS',
          refName: 'ams',
          children: [],
        },
        {
          font: 'NBArchitektStd-Bold',
          fontSize: 11,
          align: 'left',
          letterSpacing: 0.1,
          fontColor: '#ffffff',
          _type: 'glText',
          _innerText: 'Privacy Notice',
          refName: 'privacy',
          children: [],
        },
        {
          font: 'NBArchitektStd-Bold',
          fontSize: 11,
          align: 'left',
          letterSpacing: 0.1,
          fontColor: '#ffffff',
          _type: 'glText',
          _innerText: 'Newsletter Signup',
          refName: 'subscribe',
          children: [],
        },
        {
          font: 'NBArchitektStd-Bold',
          fontSize: 15,
          align: 'center',
          letterSpacing: 0.1,
          fontColor: '#ffffff',
          _type: 'glText',
          _innerText: 'DEVELOPERKAREN96@GMAIL.COM',
          refName: 'email',
          children: [],
        },
        {
          font: 'NBArchitektStd-Bold',
          fontSize: 9,
          align: 'center',
          letterSpacing: 0.02,
          fontColor: '#ffffff',
          _type: 'glText',
          _innerText: '[ MOBILE SYNC ]',
          refName: 'sync',
          children: [],
        },
        {
          width: 34,
          height: 34,
          bg: 'assets/images/ui/tg.png',
          _type: 'glObject',
          refName: 'ig',
          children: [],
        },
        {
          width: 30,
          height: 30,
          bg: 'assets/images/ui/in.png',
          _type: 'glObject',
          refName: 'in',
          children: [],
        },
        {
          width: 30,
          height: 30,
          bg: 'assets/images/ui/tw.png',
          _type: 'glObject',
          refName: 'tw',
          children: [],
        },
        {
          width: 276,
          height: 2,
          bg: '#ffffff',
          _type: 'glObject',
          refName: 'line1',
          children: [],
        },
        {
          width: 189,
          height: 1,
          bg: '#ffffff',
          _type: 'glObject',
          refName: 'line2',
          children: [],
        },
        {
          width: 160,
          height: 1,
          bg: '#ffffff',
          _type: 'glObject',
          refName: 'line3',
          children: [],
        },
      ],
    });
    self.ref_MobileSync192 = self.initClass(MobileSync);
    self.ref_MobileSync192.isFragment &&
      _promises.push(self.wait(self.ref_MobileSync192, '__ready'));
    self.params = _params;
    self.args = arguments;
    self.parent?.layers && (self.layers = self.parent.layers);
    self.layout?.getAllLayers && (self.layers = await self.layout.getAllLayers());
    self.qrcode = self.get('MobileSync/qrcode', true);
    self.qrcode &&
      self.qrcode.glui &&
      ((self.qrcode.glui.shader.blending = Shader.ADDITIVE_BLENDING),
      self.ui.add(self.qrcode.glui));
    self.onInit = async function () {
      await self.initSync(self.ui.group);
      await self.initSync(self.ui);
      self.set('ready', true);
    };
    self.ui.alpha = 0;
    self.ui.hide();
    self.privacy.line = self.line2;
    self.subscribe.line = self.line3;
    self.email.line = self.line1;
    self.arrow1.alpha = Device.mobile && Stage.height > Stage.width ? 0 : 1;
    self.arrow2.alpha = Device.mobile && Stage.height > Stage.width ? 0 : 1;
    GLA11y.registerPage(self.ui.group, 'ContactPage');
    GLA11y.textNode(self.contact.group, 'Get in touch');
    GLA11y.textNode(self.lax.group, 'Yerevan');
    GLA11y.textNode(self.nyc.group, 'Armenia');
    GLA11y.textNode(self.ams.group, 'Remote');
    GLA11y.textNode(self.email.group, 'Email me at developerkaren96@gmail.com');
    GLA11y.objectNode(self.email, self.ui.group);
    GLA11y.objectNode(self.in, self.ui.group);
    GLA11y.objectNode(self.ig, self.ui.group);
    self.email.interact(hover, (_) => window.open('mailto:developerkaren96@gmail.com'), '#');
    self.ig.interact(
      hover,
      (_) => window.open('https://t.me/developerkaren', '_blank'),
      '#',
      'Telegram',
    );
    self.in.interact(
      hover,
      (_) => window.open('https://www.linkedin.com/in/developerkarensimonyan/', '_blank'),
      '#',
      'LinkedIn',
    );
    // Hidden contact slots (Privacy Notice, Newsletter, Twitter/X, Mobile Sync QR removed).
    self.privacy.alpha = 0;
    self.privacy.visible = false;
    self.subscribe.alpha = 0;
    self.subscribe.visible = false;
    self.tw.alpha = 0;
    self.tw.visible = false;
    self.sync.alpha = 0;
    self.sync.visible = false;
    self.line2.alpha = 0;
    self.line3.alpha = 0;
    if (self.qrcode && self.qrcode.glui) {
      self.qrcode.glui.alpha = 0;
      self.qrcode.glui.visible = false;
    }
    self.bind('ViewController/contact', (active) => {
      updateLayout();
      active
        ? (self.ui.show(),
          (self.ui.shader.blending = Shader.ADDITIVE_BLENDING),
          self.ui.tween(
            {
              alpha: 1,
            },
            2e3,
            'easeInOutSine',
          ))
        : self.ui
            .tween(
              {
                alpha: 0,
              },
              1e3,
              'easeOutSine',
            )
            .onComplete((_) => self.ui.hide());
    });
    self.onResize(updateLayout);
    self.startRender((_) => {
      let glitch = Math.smoothStep(0.7, 0.1, self.ui.alpha);
      self.nyc.setText(replaceRandomLetters('ARM', 1 * glitch));
      self.lax.setText(replaceRandomLetters('EVN', 1 * glitch));
      self.ams.setText(replaceRandomLetters('REM', 1 * glitch));
      self.email.setText(replaceRandomLetters('DEVELOPERKAREN96@GMAIL.COM', 10 * glitch));
      self.contact.setText(replaceRandomLetters('CONTACT US', 10 * glitch));
    }, 12);
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

/*
 * WorkDetailContent — Frag3D holding the title / date /
 * body 3D text, the project trailer video plane, and a
 * fullscreen play button.
 *
 * Modal: a DOM <video controls> overlay is built lazily
 * (Stage.create('VideoModal') @ z-index 2, becomes 9999
 * when shown). Close button SVG; route change away from
 * 'work/' or close button click pauses + hides modal.
 *
 * GLA11y.textNode hooks on title + date keep the
 * screen-reader text in sync with the rendered 3D glyphs.
 *
 * updateText handler (bound to Work/project data flow):
 *   - swaps title + date text instantly.
 *   - second call onwards fades body via .text.alpha
 *     tween (0→1, 2s easeInOutSine, 1.5s delay).
 *   - mobile picks project color (Stage.width<768 uses
 *     '#'+data.color, otherwise white). HSL nudged
 *     slightly per chat line for contrast.
 *   - emits ChatDOM/updateText sequence (title @ 0ms,
 *     date @ 300ms, body @ 600ms, then optional Medium
 *     case-study link @ 800ms, project link @ 900ms),
 *     plus a '<- Close' filter @ 1400ms.
 *   - readyForResponse fired unless data.ai (ai-generated
 *     project skips the canned chat).
 *
 * Resize: on small viewports (<500px) title scales 0.5,
 * video scales by mapped 0.45..1 and shifts y up.
 *
 * Interaction3D.find(WorkDetail/camera).add wires the
 * 'button' layer hover/click to onFullscreenHover (scale
 * 0.5↔0.55 tween) and onFullscreenClick (open modal +
 * play()).
 *
 * Standard Fragment plumbing.
 */
Class(function WorkDetailContent(_params, ...restArgs) {
  const self = this;
  Inherit(self, Frag3D, 'WorkDetailContent');
  Inherit(self, XComponent);
  self.fragName = 'WorkDetailContent';
  self.contexts = 'Frag3D, "WorkDetailContent"';
  self.params = _params;
  self.args = arguments;
  this.isFragment = true;
  var _promises = [];
  !(async function () {
    self.element && (self.element.onMountedHook = (_) => self.onMounted?.());
    self.params = _params;
    self.args = arguments;
    self.parent?.layers && (self.layers = self.parent.layers);
    self.layout?.getAllLayers && (self.layers = await self.layout.getAllLayers());
    MouseFluid.instance().applyTo(self.layers.video.shader);
    let video = await self.get('Work/video');
    self.layers.video.shader.set('tMap', video);
    self.modal ||
      (function createModal() {
        if (self.modal) return;
        self.modal = Stage.create('VideoModal');
        self.modal.css({
          display: 'none',
        });
        self.modal.goob(
          '\n        position: absolute;\n        align-items: center;\n        justify-content: center;\n        display: flex;\n\n        top: 0;\n        left: 0;\n        width: 100%;\n        height: 100%;\n        z-index: 2;\n        padding: 25px;\n\n        background-color: #000000cc;\n    ',
        );
        self.video = document.createElement('video');
        self.video.src = Assets.getPath('assets/video/reel.mp4');
        self.video.controls = true;
        self.video.style.width = '100%';
        self.video.style.height = 'auto';
        self.closeButton = self.modal.create('closeButton');
        self.closeButton.interact(null, (_) => closeModal(), '#', 'Close Video', {
          role: 'button',
        });
        self.closeButton.goob(
          `\n        position: absolute !important;\n        top: 22px;\n        right: 22px;\n        z-index: 3;\n\n        width: 18px;\n        height: 18px;\n\n        border: none;\n        background: transparent url(${Assets.getPath('assets/images/ui/close.svg')});\n        background-size: cover;\n        background-position: center;\n        background-repeat: no-repeat;\n\n        @media (hover:hover) {\n            &:hover {\n                transition: 0.1s all ease;\n                transform: scale(1.1);\n            }\n        }\n    `,
        );
        self.modal.div.appendChild(self.video);
        Stage.add(self.modal);
      })();
    self.onFullscreenHover = (e) => {
      tween(
        e.mesh.scale,
        'over' == e.action
          ? {
              x: 0.55,
              y: 0.55,
            }
          : {
              x: 0.5,
              y: 0.5,
            },
        300,
        'easeOutCubic',
      );
    };
    self.onFullscreenClick = (_) => {
      self.modal.css({
        display: 'flex',
        zIndex: '9999',
      });
      self.video.play();
    };
    let camera = await self.get('WorkDetail/camera');
    Interaction3D.find(camera).add(
      self.layers.button,
      self.onFullscreenHover,
      self.onFullscreenClick,
      {
        url: '#',
        label: 'Open fullscreen video',
      },
    );
    self.bind('Router/state', (val) => {
      val.includes('work/') || closeModal();
    });
    const getText = (text3d) => text3d.text.text.string;
    GLA11y.textNode(self.layers.title.group, getText(self.layers.title));
    GLA11y.textNode(self.layers.date.group, getText(self.layers.date));
    let count = 0;
    function closeModal() {
      self.video.pause();
      self.video.currentTime = 0;
      self.modal.css({
        display: 'none',
      });
    }
    self.bind(
      'updateText',
      ({
        title: title,
        date: date,
        body: body,
        tags: tags,
        caseStudyURL: caseStudyURL,
        projectURL: projectURL,
        ai: ai,
        color: color,
      }) => {
        self.layers.title.setText(title);
        self.layers.date.setText(date);
        count++;
        count > 1 && (self.layers.body.visible = false);
        self.layers.body.text.alpha = 0;
        self.layers.body.text.tween(
          {
            alpha: 1,
          },
          2e3,
          'easeInOutSine',
          1500,
        );
        let text = date.replace(/\n/g, ' / ');
        text = text.split(',')[0];
        let col = new Color(Stage.width < 768 ? '#' + color : '#ffffff'),
          hsl = col.getHSL();
        tags.split(', ')[0];
        self.fire('ChatDOM/clearText');
        col.setHSL(hsl.h, hsl.s, 0.6 + 0.3 * hsl.l);
        self.set('ChatDOM/updateText', {
          text: `${title}`,
          color: col.getHexString(),
          animated: true,
        });
        col.setHSL(hsl.h, hsl.s, 0.45 + 0.3 * hsl.l);
        self.set('ChatDOM/updateText', {
          text: `${text}`,
          color: col.getHexString(),
          animated: true,
          delay: 300,
        });
        col.setHSL(hsl.h, hsl.s, 0.6 + 0.3 * hsl.l);
        self.set('ChatDOM/updateText', {
          text: body,
          color: col.getHexString(),
          animated: true,
          delay: 600,
        });
        caseStudyURL &&
          self.set('ChatDOM/updateLink', {
            title: 'Medium Case Study',
            href: caseStudyURL,
            animated: true,
            delay: 800,
          });
        projectURL &&
          self.set('ChatDOM/updateLink', {
            title: 'Project Link',
            href: projectURL,
            animated: true,
            delay: 900,
          });
        self.set('ChatDOM/updateFilter', {
          title: '<- Close',
          tag: null,
          animated: true,
          delay: 1400,
        });
        GLA11y.textNode(self.layers.title.group, title);
        GLA11y.textNode(self.layers.date.group, date);
        ai || self.fire('CMSData/readyForResponse');
      },
    );
    self.layers.title.originTransform = Utils3D.cloneTransform(self.layers.title);
    self.layers.date.originTransform = Utils3D.cloneTransform(self.layers.date);
    self.layers.video.originTransform = Utils3D.cloneTransform(self.layers.video);
    self.onResize((_) => {
      if (Stage.width < 500) {
        self.layers.title.group.scale.set(0.5, 0.5, 1);
        let vscale = Math.map(Stage.width, 350, 800, 0.45, 1, true);
        self.layers.video.scale.copy(self.layers.video.originTransform.scale);
        self.layers.video.scale.x *= vscale;
        self.layers.video.scale.y *= vscale;
        self.layers.video.position.y = 0.5;
        self.layers.title.group.position.set(0, 0.05, 2);
        self.layers.date.group.position.set(1, 1.2, 1.5);
      } else {
        self.layers.title.group.scale.copy(self.layers.title.originTransform.scale);
        self.layers.video.scale.copy(self.layers.video.originTransform.scale);
        self.layers.title.group.position.copy(self.layers.title.originTransform.position);
        self.layers.date.group.position.copy(self.layers.date.originTransform.position);
      }
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

/*
 * MusicPlayerDOM — top-right DOM music widget (prev / ticker
 * / next). Owns the in-app background music playlist of 8
 * tracks under `assets/music/*.mp3`, shuffled at init.
 *
 * Registers all 8 sounds with SFXController (the wrapper
 * around GlobalAudio3D), then on GlobalAudio3D READY:
 *   - Binds AppState 'songIndex': fade ticker out, swap
 *     text on both ticker items (duplicated for the CSS
 *     marquee animation), fade in at 0.5 opacity, stop all
 *     other tracks and play the selected one.
 *   - Reads Storage.get('muted') for persisted mute state.
 *   - Volume ramp 0 → 0.15 over 2s easeInOutSine.
 *   - songIndex initialised to a random track.
 *
 * Ready-gating: shows only once `readyToShow` AppState
 * counter == 2 (incremented by both audio-ready and
 * Global/loadFinished). Then slides wrapper down y=-100→0
 * and fades to 0.8 opacity (or 0 if muted) in 2s with
 * 1.5s delay.
 *
 * Audio toggle: Global/audioEnabled tween volume 0↔0.15 and
 * fires SFXController.TOGGLE_AUDIO; wrapper visibility
 * follows (opaque only when enabled).
 *
 * Auto-advance: every 5th render frame, if no active sounds
 * are playing → goNext().
 *
 * Work/project (a project opened) fires Events.MESSAGE
 * { isMuffled: true } → engine ducks audio.
 *
 * CSS injected via goob: frosted-glass pill, CSS marquee
 * keyframes for `.ticker` text, mix-blend-mode plus-lighter.
 *
 * Standard Fragment plumbing.
 */
Class(function MusicPlayerDOM(_params, ...restArgs) {
  const self = this;
  Inherit(self, Element);
  Inherit(self, XComponent);
  self.fragName = 'MusicPlayerDOM';
  self.contexts = 'Element';
  self.params = _params;
  self.args = arguments;
  this.isFragment = true;
  var _promises = [];
  !(async function () {
    self.element && (self.element.onMountedHook = (_) => self.onMounted?.());
    self.initClass(FragUIHelper, {
      addTo: 'Stage',
      _type: 'UI',
      refName: 'unnamed',
      children: [
        {
          _type: 'div',
          refName: 'wrapper',
          children: [
            {
              'aria-label': 'Previous Song',
              click: '$goPrev',
              _type: 'button',
              refName: 'arrowL',
              children: [
                {
                  _type: 'p',
                  _innerText: '<<',
                  refName: 'textL',
                  children: [],
                },
              ],
            },
            {
              _type: 'div',
              refName: 'ticker',
              children: [
                {
                  _type: 'div',
                  _innerText: 'Song--Artist',
                  refName: 'tickerItem0',
                  children: [],
                },
                {
                  _type: 'div',
                  _innerText: 'Song--Artist',
                  refName: 'tickerItem1',
                  children: [],
                },
              ],
            },
            {
              'aria-label': 'Next Song',
              click: '$goNext',
              _type: 'button',
              refName: 'arrowR',
              children: [
                {
                  _type: 'p',
                  _innerText: '>>',
                  refName: 'textR',
                  children: [],
                },
              ],
            },
          ],
        },
      ],
    });
    self.params = _params;
    self.args = arguments;
    self.parent?.layers && (self.layers = self.parent.layers);
    self.layout?.getAllLayers && (self.layers = await self.layout.getAllLayers());
    GlobalAudio3D.setup();
    self.sfx = SFXController.instance();
    let SONGS = [
      {
        title: 'Sergey Azbel - Themis',
        src: 'assets/music/Sergey Azbel - Themis.mp3',
      },
      {
        title: 'nuer self - Dusk',
        src: 'assets/music/nuer self - Dusk.mp3',
      },
      {
        title: 'Flint - Fly up High',
        src: 'assets/music/Flint - Fly up High.mp3',
      },
      {
        title: 'Hotham - To the Stars',
        src: 'assets/music/Hotham - To the Stars.mp3',
      },
      {
        title: 'Jozeque - Sultans of Streams',
        src: 'assets/music/Jozeque - Sultans of Streams.mp3',
      },
      {
        title: 'Downtown Binary - Other Worlds',
        src: 'assets/music/Downtown Binary - Other Worlds.mp3',
      },
      {
        title: 'Magiksolo - Quantum World',
        src: 'assets/music/Magiksolo - Quantum World.mp3',
      },
      {
        title: 'BXRDVJA - Ghost Cities',
        src: 'assets/music/BXRDVJA - Ghost Cities.mp3',
      },
    ];
    SONGS = SONGS.shuffle();
    self.goPrev = (_) =>
      self.set('songIndex', (self.get('songIndex') - 1 + SONGS.length) % SONGS.length);
    self.goNext = (_) => self.set('songIndex', (self.get('songIndex') + 1) % SONGS.length);
    (function setup() {
      SONGS.forEach((song) => self.sfx.registerSound(song.title, Assets.getPath(song.src)));
    })();
    self.set('readyToShow', 0);
    self.listen(GlobalAudio3D, Events.READY, () => {
      self.bind('songIndex', (index) => {
        self.ticker
          .tween(
            {
              opacity: 0,
            },
            100,
            'easeInSine',
          )
          .onComplete((_) => {
            self.tickerItem0.text(index + 1 + '. ' + SONGS[index].title);
            self.tickerItem1.text(index + 1 + '. ' + SONGS[index].title);
            self.ticker.tween(
              {
                opacity: 0.5,
              },
              1e3,
              'easeOutSine',
              200,
            );
          });
        SONGS.forEach((song) => self.sfx.stop(song.title));
        self.sfx.play(SONGS[index].title);
      });
      Storage.get('muted') ? (self.sfx.muted = true) : (self.sfx.muted = false);
      GlobalAudio3D.volume = 0;
      tween(
        GlobalAudio3D,
        {
          volume: 0.15,
        },
        2e3,
        'easeInOutSine',
      );
      self.set('Global/audioEnabled', self.sfx.muted ? 0 : 1);
      GlobalAudio3D.muted = self.sfx.muted;
      self.set('readyToShow', self.get('readyToShow') + 1);
    });
    self.set('songIndex', Math.random(0, SONGS.length - 1));
    self.bind('Global/audioEnabled', (enabled) => {
      self.visible &&
        (Storage.set('muted', !enabled),
        tween(
          GlobalAudio3D,
          {
            volume: enabled ? 0.15 : 0,
          },
          500,
          'easeOutSine',
        ),
        2 !== enabled && self.events.fire(SFXController.TOGGLE_AUDIO),
        self.wrapper.tween(
          {
            opacity: enabled ? 0.8 : 0,
          },
          500,
          'easeOutSine',
        ));
    });
    self.wrapper.div.style.opacity = 0;
    self.listen('Global/loadFinished', (_) => self.set('readyToShow', self.get('readyToShow') + 1));
    self.bind('readyToShow', (ready) => {
      2 === ready &&
        ((self.visible = true),
        self.wrapper
          .css({
            opacity: 0,
          })
          .transform({
            y: -100,
          }),
        self.wrapper.tween(
          {
            opacity: self.sfx.muted ? 0 : 0.8,
            y: 0,
          },
          2e3,
          'easeOutCubic',
          1500,
        ));
    });
    self.bind('Work/project', (data, prevData) => {
      data
        ? GlobalAudio3D.events.fire(Events.MESSAGE, {
            isMuffled: true,
          })
        : prevData &&
          GlobalAudio3D.events.fire(Events.MESSAGE, {
            isMuffled: false,
          });
    });
    self.startRender((_) => {
      for (const title in self.sfx.activeSounds) if (self.sfx.activeSounds[title].length) return;
      self.goNext();
    }, 5);
    self.element.goob(
      '\n    .wrapper {\n        display: flex;\n        flex-direction: row;\n        justify-content: space-between;\n        align-items: center;\n        mix-blend-mode: plus-lighter;\n\n        position: fixed;\n        top: 70px;\n        right: 32px;\n        margin: 2.6rem 2.6rem;\n        @media (max-width: 768px) {\n            top: 55px;\n            margin: 2rem 2rem;\n        }\n        z-index: 3;\n        padding: 10px 4px;\n        pointer-events: none;\n        border: 1px solid rgba(255,255,255,0.1);\n        background-color: rgba(255,255,255,0.1);\n\n        width: 170px;\n        height: 42px;\n        background-color: transparent;\n        border-radius: 7px;\n        opacity: 0;\n\n        transition: all 0.4s ease-out;\n        &:hover {\n            opacity: 1;\n        }\n    }\n\n    button {\n        width: 36px;\n        height: 32px;\n        pointer-events: auto;\n        cursor: pointer;\n        background-color: rgba(255,255,255,0.1);\n        border-radius: 5px;\n        border: 1px solid rgba(255,255,255,0.6);\n        mix-blend-mode: color-dodge;\n\n        font-family: "nbarchitekt", monospace;\n        font-size: 14px;\n        font-weight: 700;\n        color: white;\n\n        display: flex;\n        align-items: center;\n        justify-content: center;\n        opacity: 0.3;\n        transition: all 0.4s ease-out;\n        &:hover {\n            opacity: 1;\n        }\n    }\n\n    @keyframes ticker {\n        0% {\n            -webkit-transform: translate3d(0, 0, 0);\n            transform: translate3d(0, 0, 0);\n            visibility: visible;\n        }\n      \n        100% {\n            -webkit-transform: translate3d(-100%, 0, 0);\n            transform: translate3d(-100%, 0, 0);\n        }\n    }\n    .ticker {\n        display: inline-block;\n        height: 30px;\n        line-height: 30px;\n        width: 80px;\n        overflow: hidden;\n        background-color: transparent;\n        white-space: nowrap;\n        opacity: 0.4;\n        box-sizing: content-box;\n        mix-blend-mode: color-dodge;\n\n        > * {\n            display: inline-block;\n            height: 30px;\n            margin: 0;\n\n            animation-iteration-count: infinite;\n            animation-timing-function: linear;\n            animation-name: ticker;\n            animation-duration: 9s;\n\n            padding: 0 0.8rem;\n            font-family: "nbarchitekt", monospace;\n            font-size: 10px;\n            font-weight: 400;\n            color: white;\n        }\n    }\n    \n',
    );
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

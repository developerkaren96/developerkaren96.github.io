/*
 * ChatDOM — DOM-based chat overlay Fragment (Element +
 * XComponent). Builds the chat UI as DOM (FragUIHelper tree)
 * and wires it to an InteractAI.Assistant for replies.
 *
 * DOM tree (via FragUIHelper):
 *   - .wrapper
 *       .messages         — scroll container for transcript.
 *       textarea.input    — single-row, 100-char limit, placeholder
 *                           "Ask me anything...". User input.
 *       .flashing         — animation hook (e.g. typing indicator).
 *
 * Assistant: `self.assistant = self.initClass(InteractAI.Assistant)`
 * — talks to the configured LLM backend. Awaited via the
 * `_promises` pattern.
 *
 * `replaceRandomLetters(str, n)` — scrambles `n` random non-
 * whitespace/punctuation positions in `str` with random digits;
 * used to drive the streaming-text "decoded" intro effect
 * (text gradually settles into the final reply by replacing
 * fewer characters each tick).
 *
 * Standard Fragment plumbing (params/args, layers inheritance,
 * `for (key in self)` promise unwrap, `__ready` flag) — see
 * 0388 for the canonical explanation of this pattern.
 *
 * The rest of the file wires the assistant's reply stream to
 * DOM updates (typing animation, character scramble decay,
 * message list management).
 */
Class(function ChatDOM(_params, ...restArgs) {
  const self = this;
  Inherit(self, Element);
  Inherit(self, XComponent);
  self.fragName = 'ChatDOM';
  self.contexts = 'Element';
  self.params = _params;
  self.args = arguments;
  this.isFragment = true;
  var _promises = [];
  !(async function () {
    function replaceRandomLetters(str, numReplacements) {
      if (str.length < 2) return str;
      let result = str.split('');
      for (let i = 0; i < numReplacements; i++) {
        const randomPos = Math.floor(Math.random() * str.length),
          randomChar = '0123456789'.charAt(Math.floor(10 * Math.random()));
        result[randomPos].includes([' ', '/', '?', ',', '.', '\n']) ||
          (result[randomPos] = randomChar);
      }
      return result.join('');
    }
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
              _type: 'div',
              refName: 'messages',
              children: [],
            },
            {
              maxLength: 100,
              rows: 1,
              placeholder: '',
              _type: 'textarea',
              refName: 'input',
              children: [],
            },
            {
              _type: 'div',
              refName: 'flashing',
              children: [],
            },
          ],
        },
      ],
    });
    self.assistant = self.initClass(InteractAI.Assistant);
    self.assistant.isFragment && _promises.push(self.wait(self.assistant, '__ready'));
    self.params = _params;
    self.args = arguments;
    self.parent?.layers && (self.layers = self.parent.layers);
    self.layout?.getAllLayers && (self.layers = await self.layout.getAllLayers());
    self.wrapper.css({
      opacity: 0,
    });
    self.wrapper.hide();
    self.flashing.css({
      opacity: 0,
    });
    self.wrapper.progress = 0;
    self.input.div.style.display = 'none';
    self.input.div.disabled = true;
    self.set('showDisclaimer', false);
    self.set('isFocused', false);
    self.set('lastClick', 0);
    self.input.bind('focus', (_) => {
      self.set('isFocused', true);
      self.set('showDisclaimer', true);
    });
    self.input.bind('blur', (_) => self.set('isFocused', false));
    self.input.bind('input', (_) => {
      let text = self.input.val();
      self.input.classList().toggle('extended', !!text);
    });
    self.input.bind('keydown', async (e) => {
      if ((self.input.val(self.input.val().replace(/\n/g, ' ')), 13 === e.which && !e.shiftKey)) {
        if ((e.preventDefault(), !e.repeat)) {
          if (self.get('InteractAIAssistant/isThinking')) return;
          let formText = self.input.val();
          if ((self.input.val(''), self.input.classList().toggle('extended', false), formText)) {
            let blinker = await self.addMessage(formText, '#00ffff');
            blinker.classList.add('blink');
            e.preventDefault();
            self.input.progress = 1;
            self.flashing.progress = 0;
            tween(
              self.input,
              {
                progress: 0,
              },
              400,
              'easeOutSine',
            )
              .onUpdate((_) => {
                self.input.css({
                  opacity: self.input.progress,
                });
              })
              .onComplete((_) => (self.input.div.disabled = true));
            tween(
              self.flashing,
              {
                progress: 1,
              },
              600,
              'easeOutSine',
              800,
            ).onUpdate((_) => {
              self.flashing.css({
                opacity: self.flashing.progress,
              });
            });
            let response = await self.assistant.once(formText);
            response.length > 400 && (response = response.substring(0, 400) + '...');
            self.addMessage(response, '#ffffff', true);
            blinker.classList.remove('blink');
            self.input.div.disabled = false;
            self.input.progress = 0;
            tween(
              self.input,
              {
                progress: 1,
              },
              400,
              'easeInSine',
            ).onUpdate((_) => {
              self.input.css({
                opacity: self.input.progress,
              });
              self.flashing.css({
                opacity: 1 - self.input.progress,
              });
            });
          }
        }
        e.preventDefault();
      }
    });
    self.onInit = function () {};
    self.addMessage = async (str, color, animated = false, delay = 0) => {
      let elem = document.createElement('p'),
        text = document.createTextNode(str);
      if (
        (elem.appendChild(text),
        color && (elem.style.color = color),
        self.messages.div.prepend(elem),
        animated)
      ) {
        text.textContent = '';
        await self.wait(delay);
        text.progress = 0.95;
        let duration = Math.clamp(2 * str.length + 50, 500, 1500),
          setNodeText = (_) => {
            let substr = str.slice(0, str.length * (1 - text.progress));
            text.textContent =
              substr.slice(0, substr.length * text.progress * text.progress) +
              replaceRandomLetters(
                substr.slice(substr.length * text.progress * text.progress),
                substr.length * text.progress * 0.5,
              );
          };
        self.startRender(setNodeText, 15);
        tween(
          text,
          {
            progress: 0,
          },
          duration,
          'linear',
        ).onComplete((_) => {
          self.stopRender(setNodeText);
          text.textContent = str;
        });
      }
      return elem;
    };
    self.addLink = async (title, href, animated = false, delay = 0) => {
      let link = document.createElement('a');
      if (
        ((link.text = title),
        link.setAttribute('title', title),
        link.setAttribute('href', href),
        link.setAttribute('target', '_blank'),
        self.messages.div.prepend(link),
        animated)
      ) {
        link.textContent = '';
        await self.wait(delay);
        link.progress = 0.95;
        let setNodeText = (_) => {
          let substr = title.slice(0, title.length * (1 - link.progress));
          link.textContent =
            substr.slice(0, substr.length * link.progress * link.progress) +
            replaceRandomLetters(
              substr.slice(substr.length * link.progress * link.progress),
              substr.length * link.progress * 0.5,
            );
        };
        self.startRender(setNodeText, 15);
        tween(
          link,
          {
            progress: 0,
          },
          600,
          'linear',
        ).onComplete((_) => {
          self.stopRender(setNodeText);
          link.textContent = title;
        });
      }
      return link;
    };
    self.addFilter = async (title, tag, animated = false, delay = 0) => {
      let link = document.createElement('a');
      if (
        ((link.text = title),
        link.setAttribute('title', title),
        tag && link.classList.add('home'),
        (link.onclick = async (_) => {
          self.get('disableFiltering', true) ||
            (self.set('disableFiltering', true),
            self.delayedCall(() => {
              self.set('disableFiltering', false);
            }, 1e3),
            self.fire('clickFilter'),
            tag && defer((_) => link.classList.add('active')),
            (self.active = link.text),
            self.set('Work/project', null),
            self.set('lastClick', Date.now()),
            tag && (await defer(), CMSData.filter(tag.toLowerCase())));
        }),
        self.messages.div.prepend(link),
        self.listen('clickFilter', (_) => link.classList.remove('active')),
        animated)
      ) {
        link.textContent = '';
        await self.wait(delay);
        link.progress = 0.95;
        let setNodeText = (_) => {
          let substr = title.slice(0, title.length * (1 - link.progress));
          link.textContent =
            substr.slice(0, substr.length * link.progress * link.progress) +
            replaceRandomLetters(
              substr.slice(substr.length * link.progress * link.progress),
              substr.length * link.progress * 0.5,
            );
        };
        self.startRender(setNodeText, 15);
        tween(
          link,
          {
            progress: 0,
          },
          600,
          'linear',
        ).onComplete((_) => {
          self.stopRender(setNodeText);
          link.textContent = title;
        });
      }
      return (
        defer((_) => {
          self.active && title == self.active && tag && link.classList.add('active');
        }),
        link
      );
    };
    self.bind('updateText', ({ text: text, color = '#ffffff', animated = false, delay = 0 }) =>
      self.addMessage(text, color, animated, delay),
    );
    self.bind('updateLink', ({ title: title, href: href, animated = false, delay = 0 }) =>
      self.addLink(title, href, animated, delay),
    );
    self.bind('updateFilter', ({ title: title, tag: tag, animated = false, delay = 0 }) =>
      self.addFilter(title, tag, animated, delay),
    );
    self.listen('clearText', (_) => self.clearChat());
    self.listen('resetOptions', (_) => self.onInit());
    self.bind('showDisclaimer', (show) => {
      if (!show) return;
      let disclaimer = 'Sessions may be recorded. By using chat, you acknowledge our ',
        elem = document.createElement('p'),
        text = document.createTextNode(disclaimer);
      elem.appendChild(text);
      elem.style.color = '#cccccc';
      self.messages.div.prepend(elem);
      let link = document.createElement('a');
      link.text = 'Privacy Policy.';
      link.setAttribute('title', 'Privacy Policy.');
      link.setAttribute(
        'href',
        'https://github.com/developerkaren96',
      );
      link.setAttribute('target', '_blank');
      link.style.marginLeft = '0';
      elem.appendChild(link);
      text.textContent = '';
      text.progress = 0.95;
      let duration = Math.clamp(172, 500, 1500),
        setNodeText = (_) => {
          let substr = disclaimer.slice(0, 61 * (1 - text.progress));
          text.textContent =
            substr.slice(0, substr.length * text.progress * text.progress) +
            replaceRandomLetters(
              substr.slice(substr.length * text.progress * text.progress),
              substr.length * text.progress * 0.5,
            );
        };
      self.startRender(setNodeText, 15);
      tween(
        text,
        {
          progress: 0,
        },
        duration,
        'linear',
      ).onComplete((_) => {
        self.stopRender(setNodeText);
        text.textContent = disclaimer;
      });
    });
    self.listen('Global/loadFinished', (_) => {
      self.wrapper.tween(
        {
          opacity: 1,
        },
        2e3,
        'easeInOutSine',
        3300,
      );
      let showingContact = false,
        routeIsNotWork = true;
      const checkVisibility = (_) => {
        showingContact || routeIsNotWork ? self.hideChat() : self.showChat();
      };
      self.bind('ViewController/contact', (active) => {
        showingContact = !!active;
        checkVisibility();
      });
      self.bind('Work/scrollProgress', (val) => {
        let prev = routeIsNotWork,
          min = Device.mobile.phone ? 0.1 : 0.05,
          max = Device.mobile.phone ? 0.88 : 0.95;
        routeIsNotWork = !(val > min && val < max);
        prev != routeIsNotWork && checkVisibility();
      });
    });
    self.hideChat = async (_) => {
      if (self.hidden) return;
      self.wrapper.tween(
        {
          opacity: 0,
        },
        200,
        'easeInSine',
      );
      let uniforms = await self.get('ViewController/uniforms');
      tween(
        self.wrapper,
        {
          progress: 0,
        },
        3e3,
        'easeInOutSine',
      )
        .onUpdate((_) => {
          uniforms.uChatOpen.value = self.wrapper.progress;
        })
        .onComplete((_) => self.wrapper.hide());
    };
    self.showChat = async (_) => {
      self.wrapper.show();
      self.wrapper
        .css({
          opacity: 0,
        })
        .tween(
          {
            opacity: 1,
          },
          1e3,
          'easeOutSine',
        );
      let uniforms = await self.get('ViewController/uniforms');
      tween(
        self.wrapper,
        {
          progress: 1,
        },
        1e3,
        'easeOutSine',
      ).onUpdate((_) => {
        uniforms.uChatOpen.value = self.wrapper.progress;
      });
    };
    self.clearChat = (_) => {
      for (; self.messages.div.firstChild; )
        self.messages.div.removeChild(self.messages.div.firstChild);
    };
    self.element.goob(
      '\n    .wrapper {\n        display: flex;\n        flex-direction: column;\n        justify-content: flex-end;\n        padding: 3rem 3rem;\n        mix-blend-mode: color-dodge;\n\n        @media (max-width: 768px) {\n            padding: 2rem 2rem;\n            mix-blend-mode: normal;\n        }\n\n        pointer-events: none;\n        \n        position: fixed;\n        bottom: 0;\n        left: 0;\n        z-index: 3;\n\n        width: min(450px, 100%);\n        height: calc(100% - 100px);\n        background-color: transparent;\n    }\n\n    .messages {\n        display: flex;\n        flex-direction: column-reverse;\n        justify-content: flex-start;\n        overflow: hidden;\n\n        margin-bottom: 1rem;\n        height: 100%;\n        -webkit-mask-image: linear-gradient(to top, white 0%, white 75%, transparent 90%);\n\n        p, a {\n            font-family: "nbarchitekt", monospace;\n            font-size: 14px;\n            font-weight: 400;\n            line-height: 1.5;\n            margin: 6px 0;\n            margin-left: 10px;\n            white-space: pre-wrap;\n\n            @media (max-width: 768px) {\n                font-size: 13px;\n                margin: 4px 0;\n            }\n\n            @keyframes cursor-blink {\n                0% { background: transparent; }\n                25% { background: transparent; }\n                50% { background: #00ffff; }\n                75% { background: #00ffff; }\n                100% { background: transparent; }\n            }\n\n            &.blink::after {\n                content: "";\n                position: absolute;\n                width: 8px;\n                height: 12px;\n                margin-top: 4px;\n                margin-left: 10px;\n    \n                border: none;\n                background-color: #00ffff;\n                display: inline-block;\n                animation: cursor-blink 1.5s infinite;\n            }\n        }\n\n    }\n\n\n    a {\n        color: #c6c6c6;\n        pointer-events: auto;\n        cursor: pointer;\n\n        font-weight: 700;\n        width: fit-content;\n        transition: all 0.4s cubic-bezier(.17,.4,.02,.99);\n        transform: translateX(0px);\n\n        @media (max-width: 768px) {\n            color: #eeeeee;\n            &.home {\n                color: #9ca5ff;\n            }\n        }\n        \n\n        &.active {\n            color: #ffffff;\n            text-shadow: #ffffff 1px 0px 5px;\n            transform: translateX(10px);\n        }\n\n        @media (hover: hover) {\n            &:hover {\n                color: #ffffff;\n                font-weight: 400;\n            }\n        }\n    }\n\n    textarea {\n        background: rgba(0,0,0,0.2);\n        color: rgba(255,255,255,0.7);\n        font-family: "nbarchitekt", monospace;\n        font-weight: 400;\n        font-size: 14px;\n        outline: none;\n\n        border: 2px solid rgba(255,255,255,0.3);\n        border-radius: 50px;\n        padding: 14px 25px 4px;\n\n        transition: all 0.8s cubic-bezier(.17,.4,.02,.99);\n        width: 200px;\n        white-space: nowrap;\n        min-height: 40px;\n        resize: none;\n        pointer-events: auto;\n        overflow: hidden;\n\n        @media (max-width: 768px) {\n            font-size: 13px;\n        }\n\n        &:hover {\n            border: 2px solid rgba(255,255,255,0.5);\n        }\n\n        &:focus {\n            color: #eeeeee;\n            background: rgba(0,0,0,0.5);\n            border: 2px solid rgba(255,255,255,0.8);\n        }\n\n        &.extended {\n            background: rgba(0,0,0,0.5);\n            border: 2px solid rgba(255,255,255,0.9);\n            width: 330px;\n        }\n\n        &::placeholder, * {\n            color: rgba(255,255,255,0.4);\n        }\n    }\n\n    .flashing {\n        position: relative;\n        left: 37px;\n        bottom: 32px;\n\n        width: 12px;\n        height: 12px;\n        border-radius: 6px;\n        background-color: #00ffff;\n        color: #00ffff;\n        opacity: 0.3;\n        animation: dot-flashing 1.5s infinite linear alternate;\n        animation-delay: 0.75s;\n\n        &::before, &::after {\n            content: "";\n            display: inline-block;\n            position: absolute;\n            top: 0;\n            width: 12px;\n            height: 12px;\n            border-radius: 6px;\n            color: #00ffff;\n            opacity: 1;\n            background-color: #00ffff;\n            animation: dot-flashing 1.5s infinite alternate;\n        }\n\n        &::before {\n            left: -25px;\n            animation-delay: 0s;\n        }\n\n        &::after {\n            left: 25px;\n            animation-delay: 1.5s;\n        }\n    }\n\n    @keyframes dot-flashing {\n        0% { background-color: #00ffff; box-shadow: 0 1px 6px #00ffff; }\n        50%, 100% { background-color: rgba(200,255,255,0.2); }\n    }\n',
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

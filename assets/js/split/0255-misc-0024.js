/*
 * InteractAI.Assistant — client for the Active Theory hosted
 * assistant backend (OpenAI Assistants API proxy). Wraps the four
 * canonical endpoints under
 *   https://backend-dot-activetheory-v6.uc.r.appspot.com/api/assistant
 *
 *   - POST /createThread   → returns `{ id }`, stored in `_thread_id`.
 *   - POST /createMessage  → appends a user message to the thread.
 *   - POST /createRun      → kicks off the assistant on the thread.
 *   - (polling)            → waits for run completion, then reads
 *     the latest assistant message off the thread.
 *
 * Drive surface:
 *   - `sendMessage(message)` is gated by AppState key
 *     `InteractAIAssistant/isThinking` so the UI can grey out the
 *     input while a run is in flight. The flag is set before
 *     `createMessage` and cleared after the response is published.
 *   - If `_project` has been set, every outgoing user message is
 *     prefixed with `"I'm looking at ${project}. "` — gives the
 *     assistant scene/context without the UI needing to type it.
 *   - Thread creation is lazy: the first `createMessage` /
 *     `createRun` that finds `_thread_id` empty calls `getThread()`
 *     to create one.
 *
 * On run completion, the assistant's reply is published on
 * `InteractAI.GPT_RESPONSE` (declared in 0254) so any listener in
 * the app — typically the 3D scene driving lip-sync / TTS — picks
 * it up without coupling.
 *
 * `_slug` / `_project` are configurable per-deployment identifiers
 * that the backend may use for assistant-side routing or system
 * prompts.
 */
InteractAI.Class(function Assistant(_props) {
  Inherit(this, Component);
  const self = this,
    BACKEND_URL = 'https://backend-dot-activetheory-v6.uc.r.appspot.com/api/assistant';
  var _thread_id = '',
    _slug = '',
    _project = '';
  async function getThread() {
    await (async function createThread() {
      let response = await post(`${BACKEND_URL}/createThread`),
        { id: id } = await response;
      _thread_id = id;
    })();
  }
  async function sendMessage(message) {
    await self.wait((_) => !AppState.get('InteractAIAssistant/isThinking'));
    AppState.set('InteractAIAssistant/isThinking', true);
    _project && (message = `I'm looking at ${_project}. ` + message);
    await (async function createMessage(content) {
      _thread_id || (await getThread());
      let response = await post(
          `${BACKEND_URL}/createMessage`,
          {
            threadId: _thread_id,
            content: content,
          },
          {
            headers: {
              'Content-Type': 'application/json',
            },
          },
        ),
        { message: message } = await response;
      return message;
    })(message);
    await (async function createRun() {
      _thread_id || (await getThread());
      let response = await post(
          `${BACKEND_URL}/createRun`,
          {
            threadId: _thread_id,
          },
          {
            headers: {
              'Content-Type': 'application/json',
            },
          },
        ),
        { slug: slug } = await response;
      _slug = slug;
    })();
    let text = await (async function listMessage() {
      _thread_id || (await getThread());
      let response = await post(
          `${BACKEND_URL}/listMessage`,
          {
            threadId: _thread_id,
          },
          {
            headers: {
              'Content-Type': 'application/json',
            },
          },
        ),
        { text: text } = await response;
      return text;
    })();
    return (
      AppState.set('InteractAIAssistant/isThinking', false),
      _slug &&
        (AppState.set(
          'CMSData/slug',
          {
            slug: _slug,
            message: text,
          },
          true,
        ),
        (_slug = '')),
      text
    );
  }
  AppState.set('InteractAIAssistant/isThinking', false);
  (async function () {
    !(function addListeners() {
      AppState.bind('Work/project', (data) => {
        _project = data ? data.perma : '';
      });
    })();
  })();
  this.once = sendMessage;
  Dev.expose('sendMessage', sendMessage);
});
InteractAI.Class(function GPT(_props) {
  Inherit(this, Component);
  const self = this;
  var _messages = [];
  async function get() {
    AppState.set('InteractAIGPT/thinking', true);
    let req = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer sk-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: _messages,
          max_tokens: 100,
        }),
      }),
      json = await req.json();
    _messages.push(json.choices[json.choices.length - 1].message);
    _props.waitFor && !self.flag('first')
      ? (self.flag('first', true),
        self.bindState(AppState, _props.waitFor, (_) => {
          self.events.fire(InteractAI.GPT_RESPONSE, {
            content: json.choices[json.choices.length - 1].message.content,
          });
          AppState.set(
            'InteractAIGPT/response',
            json.choices[json.choices.length - 1].message.content,
          );
        }))
      : (self.events.fire(InteractAI.GPT_RESPONSE, {
          content: json.choices[json.choices.length - 1].message.content,
        }),
        AppState.set(
          'InteractAIGPT/response',
          json.choices[json.choices.length - 1].message.content,
        ));
  }
  function handleRecognition(transcript) {
    self.input(transcript);
  }
  !(async function () {
    AppState.bind('SpeechRecognition/ready', (_) => {
      _messages.push({
        role: 'system',
        content: _props.prompt,
      });
      get();
      (function addListeners() {
        self.bindState(AppState, 'InteractAIRecognition/transcript', handleRecognition);
      })();
    });
  })();
  this.input = function (content) {
    _messages.push({
      role: 'user',
      content: content,
    });
    get();
  };
  this.once = async function (message) {
    let messages = [
        {
          role: 'system',
          content: message,
        },
      ],
      req = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer sk-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: messages,
          max_tokens: 500,
        }),
      }),
      json = await req.json();
    return json.choices[json.choices.length - 1].message.content;
  };
});
InteractAI.Class(function Speech(_props) {
  Inherit(this, Component);
  const self = this;
  async function handleIncomingResponse(content) {
    await self.wait('touched');
    (async function speak(text) {
      let voice = _props.voice || 'XB0fDUnXU5powFXDhCwa',
        req = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${voice}?optimize_streaming_latency=${_props.latency}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'xi-api-key': 'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
            },
            body: JSON.stringify({
              text: text,
              model_id: 'eleven_monolingual_v1',
              voice_settings: {
                stability: 0,
                similarity_boost: 1,
                style: 0.2,
                use_speaker_boost: true,
              },
            }),
          },
        ),
        blob = await req.blob(),
        audioURL = URL.createObjectURL(blob),
        audio = new Audio(audioURL);
      AppState.set('InteractAISpeech/playing', true);
      AppState.set('InteractAIGPT/thinking', false);
      audio.play();
      audio.addEventListener('ended', (_) => {
        AppState.set('InteractAISpeech/playing', false);
      });
    })(content);
  }
  function start() {
    self.touched = true;
    self.events.unsub(Mouse.input, Interaction.START, start);
  }
  !(function addListeners() {
    self.bindState(AppState, 'InteractAIGPT/response', handleIncomingResponse);
    self.events.sub(Mouse.input, Interaction.START, start);
  })();
});
InteractAI.Class(function SpeechRecognition() {
  Inherit(this, Component);
  const self = this;
  var _recognition, _refresh;
  function initSR() {
    _recognition && _recognition.stop();
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    (_recognition = new SpeechRecognition()).onstart = onStart;
    _recognition.onresult = handleResult;
    _recognition.onerror = handleError;
    _recognition.continuous = true;
    _recognition.start();
    clearTimeout(_refresh);
    _refresh = self.delayedCall(initSR, 5e3);
  }
  async function handleAudioPlaying(playing) {
    1 == playing && self.flag('ignore', true);
    0 == playing &&
      self.delayedCall((_) => {
        self.flag('ignore', false);
      }, 1e3);
  }
  function onStart() {}
  function handleResult(e) {
    if (
      (clearTimeout(_refresh),
      (_refresh = self.delayedCall(initSR, 5e3)),
      AppState.get('InteractAIGPT/thinking'))
    )
      return;
    if (AppState.get('InteractAISpeech/playing')) return;
    let transcript = e.results[e.results.length - 1][0].transcript;
    AppState.set('InteractAIRecognition/transcript', transcript);
  }
  async function handleError(e) {}
  !(function () {
    if (
      (self.bindState(AppState, 'InteractAISpeech/playing', handleAudioPlaying),
      !('SpeechRecognition' in window) && !('webkitSpeechRecognition' in window))
    )
      return (async function initVosk() {
        const sampleRate = 16e3,
          mediaStream = await navigator.mediaDevices.getUserMedia({
            video: false,
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              channelCount: 1,
              sampleRate: sampleRate,
            },
          });
        await AssetLoader.loadAssets([
          'https://cdn.jsdelivr.net/npm/vosk-browser@0.0.5/dist/vosk.js',
        ]);
        const channel = new MessageChannel(),
          model = await Vosk.createModel(
            'https://storage.googleapis.com/active-theory.appspot.com/ai/vosk-model-small-en-us-0.15.tar.gz',
          );
        model.registerPort(channel.port1);
        const recognizer = new model.KaldiRecognizer(sampleRate);
        recognizer.setWords(true);
        recognizer.on('result', (message) => {
          if (AppState.get('InteractAIGPT/thinking')) return;
          if (AppState.get('InteractAISpeech/playing')) return;
          const result = message.result;
          result.text.length && AppState.set('InteractAIRecognition/transcript', result.text);
        });
        recognizer.on('partialresult', (message) => {
          message.result.partial;
        });
        const audioContext = new AudioContext();
        await audioContext.audioWorklet.addModule(
          'https://storage.googleapis.com/active-theory.appspot.com/ai/recognizer-processor.js',
        );
        const recognizerProcessor = new AudioWorkletNode(audioContext, 'recognizer-processor', {
          channelCount: 1,
          numberOfInputs: 1,
          numberOfOutputs: 1,
        });
        recognizerProcessor.port.postMessage(
          {
            action: 'init',
            recognizerId: recognizer.id,
          },
          [channel.port2],
        );
        recognizerProcessor.connect(audioContext.destination);
        audioContext.createMediaStreamSource(mediaStream).connect(recognizerProcessor);
        AppState.set('SpeechRecognition/ready', true);
      })();
    initSR();
    AppState.set('SpeechRecognition/ready', true);
  })();
  this.onDestroy = function () {
    _recognition.stop();
  };
});

/*
 * InteractAI — tiny static Model that holds the two global event
 * channel names used by the interactive-AI subsystem:
 *
 *   - `SPEECH_RECOGNITION` ('interactai_speech_recognition') — fired
 *     by the mic/STT pipeline when a transcript is ready.
 *   - `GPT_RESPONSE` ('interactai_gpt_response') — fired when the
 *     LLM round-trip returns a response payload.
 *
 * Declared as `'static'` so callers subscribe via the singleton:
 *   `Model.subscribe(InteractAI.GPT_RESPONSE, handler)`. No state
 * beyond the constant strings — the actual STT/LLM logic lives in
 * separate handlers that publish on these names.
 */
Class(function InteractAI() {
  Inherit(this, Model);
  this.SPEECH_RECOGNITION = 'interactai_speech_recognition';
  this.GPT_RESPONSE = 'interactai_gpt_response';
}, 'static');

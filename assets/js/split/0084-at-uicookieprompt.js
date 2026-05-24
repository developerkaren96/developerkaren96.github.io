/*
 * UICookiePrompt — DOM-side view counterpart to CookieNotice
 * (the model/decision layer). This static Element owns the rendered
 * banner DOM and just exposes animateIn / animateOut helpers; the
 * accept/decline logic lives in CookieNotice.
 *
 * The empty async IIFE is preserved from the original — likely a
 * placeholder for future init steps (DOM hydration on first show, font
 * preload, etc.) that never got filled in. Kept for shape compatibility
 * with sibling UI prompts that do real work there.
 *
 * `animateIn` — fade opacity to 1 over 300ms (easeInOutCubic).
 * `animateOut` — fade to 0 then hide(). easeOutCubic so the exit
 *   trails off rather than snapping at the end.
 */
Class(function UICookiePrompt() {
  Inherit(this, Element);
  const self = this;
  const $this = self.element;

  (async function init() {})();

  self.animateIn = () => {
    $this.tween({ opacity: 1 }, 300, 'easeInOutCubic');
  };

  self.animateOut = () => {
    $this.tween({ opacity: 0 }, 300, 'easeOutCubic', () => {
      $this.hide();
    });
  };
}, 'static');

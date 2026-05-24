/*
 * Keyboard — static event hub for keyboard input.
 *
 * Subscribes to window-level keydown / keyup / keypress and re-emits them
 * via the Events bus under the namespaced event names:
 *
 *   Keyboard.DOWN  = 'keyboard_down'
 *   Keyboard.UP    = 'keyboard_up'
 *   Keyboard.PRESS = 'keyboard_press'
 *
 * `pressing` is a snapshot of currently-held keys (`e.key` strings). The
 * keydown handler adds keys without duplicates; keyup removes them.
 *
 * Cmd+Shift escape hatch: when exactly `['Meta', 'Shift']` is held, the
 * pressing list is cleared. This compensates for a long-standing macOS
 * issue where keyup events are *not* delivered while Cmd is held — without
 * this clear, stuck keys would linger in `pressing` forever. The user can
 * tap Cmd+Shift to force-reset the state.
 *
 * window 'focus' also clears the pressing list (anything held while the tab
 * was backgrounded almost certainly isn't held now).
 */
Class(function Keyboard() {
  Inherit(this, Component);
  const self = this;

  function addListeners() {
    __window.keydown (keydown);
    __window.keyup   (keyup);
    __window.keypress(keypress);
    window.addEventListener('focus', onFocus);
  }

  function keydown(e) {
    if (!self.pressing.includes(e.key)) self.pressing.push(e.key);
    self.events.fire(self.DOWN, e);
    // Cmd+Shift force-reset for macOS sticky-Cmd workaround.
    if (2 == self.pressing.length &&
        self.pressing.includes('Meta') &&
        self.pressing.includes('Shift')) {
      self.pressing.length = 0;
    }
  }

  function keyup(e) {
    self.pressing.remove(e.key);
    self.events.fire(self.UP, e);
  }

  function keypress(e) { self.events.fire(self.PRESS, e); }

  // Anything held while the tab was hidden is almost certainly released by
  // now — drop the list.
  function onFocus() { self.pressing.length = 0; }

  this.pressing = [];
  self.DOWN  = 'keyboard_down';
  self.PRESS = 'keyboard_press';
  self.UP    = 'keyboard_up';

  Hydra.ready(addListeners);
}, 'static');

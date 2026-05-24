/*
 * Mobile — static helper handling mobile-specific browser quirks:
 *   • disabling native scroll-bounce on iOS Safari
 *   • detecting / mediating between "real" 100vh and the iOS dynamic
 *     toolbar's collapsed-vs-extended viewport heights
 *   • orientation tracking + (optional) ScreenLock-backed forced
 *     orientation
 *   • exposing `--safe-area-inset-*` CSS env() values to JS
 *   • providing `vibrate`, `fullscreen`, `isKeyboardOpen`, etc.
 *
 * Scroll suppression (`preventNativeScroll`):
 *   On non-native mobile (i.e. browser, not the embedded app), we cancel
 *   touchstart so the OS won't rubber-band/scroll the viewport. The
 *   exception list keeps form controls and links working — and any element
 *   that has set `_scrollParent = true` (via `_addOverflowScroll`) opts back
 *   into native overflow scrolling for its subtree.
 *
 * Resize-driven reload heuristic (`checkResizeRefresh`):
 *   iOS Safari and older Android browsers reset internal state in ways that
 *   are hard to recover from when the URL bar collapses; on those devices,
 *   when the width changes (i.e. *real* device rotation, not toolbar
 *   collapse — width changes only on rotation), we reload the page. Tablets
 *   with a long axis ≤ 800 px are excluded.
 *
 * 100vh handling (`updateMobileFullscreen`):
 *   `<feature-detects>` is an element styled with `height: 100vh`. We
 *   compare its offsetHeight to Stage.height to discover whether the URL bar
 *   is currently collapsed or extended, and pin both `<html>` and Stage to
 *   either `100%` (collapsed state) or the explicit pixel height (extended
 *   state) so layout doesn't jump when the bar slides.
 *
 * `setOrientation`:
 *   In a native-shell build (`self.NativeCore.active`) defers to the native
 *   bridge. Otherwise stores the desired orientation and, with `isForce`,
 *   takes a ScreenLock to actually lock the orientation.
 *
 * Safe-area insets are read from CSS custom properties on the
 * `<feature-detects>` element — the host page sets `--safe-area-inset-X:
 * env(safe-area-inset-X)` once, and JS sees them as plain numbers.
 *
 * `Mobile.phone/tablet/os` are removed: throwing getters here redirect
 * callers to `Device.mobile.phone`, etc. — leftover migration guidance for
 * older code.
 */
Class(function Mobile() {
  Inherit(this, Component);
  Namespace(this);
  const self = this;
  let $html, $featureDetects;
  let _is100vh = false;

  // Cancels touchstart unless we're inside a permitted input target or a
  // sub-tree explicitly opted into native scroll.
  function preventNativeScroll(e) {
    if (self.isAllowNativeScroll) return;
    let target = e.target;
    if (target.closest('label, input, textarea, select, a, button, [contenteditable]')) return;
    let prevent = target.hydraObject;
    while (target.parentNode && prevent) {
      if (target._scrollParent) prevent = false;
      target = target.parentNode;
    }
    if (prevent) e.preventDefault();
  }

  function resize() {
    updateOrientation();
    checkResizeRefresh();
    updateMobileFullscreen();
    if (!self.isAllowNativeScroll) document.body.scrollTop = 0;
  }

  function updateOrientation() {
    self.orientation = Stage.width > Stage.height ? 'landscape' : 'portrait';
    // In fullscreen or PWA, push the requested orientation to the OS.
    if (self.orientationSet &&
        (window.Fullscreen?.isOpen || Device.mobile?.pwa) &&
        window.screen &&
        window.screen.orientation) {
      window.screen.orientation.lock(self.orientationSet);
    }
  }

  Hydra.ready(() => {
    if (Device.mobile) {
      if (Stage.isNormalMobileScroll) {
        self.isAllowNativeScroll   = true;
        self.isPreventResizeReload = false;
      }
      (function initFeatureDetects() { $featureDetects = __body.create('feature-detects'); })();
      (function addHandlers() {
        self.events.sub(Events.RESIZE, resize);
        // Block native scroll only in browser-mode without normal-scroll opt-in.
        if (!Device.mobile.native && !Stage.isNormalMobileScroll) {
          window.addEventListener('touchstart', preventNativeScroll, { passive: false });
        }
      })();

      // Phone-only branch tags `<html>` with platform class and sets a fixed
      // body height on iOS so the URL bar can collapse cleanly.
      if (Device.mobile?.phone && !Device.mobile.native && !Stage.isNormalMobileScroll) {
        $html = $(document.documentElement);
        const ios = 'safari' === Device.system.browser;
        if (ios) $html.div.classList.add('ios');
        else     $html.div.classList.add('mob');
        _is100vh = true;
        if (ios) __body.css({ height: '100%' }).div.scrollTop = 0;
        updateMobileFullscreen();
      }

      // Native-shell uses literal `100vw`/`100vh` to anchor Stage; the shell
      // controls the viewport so vh is reliable.
      if (Device.mobile.native) Stage.css({ width: '100vw', height: '100vh' });
    }
  });

  /*
   * Width-change reload heuristic. The closure caches the last seen width
   * so we only reload on a real change. Tablets with a long axis ≤ 800
   * (small tablets / large phones) are excluded — they're treated as
   * phones for this purpose.
   */
  const checkResizeRefresh = (function () {
    let _lastWidth;
    return function () {
      if (self.isPreventResizeReload) return;
      if (_lastWidth == Stage.width) return;
      _lastWidth = Stage.width;
      const needsReload =
        'ios' === Device.system.os ||
        ('android' == Device.system.os && Device.system.version >= 7);
      if (!needsReload) return;
      if (!Device.mobile.tablet || Math.max(Stage.width, Stage.height) > 800) {
        window.location.reload();
      }
    };
  })();

  /*
   * Use the 100vh-styled feature-detects element to determine which of two
   * vertical layouts the URL bar gives us, then pin `<html>` and Stage so
   * subsequent paints don't snap.
   */
  function updateMobileFullscreen() {
    if (Stage.isNormalMobileScroll || !$html) return;
    const vh100 = $featureDetects.div.offsetHeight;
    if ($html.div.offsetHeight !== Stage.height) {
      if (Stage.height === vh100) {
        $html.css({ height: '' });
        Stage.css({ height: '100%' });
        _is100vh = true;
      } else {
        $html.css({ height: Stage.height });
        Stage.css({ height: Stage.height });
        _is100vh = false;
      }
    } else if (!_is100vh && Stage.height === vh100) {
      $html.css({ height: '' });
      Stage.css({ height: '100%' });
      _is100vh = true;
    }
  }

  this.vibrate = function (duration) {
    if (navigator.vibrate) navigator.vibrate(duration);
  };

  // Enter fullscreen via the Fullscreen module. Android-only "tap to enter"
  // hook (Oculus is excluded since it controls fullscreen separately).
  this.fullscreen = function () {
    if (Device.mobile && !Device.mobile.native && !Device.mobile.pwa && !Dev.emulator) {
      if (!window.Fullscreen) throw 'Mobile.fullscreen requires Fullscreen module';
      if ('android' === Device.system.os && !Device.detect('oculus')) {
        __window.bind('touchend', () => { Fullscreen.open(); });
        if (self.ScreenLock && self.ScreenLock.isActive) window.onresize();
      }
    }
  };

  this.setOrientation = function (orientation, isForce) {
    // Native shell — set on the bridge constant.
    if (self.System && self.NativeCore.active) {
      return (self.System.orientation = self.System[orientation.toUpperCase()]);
    }
    self.orientationSet = orientation;
    updateOrientation();
    if (isForce) {
      if (!self.ScreenLock) throw 'Mobile.setOrientation isForce argument requires ScreenLock module';
      if ('any' === orientation) self.ScreenLock.unlock(); else self.ScreenLock.lock();
    }
  };

  // True if focus is in a text field — the soft keyboard is probably visible.
  this.isKeyboardOpen = function () {
    return Device.mobile &&
           document.activeElement.tagName.toLowerCase().includes(['textarea', 'input']);
  };

  // Allow native overflow / pinch behaviour by un-setting touchAction.
  this.allowNativeScroll = function (enabled = true) {
    self.isAllowNativeScroll = enabled;
    const action = enabled ? 'unset' : '';
    [$(document.documentElement), __body, Stage].forEach(($el) =>
      $el.css({ touchAction: action, MSContentZooming: action, MSTouchAction: action }),
    );
  };

  this.preventResizeReload = function () { self.isPreventResizeReload = true; };

  // Mark `$obj` as a scroll-allowed subtree and absorb touchmove so the
  // global preventNativeScroll doesn't cancel it.
  this._addOverflowScroll = function ($obj) {
    $obj.div._scrollParent = true;
    if (!Device.mobile.native) {
      $obj.div._preventEvent = function (e) { e.stopPropagation(); };
      $obj.bind('touchmove', $obj.div._preventEvent);
    }
  };
  this._removeOverflowScroll = function ($obj) {
    $obj.unbind('touchmove', $obj.div._preventEvent);
  };

  // Migration shims — throw with hint to the new location.
  this.get('phone',  () => { throw 'Mobile.phone is removed. Use Device.mobile.phone';  });
  this.get('tablet', () => { throw 'Mobile.tablet is removed. Use Device.mobile.tablet'; });
  this.get('os',     () => { throw 'Mobile.os is removed. Use Device.system.os';        });

  // Safe-area insets: read CSS custom properties off feature-detects.
  (function () {
    const _props = [
      '--safe-area-inset-top',
      '--safe-area-inset-right',
      '--safe-area-inset-bottom',
      '--safe-area-inset-left',
    ];
    function getSafeAreaInset(index) {
      if (!$featureDetects) return 0;
      const style = getComputedStyle($featureDetects.div);
      return parseInt(style.getPropertyValue(_props[index])) || 0;
    }
    self.getSafeAreaInsets       = ()  => _props.map((_, i) => getSafeAreaInset(i));
    self.getSafeAreaInsetTop     = ()  => getSafeAreaInset(0);
    self.getSafeAreaInsetRight   = ()  => getSafeAreaInset(1);
    self.getSafeAreaInsetBottom  = ()  => getSafeAreaInset(2);
    self.getSafeAreaInsetLeft    = ()  => getSafeAreaInset(3);
  })();
}, 'Static');

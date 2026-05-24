/*
 * PushState — abstracts over `history.pushState` and the legacy hash-based
 * URL state ("#!/route/path" style) into a single store accessible via
 * `getState() / setState() / replaceState()`.
 *
 *   new PushState()           — autoselect: hash on LOCAL or no-pushstate
 *                                browsers, real History API otherwise.
 *   new PushState(true)       — force hash.
 *   new PushState(false)      — force pushState.
 *
 * Emits `Events.UPDATE` whenever the URL changes, with the new value, the
 * previous value, and a `split('/')` segment array.
 *
 * `useInternal()` switches to in-memory state — the URL bar is no longer
 * touched. Used by apps that have multiple sub-routers and only want one to
 * own the address bar. When invoked during init while a non-empty state is
 * present, it first replaces that state with `''` (so the in-memory store
 * starts clean), guarded by the `isInitializingUseInternal` flag to absorb
 * the synthetic change event.
 *
 * Lock semantics:
 *   `lock()` prevents external state changes from propagating; in-flight
 *   user navigation gets rewritten back to `_store` via push/replace.
 *   `unlock()` resumes normal behaviour.
 *
 * `isNotBlocked` flag (Component.flag) gates `setState`'s await — callers
 * can call `enableBlocker()` to suspend route changes during a critical
 * UI operation, then `disableBlocker()` to release the pending nav.
 *
 * `fireChangeWhenSet` — when set on a subclass, every `setState` triggers
 * the change handler synchronously (Router needs this to actually run the
 * route resolver after navigating).
 *
 * Native shell persistence: when `Device.mobile.native`, the state is also
 * mirrored into Storage under `app_state` so a backgrounded native app
 * can resume on the same route.
 */
Class(
  function PushState(_isHash) {
    Inherit(this, Component);
    const self = this;
    let _store, _useInternal;
    let _root = '';

    /*
     * Read the current state. Internal mode returns the in-memory string;
     * hash mode strips the leading "#!/"; pushState mode trims the root
     * prefix. Empty paths normalise to ''.
     */
    function getState() {
      if (_useInternal) return new String(_store);
      if (_isHash) return String(window.location.hash.slice(3));
      return (
        '/' !== _root && '' !== _root
          ? location.pathname.split(_root)[1]
          : location.pathname.slice(1)
      ) || '';
    }

    function handleStateChange(state, forced) {
      if (state === _store && !forced) return;
      if (self.flag('isInitializingUseInternal')) return;
      // Locked — push the URL back to `_store` so the bar reflects truth.
      if (self.isLocked && !forced) {
        if (!_store) return;
        if (_useInternal) return;
        if (_isHash) window.location.hash = '!/' + _store;
        else window.history.pushState(null, null, Utils.addQueryToPath(_root + _store));
        return;
      }
      const prevValue = _store;
      _store = state;
      const evt = { prevValue: prevValue, value: state, split: state.split('/') };
      self.events.fire(Events.UPDATE, evt);
      self.onStateUpdate?.(evt);
    }

    // Default to hash mode in LOCAL (file:// dev) or browsers without
    // History API support.
    if ('boolean' != typeof _isHash) _isHash = Hydra.LOCAL || !Device.system.pushstate;

    this.isLocked = false;
    self.flag('isNotBlocked', true);

    (function addHandlers() {
      if (_isHash) {
        return window.addEventListener('hashchange', () => handleStateChange(getState()), false);
      }
      // Browser back/forward and any pushState performed elsewhere.
      window.onpopstate = history.onpushstate = () => handleStateChange(getState());
    })();

    _store = getState();
    self.flag('isInitializing', true);
    deferNextTick(() => { self.flag('isInitializing', false); });

    // Reads. In native shells, the persisted version wins (the URL bar is
    // not a reliable source there).
    this.getState = this._getState = function () {
      return Device.mobile.native ? Storage.get('app_state') || '' : getState();
    };

    this.setRoot = function (root) {
      _root = '/' === root.charAt(0) ? root : '/' + root;
    };

    this.setState = this._setState = async function (state, forced) {
      if ('/' == state.charAt(0)) state = state.slice(1);
      self.events.fire(PushState.SET_STATE);
      await self.wait('isNotBlocked');
      if (Device.mobile.native) Storage.set('app_state', state);
      if (state === _store && !forced) return;
      if (_useInternal) {
        _store = state;
      } else if (_isHash) {
        window.location.hash = '!/' + state;
      } else {
        window.history.pushState(null, null, Utils.addQueryToPath(_root + state));
      }
      if (self.fireChangeWhenSet) handleStateChange(getState(), forced);
      _store = state;
      return true;
    };

    this.enableBlocker  = function () { self.flag('isNotBlocked', false); };
    this.disableBlocker = function () { self.flag('isNotBlocked', true);  };

    // Like setState but replaces the current history entry rather than
    // pushing a new one. Doesn't await the blocker.
    this.replaceState = function (state) {
      if (state === _store) return;
      if (_useInternal) {
        _store = state;
      } else if (_isHash) {
        window.location.hash = '!/' + state;
      } else {
        window.history.replaceState(null, null, Utils.addQueryToPath(_root + state));
      }
      if (self.fireChangeWhenSet) handleStateChange(getState(), true);
      else _store = state;
    };

    this.setTitle = function (title) { document.title = title; };

    this.lock   = function () { this.isLocked = true;  self.events.fire(PushState.LOCK);   };
    this.unlock = function () { this.isLocked = false; self.events.fire(PushState.UNLOCK); };

    this.useHash = function () { _isHash = true; };

    /*
     * Switch to internal (in-memory) mode. If init found a non-empty URL,
     * blank it first under the isInitializingUseInternal flag so the
     * resulting synthetic change event is ignored.
     */
    this.useInternal = function () {
      if (self.flag('isInitializing') && '' !== _store) {
        self.flag('isInitializingUseInternal', true);
        self.replaceState('');
        deferNextTick(() => { self.flag('isInitializingUseInternal', false); });
      }
      _useInternal = true;
    };
  },
  (_) => {
    PushState.SET_STATE = 'push_state_set_state';
    PushState.LOCK      = 'push_state_lock';
    PushState.UNLOCK    = 'push_state_unlock';
  },
);

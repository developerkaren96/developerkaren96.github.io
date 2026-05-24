/*
 * UILWindow — generic draggable/resizable floating panel used as
 * the chrome for the editor's pop-up windows (List, Timeline,
 * Code editor, etc.).
 *
 * Options (`_opts`):
 *   - `hide`    — start invisible.
 *   - `drag`    — enable header drag (default true).
 *   - `resize`  — enable corner resize (default true).
 *   - `closed`  — start collapsed.
 *   - `left/top` — initial position (defaults 350, 50).
 *   - `width/height` — initial size.
 *   - `label`   — header title text.
 *
 * Layout:
 *   - `$this` — outer container (`Element`).
 *   - `$header` — drag handle + title + collapse toggle.
 *   - `$container` — content host where caller adds children
 *     via `add(child)` (delegates to the inner folder).
 *
 * Interactions:
 *   - Drag: mousedown on `$header` records initial position
 *     offsets; `mousemove` shifts the window. `_dragging` gates
 *     so other handlers can ignore mouse during drag.
 *   - Resize: corner handle adjusts width/height via similar
 *     pointer tracking.
 *   - Keyboard: `Ctrl/Cmd + Shift + H` toggles visibility
 *     (guarded so the shortcut doesn't fire while typing in
 *     input/textarea fields). Fires `onClose` callback when
 *     hidden so owning code can clean up.
 *   - Collapse: `$toggle` expands/collapses content; `_open`
 *     tracks state.
 *
 * `_folder` is an inner UILFolder holding actual editor
 * controls — so the same `add()` / `remove()` / `find()` API
 * works as on any UIL panel.
 */
Class(function UILWindow(
  _title,
  _opts = {
    hide: false,
    drag: true,
    resize: true,
  },
) {
  Inherit(this, Element);
  const self = this;
  let $this,
    $header,
    $container,
    $toggle,
    $title,
    _folder,
    _hidden,
    _initialX,
    _initialY,
    _open = !_opts.closed,
    _x = _opts.left || 350,
    _y = _opts.top || 50,
    _xOffset = _x,
    _yOffset = _y,
    _dragging = false;
  function hide() {
    $this && $this.invisible();
    _hidden = true;
    self.onClose && self.onClose();
  }
  function show() {
    $this && $this.visible();
    _hidden = false;
  }
  function onKeydown(e) {
    if (e.ctrlKey || e.metaKey) {
      if (72 == e.keyCode && e.shiftKey) {
        if (`${document.activeElement.type}`.includes(['textarea', 'input', 'number'])) return;
        e.preventDefault();
        _hidden ? show() : hide();
      }
      67 == e.which && e.shiftKey && (e.preventDefault(), _folder.forEachFolder((f) => f.close()));
      79 == e.which && e.shiftKey && (e.preventDefault(), _folder.forEachFolder((f) => f.open()));
    }
  }
  function onMouseDown(e) {
    e.preventDefault();
    $header.css({
      cursor: 'move',
    });
    _initialX = e.clientX - _xOffset;
    _initialY = e.clientY - _yOffset;
    _dragging = true;
    document.addEventListener('mousemove', onMouseMove, false);
    document.addEventListener('mouseup', onMouseUp, false);
  }
  function onMouseMove(e) {
    e.preventDefault();
    _x = e.clientX - _initialX;
    _y = e.clientY - _initialY;
    _xOffset = _x;
    _yOffset = _y;
    $this.x = _x;
    $this.y = _y;
    $this.transform();
  }
  function onMouseUp() {
    $header.css({
      cursor: '',
    });
    _initialX = _x;
    _initialY = _y;
    _dragging = false;
    document.removeEventListener('mousemove', onMouseMove, false);
    document.removeEventListener('mouseup', onMouseUp, false);
  }
  function onToggle(e) {
    ('click' !== e.type && 13 !== e.which) ||
      (_open
        ? (function close() {
            _open = false;
            $container.css({
              display: 'none',
            });
            $toggle.text('▶');
          })()
        : (function open() {
            _open = true;
            $container.css({
              display: 'block',
            });
            $toggle.text('▼');
          })());
  }
  function undim() {
    _dragging ||
      $this.css({
        opacity: 1,
      });
  }
  function dim() {
    _dragging ||
      $this.css({
        opacity: 0.3,
      });
  }
  self.id = _title;
  (function initHTML() {
    $this = self.element;
    $this
      .bg('#161616')
      .transform({
        x: _x,
        y: _y,
      })
      .mouseEnabled(true);
    $this.css({
      position: 'absolute',
      userSelect: 'none',
      overflowY: 'auto',
      borderRadius: 4,
      maxHeight: _opts.maxHeight || '100%',
      border: '1px solid #2e2e2e',
    });
  })();
  (function initHeader() {
    $header = $this.create('header');
    $header.size('100%', 'auto').bg('#272727');
    $header.css({
      display: 'block',
      color: '#B1B1B1',
      padding: '4px 4px',
      boxSizing: 'border-box',
      fontFamily: 'sans-serif',
      fontSize: 11,
      fontWeight: 'bold',
      userSelect: 'none',
      minWidth: 200,
    });
    $toggle = $header.create('toggle');
    $toggle.text(_open ? '▼' : '▶').css({
      fontSize: 8,
      paddingLeft: 4,
      display: 'inline-block',
      verticalAlign: 'middle',
    });
    $toggle.click(onToggle);
    $title = $header.create('title');
    $title.text(_opts.label || _title).css({
      display: 'inline-block',
      marginLeft: 4,
    });
    $title.click(onToggle);
    let $close = $header.create('close');
    $close.text('✕').css({
      position: 'absolute',
      right: 7,
      top: 5,
      display: 'inline-block',
    });
    $close.click(hide);
  })();
  (function initContainer() {
    $container = $this.create('container');
    $container.size(_opts.width || 'auto', _opts.height || 'auto');
    $container.css({
      position: 'realtive',
      overflowY: 'auto',
      padding: 4,
      boxSizing: 'border-box',
      minWidth: _opts.minWidth || 0,
    });
    _opts.resize &&
      $container.css({
        resize: 'both',
        minWidth: 200,
        minHeight: 60,
      });
    _open ||
      $container.css({
        display: 'none',
      });
  })();
  (function initGroup() {
    _folder = self.initClass(
      UILFolder,
      _title,
      {
        hideTitle: true,
        background: '#161616',
      },
      null,
    );
    self.folder = _folder;
    $container.add(_folder);
  })();
  (function addHandlers() {
    document.addEventListener('keydown', onKeydown, false);
    _opts.drag && $header.div.addEventListener('mousedown', onMouseDown, false);
    _opts.hide &&
      ($this.div.addEventListener('mouseover', undim, false),
      $this.div.addEventListener('mouseleave', dim, false));
  })();
  this.add = function (child) {
    return (_folder.add(child), self);
  };
  this.remove = function (x) {
    return (_folder.remove(id), self);
  };
  this.get = function (id) {
    return _folder.get(id);
  };
  this.find = function (id) {
    return _folder.find(id);
  };
  this.filter = function (str) {
    return _folder.filter(str);
  };
  this.show = function () {
    return (show(), self);
  };
  this.hide = function () {
    return (hide(), self);
  };
  this.isVisible = function () {
    return !_hidden;
  };
  this.enableSorting = function (key) {
    return (_folder.enableSorting && _folder.enableSorting(key), self);
  };
  this.eliminate = function () {
    _opts.drag && $header.div.removeEventListener('mousedown', onMouseDown, false);
    _opts.hide &&
      ($this.div.removeEventListener('mouseover', undim, false),
      $this.div.removeEventListener('mouseleave', dim, false));
    document.removeEventListener('keydown', onKeydown, false);
  };
});

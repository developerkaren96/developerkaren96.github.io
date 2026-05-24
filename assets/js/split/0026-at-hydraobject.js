/*
 * HydraObject — the DOM-wrapper base class behind `$(...)`.
 *
 *   $('.hero')                  // create <div class="hero">
 *   $('#header', null, true)    // look up existing #header
 *   $('mySvg', 'svg')           // create namespaced <svg>
 *   $(existingDOMNode)          // wrap a raw node
 *
 * Construction modes (driven by `_initSelector`):
 *   - Non-string `_selector`   → wrap that raw DOM node.
 *   - `_exists` truthy         → `document.getElementById` lookup (id only).
 *   - String starting with `.` → create element, set className.
 *   - String starting with `#` → create element, set id.
 *   - Bare string              → treat as className, default first='.'
 *
 * Element type:
 *   - SVG names (`svg`, `path`, …) → `createElementNS` under the SVG ns.
 *   - Anything else                 → `createElement` (default `'div'`).
 *
 * Children & batching:
 *   - `_children` is an intrusive LinkedList of attached child HydraObjects.
 *   - If constructed with `_useFragment`, `add()` writes into a DocumentFragment
 *     and the actual `appendChild` is deferred — useful when adding many
 *     children in a row (single layout). Per-child `_fragmentBefore` is
 *     remembered so a mixed batch with `before:` anchors still inserts in
 *     the right order.
 *   - `onMountedHook` (set by callers) fires once children are in-tree.
 *
 * Lifecycle:
 *   - `remove()` removes from parent, clears interact/bind, removes & destroys
 *     every child, frees the LinkedList, and nulls `this`. Subclasses inherit
 *     this via `Inherit(self, HydraObject)`.
 *   - `destroy()` is an alias for `remove()` so HydraObjects participate in
 *     the framework's destroy cascade.
 */
Class(
  function HydraObject(_selector, _type, _exists, _useFragment) {
    this._children = new LinkedList();
    this._onDestroy;
    this.__useFragment = _useFragment;
    this._initSelector(_selector, _type, _exists);
  },
  () => {
    const prototype = HydraObject.prototype;

    // Element names that must go through `createElementNS` rather than the
    // default HTML namespace. SVG inside HTML otherwise gets misparsed.
    const svgElements = [
      'svg', 'path', 'rect', 'circle', 'filter', 'clippath', 'clipPath',
      'ellipse', 'image', 'mask', 'polygon', 'g', 'animate', 'line',
      'linearGradient', 'marker', 'mpath', 'polyline', 'set', 'stop',
      'text', 'defs', 'use',
    ];

    prototype._initSelector = function (_selector, _type, _exists) {
      // Mode 1: wrap an already-existing DOM node directly.
      if (_selector && typeof _selector !== 'string') {
        this.div = _selector;
      } else {
        // Parse selector: `#id` → id lookup/set, `.cls` → class, bare → class.
        let first = _selector ? _selector.charAt(0) : null;
        let name = _selector ? _selector.slice(1) : null;
        if (first !== '.' && first !== '#') {
          name = _selector;
          first = '.';
        }

        if (_exists) {
          // Mode 2: getElementById — id only.
          if (first !== '#') throw 'Hydra Selectors Require #ID';
          this.div = document.getElementById(name);
        } else {
          // Mode 3: create element of `_type` (default `div`), optionally SVG.
          this._type = _type || 'div';
          if (svgElements.includes(this._type)) {
            this.div = document.createElementNS('http://www.w3.org/2000/svg', this._type);
            // Root <svg> also needs the xlink namespace for `<use href=…>` etc.
            if (this._type === 'svg') {
              this.div.setAttributeNS(
                'http://www.w3.org/2000/xmlns/',
                'xmlns:xlink',
                'http://www.w3.org/1999/xlink',
              );
            }
          } else {
            this.div = document.createElement(this._type);
          }

          // Apply id or class from the parsed selector.
          if (first) {
            if (first === '#') {
              this.div.id = name;
            } else if (name !== 'unnamed') {
              // SVG elements expose className as SVGAnimatedString (.baseVal).
              if (this.div.className.baseVal) this.div.className.baseVal = name;
              else this.div.className = name;
            }
          }
        }
      }

      // Back-pointer from the DOM node to the wrapper. Lets `$(node)`-style
      // code find an existing wrapper instead of creating duplicates.
      this.div.hydraObject = this;
    };

    /**
     * Attach `child` as the last (or before-anchor) child.
     * Accepts: Element (with `.element` HydraObject), HydraObject, raw DOM.
     */
    prototype.add = function (child, before = null) {
      const self = this;

      // Resolve `before:` to an actual DOM node that's currently our child.
      // Anything else (different parent, missing) reverts to "append at end".
      function doInsertChild(childDiv) {
        if (before) {
          if (before.element && before.element instanceof HydraObject) before = before.element.div;
          else if (before.div) before = before.div;
          else if (!before.nodeName) before = null;
        }
        if (before && before.parentNode !== self.div) before = null;
        self.div.insertBefore(childDiv, before);
      }

      function insertChild(childDiv) {
        if (self.__useFragment) {
          // ── Batched path ─────────────────────────────────────────────────
          // Lazily allocate a DocumentFragment; one defer per parent flushes
          // every child added during this microtask in a single DOM write.
          if (!self._fragment) {
            self._fragment = document.createDocumentFragment();
            defer(function () {
              if (!self._fragment || !self.div) {
                delete self._fragment;
                return;
              }

              // Collect any children that asked for an onMountedHook; we'll
              // fire them once the fragment is committed.
              const hydraObjectsWithMountedHooks = Array.prototype.map
                .call(self._fragment.childNodes, (childDiv) => childDiv.hydraObject)
                .filter(($child) => $child?.onMountedHook);

              const allAppendable = Array.prototype.every.call(
                self._fragment.childNodes,
                (childDiv) => !childDiv._fragmentBefore,
              );

              if (allAppendable) {
                // Fast path — no per-child anchors, single appendChild.
                self.div.appendChild(self._fragment);
              } else {
                // Mixed path — preserve anchor positions one at a time.
                while (self._fragment.childNodes.length) {
                  const childDiv = self._fragment.childNodes[0];
                  before = childDiv._fragmentBefore;
                  delete childDiv._fragmentBefore;
                  doInsertChild(childDiv);
                }
              }
              delete self._fragment;

              // Fire mount hooks on the next defer so layout has settled.
              defer(() => {
                hydraObjectsWithMountedHooks.forEach(($child) => {
                  $child.onMountedHook();
                  delete $child.onMountedHook;
                });
              });
            });
          }
          self._fragment.appendChild(childDiv);
          childDiv._fragmentBefore = before;
        } else {
          // ── Immediate path ───────────────────────────────────────────────
          doInsertChild(childDiv);
          if (childDiv.hydraObject?.onMountedHook) {
            defer(() => {
              if (childDiv.hydraObject?.onMountedHook) {
                childDiv.hydraObject.onMountedHook();
                delete childDiv.hydraObject.onMountedHook;
              }
            });
          }
        }
      }

      // Dispatch on what kind of child object we got.
      if (child.element && child.element instanceof HydraObject) {
        // Element wrapper (`Element.add($obj)` form).
        insertChild(child.element.div);
        this._children.push(child.element);
        child.element._parent = this;
        child.element.div.parentNode = this.div;
      } else if (child.div) {
        // Bare HydraObject.
        insertChild(child.div);
        this._children.push(child);
        child._parent = this;
        child.div.parentNode = this.div;
      } else if (child.nodeName) {
        // Raw DOM node — no wrapper to bookkeep.
        insertChild(child);
        child.parentNode = this.div;
      }
      return this;
    };

    /** Deep DOM clone, returned wrapped in a new HydraObject. */
    prototype.clone = function () {
      return $(this.div.cloneNode(true));
    };

    /** Convenience: create a child of given selector/type and `add` it. */
    prototype.create = function (name, type) {
      const $obj = $(name, type);
      this.add($obj);
      return $obj;
    };

    /** Remove every child (calling each `.remove()` for proper cleanup). */
    prototype.empty = function () {
      let child = this._children.start();
      while (child) {
        const next = this._children.next();
        if (child && child.remove) child.remove();
        child = next;
      }
      this.div.innerHTML = '';
      return this;
    };

    prototype.parent = function () {
      return this._parent;
    };

    /**
     * Return children — DOM nodes by default, or HydraObject children when
     * `isHydraChildren=true` (i.e., only those tracked in our LinkedList).
     */
    prototype.children = function (isHydraChildren = false) {
      let children = this.div.children ? this.div.children : this.div.childNodes;
      if (isHydraChildren) {
        children = [];
        let child = this._children.start();
        while (child) {
          children.push(child);
          child = this._children.next();
        }
      }
      return children;
    };

    /**
     * Detach `object` from this parent. `keep=true` retains the LinkedList
     * entry — used internally when `remove()` is recursing.
     */
    prototype.removeChild = function (object, keep) {
      try {
        object.div.parentNode.removeChild(object.div);
      } catch (e) { /* already detached — fine */ }
      if (!keep) this._children.remove(object);
    };

    /**
     * Remove THIS object: unhook from parent, clear bindings, recursively
     * destroy children, free the LinkedList, null all fields.
     *
     * Note: an explicit positional arg is a common foot-gun (callers used to
     * pass the child here, confusing with `removeChild`), so we warn.
     */
    prototype.remove = function (param) {
      if (param) {
        console.warn('HydraObject.remove removes ITSELF from its parent. use removeChild instead');
      }
      if (this._onDestroy) this._onDestroy.forEach((cb) => cb());
      this.removed = true;
      this.clearInteract();
      this.clearBind();

      const parent = this._parent;
      if (parent && !parent.removed && parent.removeChild) parent.removeChild(this, true);

      // Recursive destroy on every tracked child.
      let child = this._children.start();
      while (child) {
        const next = this._children.next();
        if (child && child.remove) child.remove();
        child = next;
      }
      this._children.destroy();
      this.div.hydraObject = null;
      Utils.nullObject(this);
    };

    /** Alias so HydraObjects fit the framework's `.destroy()` cascade. */
    prototype.destroy = function () {
      this.remove();
    };

    /** Register a callback to run during this object's `remove()`. */
    prototype._bindOnDestroy = function (cb) {
      if (!this._onDestroy) this._onDestroy = [];
      this._onDestroy.push(cb);
    };

    // jQuery-style global factory + prototype alias.
    window.$ = function (selector, type, exists) {
      return new HydraObject(selector, type, exists);
    };
    $.fn = HydraObject.prototype;
  },
);

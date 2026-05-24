/*
 * GLA11y — accessibility (SEO + screen-reader) sidecar for the
 * WebGL UI tree. The actual page is drawn on a `<canvas>`, which
 * is opaque to assistive tech; this class maintains a parallel
 * hidden DOM tree (`<a>`, `<h1>`, text nodes) whose structure
 * mirrors the GLUI hierarchy so that screen readers, search-engine
 * crawlers and tab-focus navigation all see a real semantic DOM.
 *
 * Registers itself as `window.GLSEO`.
 *
 * Key concepts:
 *   - Every visible GLUI page is registered via `registerPage`,
 *     which mints a `group.seo` DOM container and pushes it into
 *     `_groups`. Persistent (cross-page) UI uses `registerPersist`.
 *   - `link($dom, group)` attaches arbitrary `HydraObject`s to
 *     a group so they show/hide alongside the page.
 *   - `textNode($text, str, sortOrder)` walks the GLUI parent chain
 *     to find the nearest registered group, then inserts a `<text>`
 *     div in the right z/sort position. `aLink(url, opts)` upgrades
 *     a text node into a focusable `<a>` (role-aware, with
 *     keyboard-activation when a `role` is provided).
 *   - `objectNode($object, $parent)` creates an empty seo handle
 *     ready to be promoted to an `<a>` later — used for
 *     interactive non-text widgets.
 *   - `setPageH1(group, title)` injects an `<h1>` at the top of a
 *     page's seo container.
 *   - `bindToPage(parent, child, name)` makes `child` share `parent`'s
 *     visibility/deleted state via `__glseoParent`.
 *
 * The `loop()` ticker (registered at priority 10 from inside
 * `registerPage`) keeps the SEO mirror's hidden/visible state in
 * sync with the underlying GLUI tree, and prunes deleted entries.
 *
 * Sort ordering: `addSortOrderProperty` makes `seo.sortOrder` a
 * setter that re-inserts the DOM node in the correct position
 * whenever the GLUI sort order changes.
 *
 * Notes on visibility logic:
 *   - A group with `__glseoParent` inherits its visibility from the
 *     parent (used by `bindToPage`).
 *   - Otherwise the group is visible when `seo.enabled` and
 *     `determineVisible()` agree.
 */
Class(function GLA11y() {
  Inherit(this, Element);
  const self = this;
  var $this,
    _groups = [],
    _links = [];
  function isVisible(group) {
    if (group.__glseoParent) {
      const seoHidden = !!group.__glseoParent.seoHidden,
        hidden = !!group.__glseoParent.hidden;
      return !seoHidden && !hidden;
    }
    return group.seo.enabled && group.determineVisible();
  }
  function isDeleted(group) {
    return group.__glseoParent ? group.__glseoParent.deleted : group.deleted;
  }
  function loop() {
    for (let i = _groups.length - 1; i > -1; i--) {
      let group = _groups[i];
      if (isDeleted(group)) return ($this.removeChild(group.seo), _groups.splice(i, 1));
      isVisible(group)
        ? (group.seo && group.seo.hidden && ((group.seo.hidden = false), $this.add(group.seo)),
          (seo = group.seo),
          Array.prototype.slice.call(seo.div.children).forEach((div) => {
            let seo = div.hydraObject,
              group = seo && seo.group;
            if (!seo || !group) return;
            let hidden = !group.determineVisible();
            hidden !== seo.hidden && (hidden ? seo.hide() : seo.show(), (seo.hidden = hidden));
          }))
        : group.seo &&
          !group.seo.hidden &&
          ((group.seo.hidden = true), $this.removeChild(group.seo, true));
    }
    var seo;
    for (let i = _links.length - 1; i > -1; i--) {
      let group = _links[i];
      if (isDeleted(group)) return ($this.removeChild(group.seo), _groups.splice(i, 1));
      isVisible(group)
        ? group.seoHidden && ((group.seoHidden = false), group.seoDOM.forEach((obj) => obj.show()))
        : group.seoHidden || ((group.seoHidden = true), group.seoDOM.forEach((obj) => obj.hide()));
    }
  }
  function aLink($object, url, label, options = {}) {
    let seo = $('link', 'a');
    return (
      (seo.group = $object.group || $object),
      seo.attr('href', '#' === url ? url : Hydra.absolutePath(url)),
      seo.text(label),
      seo.accessible(),
      (seo.div.onfocus = (_) => $object._divFocus()),
      (seo.div.onblur = (_) => $object._divBlur()),
      (seo.div.onclick = (e) => {
        e.preventDefault();
        $object._divSelect();
      }),
      options.role &&
        (seo.attr('role', options.role),
        (seo.div.onkeydown = (e) => {
          switch (e.key) {
            case ' ':
            case 'Spacebar':
              e.preventDefault();
              e.stopPropagation();
              $object._divSelect();
          }
        })),
      seo
    );
  }
  function findSeoParent($object, $suggestedParent) {
    let parent =
      $suggestedParent ||
      ($object._3d
        ? $object.anchor && $object.anchor._parent
          ? $object.anchor
          : $object.group
        : $object
      )._parent;
    if ($object.parentSeo) {
      let parentSeo = $object.parentSeo;
      parent = parentSeo.group && parentSeo.group.seo ? parentSeo.group : parentSeo;
    }
    for (; parent && !parent.seo; )
      if (parent.parentSeo) parent = parent.parentSeo.group || parent.parentSeo;
      else {
        if (parent.stageLayoutCapture?.parent?.$gluiObject)
          return findSeoParent(parent.stageLayoutCapture.parent.$gluiObject);
        parent = parent._parent;
      }
    if (parent?.seo) return parent;
  }
  function getInsertBeforeNode($object, parent, sortOrder) {
    let before = null;
    if (!isNaN(sortOrder)) {
      sortOrder = +sortOrder;
      $object.seo.sortOrder = sortOrder;
      let divs = parent.seo.children();
      for (let i = 0; i < divs.length; ++i) {
        let div = divs[i];
        if (div.hydraObject.sortOrder > sortOrder) {
          before = div;
          break;
        }
      }
    }
    return before;
  }
  function addSortOrderProperty($object, parent, initialSortOrder = $object.seo.sortOrder) {
    let sortOrder = initialSortOrder;
    Object.defineProperty($object.seo, 'sortOrder', {
      get: () => sortOrder,
      set(nextSortOrder) {
        if (nextSortOrder === sortOrder) return;
        sortOrder = nextSortOrder;
        let before = getInsertBeforeNode($object, parent, sortOrder);
        parent.seo.div.insertBefore($object.seo.div, before);
      },
    });
  }
  !(async function () {
    window.GLSEO = self;
    await Hydra.ready();
    (function initHTML() {
      ($this = self.element).setZ(-1);
      Stage.add($this);
    })();
    HydraCSS.style('.GLA11y *', {
      position: 'relative',
    });
  })();
  this.registerPage = function (group, name) {
    let topLevel = group;
    !(group = group instanceof GLUIObject ? group : group.group || group.scene || group)
      .determineVisible &&
      group.group &&
      (group.determineVisible = group.group.determineVisible.bind(group.group));
    Global.PLAYGROUND || World.ELEMENT.mouseEnabled(false);
    topLevel.seo = group.seo = $(name);
    group.seo.hidden = true;
    group.seo.enabled = true;
    let remove = group.seo.remove.bind(group.seo);
    group.seo.remove = (_) => {
      _groups.remove(group);
      remove();
    };
    _groups.push(group);
    self.startRender(loop, 10);
  };
  this.setPageH1 = function (group, title) {
    let $h1 = group.seo.h1;
    $h1 ||
      (($h1 = group.seo.create('title', 'h1')),
      (group.seo.h1 = $h1),
      defer(() => {
        let el = $h1.div;
        el.parentNode.insertBefore(el, el.parentNode.firstChild);
      }));
    $h1.text(title);
  };
  this.registerPersist = function (group, name) {
    let topLevel = group;
    group = group instanceof GLUIObject ? group : group.group || group.scene || group;
    Global.PLAYGROUND || World.ELEMENT.mouseEnabled(false);
    topLevel.seo = group.seo = $this.create(name);
  };
  this.link = function ($dom, group) {
    $dom instanceof HydraObject &&
      ((group = group.group || group.scene || group).seoDOM || (group.seoDOM = []),
      group.seoDOM.push($dom),
      _links.push(group));
    $dom instanceof GLUIObject && ($dom.seo = group.seo);
  };
  this.textNode = function ($text, text, sortOrder) {
    let parent = findSeoParent($text);
    if (parent)
      if ($text.seo) {
        if (
          ($text.seo.text(text),
          $text.seo.accessible(),
          !isNaN(sortOrder) && $text.seo.sortOrder !== +sortOrder)
        ) {
          let before = getInsertBeforeNode($text, parent, sortOrder);
          $text.seo.div.parentNode.insertBefore($text.seo.div, before);
        }
      } else {
        $text.seo = $('text');
        $text.seo.group = $text.group;
        $text.seo.text(text);
        $text.seo.accessible();
        let before = getInsertBeforeNode($text, parent, sortOrder);
        parent.seo.add($text.seo, before?.hydraObject);
        addSortOrderProperty($text, parent);
        $text.seo.aLink = function (url, options) {
          let index = Array.prototype.slice.call(parent.seo.div.children).indexOf($text.seo.div),
            sortOrder = $text.seo.sortOrder;
          $text.seo.remove();
          $text.seo = aLink($text, url, text, options);
          parent.seo.div.insertBefore($text.seo.div, parent.seo.div.children[index]);
          addSortOrderProperty($text, parent, sortOrder);
        };
        $text.seo.unlink = function () {
          parent.seo.div.removeChild($text.seo.div);
          $text.seo.group = null;
          $text.seo = null;
        };
      }
  };
  this.bindToPage = function (parent, child, name) {
    child.__glseoParent = parent;
    self.registerPage(child, name);
  };
  this.objectNode = function ($object, $parent) {
    let parent = findSeoParent($object, $parent);
    parent &&
      ($object.seo ||
        (($object.seo = {}),
        ($object.seo.group = $object.group || $object),
        ($object.seo.aLink = function (url, label, options) {
          $object.seo = aLink($object, url, label, options);
          parent.seo.div.insertBefore(
            $object.seo.div,
            getInsertBeforeNode($object, parent, options?.sortOrder),
          );
          addSortOrderProperty($object, parent);
          $object.seo.unlink = function () {
            parent.seo.div.removeChild($object.seo.div);
            $object.seo.group = null;
            $object.seo = null;
          };
        })));
  };
}, 'static');

/*
 * Element — base class for any "view" with a DOM root.
 *
 * Every subclass gets:
 *   - Component lifecycle (events, startRender, destroy cascade, …) via Inherit.
 *   - `this.element` — a HydraObject `<div>` whose className is the subclass's
 *     constructor name (e.g. `class Header extends Element {}` produces
 *     `<div class="Header">`).
 *   - `__useFragment=true` on the element, so children added in the same tick
 *     are batched into one DocumentFragment write (see HydraObject.add).
 *
 *   Class(function Header() {
 *     Inherit(this, Element);
 *     this.element.create('.title', 'h1');
 *   });
 *
 * `querySelector` / `querySelectorAll` defer one tick first — this gives the
 * DocumentFragment a chance to flush, so a child created in the same tick is
 * already in-tree by the time the lookup runs. Both return HydraObject
 * wrappers (`$(node)`) instead of bare DOM nodes.
 */
Class(function Element(type = 'div') {
  Inherit(this, Component);

  // Use the subclass's constructor name as the root element's CSS class —
  // gives every Element a debuggable hook in DevTools without extra config.
  const name = Utils.getConstructorName(this);

  this.__element = true;
  this.element = $('.' + name, type);
  this.element.__useFragment = true;

  /** Tear down: drop the DOM wrapper, then run subclass-defined `_destroy`. */
  this.destroy = function () {
    if (this.element && this.element.remove) this.element = this.element.remove();
    if (this._destroy) this._destroy();
  };

  /**
   * Deferred querySelector. Returns a HydraObject wrapper.
   * If passed an array of selectors, returns the parallel array of matches.
   */
  this.querySelector = async function (selector) {
    await defer();
    if (Array.isArray(selector)) {
      const values = [];
      selector.forEach((s) => {
        values.push($(this.element.div.querySelector(s)));
      });
      return values;
    }
    return $(this.element.div.querySelector(selector));
  };

  /** Deferred querySelectorAll. Returns HydraObject wrappers for every match. */
  this.querySelectorAll = async function (selector) {
    await defer();
    const list = this.element.div.querySelectorAll(selector);
    const values = [];
    for (let i = 0; i < list.length; i++) values.push($(list[i]));
    return values;
  };
});
